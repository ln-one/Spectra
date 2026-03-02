# Git 工作流规范

> 详细规约见 [CONTRIBUTING.md](../CONTRIBUTING.md)

## 分支策略

```
main → develop → feature/功能名
 → bugfix/问题描述
 → hotfix/紧急修复
```

## Commit 规范

```
<type>(<scope>): <subject>
```

**Type**: `feat` | `fix` | `docs` | `style` | `refactor` | `perf` | `test` | `chore`

**示例**:
```bash
feat(chat): 添加多轮对话功能
fix(upload): 修复大文件上传失败
docs(readme): 更新安装说明
```

## PR 规范

- 标题与 commit 格式一致
- 至少 1 人 Review 通过
- CI 检查必须通过
- 使用 Squash Merge

## 最佳实践

- 小步提交，频繁提交
- 每个 commit 只做一件事
- 及时同步 develop 分支
- 禁止直接 Push 到 main

