"""一键将 AI_Tutor_Release 云端网关与自动构建引擎部署至第2个 Hugging Face Space (zenglian110110/ai-tutor-release)."""
import json
import os
import urllib.request
from pathlib import Path

SPACE_ID = os.getenv("HF_SPACE_ID", "zenglian110110/ai-tutor-release")

README_MD = """---
title: 曾练专属私教 (ZengLian AI Tutor 1-9年级)
emoji: 🎓
colorFrom: blue
colorTo: indigo
sdk: gradio
sdk_version: 5.23.1
app_file: app.py
pinned: true
---

# 🎓 曾练专属私教 (ZengLian AI Tutor) — 1-9年级 AI 深度辅导云端后端
"""

APP_PY = '''"""Hugging Face Spaces (ZeroGPU + Node.js 22 + LanceDB RAG) 启动入口 — 曾练专属私教 (AI_Tutor_Release)."""
import os
import shutil
import subprocess
import threading
import time
from pathlib import Path

import gradio as gr
import gradio.routes
import httpx
import spaces

WORK_DIR = Path("/tmp/ai_tutor_app")
NODE_DIR = Path("/tmp/node22")
REPO_URL = "https://github.com/Zenglian990/AI_Tutor_Release.git"
NODE_PORT = 3001

BOOT_STATE = {
    "status": "starting",
    "step": "准备初始化...",
    "logs": [],
    "node_pid": None,
}


def _log(msg: str):
    ts = time.strftime("%H:%M:%S")
    for line in str(msg).splitlines():
        if line.strip():
            entry = f"[{ts}] {line}"
            print(entry, flush=True)
            BOOT_STATE["logs"].append(entry)
    if len(BOOT_STATE["logs"]) > 100:
        BOOT_STATE["logs"] = BOOT_STATE["logs"][-100:]


def _run(cmd, cwd=None, env=None, check=True):
    res = subprocess.run(
        cmd,
        cwd=cwd,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    if res.returncode != 0:
        _log(f"Command failed ({cmd}):\\n{res.stdout[-1500:]}")
        if check:
            raise RuntimeError(f"Command {cmd} failed: {res.stdout[-400:]}")
    return res


def _ensure_node22() -> str:
    node_bin = NODE_DIR / "bin" / "node"
    if node_bin.exists():
        os.environ["PATH"] = f"{NODE_DIR / 'bin'}:{os.environ.get('PATH', '')}"
        try:
            ver = subprocess.check_output([str(node_bin), "-v"]).decode().strip()
            if ver.startswith("v22.16") or ver.startswith("v22.17"):
                return str(node_bin)
        except Exception:
            pass
        shutil.rmtree(NODE_DIR, ignore_errors=True)

    _log("正在下载官方 Node.js v22.16.0 LTS (支持 zstd 压缩与原生 fetch)...")
    NODE_DIR.mkdir(parents=True, exist_ok=True)
    tar_url = "https://nodejs.org/dist/v22.16.0/node-v22.16.0-linux-x64.tar.xz"
    subprocess.run(
        f"curl -fsSL {tar_url} | tar -xJ --strip-components=1 -C {NODE_DIR}",
        shell=True,
        check=True,
    )
    os.environ["PATH"] = f"{NODE_DIR / 'bin'}:{os.environ.get('PATH', '')}"
    ver = subprocess.check_output(["node", "-v"]).decode().strip()
    _log(f"Node.js 安装完成: {ver}")
    return str(node_bin)


_SUPERVISOR_LOCK = threading.Lock()
_SUPERVISOR_RUNNING = False


def _spawn_node_once(env_srv):
    proc = subprocess.Popen(
        ["node", "server/index.js"],
        cwd=str(WORK_DIR),
        env=env_srv,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    BOOT_STATE["node_pid"] = proc.pid

    def _read_node_out(p):
        for line in p.stdout:
            _log(f"[Node] {line.rstrip()}")

    threading.Thread(target=_read_node_out, args=(proc,), daemon=True).start()
    return proc


def _ensure_supervisor(env_srv):
    global _SUPERVISOR_RUNNING
    with _SUPERVISOR_LOCK:
        if _SUPERVISOR_RUNNING:
            return
        _SUPERVISOR_RUNNING = True

    def _watch():
        while True:
            time.sleep(3)
            if BOOT_STATE["status"] != "online":
                continue
            pid = BOOT_STATE.get("node_pid")
            alive = False
            if pid:
                try:
                    os.kill(pid, 0)
                    alive = True
                except Exception:
                    alive = False
            if not alive:
                _log("[Supervisor] 检测到 Node.js 进程退出，正在自动拉起恢复...")
                _spawn_node_once(env_srv)

    threading.Thread(target=_watch, daemon=True).start()


def bootstrap_ai_tutor(force_pull: bool = False):
    try:
        BOOT_STATE["status"] = "building"
        BOOT_STATE["step"] = "1/5 安装 Node.js 22.16 LTS 运行时"
        _ensure_node22()

        if not (WORK_DIR / "package.json").exists():
            BOOT_STATE["step"] = "2/5 从 GitHub 克隆 Zenglian990/AI_Tutor_Release"
            _log(f"正在克隆仓库 {REPO_URL} ...")
            if WORK_DIR.exists():
                shutil.rmtree(WORK_DIR)
            _run(["git", "clone", "--depth", "1", REPO_URL, str(WORK_DIR)])
        elif force_pull:
            BOOT_STATE["step"] = "2/5 从 GitHub 拉取最新代码 (git pull)"
            _log("正在拉取 GitHub 最新提交...")
            _run(["git", "pull", "--ff-only"], cwd=str(WORK_DIR))

        BOOT_STATE["step"] = "3/5 安装后端依赖与构建 React 前端"
        if not (WORK_DIR / "node_modules").exists() or force_pull:
            _log("正在安装后端 npm 生产依赖 (LanceDB / SQLite / Express)...")
            _run(["npm", "install", "--omit=dev"], cwd=str(WORK_DIR))
            # 确保 @lancedb/lancedb 与 sqlite3 使用兼容当前 Debian/Ubuntu GLIBC 的预编译二进制版本
            _log("正在校准 @lancedb/lancedb@0.15.0 与 sqlite3@5.1.7 原生引擎...")
            _run(
                ["npm", "install", "@lancedb/lancedb@0.15.0", "sqlite3@5.1.7", "--omit=dev"],
                cwd=str(WORK_DIR),
            )
            chk_sq = _run(["node", "-e", "require('sqlite3')"], cwd=str(WORK_DIR), check=False)
            if chk_sq.returncode != 0:
                _log("正在从源码编译 sqlite3 原生绑定...")
                _run(["npm", "rebuild", "sqlite3", "--build-from-source"], cwd=str(WORK_DIR))

        if not (WORK_DIR / "client" / "dist" / "index.html").exists() or force_pull:
            _log("正在编译 1-9 年级前端交互工作台 (client/dist)...")
            env_build = os.environ.copy()
            env_build["VITE_API_URL"] = ""
            _run(
                ["npm", "install", "--legacy-peer-deps"],
                cwd=str(WORK_DIR / "client"),
                env=env_build,
            )
            _run(
                ["npm", "run", "build"],
                cwd=str(WORK_DIR / "client"),
                env=env_build,
            )

        BOOT_STATE["step"] = "4/5 初始化 1-9 年级人教版教材向量库 (LanceDB) 与真题库"
        (WORK_DIR / "data" / "lancedb").mkdir(parents=True, exist_ok=True)
        (WORK_DIR / "logs").mkdir(parents=True, exist_ok=True)
        if not (WORK_DIR / "data" / ".seeded").exists():
            _log("正在解压并导入 1-9 年级教材与真题种子库...")
            _run(["node", "scripts/seed_demo_data.js"], cwd=str(WORK_DIR), check=False)
            (WORK_DIR / "data" / ".seeded").write_text("ok", encoding="utf-8")

        BOOT_STATE["step"] = "5/5 启动曾练专属私教 Node.js 后端服务"
        if BOOT_STATE["node_pid"]:
            try:
                os.kill(BOOT_STATE["node_pid"], 15)
                time.sleep(1)
            except Exception:
                pass

        env_srv = os.environ.copy()
        for k in list(env_srv.keys()):
            if k.startswith("GEMINI_API_KEY") or k.startswith("DEEPSEEK_API_KEY"):
                env_srv.pop(k, None)
        if (WORK_DIR / ".env").exists():
            (WORK_DIR / ".env").unlink(missing_ok=True)
        env_srv["PORT"] = str(NODE_PORT)
        env_srv["NODE_ENV"] = "production"
        env_srv["ALLOWED_ORIGINS"] = "*"
        env_srv["CLOUD_PUBLIC_MODE"] = "true"
        env_srv["CHAT_MODEL"] = os.getenv("CHAT_MODEL", "gemini-2.5-flash")
        env_srv["EMBED_MODEL"] = os.getenv("EMBED_MODEL", "gemini-embedding-001")

        proc = _spawn_node_once(env_srv)
        _ensure_supervisor(env_srv)

        # 等待 3001 端口就绪
        for _ in range(60):
            if proc.poll() is not None:
                raise RuntimeError(f"Node server exited early with code {proc.returncode}")
            try:
                r = httpx.get(f"http://127.0.0.1:{NODE_PORT}/api/health", timeout=2.0)
                if r.status_code == 200:
                    BOOT_STATE["status"] = "online"
                    BOOT_STATE["step"] = "✅ 曾练专属私教 (1-9年级) 云端全栈已就绪！"
                    _log("AI_Tutor_Release 服务已成功上线！")
                    return
            except Exception:
                pass
            time.sleep(1)

        BOOT_STATE["status"] = "online"
        BOOT_STATE["step"] = "✅ 服务进程已启动"
    except Exception as e:
        BOOT_STATE["status"] = "error"
        BOOT_STATE["step"] = f"❌ 启动异常: {e}"
        _log(f"ERROR: {e}")


def get_status():
    return {
        "status": BOOT_STATE["status"],
        "current_step": BOOT_STATE["step"],
        "node_pid": BOOT_STATE["node_pid"],
        "recent_logs": BOOT_STATE["logs"][-25:],
    }


def trigger_github_sync():
    threading.Thread(target=bootstrap_ai_tutor, kwargs={"force_pull": True}, daemon=True).start()
    time.sleep(1)
    return get_status()


@spaces.GPU(duration=20)
def wake_zerogpu():
    try:
        out = (
            subprocess.check_output(
                ["nvidia-smi", "--query-gpu=name,memory.total", "--format=csv,noheader"]
            )
            .decode()
            .strip()
        )
        return f"✅ ZeroGPU 显卡已激活: {out}"
    except Exception as e:
        return f"GPU 状态: {e}"


# ASGI 透明反向代理：将 /tutor、/api/*、/assets/* 及 PWA 静态文件无缝转发至 Node.js (127.0.0.1:3001)
_orig_asgi_call = gradio.routes.App.__call__

STATIC_PREFIXES = (
    "/api/",
    "/assets/",
    "/manifest",
    "/pwa-",
    "/apple-touch-icon",
    "/sw.js",
    "/workbox-",
    "/registerSW.js",
    "/favicon",
)


async def _proxy_to_node_asgi(scope, receive, send):
    path = scope.get("path", "/")
    if path == "/tutor" or path == "/tutor/":
        target_path = "/"
    elif path.startswith("/tutor/"):
        target_path = path[len("/tutor") :]
    else:
        target_path = path

    if BOOT_STATE["status"] != "online":
        body = (
            "<html><head><meta charset='utf-8'><meta http-equiv='refresh' content='3'>"
            "<title>曾练专属私教正在启动...</title></head>"
            "<body style='background:#0f172a;color:#f8fafc;font-family:sans-serif;padding:40px;text-align:center;'>"
            f"<h2>🎓 曾练专属私教 (1-9年级) 云端引擎正在初始化...</h2>"
            f"<p style='color:#38bdf8;font-size:18px;'>当前进度：{BOOT_STATE['step']}</p>"
            "<p style='color:#94a3b8;'>页面每 3 秒自动刷新，完成后将直接进入系统</p>"
            "<pre style='text-align:left;max-width:800px;margin:20px auto;background:#1e293b;padding:16px;border-radius:8px;overflow:auto;'>"
            + "\\n".join(BOOT_STATE["logs"][-20:])
            + "</pre></body></html>"
        ).encode("utf-8")
        await send(
            {
                "type": "http.response.start",
                "status": 200,
                "headers": [(b"content-type", b"text/html; charset=utf-8")],
            }
        )
        await send({"type": "http.response.body", "body": body})
        return

    query = scope.get("query_string", b"").decode("utf-8")
    url = f"http://127.0.0.1:{NODE_PORT}{target_path}" + (f"?{query}" if query else "")
    method = scope.get("method", "GET")

    req_headers = []
    for k, v in scope.get("headers", []):
        kl = k.decode("latin1").lower()
        if kl not in ("host", "content-length", "connection"):
            req_headers.append((k.decode("latin1"), v.decode("latin1")))

    body_chunks = []
    while True:
        message = await receive()
        if message["type"] == "http.request":
            body_chunks.append(message.get("body", b""))
            if not message.get("more_body", False):
                break
        elif message["type"] == "http.disconnect":
            return
    req_body = b"".join(body_chunks)

    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            req = client.build_request(method, url, headers=req_headers, content=req_body)
            resp = await client.send(req, stream=True)
            resp_headers = [
                (k.encode("latin1"), v.encode("latin1"))
                for k, v in resp.headers.multi_items()
                if k.lower() not in ("transfer-encoding", "content-encoding", "content-length", "connection")
            ]
            await send(
                {
                    "type": "http.response.start",
                    "status": resp.status_code,
                    "headers": resp_headers,
                }
            )
            async for chunk in resp.aiter_raw():
                await send({"type": "http.response.body", "body": chunk, "more_body": True})
            await send({"type": "http.response.body", "body": b"", "more_body": False})
            await resp.aclose()
    except Exception as exc:
        err_json = (
            '{"success":false,"error":"后端引擎正在自动恢复，请稍后重试","details":"'
            + str(exc).replace('"', "'")
            + '"}'
        ).encode("utf-8")
        await send(
            {
                "type": "http.response.start",
                "status": 502,
                "headers": [(b"content-type", b"application/json; charset=utf-8")],
            }
        )
        await send({"type": "http.response.body", "body": err_json, "more_body": False})


async def _hybrid_asgi_call(self, scope, receive, send):
    if scope["type"] == "http":
        path = scope.get("path", "")
        if path == "/tutor" or path.startswith("/tutor/") or path.startswith(STATIC_PREFIXES):
            return await _proxy_to_node_asgi(scope, receive, send)
        if path.endswith((".js", ".css", ".png", ".svg", ".ico", ".woff2")) and (
            WORK_DIR / "client" / "dist" / path.lstrip("/")
        ).exists():
            return await _proxy_to_node_asgi(scope, receive, send)
    return await _orig_asgi_call(self, scope, receive, send)


gradio.routes.App.__call__ = _hybrid_asgi_call

threading.Thread(target=bootstrap_ai_tutor, daemon=True).start()

with gr.Blocks(title="曾练专属私教 (ZengLian AI Tutor)") as demo:
    gr.Markdown("## 🎓 曾练专属私教 (ZengLian AI Tutor) — 1-9年级 AI 深度辅导云端中枢")
    gr.HTML(
        '<div style="margin:12px 0;padding:16px;border-radius:10px;background:#1e3a8a;color:#fff;">'
        '🚀 <b>1-9年级 AI 深度辅导全栈工作台：</b> '
        '<a href="/tutor" target="_blank" style="color:#38bdf8;font-weight:bold;font-size:16px;text-decoration:underline;">'
        '👉 点击进入《曾练专属私教》全屏系统 (/tutor)</a> ｜ '
        '移动端/外部 API 地址：<code>https://zenglian110110-ai-tutor-release.hf.space</code>'
        "</div>"
    )
    with gr.Row():
        btn_status = gr.Button("📊 刷新云端构建/运行状态", variant="primary")
        btn_sync = gr.Button("🔄 一键从 GitHub 同步最新代码并热重启")
        btn_gpu = gr.Button("⚡ 唤醒免费 48GB 显卡 (ZeroGPU)")
    status_json = gr.JSON(label="云端服务状态与实时日志", value=get_status)
    gpu_out = gr.Textbox(label="ZeroGPU 显卡状态")
    btn_status.click(fn=get_status, outputs=status_json)
    btn_sync.click(fn=trigger_github_sync, outputs=status_json)
    btn_gpu.click(fn=wake_zerogpu, outputs=gpu_out)

if __name__ == "__main__":
    demo.launch()
'''


def _get_hf_token() -> str:
    env_tok = os.getenv("HF_TOKEN", "").strip()
    if env_tok:
        return env_tok
    token_file = Path.home() / ".huggingface" / "token"
    if token_file.exists():
        return token_file.read_text(encoding="utf-8").strip()
    raise RuntimeError("Missing HF_TOKEN environment variable or ~/.huggingface/token")


def deploy():
    token = _get_hf_token()
    lines = [
        json.dumps(
            {
                "key": "header",
                "value": {
                    "summary": "Upgrade Node to v22.16.0 (zstd fix), set gemini-2.5-flash & process supervisor"
                },
            }
        ),
        json.dumps(
            {
                "key": "file",
                "value": {"content": README_MD, "path": "README.md", "encoding": "utf-8"},
            }
        ),
        json.dumps(
            {
                "key": "file",
                "value": {"content": APP_PY, "path": "app.py", "encoding": "utf-8"},
            }
        ),
        json.dumps(
            {
                "key": "file",
                "value": {"content": "httpx>=0.27.0\n", "path": "requirements.txt", "encoding": "utf-8"},
            }
        ),
    ]
    body = "\n".join(lines).encode("utf-8")
    url = f"https://huggingface.co/api/spaces/{SPACE_ID}/commit/main"
    req = urllib.request.Request(
        url,
        data=body,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/x-ndjson",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        result = json.loads(resp.read().decode("utf-8"))
        print(f"Deployed AI_Tutor_Release gateway -> {result.get('commitUrl')}")


if __name__ == "__main__":
    deploy()
