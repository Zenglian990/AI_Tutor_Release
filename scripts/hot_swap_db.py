import os
import lancedb
import sys
import server_utils
import glob

# Reconfigure stdout to use utf-8
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

log_path = os.path.join(server_utils.DATA_DIR, "processed_pdfs_v2.log")

print("=========================================")
print("Performing safe hot swap...")
success = server_utils.swap_lancedb_tables("textbooks.lance", "textbooks_v2.lance")
if not success:
    sys.exit(1)

# Step 3: Rebuild FTS index on the new table
try:
    print("Opening the new live table to build FTS index...")
    db = lancedb.connect(server_utils.LANCEDB_DIR)
    table = db.open_table("textbooks")
    table.create_fts_index("text", replace=True)
    print("✅ FTS index rebuilt successfully!")
except Exception as fts_err:
    print(f"Warning: Failed to rebuild FTS index: {fts_err}")

# Step 4: Write all PDFs to processed log dynamically
try:
    # Find all current pdfs
    pdf_files = glob.glob(os.path.join(server_utils.DATA_DIR, 'textbooks', '**', '*.pdf'), recursive=True)
    
    # Read log to see if already in it
    existing_logs = set()
    if os.path.exists(log_path):
        with open(log_path, 'r', encoding='utf-8') as f:
            existing_logs = set(line.strip() for line in f)
            
    added_count = 0
    with open(log_path, 'a', encoding='utf-8') as f:
        for pdf_path in pdf_files:
            # Get relative path starting with 'data/textbooks/'
            rel_path = os.path.relpath(pdf_path, server_utils.PROJECT_ROOT)
            # Normalize path separators
            rel_path = rel_path.replace('\\', '/')
            if rel_path not in existing_logs:
                f.write(f"{rel_path}\n")
                added_count += 1
                
    if added_count > 0:
        print(f"✅ Added {added_count} new PDF paths to processed log.")
    else:
        print("All PDF paths already exist in processed log.")
except Exception as log_err:
    print(f"Warning: Failed to update processed log: {log_err}")

print("=========================================")
print("Hot swap process completed!")
