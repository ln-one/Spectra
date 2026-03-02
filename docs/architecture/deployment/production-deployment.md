# Production Deployment

## 生产环境架构

```
Internet → Load Balancer → Frontend Pods
 → Backend Pods → PostgreSQL
 → Redis
 → ChromaDB
 → OSS/S3
```

## 数据库迁移

### SQLite → PostgreSQL

**1. 安装 PostgreSQL**：
```bash
docker run -d \
 --name postgres \
 -e POSTGRES_PASSWORD=your_password \
 -e POSTGRES_DB=spectra \
 -p 5432:5432 \
 postgres:15
```

**2. 修改 Prisma Schema**：
```prisma
datasource db {
 provider = "postgresql"
 url = env("DATABASE_URL")
}
// 补充说明：在生产环境下使用二进制引擎以提高 Linux 环境兼容性
generator client {
 provider = "prisma-client-js"
 binaryTargets = ["native", "debian-openssl-1.1.x", "linux-musl"]
}
```

**3. 更新环境变量**：
```bash
DATABASE_URL="postgresql://user:password@localhost:5432/spectra"
```

**4. 执行迁移**：
```bash
prisma migrate dev --name init
prisma db push
```

## 文件存储迁移

### 本地文件 → OSS/S3

**封装存储服务**：
```python
# backend/services/storage.py
class StorageService(ABC):
 @abstractmethod
 def upload(self, file_path: str, object_name: str) -> str:
 pass

class OSSStorage(StorageService):
 def __init__(self, access_key: str, secret_key: str, bucket: str):
 import oss2
 auth = oss2.Auth(access_key, secret_key)
 self.bucket = oss2.Bucket(auth, 'oss-cn-hangzhou.aliyuncs.com', bucket)
 
 def upload(self, file_path: str, object_name: str) -> str:
 self.bucket.put_object_from_file(object_name, file_path)
 return f"https://{self.bucket.bucket_name}.oss-cn-hangzhou.aliyuncs.com/{object_name}"
```
## 网关配置 (Nginx)

生产环境建议使用 Nginx 作为反向代理，处理 SSL 和长连接：

```nginx
server {
 listen 443 ssl;
 server_name spectra.yourdomain.com;

 # 前端静态资源
 location / {
 proxy_pass http://frontend:3000;
 }

 # 后端 API
 location /api/ {
 proxy_pass http://backend:8000/;
 proxy_read_timeout 300s; # 重要：调高超时以支持长时间的 AI 生成任务
 proxy_set_header Host $host;
 proxy_set_header X-Real-IP $remote_addr;
 }
}
```

## 缓存层

### Redis 集成

```python
# backend/services/cache.py
import redis

class CacheService:
 def __init__(self):
 self.redis = redis.Redis(
 host=os.getenv("REDIS_HOST", "localhost"),
 port=int(os.getenv("REDIS_PORT", 6379)),
 decode_responses=True
 )
 
 def get(self, key: str) -> Optional[dict]:
 value = self.redis.get(key)
 return json.loads(value) if value else None
 
 def set(self, key: str, value: dict, ttl: int = 3600):
 self.redis.setex(key, ttl, json.dumps(value))
```

## 监控与日志

### 结构化日志

```python
# backend/utils/logger.py
class JSONFormatter(logging.Formatter):
 def format(self, record):
 log_data = {
 "timestamp": datetime.utcnow().isoformat(),
 "level": record.levelname,
 "message": record.getMessage(),
 "module": record.module,
 }
 return json.dumps(log_data)
```

## 安全加固

1. **HTTPS 强制**
2. **JWT 认证**
3. **API 限流**
4. **输入验证**
5. **数据库加密**

## 备份策略

```bash
# 数据库备份
pg_dump -U user spectra > backup/spectra-$(date +%Y%m%d).sql

# 文件备份
tar -czf backup/uploads-$(date +%Y%m%d).tar.gz backend/uploads
```

## 相关文档

- [Environment Variables](./environment-variables.md) - 环境变量
- [Deployment Overview](../deployment.md) - 部署总览
- [Troubleshooting](./troubleshooting.md) - 常见问题排查
