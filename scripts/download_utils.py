import os
import re
import requests
import server_utils

def load_db():
    db_path = os.path.join(server_utils.DATA_DIR, 'textbooks_db.js')
    if not os.path.exists(db_path):
        print(f"Cannot find database file at: {db_path}")
        return {}
        
    print(f"Loading database from: {db_path}")
    with open(db_path, 'r', encoding='utf-8') as f:
        content = f.read()
        
    try:
        # Extract the JSON object
        match = re.search(r'window\.TEXTBOOKS_DB\s*=\s*(\{.*\});?', content, re.DOTALL)
        if match:
            json_str = match.group(1)
            import json
            # Handle comments if any
            json_str = re.sub(r'//.*?\n|/\*.*?\*/', '', json_str, flags=re.S)
            data = json.loads(json_str)
            return data
    except Exception as e:
        print(f"Failed to parse textbook DB: {e}")
    return {}

def download_file(url, filepath):
    if os.path.exists(filepath):
        return True, f"ALREADY EXISTS: {filepath}"
        
    try:
        # Ensure dir exists
        os.makedirs(os.path.dirname(filepath), exist_ok=True)
        
        # Fast streaming download
        response = requests.get(url, stream=True, timeout=30)
        response.raise_for_status()
        
        # Check size immediately
        content_length = response.headers.get('content-length')
        if content_length and int(content_length) < 1000:
            return False, f"⚠️ File too small ({content_length} bytes), skipping"
            
        with open(filepath, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)
                
        # Validate Magic Byte
        with open(filepath, 'rb') as f:
            header = f.read(5)
            if header != b'%PDF-':
                os.remove(filepath)
                return False, f"❌ File downloaded but is not a valid PDF (invalid magic bytes)."
                
        return True, f"SUCCESS: {filepath}"
    except Exception as e:
        if os.path.exists(filepath):
            os.remove(filepath)
        return False, f"ERROR downloading {url}: {e}"
