# ADR-010: 用户数据隔离设计

## 状态
**提议中 (Proposed)** - 2026-02-21

## 背景

当前数据模型设计**完全缺失用户维度**，存在严重的安全和架构问题：

### 现状问题

1. **数据模型缺陷**
   - `Project`、`Upload`、`Conversation` 等核心表没有 `userId` 字段
   - 任何人都可以访问任何项目的数据
   - 无法区分不同用户的资源

2. **API 设计缺陷**
   - 所有接口都没有认证机制
   - 无法验证用户身份
   - 无法实现权限控制

3. **安全风险**
   - 用户 A 可以访问用户 B 的项目
   - 用户 A 可以修改/删除用户 B 的文件
   - 敏感教学资料完全暴露

## 决策

### 1. 数据模型改造

#### 新增 User 模型

```prisma
/// 用户模型
model User {
  id        String   @id @default(uuid())
  email     String   @unique
  username  String   @unique
  password  String   // bcrypt 哈希
  
  // 用户信息
  fullName  String?
  avatar    String?
  role      String   @default("teacher")  // teacher/admin
  
  // 关联关系
  projects  Project[]
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  @@index([email])
  @@index([username])
}
```

#### 修改现有模型

```prisma
model Project {
  id          String   @id @default(uuid())
  
  // 新增：用户关联
  userId      String
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  name        String
  description String?
  // ... 其他字段保持不变
  
  @@index([userId, status])
  @@index([userId, createdAt])
}

model Conversation {
  id          String   @id @default(uuid())
  projectId   String
  project     Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  
  // 通过 project.userId 间接关联用户
  
  role        String
  content     String
  metadata    String?
  
  createdAt   DateTime @default(now())
  
  @@index([projectId, createdAt])
}

// Upload、GenerationTask 等模型同理，通过 projectId 间接关联用户
```

### 2. 认证机制

#### JWT Token 认证

```python
# services/auth.py
from datetime import datetime, timedelta
import jwt
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

class AuthService:
    """认证服务"""
    
    def __init__(self):
        self.secret_key = os.getenv("JWT_SECRET_KEY")
        self.algorithm = "HS256"
        self.access_token_expire = 24 * 60  # 24 小时
    
    def create_access_token(self, user_id: str) -> str:
        """生成 JWT Token"""
        expire = datetime.utcnow() + timedelta(minutes=self.access_token_expire)
        payload = {
            "sub": user_id,
            "exp": expire
        }
        return jwt.encode(payload, self.secret_key, algorithm=self.algorithm)
    
    def verify_token(self, token: str) -> str:
        """验证 Token 并返回 user_id"""
        try:
            payload = jwt.decode(token, self.secret_key, algorithms=[self.algorithm])
            return payload["sub"]
        except jwt.ExpiredSignatureError:
            raise AuthException("Token 已过期")
        except jwt.InvalidTokenError:
            raise AuthException("无效的 Token")
    
    def hash_password(self, password: str) -> str:
        """密码哈希"""
        return pwd_context.hash(password)
    
    def verify_password(self, plain_password: str, hashed_password: str) -> bool:
        """验证密码"""
        return pwd_context.verify(plain_password, hashed_password)

auth_service = AuthService()
```

#### FastAPI 依赖注入

```python
# utils/dependencies.py
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

security = HTTPBearer()

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> str:
    """获取当前用户 ID"""
    token = credentials.credentials
    try:
        user_id = auth_service.verify_token(token)
        return user_id
    except AuthException as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(e),
            headers={"WWW-Authenticate": "Bearer"}
        )
```

### 3. API 改造

#### 认证接口

```python
# routers/auth.py
from fastapi import APIRouter, HTTPException, status
from schemas.auth import RegisterRequest, LoginRequest, AuthResponse

router = APIRouter(prefix="/api/v1/auth", tags=["Auth"])

@router.post("/register", response_model=AuthResponse)
async def register(request: RegisterRequest):
    """用户注册"""
    # 检查邮箱是否已存在
    existing_user = await db_service.get_user_by_email(request.email)
    if existing_user:
        raise HTTPException(status_code=400, detail="邮箱已被注册")
    
    # 创建用户
    hashed_password = auth_service.hash_password(request.password)
    user = await db_service.create_user(
        email=request.email,
        username=request.username,
        password=hashed_password,
        full_name=request.full_name
    )
    
    # 生成 Token
    token = auth_service.create_access_token(user.id)
    
    return AuthResponse(
        success=True,
        data={
            "token": token,
            "user": {
                "id": user.id,
                "email": user.email,
                "username": user.username,
                "full_name": user.fullName
            }
        },
        message="注册成功"
    )

@router.post("/login", response_model=AuthResponse)
async def login(request: LoginRequest):
    """用户登录"""
    # 查找用户
    user = await db_service.get_user_by_email(request.email)
    if not user:
        raise HTTPException(status_code=401, detail="邮箱或密码错误")
    
    # 验证密码
    if not auth_service.verify_password(request.password, user.password):
        raise HTTPException(status_code=401, detail="邮箱或密码错误")
    
    # 生成 Token
    token = auth_service.create_access_token(user.id)
    
    return AuthResponse(
        success=True,
        data={
            "token": token,
            "user": {
                "id": user.id,
                "email": user.email,
                "username": user.username,
                "full_name": user.fullName
            }
        },
        message="登录成功"
    )
```

#### 受保护的接口

```python
# routers/projects.py
from utils.dependencies import get_current_user

@router.post("/api/v1/projects")
async def create_project(
    request: CreateProjectRequest,
    user_id: str = Depends(get_current_user)  # 新增：用户认证
):
    """创建项目（需要认证）"""
    project = await db_service.create_project(
        user_id=user_id,  # 新增：关联用户
        name=request.name,
        subject=request.subject,
        grade_level=request.grade_level
    )
    return {"success": True, "data": {"project": project}}

@router.get("/api/v1/projects")
async def get_projects(
    user_id: str = Depends(get_current_user)  # 新增：用户认证
):
    """获取当前用户的项目列表"""
    projects = await db_service.get_user_projects(user_id)  # 新增：按用户过滤
    return {"success": True, "data": {"projects": projects}}

@router.get("/api/v1/projects/{project_id}")
async def get_project(
    project_id: str,
    user_id: str = Depends(get_current_user)  # 新增：用户认证
):
    """获取项目详情（需要权限）"""
    project = await db_service.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    
    # 新增：权限检查
    if project.userId != user_id:
        raise HTTPException(status_code=403, detail="无权访问此项目")
    
    return {"success": True, "data": {"project": project}}
```

### 4. 数据库服务改造

```python
# services/database.py
class DatabaseService:
    """数据库服务"""
    
    # 用户相关
    async def create_user(self, email: str, username: str, password: str, full_name: str = None):
        """创建用户"""
        return await self.prisma.user.create(
            data={
                "email": email,
                "username": username,
                "password": password,
                "fullName": full_name
            }
        )
    
    async def get_user_by_email(self, email: str):
        """根据邮箱查找用户"""
        return await self.prisma.user.find_unique(where={"email": email})
    
    # 项目相关（新增 user_id 参数）
    async def create_project(self, user_id: str, name: str, **kwargs):
        """创建项目"""
        return await self.prisma.project.create(
            data={
                "userId": user_id,  # 新增
                "name": name,
                **kwargs
            }
        )
    
    async def get_user_projects(self, user_id: str):
        """获取用户的项目列表"""
        return await self.prisma.project.find_many(
            where={"userId": user_id},  # 新增：按用户过滤
            order_by={"createdAt": "desc"}
        )
    
    async def check_project_permission(self, project_id: str, user_id: str) -> bool:
        """检查用户是否有权限访问项目"""
        project = await self.prisma.project.find_unique(
            where={"id": project_id}
        )
        return project and project.userId == user_id
```

### 5. RAG 数据隔离

```python
# services/rag_service.py
class RAGService:
    """RAG 检索服务"""
    
    async def add_chunks(self, project_id: str, user_id: str, chunks: List[Dict]):
        """添加文档块（新增 user_id）"""
        documents = [chunk["content"] for chunk in chunks]
        metadatas = [
            {
                "project_id": project_id,
                "user_id": user_id,  # 新增：用户隔离
                "chunk_index": chunk["chunk_index"],
                **chunk["metadata"]
            }
            for chunk in chunks
        ]
        ids = [f"{user_id}_{project_id}_{chunk['chunk_index']}" for chunk in chunks]
        
        self.collection.add(
            documents=documents,
            metadatas=metadatas,
            ids=ids
        )
    
    async def search(self, project_id: str, user_id: str, query: str, top_k: int = 5):
        """检索相关文档块（新增 user_id 过滤）"""
        results = self.collection.query(
            query_texts=[query],
            n_results=top_k,
            where={
                "project_id": project_id,
                "user_id": user_id  # 新增：用户隔离
            }
        )
        # ... 返回结果
```

## 实施计划

### Phase 1: 数据模型迁移（1-2 天）

1. 修改 `schema.prisma`
2. 创建迁移脚本
3. 测试数据迁移

### Phase 2: 认证服务（2-3 天）

1. 实现 `AuthService`
2. 实现注册/登录接口
3. 实现 JWT 中间件

### Phase 3: API 改造（3-5 天）

1. 所有接口添加认证依赖
2. 添加权限检查逻辑
3. 更新 OpenAPI 文档

### Phase 4: 前端适配（2-3 天）

1. 实现登录/注册页面
2. Token 存储与自动刷新
3. API 请求拦截器

### Phase 5: 测试与部署（2-3 天）

1. 单元测试
2. 集成测试
3. 安全测试

**总计：10-16 天**

## 后果

### 优势

1. **数据安全**：用户数据完全隔离
2. **合规性**：符合数据保护法规
3. **可扩展**：支持多租户、团队协作
4. **审计**：可追踪用户操作

### 劣势

1. **开发成本**：需要改造所有接口
2. **迁移风险**：现有数据需要迁移
3. **复杂度**：增加认证逻辑

### 风险

1. **数据迁移失败**：需要完善的回滚机制
2. **性能影响**：每次请求需要验证 Token
3. **兼容性**：前端需要同步改造

## 替代方案

### 方案 A：Session 认证

- 优势：实现简单，服务端控制强
- 劣势：不适合分布式部署，扩展性差

### 方案 B：OAuth 2.0

- 优势：支持第三方登录，标准化
- 劣势：实现复杂，MVP 阶段过度设计

### 方案 C：延迟实现

- 优势：MVP 快速上线
- 劣势：**严重的安全风险，不可接受**

## 参考资料

- [FastAPI Security](https://fastapi.tiangolo.com/tutorial/security/)
- [JWT Best Practices](https://tools.ietf.org/html/rfc8725)
- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)

## 相关决策

- ADR-001: 技术栈选型
- ADR-003: 数据库设计
