# ADR 004: 认证系统轻量实现策略

## 状态
已接受 (2026-02-25)

## 背景
在当前迭代中，需要实现完整的认证流程（注册、登录、刷新、登出），但为了降低开发成本和加快迭代速度，需要在功能完整性和实现复杂度之间找到平衡。

## 决策

### 1. Refresh Token 实现
**决策**: 采用基础 JWT 续期实现，不依赖 Redis/数据库

**理由**:
- 第一版优先验证核心流程，避免引入 Redis 依赖
- JWT 自包含特性足以支持基础的 Token 刷新
- 降低部署和运维复杂度

**实现**:
```python
def create_refresh_token(self, data: dict) -> str:
 """生成 Refresh Token (7天有效期)"""
 to_encode = data.copy()
 expire = datetime.utcnow() + timedelta(days=7)
 to_encode.update({"exp": expire, "type": "refresh"})
 return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
```

**未来优化**:
- 引入 Redis 存储 Refresh Token，支持主动撤销
- 实现 Token 轮转机制（Refresh Token Rotation）
- 添加设备指纹绑定

### 2. Logout 实现
**决策**: 轻量实现，直接返回成功，依赖前端清空 Token

**理由**:
- 避免引入 Token 黑名单机制（需要 Redis）
- JWT 无状态特性决定了服务端无法主动失效 Token
- 前端清空 Token 已能满足基本安全需求

**实现**:
```python
@router.post("/logout")
async def logout(current_user = Depends(get_current_user)):
 """退出登录（轻量实现）"""
 return {"success": True, "message": "Logged out successfully"}
```

**安全考虑**:
- Access Token 短期有效（30分钟），即使泄露影响有限
- 前端必须清空 localStorage/sessionStorage 中的 Token
- 敏感操作需要二次验证

**未来优化**:
- 引入 Redis Token 黑名单
- 实现全局登出（撤销所有设备的 Token）
- 添加登出日志审计

### 3. Username 验证规则
**决策**: 允许字母、数字、下划线和连字符

**正则表达式**: `^[a-zA-Z0-9_-]+$`

**理由**:
- 连字符 `-` 是常见的用户名分隔符（如 `john-doe`）
- 与主流平台（GitHub、Twitter）保持一致
- 避免特殊字符带来的安全风险

**约束**:
- 最小长度: 3
- 最大长度: 50
- 不允许空格和其他特殊字符

## 影响

### 正面影响
- 降低开发成本，加快迭代速度
- 减少外部依赖（无需 Redis）
- 简化部署流程

### 负面影响
- 无法主动撤销 Token（需等待过期）
- 无法实现"踢出用户"功能
- 安全性略低于完整实现

### 风险缓解
- Access Token 设置短期有效（30分钟）
- 敏感操作需要二次验证
- 监控异常登录行为
- 在下一迭代引入 Redis 优化

## 相关文档
- [Authentication Architecture](../architecture/backend/authentication.md)
- [API Contract](../architecture/api-contract.md)
- [OpenAPI Specification](../openapi/paths/auth.yaml)
