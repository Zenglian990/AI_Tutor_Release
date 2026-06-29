"""
keypool.py — Shared API key pool for Python ingestion scripts.
Avoids code duplication between ingest_2_0.py and ocr_scanned_pdfs.py.
"""
import os
import time
import requests
from dotenv import load_dotenv

load_dotenv()

API_KEYS = []
for i in range(1, 100):
    key_name = "GEMINI_API_KEY" if i == 1 else f"GEMINI_API_KEY_{i}"
    k = os.environ.get(key_name)
    if k:
        API_KEYS.append(k)

if not API_KEYS:
    raise ValueError("No GEMINI_API_KEY found in environment!")

_key_cooldowns = {}
_key_last_used = {}


def get_next_key():
    now = time.time()
    # Filter keys not in cooldown
    available = [k for k in API_KEYS if k not in _key_cooldowns or now > _key_cooldowns[k]]
    
    # If all in cooldown, pick the one with earliest cooldown expiration
    if not available:
        selected = min(API_KEYS, key=lambda k: _key_cooldowns.get(k, 0))
    else:
        # Pick the key that was used the furthest in the past (Least-Recently-Used)
        selected = min(available, key=lambda k: _key_last_used.get(k, 0))
        
    _key_last_used[selected] = now
    return selected


def cooldown_key(key, duration=60):
    _key_cooldowns[key] = time.time() + duration


def get_embedding(text, model_name=None):
    """Generate embedding vector for text using Gemini Embedding API."""
    embed_model = model_name or os.environ.get("EMBED_MODEL", "gemini-embedding-2")
    headers = {"Content-Type": "application/json"}
    payload = {
        "model": f"models/{embed_model}",
        "content": {"parts": [{"text": text[:1500]}]}
    }

    proxy_url = os.environ.get("HTTP_PROXY") or os.environ.get("PROXY_URL")
    proxies = {"http": proxy_url, "https": proxy_url} if proxy_url else None

    keys_tried = 0
    max_retries = max(8, len(API_KEYS) * 4)
    while keys_tried < max_retries:
        current_key = get_next_key()
        embed_url = f"https://generativelanguage.googleapis.com/v1beta/models/{embed_model}:embedContent?key={current_key}"
        try:
            response = requests.post(embed_url, headers=headers, json=payload, proxies=proxies, timeout=30)
            if response.status_code == 200:
                return response.json().get("embedding", {}).get("values")
            elif response.status_code == 429:
                cooldown_key(current_key, 60)
                keys_tried += 1
                if keys_tried % len(API_KEYS) == 0:
                    time.sleep(10)
            else:
                cooldown_key(current_key, 10)
                time.sleep(3)
                keys_tried += 1
        except Exception:
            cooldown_key(current_key, 15)
            time.sleep(5)
            keys_tried += 1
    return None
