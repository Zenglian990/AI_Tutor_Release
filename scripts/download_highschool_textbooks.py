import os
import sys
import re
import urllib.request
import urllib.parse
import json
import socket
from concurrent.futures import ThreadPoolExecutor, as_completed
from dotenv import load_dotenv

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
DATA_DIR = os.path.join(PROJECT_ROOT, 'data')
ENV_PATH = os.path.join(PROJECT_ROOT, '.env')
MANIFEST_PATH = os.path.join(DATA_DIR, 'highschool_textbooks_manifest.json')

load_dotenv(ENV_PATH)
proxy_url = os.environ.get("HTTP_PROXY") or os.environ.get("PROXY_URL")

# Test proxy availability
use_proxy = False
if proxy_url:
    try:
        parsed = urllib.parse.urlparse(proxy_url)
        host = parsed.hostname or '127.0.0.1'
        port = parsed.port or 1080
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(1.5)
        s.connect((host, port))
        s.close()
        use_proxy = True
        print(f"[Proxy] Proxy is ACTIVE on {host}:{port}, routing requests through it.", flush=True)
    except Exception:
        print(f"[Proxy] Configured proxy {proxy_url} is not responding, bypassing system proxy for DIRECT connection.", flush=True)

if use_proxy:
    proxy_support = urllib.request.ProxyHandler({'http': proxy_url, 'https': proxy_url})
else:
    proxy_support = urllib.request.ProxyHandler({})

opener = urllib.request.build_opener(proxy_support)
urllib.request.install_opener(opener)

BASE_DIR = os.path.join(DATA_DIR, 'textbooks', '高中')
RAW_BASE = "https://raw.githubusercontent.com/TapXWorld/ChinaTextbook/master/%E9%AB%98%E4%B8%AD"

def load_manifest():
    if os.path.exists(MANIFEST_PATH):
        with open(MANIFEST_PATH, 'r', encoding='utf-8') as f:
            books = json.load(f)
            print(f"[Manifest] Loaded {len(books)} high school textbooks from local manifest.", flush=True)
            return books
    print(f"[Error] Manifest file not found at: {MANIFEST_PATH}", flush=True)
    return []

def download_single_file(book):
    rel_path = book['rel_path']
    dest_path = os.path.join(BASE_DIR, *rel_path.split('/'))
    os.makedirs(os.path.dirname(dest_path), exist_ok=True)
    
    # Check if target complete file already exists (or merged complete file)
    final_pdf_path = re.sub(r'\.pdf\.\d+$', '.pdf', dest_path)
    if os.path.exists(dest_path) and os.path.getsize(dest_path) > 1000:
        try:
            d = fitz.open(dest_path)
            if d.page_count > 0:
                d.close()
                return True, f"[Exists & Valid] {os.path.basename(rel_path)}"
            d.close()
            os.remove(dest_path)
        except Exception:
            try: os.remove(dest_path)
            except Exception: pass

    if os.path.exists(final_pdf_path) and os.path.getsize(final_pdf_path) > 1000 and not dest_path.endswith('.pdf'):
        try:
            d = fitz.open(final_pdf_path)
            if d.page_count > 0:
                d.close()
                return True, f"[Already Merged & Valid] {os.path.basename(final_pdf_path)}"
            d.close()
            os.remove(final_pdf_path)
        except Exception:
            try: os.remove(final_pdf_path)
            except Exception: pass

    url = f"{RAW_BASE}/{urllib.parse.quote(rel_path)}"
    
    # Retry loop
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            with opener.open(req, timeout=45) as resp, open(dest_path, 'wb') as out_f:
                while True:
                    chunk = resp.read(65536)
                    if not chunk:
                        break
                    out_f.write(chunk)
            
            # If standard pdf, verify header
            if dest_path.endswith('.pdf'):
                with open(dest_path, 'rb') as f:
                    if f.read(5) != b'%PDF-':
                        os.remove(dest_path)
                        return False, f"[Error] Corrupted PDF: {os.path.basename(rel_path)}"
            return True, f"[Success] Downloaded {os.path.basename(rel_path)}"
        except Exception as e:
            if attempt == 2:
                if os.path.exists(dest_path):
                    try: os.remove(dest_path)
                    except: pass
                return False, f"[Failed] {os.path.basename(rel_path)}: {e}"

def merge_split_pdfs():
    print("\n[Merger] Scanning for split multi-part PDFs (e.g. .pdf.1, .pdf.2)...", flush=True)
    merged_count = 0
    for root, dirs, files in os.walk(BASE_DIR):
        split_groups = {}
        for f in files:
            m = re.match(r'^(.*\.pdf)\.(\d+)$', f)
            if m:
                base_name = m.group(1)
                idx = int(m.group(2))
                split_groups.setdefault(base_name, []).append((idx, f))
                
        for base_name, parts in split_groups.items():
            parts.sort(key=lambda x: x[0])
            merged_file = os.path.join(root, base_name)
            if os.path.exists(merged_file) and os.path.getsize(merged_file) > 1000:
                print(f"  Merged PDF already exists: {base_name}", flush=True)
                continue
                
            print(f"  Merging {len(parts)} parts -> {base_name} ...", flush=True)
            with open(merged_file, 'wb') as out_f:
                for idx, part_name in parts:
                    part_path = os.path.join(root, part_name)
                    with open(part_path, 'rb') as in_f:
                        out_f.write(in_f.read())
                        
            # Verify magic bytes
            with open(merged_file, 'rb') as f:
                header = f.read(5)
                if header == b'%PDF-':
                    print(f"  ✓ Successfully verified merged PDF: {base_name} ({round(os.path.getsize(merged_file)/1024/1024, 2)} MB)", flush=True)
                    merged_count += 1
                else:
                    print(f"  ❌ Merged file {base_name} invalid magic bytes!", flush=True)
    print(f"[Merger] Finished. Merged {merged_count} multi-part PDF(s).", flush=True)

def main():
    print("=" * 60, flush=True)
    print("  曾练专属AI导师：高中教材库（10-12年级）自动化同步工具", flush=True)
    print("=" * 60, flush=True)
    
    books = load_manifest()
    total = len(books)
    if not books:
        return
        
    print(f"开始并发下载（线程数：4，防限流）...", flush=True)
    success = 0
    errors = 0
    
    with ThreadPoolExecutor(max_workers=4) as executor:
        future_map = {executor.submit(download_single_file, b): b for b in books}
        for future in as_completed(future_map):
            b = future_map[future]
            ok, msg = future.result()
            print(msg, flush=True)
            if ok:
                success += 1
            else:
                errors += 1
                
    print(f"\n[Summary] 下载完成：成功 {success} 个，失败 {errors} 个。", flush=True)
    merge_split_pdfs()
    print("\n高中全学科教材入库完毕！可随时运行 python ingest_2_0.py 将教材导入 LanceDB 向量数据库。", flush=True)

if __name__ == "__main__":
    main()
