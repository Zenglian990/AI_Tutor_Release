import os
import glob
import re

def clean_textbooks_data():
    try:
        script_path = os.path.abspath(__file__)
    except NameError:
        import sys
        script_path = os.path.abspath(sys.argv[0])
    base_dir = os.path.dirname(os.path.dirname(script_path))
    textbooks_dir = os.path.join(base_dir, 'data', 'textbooks')
    
    if not os.path.exists(textbooks_dir):
        print(f"Directory not found: {textbooks_dir}")
        return

    # Find all files with .pdf followed by numbers like .pdf.1
    files_deleted = 0
    pattern = re.compile(r'\.pdf\.\d+$', re.IGNORECASE)
    
    for filename in os.listdir(textbooks_dir):
        if pattern.search(filename):
            filepath = os.path.join(textbooks_dir, filename)
            try:
                os.remove(filepath)
                print(f"Deleted redundant file: {filename}")
                files_deleted += 1
            except Exception as e:
                print(f"Failed to delete {filename}: {e}")
                
    if files_deleted == 0:
        print("No redundant .pdf.X files found. Directory is clean.")
    else:
        print(f"\nCleanup complete. Removed {files_deleted} files.")

if __name__ == '__main__':
    clean_textbooks_data()
