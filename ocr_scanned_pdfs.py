"""
OCR 扫描版教材 → 提取文字 → 存入 LanceDB
使用 EasyOCR（支持中英文）+ PyMuPDF（PDF转图片）
"""
import sys
import os
import time
import numpy as np

sys.stdout.reconfigure(encoding='utf-8')

import fitz  # PyMuPDF
import easyocr
import lancedb
from lancedb.pydantic import LanceModel, Vector
from dotenv import load_dotenv

load_dotenv()

# ── 需要 OCR 的 17 个扫描版文件 ──────────────────────────────────────
SCANNED_FILES = [
    r"data\textbooks\初中\化学\人教版-人民教育出版社\九年级\义务教育教科书·化学九年级下册.pdf",
    r"data\textbooks\初中\地理\人教版-人民教育出版社\七年级\义务教育教科书·地理七年级下册.pdf",
    r"data\textbooks\初中\地理\人教版-人民教育出版社\八年级\义务教育教科书·地理八年级下册.pdf",
    r"data\textbooks\初中\数学\人教版-人民教育出版社\七年级\义务教育教科书·数学七年级下册.pdf",
    r"data\textbooks\初中\数学\人教版-人民教育出版社\八年级\义务教育教科书·数学八年级下册.pdf",
    r"data\textbooks\初中\数学\人教版-人民教育出版社\九年级\义务教育教科书·数学九年级下册.pdf",
    r"data\textbooks\初中\物理\人教版-人民教育出版社\八年级\义务教育教科书·物理八年级下册.pdf",
    r"data\textbooks\初中\生物学\人教版-人民教育出版社\七年级\义务教育教科书·生物学七年级下册.pdf",
    r"data\textbooks\初中\生物学\人教版-人民教育出版社\八年级\义务教育教科书·生物学八年级下册.pdf",
    r"data\textbooks\初中\英语\人教版-人民教育出版社\七年级\义务教育教科书·英语七年级下册.pdf",
    r"data\textbooks\初中\英语\人教版-人民教育出版社\八年级\义务教育教科书·英语八年级下册.pdf",
    r"data\textbooks\小学\英语\人教版（一年级起点）（主编：吴欣）\义务教育教科书·英语（一年级起点）一年级下册.pdf",
    r"data\textbooks\小学\英语\人教版（一年级起点）（主编：吴欣）\义务教育教科书·英语（一年级起点）二年级下册.pdf",
    r"data\textbooks\小学\英语\人教版（一年级起点）（主编：吴欣）\义务教育教科书·英语（一年级起点）三年级下册.pdf",
    r"data\textbooks\小学\英语\人教版（一年级起点）（主编：吴欣）\义务教育教科书·英语（一年级起点）四年级下册.pdf",
    r"data\textbooks\小学\英语\人教版（一年级起点）（主编：吴欣）\义务教育教科书·英语（一年级起点）五年级下册.pdf",
    r"data\textbooks\小学\英语\人教版（一年级起点）（主编：吴欣）\义务教育教科书·英语（一年级起点）六年级下册.pdf",
]

# ── OCR 进度日志 ─────────────────────────────────────────────────────
OCR_LOG = "data/processed_pdfs_v2.log"

def load_done():
    if not os.path.exists(OCR_LOG):
        return set()
    with open(OCR_LOG, encoding='utf-8') as f:
        return set(l.strip().replace('\\', '/') for l in f if l.strip())

def mark_done(path):
    norm_path = path.replace('\\', '/')
    with open(OCR_LOG, 'a', encoding='utf-8') as f:
        f.write(norm_path + '\n')

# ── LanceDB 连接 ──────────────────────────────────────────────────────
def get_table():
    """Connect to LanceDB and open (or create) the textbooks_v2 staging table.

    Design note: OCR data is written into 'textbooks_v2' so it co-exists with
    ingest_2_0.py output and survives the final rename swap.
    If the table doesn't exist yet (e.g. OCR runs before ingestion), we create it
    with the same schema so the script never crashes on first deploy.
    """
    from lancedb.pydantic import LanceModel, Vector as LanceVector
    db = lancedb.connect("data/lancedb")
    TABLE_NAME = "textbooks_v2"
    if TABLE_NAME in db.table_names():
        return db.open_table(TABLE_NAME)
    # Table doesn't exist yet — create it with the minimal OCR-compatible schema
    print(f"[OCR] Table '{TABLE_NAME}' not found, creating it now...", flush=True)
    import pyarrow as pa
    schema = pa.schema([
        pa.field("vector",  pa.list_(pa.float32(), 768)),
        pa.field("text",    pa.string()),
        pa.field("source",  pa.string()),
        pa.field("page",    pa.int32()),
    ])
    return db.create_table(TABLE_NAME, schema=schema)

# ── 嵌入 & OCR（复用 shared keypool 和 chunk_utils）─────────────────────
from chunk_utils import chunk_markdown_page  # shared module — no side effects

# --- Shared API Key Pool + Embedding ---
from keypool import API_KEYS, get_next_key as _shared_next_key, get_embedding
import threading

EMBED_MODEL = os.environ.get("EMBED_MODEL") or "gemini-embedding-2"

_key_lock = threading.Lock()

def next_key():
    with _key_lock:
        return _shared_next_key()

def embed_text(text):
    return get_embedding(text, EMBED_MODEL)

def embed_chunks(chunks):
    sleep_per = max(0.5, 4.2 / max(len(API_KEYS), 1))
    results = []
    for idx, c in enumerate(chunks):
        emb = embed_text(c)
        results.append(emb)
        if (idx + 1) % 10 == 0 or (idx + 1) == len(chunks):
            print(f"  Progress: embedded {idx + 1}/{len(chunks)} chunks...", flush=True)
        time.sleep(sleep_per)
    return results

# ── OCR 单个 PDF ──────────────────────────────────────────────────────
def ocr_pdf(pdf_path, reader):
    doc = fitz.open(pdf_path)
    n = len(doc)
    texts = []
    print(f"  共 {n} 页，开始 OCR...", flush=True)
    for i, page in enumerate(doc):
        # 渲染页面为图片（150 DPI 够 OCR）
        mat = fitz.Matrix(150/72, 150/72)
        pix = page.get_pixmap(matrix=mat)
        img_array = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.h, pix.w, pix.n)
        if pix.n == 4:
            img_array = img_array[:, :, :3]  # RGBA → RGB
        # OCR
        result = reader.readtext(img_array, detail=0, paragraph=True)
        page_text = '\n'.join(result)
        texts.append(page_text)
        if (i+1) % 10 == 0 or (i+1) == n:
            print(f"  OCR 进度: {i+1}/{n} 页完成", flush=True)
    doc.close()
    return texts

# ── 入库 ──────────────────────────────────────────────────────────────
def ingest_ocr_texts(pdf_path, page_texts, table):
    # Use path relative to textbooks root so editions with same filename are distinguishable
    source = os.path.relpath(pdf_path, "data/textbooks").replace(os.sep, '/')
    all_chunks = []

    for i, text in enumerate(page_texts):
        text = text.strip()
        if len(text) < 15:
            continue
        page_chunks = chunk_markdown_page(text, i + 1)
        all_chunks.extend(page_chunks)

    if not all_chunks:
        print(f"  ⚠️ OCR 后没有有效文字，跳过", flush=True)
        return 0

    chunks = [c["text"] for c in all_chunks]
    pages = [c["page"] for c in all_chunks]

    print(f"  共 {len(chunks)} 个 Text Chunks，开始嵌入...", flush=True)
    embeddings = embed_chunks(chunks)

    rows = []
    for chunk, emb, page in zip(chunks, embeddings, pages):
        if emb is None:
            continue
        rows.append({
            'vector': emb,
            'text': chunk,
            'source': source,
            'page': page,
        })

    if rows:
        table.add(rows)
        print(f"  ✅ 成功入库 {len(rows)} 个 Chunks ({fname})", flush=True)
    return len(rows)

# ── 主程序 ────────────────────────────────────────────────────────────
def main():
    print(f"[Key Pool] Loaded {len(API_KEYS)} API key(s).", flush=True)

    # 初始化 EasyOCR（下载模型约需首次一次）
    print("\n初始化 EasyOCR 模型（首次需下载，请稍候）...", flush=True)
    reader = easyocr.Reader(['ch_sim', 'en'], gpu=False)
    print("EasyOCR 就绪！\n", flush=True)

    table = get_table()
    done = load_done()

    total_files = len(SCANNED_FILES)
    total_pages = 0

    for idx, pdf_path in enumerate(SCANNED_FILES, 1):
        norm_path = pdf_path.replace('\\', '/')
        if norm_path in done:
            print(f"[{idx}/{total_files}] 已处理，跳过: {os.path.basename(pdf_path)}", flush=True)
            continue

        if not os.path.exists(pdf_path):
            print(f"[{idx}/{total_files}] ❌ 文件不存在: {pdf_path}", flush=True)
            continue

        print(f"\n[{idx}/{total_files}] 处理: {os.path.basename(pdf_path)}", flush=True)
        t0 = time.time()

        page_texts = ocr_pdf(pdf_path, reader)
        n = ingest_ocr_texts(pdf_path, page_texts, table)
        total_pages += n
        mark_done(pdf_path)

        elapsed = time.time() - t0
        print(f"  ⏱️ 耗时: {elapsed/60:.1f} 分钟", flush=True)

    # 最终统计 — 读 textbooks_v2（当前 OCR 写入的表）
    print(f"\n=== OCR 入库全部完成 ===", flush=True)
    print(f"总新增页数: {total_pages}", flush=True)
    db = lancedb.connect("data/lancedb")
    try:
        tbl = db.open_table("textbooks_v2")
        print(f"textbooks_v2 总记录数: {tbl.count_rows()}", flush=True)
    except Exception as e:
        print(f"⚠️  无法读取 textbooks_v2 记录数: {e}", flush=True)

    # Rebuild FTS index on 'text' column to ensure search matches new pages
    try:
        print("正在为 'text' 列重建全文检索 (FTS) 倒排索引...", flush=True)
        table.create_fts_index("text", replace=True)
        print("✅ 全文检索 (FTS) 索引重建成功！", flush=True)
    except Exception as e:
        print(f"⚠️  警告: 重建 FTS 索引失败: {e}", flush=True)

if __name__ == "__main__":
    main()
