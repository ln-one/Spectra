# 需求分析阶段

> 状态：✅ **已完成** | 下一步：设计阶段

## 完成度总览

| 模块 | 负责人 | 状态 | 输出 |
|------|--------|------|------|
| 项目协调 + 基础准备 | 成员A | ✅ 完成 | 规范文档、进度跟踪 |
| 用户体验分析 | 成员B | ✅ 完成 | [./ux/](./ux/) |
| 系统功能分析 | 成员C | ✅ 完成 | [./functional/](./functional/) |
| AI能力分析 | 成员D | ✅ 完成 | [./ai/](./ai/) |
| **需求对齐** | 全员 | ✅ 完成 | [./alignment-matrix.md](./alignment-matrix.md) |

## 需求对齐矩阵

> 确保 UX、Functional、AI 三个模块保持一致

详见：[**需求对齐矩阵**](./alignment-matrix.md)

- 功能 → AI 能力映射（19 项功能对应 5 大 AI 能力）
- 用户场景 → 功能映射（3 类用户画像的痛点覆盖）
- AI 能力 → 技术实现映射（5 大能力的技术方案）
- 迭代规划 → AI 能力就绪要求

## 输出清单

### 成员A：项目协调
- [x] 制定开发规范 → [../standards/](../standards/)
- [x] 定义文件结构
- [x] 建立Git工作流 → [../standards/git.md](../standards/git.md)
- [x] 跟踪团队进度
- [x] 技术栈确定 → [../project/tech-stack.md](../project/tech-stack.md)

### 成员B：用户体验
- [x] 用户场景分析 → [./ux/user-scenarios.md](./ux/user-scenarios.md)
- [x] 交互设计 → [./ux/interaction-design/](./ux/interaction-design/)
- [x] 界面原型 → [./ux/wireframes/](./ux/wireframes/)

### 成员C：系统功能
- [x] 功能需求清单 → [./functional/feature-list.md](./functional/feature-list.md)
- [x] 系统边界 → [./functional/system-boundary.md](./functional/system-boundary.md)
- [x] API规划 → [./functional/api-planning.md](./functional/api-planning.md)
- [x] 迭代规划 → [./functional/iteration-plan.md](./functional/iteration-plan.md)

### 成员D：AI能力
- [x] AI能力定义 → [./ai/1.capabilities.md](./ai/1.capabilities.md)
- [x] 技术调研 → [./ai/2.tech-research.md](./ai/2.tech-research.md)
- [x] 知识库规划 → [./ai/3.knowledge-base.md](./ai/3.knowledge-base.md)
- [x] Prompt设计 → [./ai/4.prompt-design.md](./ai/4.prompt-design.md)

## 已确定的技术栈

| 模块 | 选型 | 备选 |
|------|------|------|
| 前端 | Next.js 15 + TypeScript + Tailwind + Shadcn/ui | - |
| 后端 | FastAPI + Python 3.11 + Prisma | - |
| 数据库 | SQLite | → PostgreSQL |
| LLM | **Qwen 3.5** | GPT-4 (fallback) |
| LLM 路由 | **LiteLLM** | ~~LangChain~~ |
| 文档解析 | **MinerU** | LlamaParse |
| 向量库 | **ChromaDB** | → Milvus |
| Embedding | **Qwen 3 Embedding** | - |
| 课件生成 | **Marp + Pandoc** | ~~python-pptx~~ |
| 语音识别 | **Faster-Whisper** | - |
| 视频处理 | **OpenCV** | - |

详见：[技术决策记录](../decisions/)

---

## 下一阶段：设计

成员A 负责整合需求，产出以下设计文档：

- [ ] 系统架构图
- [ ] 数据模型设计（ER 图 + Prisma Schema）
- [ ] 状态机设计（File/Task 状态转换）
- [ ] 前端组件架构
- [ ] 后端服务架构
- [ ] API 契约完善（P1 接口）

详见：[架构设计](../architecture/)

## 参考资料

- [项目需求](../project/requirements.md)
- [技术栈](../project/tech-stack.md)
- [开发规范](../standards/)
- [技术决策](../decisions/)
