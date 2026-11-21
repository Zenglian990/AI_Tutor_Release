import os
import sys
import server_utils

print("=========================================")
print("      曾练专属私教 极速热切换升级程序")
print("=========================================")

# Step 1: Find and Kill the Node.js process occupying port 3001
print("Stopping active Node.js server on port 3001...")
server_utils.stop_server(3001)

# Step 2: Swap Table Folders
success = server_utils.swap_lancedb_tables("textbooks.lance", "textbooks_v2.lance")
if not success:
    sys.exit(1)

# Step 3: Rebuild FTS Index to ensure new books are text-searchable
try:
    print("Rebuilding FTS Index on the upgraded database table...")
    import lancedb
    db_conn = lancedb.connect(server_utils.LANCEDB_DIR)
    table = db_conn.open_table("textbooks")
    table.create_fts_index("text", replace=True)
    print("✅ FTS index rebuilt successfully!")
except Exception as fts_err:
    print(f"Warning: FTS index rebuild failed: {fts_err}")

# Step 4: Restart the Node.js server
print("Backend server must be manually restarted to complete the upgrade.")
server_utils.print_restart_instruction()

print("=========================================")
print("  🚀 Hot Upgrade Completed!")
print("=========================================")
