# Routing Design

> 更新时间：2026-03-20

## 路由清单（当前）

```text
/                          # 首页
/auth/login                # 登录页
/auth/register             # 注册页
/projects                  # 项目列表
/projects/new              # 新建项目
/projects/[id]             # 项目详情
/projects/[id]/generate    # 生成预览/导出
```

## 路由与实现映射

| 路由入口 | 入口文件 | 页面实现 |
|---|---|---|
| `/` | `app/page.tsx` | `app/_views/home/WelcomePage.tsx` |
| `/projects` | `app/projects/page.tsx` | `app/projects/_views/ProjectsPageView.tsx` |
| `/projects/[id]` | `app/projects/[id]/page.tsx` | `app/projects/[id]/_views/ProjectDetailPageView.tsx` |
| `/projects/[id]/generate` | `app/projects/[id]/generate/page.tsx` | `app/projects/[id]/generate/_views/GeneratePreviewPageView.tsx` |

## 页面组织约束

- `page.tsx` 仅保留路由入口和参数桥接。
- 复杂页面状态（滚动、面板尺寸、URL 同步、加载状态）放在 `_views` 下 hooks。
- 项目详情页的功能面板统一来自 `components/project/features/*`，避免在路由层堆叠 UI 细节。

## 历史路由说明

以下路径不在当前 App Router 中作为独立路由维护：
- `/projects/[id]/chat`
- `/projects/[id]/preview`
- `/projects/[id]/settings`
- `/upload`
- `/settings`

对应能力已收敛到 `/projects/[id]` 与 `/projects/[id]/generate` 两个主流程页面。
