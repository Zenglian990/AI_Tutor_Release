# Canary Deployment & Traffic Splitting Guide

> [!WARNING]
> **免责声明 / Disclaimer**
> 
> 本文档描述的是**高级集群拓扑（Advanced Cluster Topology）**和金丝雀发布机制。当前代码库中自带的 `docker-compose.yml` 属于**单机标准部署版（Single-Node Standard Deployment）**。若需在生产环境中实践本文档的部署方案，请根据实际需求编写额外的负载均衡配置（如 Nginx/Traefik）和多实例容器编排。

> [!CAUTION]
> **SQLite 并发写入风险 (Concurrent Write Risk)**
> 
> 如果使用 SQLite 数据库，**绝不能让多个容器（如 stable 和 canary）挂载并共享同一个数据库文件。** SQLite 缺乏多进程并发写入的协调机制，会导致 `SQLITE_BUSY` 错误，甚至静默损坏整个数据库文件（Database Corruption）！若需双容器同时运行，必须：
> 1. 为 `canary` 分配完全独立的数据卷（例如 `./data-canary:/app/data`），但这将导致两套系统的数据相互隔离。
> 2. 如果需数据一致性，请放弃 SQLite，部署外置的 PostgreSQL 或 MySQL 容器。

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
      - ./data-canary:/app/data
```
