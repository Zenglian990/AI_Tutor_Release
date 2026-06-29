import requests
import json
import time

def test_model(key, model):
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}"
    headers = {
        "Content-Type": "application/json"
    }
    data = {
        "contents": [{
            "parts": [{
                "text": "Hello, write a 3 word greeting."
            }]
        }]
    }
    proxies = {
        "http": "http://127.0.0.1:10909",
        "https": "http://127.0.0.1:10909"
    }
    
    print(f"正在测试模型 {model} ...")
    try:
        response = requests.post(url, headers=headers, json=data, proxies=proxies, timeout=15)
        print(f" 状态码: {response.status_code}")
        try:
            res_json = response.json()
        except:
            res_json = response.text
            
        if response.status_code == 200:
            text = res_json.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
            print(f" ✨ 成功！回复: {text.strip()}")
            return True
        else:
            print(f" 失败响应: {res_json}")
            return False
    except Exception as e:
        print(f" 请求异常: {e}")
        return False

if __name__ == "__main__":
    import os
    from dotenv import load_dotenv
    load_dotenv()
    key = os.environ.get("GEMINI_API_KEY", "your_gemini_api_key_here")
    models_to_test = ["gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-2.5-flash"]
    
    for m in models_to_test:
        test_model(key, m)
        print("-" * 50)
        time.sleep(2)  # 避免过快请求
