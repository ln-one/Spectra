# Git Submodule 设置指南

## 添加 Submodule

### Frontend
```bash
cd Spectra-Frontend
git submodule add https://github.com/ln-one/Spectra-Docs.git docs
git commit -m "chore: 添加文档 submodule"
git push
```

### Backend
```bash
cd Spectra-Backend
git submodule add https://github.com/ln-one/Spectra-Docs.git docs
git commit -m "chore: 添加文档 submodule"
git push
```

## 添加 .cursorrules

### Frontend
将 `Spectra-Docs/.cursorrules-frontend` 复制到 `Spectra-Frontend/.cursorrules`

```bash
cd Spectra-Frontend
cp docs/.cursorrules-frontend .cursorrules
git add .cursorrules
git commit -m "chore: 添加 Cursor AI 规则"
git push
```

### Backend
将 `Spectra-Docs/.cursorrules-backend` 复制到 `Spectra-Backend/.cursorrules`

```bash
cd Spectra-Backend
cp docs/.cursorrules-backend .cursorrules
git add .cursorrules
git commit -m "chore: 添加 Cursor AI 规则"
git push
```

## 克隆项目（新成员）

```bash
# 克隆项目并初始化 submodule
git clone --recurse-submodules https://github.com/ln-one/Spectra-Frontend.git

# 或者先克隆，再初始化 submodule
git clone https://github.com/ln-one/Spectra-Frontend.git
cd Spectra-Frontend
git submodule init
git submodule update
```

## 更新 Submodule

当文档仓库更新后，在 Frontend/Backend 中更新：

```bash
# 更新到最新版本
git submodule update --remote docs

# 提交更新
git add docs
git commit -m "chore: 更新文档 submodule"
git push
```

## 工作流程

### 1. 更新文档
```bash
cd Spectra-Docs
# 修改文档
git add .
git commit -m "docs: 更新规范"
git push
```

### 2. 在 Frontend/Backend 中同步
```bash
cd Spectra-Frontend  # 或 Spectra-Backend
git submodule update --remote docs
git add docs
git commit -m "chore: 同步文档更新"
git push
```

## 文档链条

```
Spectra-Docs (源)
    ↓ submodule
Spectra-Frontend/docs → AI 读取 .cursorrules → 遵循规范
    ↓ submodule
Spectra-Backend/docs → AI 读取 .cursorrules → 遵循规范
```

## AI 如何使用

当开发者在 Frontend/Backend 中使用 Cursor AI 时：

1. Cursor 自动读取 `.cursorrules`
2. `.cursorrules` 引用 `docs/` 中的规范
3. AI 遵循规范生成代码
4. 保证跨仓库的一致性

## 注意事项

- Submodule 默认处于 detached HEAD 状态
- 修改文档应该在 Spectra-Docs 仓库中进行
- Frontend/Backend 只需要定期同步更新

