# 架构设计

> 需求分析已完成，技术选型已确定，进入设计阶段

## 当前状态

### ✅ 已完成（需求分析阶段）
- [x] 功能需求清单 → [feature-list.md](../requirements/functional/feature-list.md)
- [x] 系统边界定义 → [system-boundary.md](../requirements/functional/system-boundary.md)
- [x] API 规划 → [api-planning.md](../requirements/functional/api-planning.md)
- [x] 迭代规划 → [iteration-plan.md](../requirements/functional/iteration-plan.md)
- [x] 技术选型 → [tech-stack.md](../project/tech-stack.md)
- [x] AI 能力分析 → [ai/README.md](../requirements/ai/README.md)

### 🔄 待产出（设计阶段）
- [ ] 系统架构图
- [ ] 数据模型设计
- [ ] 状态机设计
- [ ] 前端组件架构
- [ ] 后端服务架构

## 技术栈确认

| 层级 | 技术选型 |
|------|----------|
| 前端 | Next.js 15 + TypeScript + Tailwind + Shadcn/ui |
| 后端 | FastAPI + Python 3.11 + Prisma |
| 数据库 | SQLite → PostgreSQL |
| LLM | Qwen 3.5 |
| 文档解析 | MinerU (Magic-PDF) |
| 向量库 | ChromaDB |
| Embedding | Qwen 3 Embedding |
| 课件生成 | Marp + Pandoc |
| 语音识别 | Faster-Whisper |
| 视频处理 | OpenCV |

详见：[技术决策记录](../decisions/)

## 下一步行动

1. **系统架构设计** - 组件边界、服务通信
2. **数据模型设计** - ER 图、Prisma Schema
3. **状态机设计** - File/Task 状态转换
4. **前端架构设计** - 页面路由、组件树
5. **API 契约完善** - P1 接口补充到 openapi.yaml

