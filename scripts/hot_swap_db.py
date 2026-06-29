import os
import shutil
import lancedb
import sys

# Reconfigure stdout to use utf-8
sys.stdout.reconfigure(encoding='utf-8')

db_dir = "C:/Users/Asus/Desktop/AI_Tutor_Release/data/lancedb"
tbl = os.path.join(db_dir, "textbooks.lance")
v2_tbl = os.path.join(db_dir, "textbooks_v2.lance")
backup = tbl + "_old"
log_path = "C:/Users/Asus/Desktop/AI_Tutor_Release/data/processed_pdfs_v2.log"

print("=========================================")
# Step 1: Ensure v2 table exists
if not os.path.exists(v2_tbl):
    print(f"Error: v2 table {v2_tbl} does not exist! Did the ingestion run successfully?")
    sys.exit(1)

# Step 2: Swap tables
try:
    if os.path.exists(backup):
        shutil.rmtree(backup)
except Exception as e:
    print(f"Warning: failed to clear old backup: {e}")

print("Performing safe hot swap...")
try:
    # Rename live table to backup
    if os.path.exists(tbl):
        os.rename(tbl, backup)
    # Rename v2 table to live table
    os.rename(v2_tbl, tbl)
    print("Table folders swapped successfully!")
    
    # Clear backup if successful
    if os.path.exists(backup):
        shutil.rmtree(backup)
        print("Cleared backup table folder.")
except Exception as swap_err:
    print(f"Error swapping folders: {swap_err}")
    print("Attempting rollback...")
    if os.path.exists(backup) and not os.path.exists(tbl):
        os.rename(backup, tbl)
    sys.exit(1)

# Step 3: Rebuild FTS index on the new table
try:
    print("Opening the new live table to build FTS index...")
    db = lancedb.connect(db_dir)
    table = db.open_table("textbooks")
    table.create_fts_index("text", replace=True)
    print("✅ FTS index rebuilt successfully!")
except Exception as fts_err:
    print(f"Warning: Failed to rebuild FTS index: {fts_err}")

# Step 4: Write to processed log
try:
    new_pdf_path = "data/textbooks/小学/数学/西南大学版/义务教育教科书·数学三年级下册.pdf"
    # Read log to see if already in it
    already_logged = False
    if os.path.exists(log_path):
        with open(log_path, 'r', encoding='utf-8') as f:
            if new_pdf_path in [line.strip() for line in f]:
                already_logged = True
                
    if not already_logged:
        with open(log_path, 'a', encoding='utf-8') as f:
            f.write(f"{new_pdf_path}\n")
        print("✅ Added new PDF path to processed log.")
    else:
        print("PDF path already exists in processed log.")
except Exception as log_err:
    print(f"Warning: Failed to update processed log: {log_err}")

print("=========================================")
print("Hot swap process completed!")
