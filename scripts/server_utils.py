import os
import time
import shutil
import urllib.request
import urllib.error
import psutil
from dotenv import load_dotenv

# Reconfigure stdout to use utf-8
import sys
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

# Get absolute paths dynamically based on this script's location
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
DATA_DIR = os.path.join(PROJECT_ROOT, 'data')
ENV_PATH = os.path.join(PROJECT_ROOT, '.env')
LANCEDB_DIR = os.path.join(DATA_DIR, 'lancedb')

def load_api_token():
    load_dotenv(ENV_PATH)
    return os.getenv('API_TOKEN')

def stop_server(port=3001):
    print(f"Scanning for active Node.js processes on port {port}...")
    pids = set()
    for conn in psutil.net_connections(kind='inet'):
        if conn.laddr.port == port and conn.pid:
            pids.add(conn.pid)
            
    if not pids:
        print(f"No active processes found on port {port}.")
        return

    print(f"Found active PID(s) on port {port}: {pids}")
    
    # Try graceful shutdown via API
    shutdown_success = False
    api_token = load_api_token()
    
    if api_token:
        print("Sending graceful shutdown request via API...")
        url = f"http://localhost:{port}/api/admin/shutdown"
        try:
            req = urllib.request.Request(
                url, 
                method='POST',
                headers={'Authorization': f'Bearer {api_token}'}
            )
            with urllib.request.urlopen(req, timeout=3) as response:
                if response.status == 200:
                    print("✅ Graceful shutdown command acknowledged by server.")
                    # Wait up to 3 seconds for node process to flush WAL and exit
                    for _ in range(3):
                        time.sleep(1)
                        still_alive = any(psutil.pid_exists(pid) for pid in pids)
                        if not still_alive:
                            print("✅ Server exited gracefully.")
                            shutdown_success = True
                            break
        except Exception as api_err:
            print(f"Graceful shutdown API call failed or timed out: {api_err}")
            
    # Fallback to force kill if graceful shutdown did not succeed
    if not shutdown_success:
        print("Graceful shutdown failed or timed out. Falling back to force kill...")
        for pid in pids:
            try:
                proc = psutil.Process(pid)
                print(f"Force-killing PID {pid} ({proc.name()}) ...")
                proc.kill()
            except psutil.NoSuchProcess:
                pass
            except Exception as e:
                print(f"Failed to kill PID {pid}: {e}")
        time.sleep(1)
        print("Backend server stopped.")

def swap_lancedb_tables(table_name="textbooks.lance", v2_table_name="textbooks_v2.lance"):
    tbl = os.path.join(LANCEDB_DIR, table_name)
    v2_tbl = os.path.join(LANCEDB_DIR, v2_table_name)
    backup = tbl + "_old"

    if not os.path.exists(v2_tbl):
        print(f"❌ Error: {v2_table_name} table does not exist at {v2_tbl}!")
        print("Please make sure the ingestion has run successfully.")
        return False

    print("Swapping LanceDB folders...")
    try:
        if os.path.exists(backup):
            shutil.rmtree(backup)
        if os.path.exists(tbl):
            os.rename(tbl, backup)
            print(f"  - Backed up {table_name} to {table_name}_old")
        os.rename(v2_tbl, tbl)
        print(f"  - Swapped {v2_table_name} to {table_name}")
        return True
    except Exception as e:
        print(f"❌ Swap failed: {e}")
        # Rollback attempt
        if not os.path.exists(tbl) and os.path.exists(backup):
            print("Attempting rollback...")
            os.rename(backup, tbl)
            print("Rollback completed.")
        return False

def print_restart_instruction():
    print("=========================================")
    print("✅ Upgrade Complete!")
    print("Please manually restart the server (e.g., using start.sh or 启动AI辅导.bat).")
    print("=========================================")
