"""
从 GitHub TapXWorld/ChinaTextbook 下载缺失的18个教材文件
使用 requests 库 + urllib.parse.quote 正确处理中文路径
"""
import os
import sys
import time
from urllib.parse import quote

sys.stdout.reconfigure(encoding='utf-8')

import requests

BASE_URL = "https://raw.githubusercontent.com/TapXWorld/ChinaTextbook/master/"
from dotenv import load_dotenv
load_dotenv()
proxy_url = os.environ.get("HTTP_PROXY") or os.environ.get("PROXY_URL")
PROXY = {"http": proxy_url, "https": proxy_url} if proxy_url else None
LOCAL_BASE = "data/textbooks"

FILES_TO_DOWNLOAD = [
    # 初中 - 数学
    ("初中/数学/人教版-人民教育出版社/七年级/义务教育教科书·数学七年级下册.pdf",
     "初中/数学/人教版-人民教育出版社/七年级/义务教育教科书·数学七年级下册.pdf"),
    ("初中/数学/人教版-人民教育出版社/八年级/义务教育教科书·数学八年级下册.pdf",
     "初中/数学/人教版-人民教育出版社/八年级/义务教育教科书·数学八年级下册.pdf"),
    ("初中/数学/人教版-人民教育出版社/九年级/义务教育教科书·数学九年级下册.pdf",
     "初中/数学/人教版-人民教育出版社/九年级/义务教育教科书·数学九年级下册.pdf"),
    # 初中 - 英语
    ("初中/英语/人教版-人民教育出版社/七年级/义务教育教科书·英语七年级下册.pdf",
     "初中/英语/人教版-人民教育出版社/七年级/义务教育教科书·英语七年级下册.pdf"),
    ("初中/英语/人教版-人民教育出版社/八年级/义务教育教科书·英语八年级下册.pdf",
     "初中/英语/人教版-人民教育出版社/八年级/义务教育教科书·英语八年级下册.pdf"),
    # 初中 - 物理
    ("初中/物理/人教版-人民教育出版社/八年级/义务教育教科书·物理八年级下册.pdf",
     "初中/物理/人教版-人民教育出版社/八年级/义务教育教科书·物理八年级下册.pdf"),
    # 初中 - 化学
    ("初中/化学/人教版-人民教育出版社/九年级/义务教育教科书·化学九年级下册.pdf",
     "初中/化学/人教版-人民教育出版社/九年级/义务教育教科书·化学九年级下册.pdf"),
    # 初中 - 地理
    ("初中/地理/人教版-人民教育出版社/七年级/义务教育教科书·地理七年级下册.pdf",
     "初中/地理/人教版-人民教育出版社/七年级/义务教育教科书·地理七年级下册.pdf"),
    ("初中/地理/人教版-人民教育出版社/八年级/义务教育教科书·地理八年级下册.pdf",
     "初中/地理/人教版-人民教育出版社/八年级/义务教育教科书·地理八年级下册.pdf"),
    # 初中 - 生物学
    ("初中/生物学/人教版-人民教育出版社/七年级/义务教育教科书·生物学七年级下册.pdf",
     "初中/生物学/人教版-人民教育出版社/七年级/义务教育教科书·生物学七年级下册.pdf"),
    ("初中/生物学/人教版-人民教育出版社/八年级/义务教育教科书·生物学八年级下册.pdf",
     "初中/生物学/人教版-人民教育出版社/八年级/义务教育教科书·生物学八年级下册.pdf"),
    # 小学 - 数学
    ("小学/数学/人教版/义务教育教科书·数学二年级下册.pdf",
     "小学/数学/人教版/义务教育教科书·数学二年级下册.pdf"),
    # 小学英语（一年级起点）
    ("小学/英语/人教版（一年级起点）（主编：吴欣）/义务教育教科书·英语（一年级起点）一年级下册.pdf",
     "小学/英语/人教版（一年级起点）（主编：吴欣）/义务教育教科书·英语（一年级起点）一年级下册.pdf"),
    ("小学/英语/人教版（一年级起点）（主编：吴欣）/义务教育教科书·英语（一年级起点）二年级下册.pdf",
     "小学/英语/人教版（一年级起点）（主编：吴欣）/义务教育教科书·英语（一年级起点）二年级下册.pdf"),
    ("小学/英语/人教版（一年级起点）（主编：吴欣）/义务教育教科书·英语（一年级起点）三年级下册.pdf",
     "小学/英语/人教版（一年级起点）（主编：吴欣）/义务教育教科书·英语（一年级起点）三年级下册.pdf"),
    ("小学/英语/人教版（一年级起点）（主编：吴欣）/义务教育教科书·英语（一年级起点）四年级下册.pdf",
     "小学/英语/人教版（一年级起点）（主编：吴欣）/义务教育教科书·英语（一年级起点）四年级下册.pdf"),
    ("小学/英语/人教版（一年级起点）（主编：吴欣）/义务教育教科书·英语（一年级起点）五年级下册.pdf",
     "小学/英语/人教版（一年级起点）（主编：吴欣）/义务教育教科书·英语（一年级起点）五年级下册.pdf"),
    ("小学/英语/人教版（一年级起点）（主编：吴欣）/义务教育教科书·英语（一年级起点）六年级下册.pdf",
     "小学/英语/人教版（一年级起点）（主编：吴欣）/义务教育教科书·英语（一年级起点）六年级下册.pdf"),
]


import download_utils

def download_file_wrapper(github_path, local_rel_path):
    encoded_path = quote(github_path, safe='/')
    url = BASE_URL + encoded_path
    local_path = os.path.join(LOCAL_BASE, local_rel_path.replace("/", os.sep))
    print(f"  下载中: {os.path.basename(local_path)}", flush=True)
    return download_utils.download_file(url, local_path)

def remove_from_log(local_rel_path):
    """从 processed_pdfs_v2.log 移除，让 ingest 重新处理"""
    log_path = "data/processed_pdfs_v2.log"
    local_path = os.path.join(LOCAL_BASE, local_rel_path.replace("/", os.sep))
    # 规范化为正斜杠，与 log 格式一致
    norm = local_path.replace("\\", "/")
    if not os.path.exists(log_path):
        return
    with open(log_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    new_lines = [l for l in lines if norm not in l.replace("\\", "/")]
    with open(log_path, 'w', encoding='utf-8') as f:
        f.writelines(new_lines)


def main():
    print(f"=== 开始下载 {len(FILES_TO_DOWNLOAD)} 个缺失教材 ===\n", flush=True)
    success = 0
    failed = []

    for i, (gh_path, local_path) in enumerate(FILES_TO_DOWNLOAD, 1):
        print(f"[{i}/{len(FILES_TO_DOWNLOAD)}] {os.path.basename(gh_path)}", flush=True)
        ok, msg = download_file_wrapper(gh_path, local_path)
        print(f"  {msg}", flush=True)
        if ok:
            success += 1
            remove_from_log(local_path)
            print(f"  📝 已从 processed_pdfs.log 移除，待重新入库", flush=True)
        else:
            failed.append(gh_path)
        time.sleep(0.5)

    print(f"\n=== 下载完成 ===", flush=True)
    print(f"✅ 成功: {success}/{len(FILES_TO_DOWNLOAD)}", flush=True)
    if failed:
        print(f"❌ 失败 ({len(failed)}个):", flush=True)
        for f in failed:
            print(f"   {f}", flush=True)
    else:
        print("🎉 全部成功！可以运行 ingest_2_0.py 重新入库了", flush=True)


if __name__ == "__main__":
    main()
