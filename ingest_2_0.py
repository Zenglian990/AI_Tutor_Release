import os
import sys
import glob
import time
import re
import requests
import fitz  # PyMuPDF
import pymupdf4llm
import lancedb
import numpy as np
from dotenv import load_dotenv

# Force utf-8 encoding for Windows console
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

load_dotenv()

# --- Shared API Key Pool (imported from keypool.py) ---
from keypool import API_KEYS, get_next_key, get_embedding

print(f"[Key Pool] Loaded {len(API_KEYS)} API key(s) for RAG 2.0 Ingestion.")

DB_PATH = "data/lancedb"
TEXTBOOKS_DIR = "data/textbooks"
PROCESSED_LOG = "data/processed_pdfs_v2.log"
proxy_url = os.environ.get("HTTP_PROXY") or os.environ.get("PROXY_URL")
PROXIES = {"http": proxy_url, "https": proxy_url} if proxy_url else None

# Dynamic model configurations
EMBED_MODEL = os.environ.get("EMBED_MODEL") or "gemini-embedding-2"
# Unified with config/index.js default
CHAT_MODEL = os.environ.get("CHAT_MODEL") or "gemini-flash-lite-latest"

# Set up local EasyOCR reader as offline fallback
easyocr_reader = None
def get_easyocr_reader():
    global easyocr_reader
    if easyocr_reader is None:
        import easyocr
        print("[OCR] Initializing local EasyOCR reader (Chinese & English)...")
        easyocr_reader = easyocr.Reader(['ch_sim', 'en'], gpu=False)
    return easyocr_reader

# chunk_markdown_page is now in chunk_utils.py (shared with ocr_scanned_pdfs.py)
from chunk_utils import chunk_markdown_page  # noqa: F401 — re-exported for backward compat

def gemini_vision_ocr(img_bytes):
    """Call Gemini Vision model to extract textbook page with standard LaTeX mathematical formulas and layouts."""
    import base64
    base64_image = base64.b64encode(img_bytes).decode('utf-8')
    headers = {"Content-Type": "application/json"}
    payload = {
        "contents": [
            {
                "parts": [
                    {
                        "inline_data": {
                            "mime_type": "image/png",
                            "data": base64_image
                        }
                    },
                    {
                        "text": "这是一页中国中小学教材的扫描版或富图表PDF页面。请精确、完整地提取并转录该页面上的所有文字、题目、插图说明、图表文字和公式（数学、理化公式请全部转化为标准的 LaTeX 格式，行内公式用 \\(...\\)，独立行公式用 \\[...\\]）。如果包含插图，请附带一句简短的插图说明（如：[插图：三只苹果]）。不要包含任何前导、后导的说明、解释或 ```markdown 外包围框。"
                    }
                ]
            }
        ],
        "generationConfig": {
            "temperature": 0.1
        }
    }
    
    keys_tried = 0
    max_retries = len(API_KEYS) * 3
    
    while keys_tried < max_retries:
        current_key = get_next_key()
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{CHAT_MODEL}:generateContent?key={current_key}"
        try:
            response = requests.post(url, headers=headers, json=payload, proxies=PROXIES, timeout=45)
            if response.status_code == 200:
                data = response.json()
                text = data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
                return text.strip()
            elif response.status_code == 429:
                keys_tried += 1
                time.sleep(10)
            else:
                time.sleep(3)
                keys_tried += 1
        except Exception as e:
            time.sleep(5)
            keys_tried += 1
    return ""

def ocr_page_offline(page, page_idx):
    """Fallback offline EasyOCR for scanned pages."""
    try:
        reader = get_easyocr_reader()
        mat = fitz.Matrix(150/72, 150/72)
        pix = page.get_pixmap(matrix=mat)
        img_array = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.h, pix.w, pix.n)
        if pix.n == 4:
            img_array = img_array[:, :, :3]
        result = reader.readtext(img_array, detail=0, paragraph=True)
        return '\n\n'.join(result)
    except Exception as e:
        print(f"  [Offline OCR Error] Page {page_idx}: {e}")
        return ""

# PDFs that produce only noise (image placeholder text, garbled OCR) and should be skipped
_ATLAS_NOISE_PATTERNS = ['地理图册', '地理图']  # Geography atlases: mostly image maps with no useful text

def process_pdf(pdf_path, enable_gemini_ocr=False):
    """Extract and chunk pages from PDF with 2.0 Layout dual-mode strategy."""
    fname = os.path.basename(pdf_path)
    is_stem = any(sub in pdf_path for sub in ["数学", "物理", "化学", "Math", "Physics", "Chemistry"])

    # Skip image-heavy atlases that produce only placeholder noise
    if any(pat in fname for pat in _ATLAS_NOISE_PATTERNS):
        print(f"  [Skip] '{fname}' is an image atlas — no extractable text. Skipping.")
        return []
    
    try:
        print(f"  [PyMuPDF4LLM] Extracting layout-aware Markdown chunks...")
        pages_data = pymupdf4llm.to_markdown(pdf_path, page_chunks=True)
        
        doc = fitz.open(pdf_path)
        all_chunks = []
        
        for idx, page_info in enumerate(pages_data):
            page_idx = idx + 1
            text = page_info.get("text", "").strip()
            
            text = re.sub(r'\*\*==> picture \[\d+ x \d+\] intentionally omitted <==\*\*', '', text)
            text = text.strip()
            
            if len(text.strip()) <= 5:
                page = doc.load_page(idx)
                if enable_gemini_ocr and is_stem:
                    print(f"  [Gemini Vision OCR] Page {page_idx} is empty/scanned. Running high-precision OCR...")
                    pix = page.get_pixmap(dpi=150)
                    img_bytes = pix.tobytes("png")
                    ocr_text = gemini_vision_ocr(img_bytes)
                    if ocr_text:
                        text = ocr_text
                else:
                    print(f"  [EasyOCR] Page {page_idx} is empty/scanned. Running offline OCR...")
                    ocr_text = ocr_page_offline(page, page_idx)
                    if ocr_text:
                        text = ocr_text
            
            if len(text) > 15:
                page_chunks = chunk_markdown_page(text, page_idx)
                all_chunks.extend(page_chunks)
                
        doc.close()
        return all_chunks
    except Exception as e:
        print(f"  [Extraction Error] Failed to process {fname}: {e}")
        return []

def main():
    print("======================================================")
    print("   曾练专属私教 RAG 2.0 Textbook Ingestion Engine")
    print("======================================================")
    os.makedirs("data", exist_ok=True)
    
    enable_gemini_ocr = os.environ.get("ENABLE_OCR", "false").lower() == "true"
    if enable_gemini_ocr:
        print("[Config] Gemini Vision OCR enabled for scanned STEM pages.")
    else:
        print("[Config] Local EasyOCR enabled as offline scanned fallback.")
    
    processed_files = set()
    if os.path.exists(PROCESSED_LOG):
        with open(PROCESSED_LOG, 'r', encoding='utf-8') as f:
            processed_files = {line.strip() for line in f}

    db = lancedb.connect(DB_PATH)
    table_name_v2 = "textbooks_v2"
    table = None
    try:
        table = db.open_table(table_name_v2)
    except:
        pass

    pdf_files = glob.glob(os.path.join(TEXTBOOKS_DIR, "**", "*.pdf"), recursive=True)
    pdf_files = [f for f in pdf_files if f.lower().endswith('.pdf')]
    print(f"Total PDFs found under data/textbooks: {len(pdf_files)}")

    records_written = False
    for idx, pdf_path in enumerate(pdf_files, 1):
        norm_path = pdf_path.replace('\\', '/')
        if norm_path in processed_files:
            print(f"[{idx}/{len(pdf_files)}] Already processed (v2), skipping: {os.path.basename(pdf_path)}")
            continue
            
        print(f"\n[{idx}/{len(pdf_files)}] Processing: {os.path.basename(pdf_path)}")
        chunks = process_pdf(pdf_path, enable_gemini_ocr=enable_gemini_ocr)
        if not chunks:
            print(f"  ⚠️ No text chunks generated for {os.path.basename(pdf_path)}.")
            continue
            
        records = []
        print(f"  Generating embeddings for {len(chunks)} chunks...")
        
        for chunk_idx, chunk in enumerate(chunks):
            vector = get_embedding(chunk["text"], EMBED_MODEL)
            if vector:
                records.append({
                    "vector": vector,
                    "text": chunk["text"],
                    # Use path relative to TEXTBOOKS_DIR so editions with same filename are distinguishable
                    "source": os.path.relpath(pdf_path, TEXTBOOKS_DIR).replace(os.sep, '/'),
                    "page": chunk["page"]
                })
            
            if (chunk_idx + 1) % 15 == 0 or (chunk_idx + 1) == len(chunks):
                print(f"  Progress: embedded {chunk_idx + 1}/{len(chunks)} chunks... ({len(records)} succeeded)")
                sys.stdout.flush()
            
            time.sleep(4.2 / len(API_KEYS))
            
        if records:
            if table is None:
                table = db.create_table(table_name_v2, data=records)
            else:
                table.add(records)
            records_written = True
            print(f"  >> Imported {len(records)} records from {os.path.basename(pdf_path)} into v2 table.")
            
            with open(PROCESSED_LOG, 'a', encoding='utf-8') as f:
                f.write(f"{norm_path}\n")
                
    if records_written:
        print("\n------------------------------------------------------")
        print("Completing database upgrade...")
        try:
            if table is not None:
                print("Building Full-Text Search (FTS) index on 'text' column...")
                table.create_fts_index("text", replace=True)
                print("FTS index built successfully.")

            db_tables = db.table_names()
            table_path = os.path.join(DB_PATH, "textbooks.lance")
            v2_table_path = os.path.join(DB_PATH, "textbooks_v2.lance")

            if "textbooks_v2" in db_tables:
                import shutil

                # ── Safety: merge any OCR rows from live 'textbooks' into textbooks_v2 ──
                # Scenario: if OCR ran AFTER a previous ingestion, its data landed in the
                # live 'textbooks' table. We rescue those rows before nuking the table.
                if "textbooks" in db_tables and os.path.exists(table_path):
                    try:
                        live_tbl = db.open_table("textbooks")
                        ocr_rows = live_tbl.to_pandas().to_dict(orient="records")
                        # Identify OCR rows: they have no 'grade'/'subject' columns or
                        # those fields are missing/empty (OCR schema only has vector/text/source/page)
                        rescue_rows = [
                            r for r in ocr_rows
                            if not r.get("grade") and not r.get("subject")
                        ]
                        if rescue_rows:
                            print(f"  Rescuing {len(rescue_rows)} OCR row(s) from live 'textbooks' into v2...")
                            v2_tbl = db.open_table("textbooks_v2")
                            v2_tbl.add(rescue_rows)
                            print(f"  ✅ {len(rescue_rows)} OCR row(s) merged into textbooks_v2.")
                        else:
                            print("  No orphaned OCR rows found in live 'textbooks' table.")
                    except Exception as merge_err:
                        print(f"  ⚠️  OCR row rescue failed (non-fatal): {merge_err}")

                print("Swapping LanceDB database tables safely...")
                backup_path = table_path + "_old"
                if os.path.exists(backup_path):
                    try:
                        shutil.rmtree(backup_path)
                    except Exception:
                        pass
                
                # Step 1: rename live table to old backup
                old_exists = os.path.exists(table_path)
                if old_exists:
                    os.rename(table_path, backup_path)
                
                # Step 2: rename v2 to live table
                try:
                    os.rename(v2_table_path, table_path)
                    # Step 3: if successful, clean up backup
                    if old_exists and os.path.exists(backup_path):
                        shutil.rmtree(backup_path)
                    print("✅ RAG 2.0 Database activated successfully!")
                except Exception as swap_err:
                    print(f"  ⚠️ Failed activating new textbooks table! Rolling back: {swap_err}")
                    # Step 4: if failed, restore live table from old backup
                    if old_exists and os.path.exists(backup_path):
                        if os.path.exists(table_path):
                            shutil.rmtree(table_path)
                        os.rename(backup_path, table_path)
                    raise swap_err

        except Exception as e:
            print(f"Error swapping RAG tables: {e}")
    else:
        print("\nNo new records written. Database upgrade skipped.")
        
    print("\nIngestion complete!")

if __name__ == "__main__":
    main()
