import os
import requests
import sys
import time

# Reconfigure stdout to use utf-8
sys.stdout.reconfigure(encoding='utf-8')

# Proxy settings (Clash)
proxy_url = "http://127.0.0.1:10910"
proxies = {"http": proxy_url, "https": proxy_url}

target_dir = "C:/Users/Asus/Desktop/AI_Tutor_Release/data/textbooks/小学/数学/西南大学版"
os.makedirs(target_dir, exist_ok=True)

# Base Raw URL on Github
base_url = "https://raw.githubusercontent.com/TapXWorld/ChinaTextbook/master/%E5%B0%8F%E5%AD%A6/%E6%95%B0%E5%AD%A6/%E8%A5%BF%E5%8D%97%E5%A4%A7%E5%AD%A6%E7%89%88"

# Definition of the 5 books to download and merge
books_def = [
    {
        "name": "义务教育教科书·数学一年级下册.pdf",
        "parts": ["义务教育教科书·数学一年级下册.pdf.1", "义务教育教科书·数学一年级下册.pdf.2", "义务教育教科书·数学一年级下册.pdf.3"]
    },
    {
        "name": "义务教育教科书·数学二年级下册.pdf",
        "parts": ["义务教育教科书·数学二年级下册.pdf.1", "义务教育教科书·数学二年级下册.pdf.2", "义务教育教科书·数学二年级下册.pdf.3"]
    },
    {
        "name": "义务教育教科书·数学四年级上册.pdf",
        "parts": ["义务教育教科书·数学四年级上册.pdf.1", "义务教育教科书·数学四年级上册.pdf.2", "义务教育教科书·数学四年级上册.pdf.3"]
    },
    {
        "name": "义务教育教科书·数学四年级下册.pdf",
        "parts": ["义务教育教科书·数学四年级下册.pdf.1", "义务教育教科书·数学四年级下册.pdf.2", "义务教育教科书·数学四年级下册.pdf.3"]
    },
    {
        "name": "义务教育教科书·数学六年级下册.pdf",
        "parts": ["义务教育教科书·数学六年级下册.pdf.1", "义务教育教科书·数学六年级下册.pdf.2"]
    }
]

def download_with_retry(url, save_path, max_retries=5, delay=3):
    headers = {"User-Agent": "Mozilla/5.0"}
    for attempt in range(1, max_retries + 1):
        try:
            r = requests.get(url, headers=headers, proxies=proxies, timeout=60, stream=True)
            if r.status_code == 200:
                with open(save_path, 'wb') as f:
                    for chunk in r.iter_content(chunk_size=8192):
                        if chunk:
                            f.write(chunk)
                print(f"    [Success] Saved to {save_path} (Size: {os.path.getsize(save_path)} bytes)")
                return True
            else:
                print(f"    [Attempt {attempt}/{max_retries}] Status code: {r.status_code}. Retrying...")
        except Exception as e:
            print(f"    [Attempt {attempt}/{max_retries}] Error: {e}. Retrying...")
        time.sleep(delay)
    return False

def process_book(book):
    book_name = book["name"]
    final_path = os.path.join(target_dir, book_name)
    
    # Check if already exists and is valid
    if os.path.exists(final_path):
        try:
            import fitz
            doc = fitz.open(final_path)
            pages = len(doc)
            doc.close()
            print(f"[Skip] {book_name} already exists and is valid ({pages} pages). Skipping.")
            return True
        except:
            print(f"[Corrupt] Found existing {book_name} but it is corrupt. Re-downloading...")
            os.remove(final_path)
            
    print(f"\nProcessing book: {book_name}...")
    temp_files = []
    
    try:
        for idx, part in enumerate(book["parts"], 1):
            encoded_part = requests.utils.requote_uri(part)
            url = f"{base_url}/{encoded_part}"
            temp_path = os.path.join(target_dir, f"temp_{part}")
            
            print(f"  Downloading part {idx}/3: {part} ...")
            success = download_with_retry(url, temp_path)
            if not success:
                raise Exception(f"Failed to download part {part} after maximum retries.")
            temp_files.append(temp_path)
            
        print("  Merging parts...")
        with open(final_path, 'wb') as outfile:
            for temp_file in temp_files:
                with open(temp_file, 'rb') as infile:
                    outfile.write(infile.read())
                    
        print(f"  [Success] Merged PDF saved to: {final_path} (Size: {os.path.getsize(final_path)} bytes)")
        
        # Verify
        try:
            import fitz
            doc = fitz.open(final_path)
            print(f"  [Verify OK] Merged PDF is valid. Page count: {len(doc)}")
            doc.close()
        except Exception as ve:
            raise Exception(f"Verification failed: {ve}. Merged file might be corrupt.")
            
        # Clean up temp
        for temp_file in temp_files:
            try:
                os.remove(temp_file)
            except:
                pass
        return True
        
    except Exception as e:
        print(f"  ❌ Error processing {book_name}: {e}")
        # Clean up any partial files
        for temp_file in temp_files:
            if os.path.exists(temp_file):
                try:
                    os.remove(temp_file)
                except:
                    pass
        if os.path.exists(final_path):
            try:
                os.remove(final_path)
            except:
                pass
        return False

def main():
    print("=========================================")
    print("   Starting batch download and merge")
    print("=========================================")
    
    all_succeeded = True
    for book in books_def:
        success = process_book(book)
        if not success:
            all_succeeded = False
            
    print("\n=========================================")
    if all_succeeded:
        print("🎉 All remaining books downloaded and merged successfully!")
    else:
        print("⚠️ Some books failed to download or merge. Please check logs.")
    print("=========================================")

if __name__ == "__main__":
    main()
