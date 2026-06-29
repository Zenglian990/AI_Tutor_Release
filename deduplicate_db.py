import os
import shutil
import lancedb
import pandas as pd
import subprocess
import time
import sys

# Reconfigure stdout to use utf-8
sys.stdout.reconfigure(encoding='utf-8')

db_dir = "C:/Users/Asus/Desktop/AI_Tutor_Release/data/lancedb"
tbl_path = os.path.join(db_dir, "textbooks.lance")
v2_tbl_path = os.path.join(db_dir, "textbooks_v2.lance")

print("=========================================")
print("      曾练专属私教 数据库去重与极速热切换")
print("=========================================")

# Step 1: Read all records from the current textbooks table
print("Connecting to LanceDB...")
db = lancedb.connect(db_dir)

try:
    table = db.open_table("textbooks")
    total_rows = table.count_rows()
    print(f"Current total rows in 'textbooks' table: {total_rows}")
    
    if total_rows == 0:
        print("Error: Table is empty. Aborting.")
        sys.exit(1)
        
    print("Loading data into Pandas DataFrame for deduplication...")
    df = table.to_pandas()
    
    # Deduplicate based on 'text' and 'source' to keep unique chunks
    print("Running deduplication...")
    df_unique = df.drop_duplicates(subset=['text', 'source'])
    unique_rows = len(df_unique)
    print(f"Deduplication completed: {total_rows} rows -> {unique_rows} unique rows. (Removed {total_rows - unique_rows} duplicate rows!)")
    
    # Save the unique DataFrame into a new temporary table 'textbooks_clean'
    clean_table_name = "textbooks_clean"
    if clean_table_name in db.table_names():
        db.drop_table(clean_table_name)
        
    print(f"Creating cleaned table '{clean_table_name}'...")
    # Convert list elements to proper formats if any
    clean_table = db.create_table(clean_table_name, data=df_unique.to_dict(orient='records'))
    print(f"Cleaned table created with {clean_table.count_rows()} records.")
    
except Exception as e:
    print(f"❌ Error during deduplication prep: {e}")
    sys.exit(1)

# Step 2: Stop Node.js server on port 3001
print("\nStopping active Node.js server on port 3001 to release file locks...")
try:
    cmd = 'netstat -aon | findstr :3001'
    res = subprocess.run(cmd, shell=True, text=True, capture_output=True)
    lines = res.stdout.strip().split('\n')
    pids = set()
    for line in lines:
        parts = line.strip().split()
        if len(parts) >= 5:
            pid = parts[-1]
            if pid.isdigit() and pid != '0':
                pids.add(int(pid))
                
    if pids:
        print(f"Found active PID(s) on port 3001: {pids}")
        
        # Try graceful shutdown via API
        shutdown_success = False
        try:
            import urllib.request
            import urllib.error
            
            # Read API_TOKEN from .env file
            api_token = None
            env_path = "C:/Users/Asus/Desktop/AI_Tutor_Release/.env"
            if os.path.exists(env_path):
                with open(env_path, 'r', encoding='utf-8') as env_file:
                    for line in env_file:
                        if line.startswith('API_TOKEN='):
                            api_token = line.split('=', 1)[1].strip()
                            break
            
            if api_token:
                print("Sending graceful shutdown request via API...")
                url = "http://localhost:3001/api/admin/shutdown"
                req = urllib.request.Request(
                    url, 
                    method='POST',
                    headers={'Authorization': f'Bearer {api_token}'}
                )
                with urllib.request.urlopen(req, timeout=3) as response:
                    if response.status == 200:
                        print("✅ Graceful shutdown command acknowledged by server.")
                        # Wait up to 3 seconds for node process to flush WAL and exit
                        for i in range(3):
                            time.sleep(1)
                            # Recheck port
                            recheck = subprocess.run(cmd, shell=True, text=True, capture_output=True)
                            if not recheck.stdout.strip():
                                print("✅ Server exited gracefully.")
                                shutdown_success = True
                                break
        except Exception as api_err:
            print(f"Graceful shutdown API call failed or timed out: {api_err}")
            
        # Fallback to taskkill /F if graceful shutdown did not succeed
        if not shutdown_success:
            print("Graceful shutdown failed or timed out. Falling back to taskkill /F...")
            for pid in pids:
                print(f"Force-killing PID {pid} ...")
                subprocess.run(f"taskkill /F /PID {pid}", shell=True)
            time.sleep(1)
            print("Backend server stopped.")
    else:
        print("No active Node.js processes found on port 3001.")
except Exception as e:
    print(f"Warning: Failed to stop backend: {e}")

# Step 3: Swap Table Folders
clean_tbl_path = os.path.join(db_dir, "textbooks_clean.lance")
backup_path = tbl_path + "_old"

print("\nPerforming database folder hot swap...")
try:
    # Clear backup path if exists
    if os.path.exists(backup_path):
        shutil.rmtree(backup_path)
        
    # Rename live table to backup
    if os.path.exists(tbl_path):
        os.rename(tbl_path, backup_path)
        
    # Rename clean table to live table
    os.rename(clean_tbl_path, tbl_path)
    print("✅ LanceDB database table folders swapped successfully!")
    
    # Try cleaning backup
    if os.path.exists(backup_path):
        shutil.rmtree(backup_path)
        print("Cleared backup folder.")
        
    # Also clean textbooks_v2.lance if it exists to release disk space
    if os.path.exists(v2_tbl_path):
        shutil.rmtree(v2_tbl_path)
        print("Cleared textbooks_v2.lance folder.")
        
except Exception as swap_err:
    print(f"❌ Critical Error swapping folders: {swap_err}")
    print("Attempting automatic rollback...")
    if os.path.exists(backup_path) and not os.path.exists(tbl_path):
        try:
            os.rename(backup_path, tbl_path)
            print("Rollback successful.")
        except Exception as rb_err:
            print(f"Fatal: Rollback failed: {rb_err}")
    sys.exit(1)

# Step 4: Rebuild FTS Index on the upgraded clean table
try:
    print("\nRebuilding FTS Index on the deduplicated database table...")
    db_conn = lancedb.connect(db_dir)
    table = db_conn.open_table("textbooks")
    table.create_fts_index("text", replace=True)
    print("✅ FTS index rebuilt successfully!")
except Exception as fts_err:
    print(f"Warning: FTS index rebuild failed: {fts_err}")

# Step 5: Restart the Node.js server
print("\nRestarting Node.js backend server...")
try:
    CREATE_NEW_CONSOLE = 0x00000010
    subprocess.Popen(
        "npm start",
        cwd="C:/Users/Asus/Desktop/AI_Tutor_Release",
        shell=True,
        creationflags=CREATE_NEW_CONSOLE
    )
    print("✅ Node.js backend server restarted in a new console window!")
except Exception as start_err:
    print(f"❌ Error restarting backend server: {start_err}")

print("=========================================")
print("  🚀 Deduplication Hot Upgrade Completed!")
print("=========================================")
