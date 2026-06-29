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
        db_path = os.path.join(script_dir, 'textbooks_db.js')
    
    with open(db_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
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
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=30) as response, open(save_path, 'wb') as out_file:
            out_file.write(response.read())
        return f"SUCCESS: {save_path}"
    except Exception as e:
        return f"ERROR downloading {url}: {e}"

def main():
    print("==================================================")
    print("  西南版本 (西师大版/西南大学版) 教材下载管线")
    print("==================================================")
    
    db = load_db()
    tasks = []
    
    for grade in TARGET_GRADES:
        if grade in db:
            books = db[grade]
            for book in books:
                repo_path = book.get('repo_path')
                download_url = book.get('download_url')
                
                if not repo_path or not download_url:
                    continue
                
                # Only Southwest editions (西南师大版, 西南大学版, 西师大版)
                is_southwest = any(kw in repo_path for kw in ["西南", "西师"])
                if not is_southwest:
                    continue
                
                # Exclude 五四学制 (5-4 school system)
                if "五四" in repo_path or "五·四" in repo_path or "五•四" in repo_path:
                    continue
                
                local_path = os.path.join(BASE_DIR, *repo_path.split('/'))
                tasks.append((download_url, local_path))
                
    print(f"检测到西南版本教材共 {len(tasks)} 本")
    
    if len(tasks) == 0:
        print("未找到需要下载的西南版本教材。")
        return
        
    print("开始并发下载（5个线程）...")
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
                
    print(f"\n下载总结: {successful} 成功, {errors} 失败。")
    print("==================================================")
    print(" 下载完成！")
    print(" 若要将教材导入系统向量数据库，请执行:")
    print(" python ingest_2_0.py")
    print("==================================================")

if __name__ == "__main__":
    main()
