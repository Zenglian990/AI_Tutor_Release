import os
import sys
import glob
import time
import re
import shutil
import fitz
import lancedb
import requests
import threading
from concurrent.futures import ThreadPoolExecutor
from dotenv import load_dotenv

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
DATA_DIR = os.path.join(PROJECT_ROOT, 'data')
ENV_PATH = os.path.join(PROJECT_ROOT, '.env')

load_dotenv(ENV_PATH)
sys.path.append(SCRIPT_DIR)
from chunk_utils import chunk_markdown_page

DB_PATH = os.path.join(DATA_DIR, 'lancedb')
TEXTBOOKS_DIR = os.path.join(DATA_DIR, 'textbooks')
HIGHSCHOOL_DIR = os.path.join(TEXTBOOKS_DIR, '高中')
PROCESSED_LOG = os.path.join(DATA_DIR, 'processed_pdfs_v2.log')

PROXIES = {"http": "http://127.0.0.1:7897", "https": "http://127.0.0.1:7897"}

API_KEYS = []
env_file = os.path.join(REPO_ROOT, ".env")
if os.path.exists(env_file):
    with open(env_file, "r", encoding="utf-8") as f:
        for line in f:
            if line.startswith("GEMINI_API_KEY="):
                val = line.strip().split("=", 1)[1].strip("'\"")
                API_KEYS = [k.strip() for k in val.split(",") if k.strip()]

if not API_KEYS and os.getenv("GEMINI_API_KEY"):
    API_KEYS = [k.strip() for k in os.getenv("GEMINI_API_KEY", "").split(",") if k.strip()]

print(f"[KeyPool] Loaded {len(API_KEYS)} API key(s) for Turbo Ingestion.", flush=True)

_key_idx = 0
_key_lock = threading.Lock()
def get_next_key():
    global _key_idx
    with _key_lock:
        k = API_KEYS[_key_idx % len(API_KEYS)]
        _key_idx += 1
        return k

EMBED_MODEL = os.environ.get("EMBED_MODEL") or "gemini-embedding-001"

def batch_embed_texts(texts, max_retries=6):
    if not texts:
        return []
    payload = {
        "requests": [
            {
                "model": f"models/{EMBED_MODEL}",
                "content": {"parts": [{"text": t[:1500]}]},
                "outputDimensionality": 768
            }
            for t in texts
        ]
    }
    headers = {"Content-Type": "application/json"}
    
    for attempt in range(max_retries):
        if not API_KEYS:
            print("  [FATAL] No API keys remaining!", flush=True)
            return [None] * len(texts)
        current_key = get_next_key()
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{EMBED_MODEL}:batchEmbedContents?key={current_key}"
        try:
            resp = requests.post(url, headers=headers, json=payload, proxies=PROXIES, timeout=30)
            if resp.status_code == 200:
                data = resp.json()
                embeddings = data.get("embeddings", [])
                time.sleep(1.0)  # Safe spacing
                return [e.get("values") for e in embeddings]
            elif resp.status_code == 429:
                err_text = resp.text
                if "limit: 1000" in err_text or "per day" in err_text.lower():
                    print(f"    [Key Daily Limit] Ejecting key {current_key[:8]} from pool.", flush=True)
                    with _key_lock:
                        if current_key in API_KEYS:
                            API_KEYS.remove(current_key)
                    continue
                wait_t = 15.0 * (attempt + 1)
                print(f"    [RateLimit 429 RPM] Waiting {wait_t:.1f}s before retry...", flush=True)
                time.sleep(wait_t)
            elif resp.status_code == 402:
                print(f"    [Key Depleted 402] Ejecting key {current_key[:8]} from pool.", flush=True)
                with _key_lock:
                    if current_key in API_KEYS:
                        API_KEYS.remove(current_key)
                continue
            else:
                print(f"    [API Error {resp.status_code}] Retrying in 2s...", flush=True)
                time.sleep(2.0)
        except Exception as e:
            time.sleep(2.0)
            
    print(f"  [Warning] Batch embedding failed after {max_retries} attempts.", flush=True)
    return [None] * len(texts)

_ATLAS_NOISE_PATTERN = re.compile(r'(地理图册|地理图|geo.*atlas|map|atlas)', re.IGNORECASE)

def process_pdf(pdf_path):
    fname = os.path.basename(pdf_path)
    if _ATLAS_NOISE_PATTERN.search(fname):
        return []
        
    all_chunks = []
    # Primary: Fast, ultra-reliable PyMuPDF direct text extraction
    try:
        doc = fitz.open(pdf_path)
        for idx in range(doc.page_count):
            page_idx = idx + 1
            text = doc[idx].get_text("text").strip()
            if len(text) > 15:
                page_chunks = chunk_markdown_page(text, page_idx)
                all_chunks.extend(page_chunks)
        doc.close()
        if all_chunks:
            return all_chunks
    except Exception as e:
        print(f"  [Warning] fitz direct failed on {fname}: {e}", flush=True)
        
    return all_chunks

def main():
    print("=" * 65, flush=True)
    print("  曾练专属AI导师：高中教材库（10-12年级）极速向量入库引擎 (方案B)", flush=True)
    print("=" * 65, flush=True)
    
    db = lancedb.connect(DB_PATH)
    tbl_path = os.path.join(DB_PATH, "textbooks.lance")
    bak_path = os.path.join(DB_PATH, "textbooks.lance.bak")
    
    if os.path.exists(tbl_path) and not os.path.exists(bak_path):
        print(f"[Backup] Creating backup textbooks.lance -> .bak ...", flush=True)
        shutil.copytree(tbl_path, bak_path)
        
    table = db.open_table("textbooks")
    initial_count = len(table)
    print(f"[LanceDB] Connected to 'textbooks' table. Current records: {initial_count}", flush=True)
    
    processed_files = set()
    if os.path.exists(PROCESSED_LOG):
        with open(PROCESSED_LOG, 'r', encoding='utf-8') as f:
            processed_files = {line.strip() for line in f}
            
    pdf_files = glob.glob(os.path.join(HIGHSCHOOL_DIR, "**", "*.pdf"), recursive=True)
    pdf_files = [f for f in pdf_files if f.lower().endswith('.pdf') and not re.search(r'\.pdf\.\d+$', f)]
    print(f"[Scanner] Found {len(pdf_files)} High School textbook PDFs.", flush=True)
    
    start_time = time.time()
    total_new_records = 0
    BATCH_SIZE = 30
    
    for idx, pdf_path in enumerate(pdf_files, 1):
        norm_path = pdf_path.replace('\\', '/')
        if norm_path in processed_files:
            continue
            
        bname = os.path.basename(pdf_path)
        print(f"\n[{idx}/{len(pdf_files)}] Parsing & Chunking: {bname} ...", flush=True)
        t0 = time.time()
        chunks = process_pdf(pdf_path)
        if not chunks:
            print(f"  No valid text chunks in {bname}, skipping.", flush=True)
            continue
            
        print(f"  Extracted {len(chunks)} chunks in {time.time()-t0:.2f}s. Batch embedding...", flush=True)
        
        records = []
        rel_source = os.path.relpath(pdf_path, TEXTBOOKS_DIR).replace(os.sep, '/')
        
        batch_list = [chunks[i : i + BATCH_SIZE] for i in range(0, len(chunks), BATCH_SIZE)]
        batch_vectors = []
        for b_idx, b in enumerate(batch_list, 1):
            vecs = batch_embed_texts([c["text"] for c in b])
            batch_vectors.append(vecs)
            print(f"    Batch [{b_idx}/{len(batch_list)}] embedded ({len(b)} chunks).", flush=True)
            time.sleep(3.5)
        
        for batch, vectors in zip(batch_list, batch_vectors):
            for c, vec in zip(batch, vectors):
                if vec:
                    records.append({
                        "vector": vec,
                        "text": c["text"],
                        "source": rel_source,
                        "page": c["page"]
                    })
                    
        if records:
            table.add(records)
            total_new_records += len(records)
            print(f"  ✓ Appended {len(records)} vectors to LanceDB. (Total new: {total_new_records})", flush=True)
            
            with open(PROCESSED_LOG, 'a', encoding='utf-8') as f:
                f.write(f"{norm_path}\n")
                
    elapsed = time.time() - start_time
    final_count = len(table)
    print("\n" + "=" * 65, flush=True)
    print(f"  高中教材全量向量入库圆满完成！", flush=True)
    print(f"  原有记录数: {initial_count} 条", flush=True)
    print(f"  本次新增记录数: {total_new_records} 条", flush=True)
    print(f"  当前知识库总条数: {final_count} 条", flush=True)
    print(f"  总耗时: {elapsed/60:.2f} 分钟 ({elapsed:.1f} 秒)", flush=True)
    print("=" * 65, flush=True)
    
    print("[FTS] Updating Full-Text Search index on 'text' column...", flush=True)
    try:
        table.create_fts_index("text", replace=True)
        print("[FTS] FTS index updated successfully.", flush=True)
    except Exception as e:
        print(f"[FTS] FTS indexing note: {e}", flush=True)

if __name__ == "__main__":
    main()
