# Canary Deployment & Traffic Splitting Guide

This guide details how to implement gray (canary) releases for the **曾练专属私教** AI Tutor project, allowing you to test updates safely with a subset of users before full rollout.

---

## 1. Nginx-Based Canary Routing (Recommended)

Using Nginx as a reverse proxy, you can split traffic based on request headers, cookies, or IP ranges.

### Option A: Header-Based Splitting (e.g. `x-canary`)
Route requests containing the `x-canary: true` header to the canary version, and all others to the stable version.

```nginx
# Nginx Configuration (/etc/nginx/nginx.conf)
http {
    upstream stable_backend {
        server 127.0.0.1:3001; # Stable version port
    }

    upstream canary_backend {
        server 127.0.0.1:3002; # Canary version port
    }

    map $http_x_canary $backend_pool {
        "true"  canary_backend;
        default stable_backend;
    }

    server {
        listen 80;
        server_name aitutor.zeng.com;

        location / {
            proxy_pass http://$backend_pool;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }
    }
}
```

### Option B: Percentage-Based Traffic Splitting (e.g. 10% Canary)
Route exactly 10% of users randomly to the canary backend.

```nginx
http {
    upstream stable_backend {
        server 127.0.0.1:3001;
    }

    upstream canary_backend {
        server 127.0.0.1:3002;
    }

    # Split 10% to canary, 90% to stable
    split_clients "${remote_addr}AAA" $canary_pool {
        10%     canary_backend;
        *       stable_backend;
    }

    server {
        listen 80;
        server_name aitutor.zeng.com;

        location / {
            proxy_pass http://$canary_pool;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        }
    }
}
```

---

## 2. Docker Compose Canary Deployment

Here is a sample `docker-compose.yml` to run both Stable and Canary nodes concurrently:

```yaml
version: '3.8'

services:
  stable:
    image: aitutor:stable
    ports:
      - "3001:3001"
    environment:
      - NODE_ENV=production
      - PORT=3001
    volumes:
      - ./data:/app/data

  canary:
    image: aitutor:canary
    ports:
      - "3002:3001" # Host port 3002, container port 3001
    environment:
      - NODE_ENV=production
      - PORT=3001
      - IS_CANARY=true
    volumes:
      - ./data:/app/data
```
