import os
import lancedb
import sys
import server_utils

print("=========================================")
print("      曾练专属私教 数据库去重与极速热切换")
print("=========================================")

# Step 1: Read all records from the current textbooks table
print("Connecting to LanceDB...")
db = lancedb.connect(server_utils.LANCEDB_DIR)

try:
    table = db.open_table("textbooks")
    total_rows = table.count_rows()
    print(f"Current total rows in 'textbooks' table: {total_rows}")
    
    if total_rows == 0:
        print("Error: Table is empty. Aborting.")
        sys.exit(1)
        
    print("Streaming data in batches for memory-efficient deduplication...")
    seen = set()
    unique_records = []
    
    # Process in batches to avoid loading everything into Pandas at once
    for batch in table.search().to_batches():
        df = batch.to_pandas()
        for record in df.to_dict(orient='records'):
            key = (record.get('text', ''), record.get('source', ''))
            if key not in seen:
                seen.add(key)
                unique_records.append(record)
                
    unique_rows = len(unique_records)
    print(f"Deduplication completed: {total_rows} rows -> {unique_rows} unique rows. (Removed {total_rows - unique_rows} duplicate rows!)")
    
    # Save the unique DataFrame into a new temporary table 'textbooks_clean'
    clean_table_name = "textbooks_clean"
    if clean_table_name in db.table_names():
        db.drop_table(clean_table_name)
        
    print(f"Creating cleaned table '{clean_table_name}'...")
    clean_table = db.create_table(clean_table_name, data=unique_records)
    print(f"Cleaned table created with {clean_table.count_rows()} records.")
    
except Exception as e:
    print(f"❌ Error during deduplication prep: {e}")
    sys.exit(1)

# Step 2: Stop Node.js server on port 3001
print("\nStopping active Node.js server on port 3001 to release file locks...")
server_utils.stop_server(3001)

# Step 3: Swap Table Folders
print("\nPerforming database folder hot swap...")
success = server_utils.swap_lancedb_tables("textbooks.lance", "textbooks_clean.lance")

# Try to clean up v2 as well if we are deduplicating after an upgrade
v2_tbl_path = os.path.join(server_utils.LANCEDB_DIR, "textbooks_v2.lance")
import shutil
if os.path.exists(v2_tbl_path):
    try:
        shutil.rmtree(v2_tbl_path)
        print("Cleared textbooks_v2.lance folder.")
    except Exception as e:
        pass

if not success:
    sys.exit(1)

# Step 4: Rebuild FTS Index on the upgraded clean table
try:
    print("\nRebuilding FTS Index on the deduplicated database table...")
    table = db.open_table("textbooks")
    table.create_fts_index("text", replace=True)
    print("✅ FTS index rebuilt successfully!")
except Exception as fts_err:
    print(f"Warning: FTS index rebuild failed: {fts_err}")

# Step 5: Restart the Node.js server
print("\nBackend server must be manually restarted to complete the upgrade.")
server_utils.print_restart_instruction()

print("=========================================")
print("  🚀 Deduplication Hot Upgrade Completed!")
print("=========================================")
