import os
import sys
import json
import re
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from dotenv import load_dotenv

# Force utf-8 encoding for Windows console to prevent UnicodeEncodeError
sys.stdout.reconfigure(encoding='utf-8')

# Load environment and configure proxy for urllib
load_dotenv()
proxy_url = os.environ.get("HTTP_PROXY") or os.environ.get("PROXY_URL")
if proxy_url:
    print(f"[Proxy] Configuring global proxy for urllib: {proxy_url}", flush=True)
    proxy_support = urllib.request.ProxyHandler({'http': proxy_url, 'https': proxy_url})
    opener = urllib.request.build_opener(proxy_support)
    urllib.request.install_opener(opener)

# Target grades - ALL Primary and Junior High
TARGET_GRADES = [
    "Grade 1 (小学一年级)", "Grade 2 (小学二年级)", "Grade 3 (小学三年级)", 
    "Grade 4 (小学四年级)", "Grade 5 (小学五年级)", "Grade 6 (小学六年级)",
    "Grade 7 (初中一年级)", "Grade 8 (初中二年级)", "Grade 9 (初中三年级)"
]
BASE_DIR = "data/textbooks"

def load_db():
    try:
        script_path = os.path.abspath(__file__)
    except NameError:
        import sys
        script_path = os.path.abspath(sys.argv[0])
    script_dir = os.path.dirname(script_path)

    db_path = os.path.join(script_dir, 'data', 'textbooks_db.js')
    if not os.path.exists(db_path):
        # Fallback for local dev if run from different dir
        db_path = os.path.join(script_dir, 'textbooks_db.js')
    
    with open(db_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Extract the JSON part from window.TEXTBOOKS_DB = {...};
    match = re.search(r'window\.TEXTBOOKS_DB\s*=\s*(\{.*\});?', content, re.DOTALL)
    if not match:
        raise ValueError("Could not find window.TEXTBOOKS_DB in textbooks_db.js")
    
    json_str = match.group(1)
    return json.loads(json_str)

def download_file(url, save_path):
    if os.path.exists(save_path):
        return f"ALREADY EXISTS: {save_path}"
    
    os.makedirs(os.path.dirname(save_path), exist_ok=True)
    
    try:
        # User-Agent to avoid simple blocks
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=30) as response, open(save_path, 'wb') as out_file:
            out_file.write(response.read())
        return f"SUCCESS: {save_path}"
    except Exception as e:
        return f"ERROR downloading {url}: {e}"

def main():
    print("Starting textbook download pipeline...")
    db = load_db()
    
    tasks = []
    
    for grade in TARGET_GRADES:
        if grade in db:
            books = db[grade]
            print(f"Found {len(books)} books for {grade}")
            for book in books:
                repo_path = book.get('repo_path')
                download_url = book.get('download_url')
                
                if not repo_path or not download_url:
                    continue
                # Filter to only download PEP/Unified textbooks (人教版, 人民教育出版社, or 统编版)
                if "人教版" not in repo_path and "人民教育出版社" not in repo_path and "统编版" not in repo_path:
                    continue
                    
                # The user EXPLICITLY requested ONLY 六三学制 (6-3 school system)
                # Exclude any textbooks belonging to 五四学制 (5-4 school system)
                if "五四" in repo_path or "五·四" in repo_path or "五•四" in repo_path:
                    continue
                    
                # Subject filtering based on Grade
                if "小学" in grade:
                    # Primary School: Only Core subjects (Chinese, Math, English)
                    if not any(subj in repo_path for subj in ["语文", "数学", "英语"]):
                        continue
                elif "初中" in grade:
                    # Junior High: All important subjects
                    important_subjects = ["语文", "数学", "英语", "物理", "化学", "生物", "生物学", "历史", "地理", "政治", "道德与法治", "科学", "体育", "体育与健康"]
                    if not any(subj in repo_path for subj in important_subjects):
                        continue
                
                # We replace forward slashes with os-specific separators for local path
                local_path = os.path.join(BASE_DIR, *repo_path.split('/'))
                tasks.append((download_url, local_path))
        else:
            print(f"Warning: {grade} not found in textbooks_db.js")
            
    print(f"Total files to download: {len(tasks)}")
    
    # Download concurrently (5 workers to avoid heavy rate-limiting immediately)
    successful = 0
    errors = 0
    with ThreadPoolExecutor(max_workers=5) as executor:
        future_to_url = {executor.submit(download_file, url, path): url for url, path in tasks}
        for future in as_completed(future_to_url):
            res = future.result()
            print(res)
            if "SUCCESS" in res or "ALREADY EXISTS" in res:
                successful += 1
            else:
                errors += 1
                
    print(f"\nDownload Summary: {successful} successful, {errors} errors.")

if __name__ == "__main__":
    main()
