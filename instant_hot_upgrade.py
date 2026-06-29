import os
import shutil
import subprocess
import time
import sys

# Reconfigure stdout to use utf-8
sys.stdout.reconfigure(encoding='utf-8')

db_dir = "C:/Users/Asus/Desktop/AI_Tutor_Release/data"
lancedb_dir = os.path.join(db_dir, "lancedb")
tbl = os.path.join(lancedb_dir, "textbooks.lance")
v2_tbl = os.path.join(lancedb_dir, "textbooks_v2.lance")
backup = tbl + "_old"

print("=========================================")
print("      曾练专属私教 极速热切换升级程序")
print("=========================================")

# Step 1: Check if v2 table exists
if not os.path.exists(v2_tbl):
    print(f"❌ Error: textbooks_v2.lance table does not exist at {v2_tbl}!")
    print("Please make sure RAG 2.0 Ingestion has run successfully.")
    sys.exit(1)

# Step 2: Find and Kill the Node.js process occupying port 3001
print("Stopping active Node.js server on port 3001...")
try:
    # Use netstat to find PID of process on 3001
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
    print(f"Warning: Failed to scan port 3001: {e}")

# Step 3: Swap Table Folders
print("Swapping LanceDB folders...")
try:
    if os.path.exists(backup):
        shutil.rmtree(backup)
except Exception as be:
    print(f"Warning clearing old backup folder: {be}")

try:
    if os.path.exists(tbl):
        os.rename(tbl, backup)
    os.rename(v2_tbl, tbl)
    print("✅ LanceDB database table folders swapped successfully!")
    
    # Try cleaning backup
    if os.path.exists(backup):
        try:
            shutil.rmtree(backup)
            print("Cleared backup folder.")
        except:
            pass
except Exception as swap_err:
    print(f"❌ Critical Error swapping folders: {swap_err}")
    print("Attempting automatic rollback...")
    if os.path.exists(backup) and not os.path.exists(tbl):
        try:
            os.rename(backup, tbl)
            print("Rollback successful.")
        except Exception as rb_err:
            print(f"Fatal: Rollback failed: {rb_err}")
    sys.exit(1)

# Step 4: Rebuild FTS Index to ensure new books are text-searchable
try:
    print("Rebuilding FTS Index on the upgraded database table...")
    import lancedb
    db_conn = lancedb.connect(lancedb_dir)
    table = db_conn.open_table("textbooks")
    table.create_fts_index("text", replace=True)
    print("✅ FTS index rebuilt successfully!")
except Exception as fts_err:
    print(f"Warning: FTS index rebuild failed: {fts_err}")

# Step 5: Restart the Node.js server in a NEW console window (independent process)
print("Restarting Node.js backend server...")
try:
    # Use subprocess.Popen with CREATE_NEW_CONSOLE so it detaches and continues running
    # in the background after this Python script exits.
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
    print("Please manually run '启动AI辅导.bat' on your Desktop.")

print("=========================================")
print("  🚀 Hot Upgrade Completed in 2 Seconds!")
print("=========================================")
