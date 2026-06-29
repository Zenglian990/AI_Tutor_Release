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


def download_file(github_path, local_rel_path):
    # 正确对中文路径做 URL 编码（safe='/' 保留斜杠）
    encoded_path = quote(github_path, safe='/')
    url = BASE_URL + encoded_path
    local_path = os.path.join(LOCAL_BASE, local_rel_path.replace("/", os.sep))
    os.makedirs(os.path.dirname(local_path), exist_ok=True)

    for attempt in range(3):
        try:
            print(f"  下载中 (尝试{attempt+1}/3): {os.path.basename(local_path)}", flush=True)
            resp = requests.get(url, proxies=PROXY, timeout=90, stream=True)
            resp.raise_for_status()
            data = resp.content
            if len(data) < 1000:
                print(f"  ⚠️  文件太小({len(data)}字节)，跳过", flush=True)
                return False
            with open(local_path, 'wb') as f:
                f.write(data)
            size_kb = len(data) / 1024
            print(f"  ✅ 成功: {os.path.basename(local_path)} ({size_kb:.0f} KB)", flush=True)
            return True
        except Exception as e:
            print(f"  ❌ 失败(尝试{attempt+1}): {e}", flush=True)
            time.sleep(3)
    return False


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
        ok = download_file(gh_path, local_path)
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
        print("🎉 全部成功！可以运行 ingest_all.py 重新入库了", flush=True)


if __name__ == "__main__":
    main()
