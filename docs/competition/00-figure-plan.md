# Spectra 商业方案书配图清单

> Status: `current`
> Role: external commercial proposal figure checklist and delegation sheet.

本清单按“商业方案书主稿”来定，不按仓库技术文档来定。

核心原则：

- 先讲系统本体，再讲能力层
- 先讲产品面，再讲服务面
- 图必须独立成立，默认读者看不到仓库、代码、README
- `Dualweave / Ourograph` 低披露
- 前端真实产品面必须进图，不能只画后端服务框图

建议总量：

- `12` 张核心图
- `6` 张结果/界面图
- `2` 张数据图

如果人手不够，优先做标了 `P0` 的。

## 1. 核心架构图

### 1.1 `P0` Spectra 系统总览图

- 放置章节：`00-executive-summary` 或 `01-overview`
- 图名建议：`Spectra 总体系统图`
- 目的：
  - 第一眼说明这不是 PPT 工具
  - 说明 `Spectra = 知识空间系统 + Studio 内容工坊 + 六能力层支撑`
- 必须包含：
  - 前端工作台
  - `Studio`
  - `Spectra Backend`
  - 六个正式能力层
  - `Project / Session / Artifact` 最小对象语言
- 不要画得太细：
  - 不要把每个服务内部模块都展开

### 1.2 `P0` 知识空间本体图

- 放置章节：`01-overview`
- 图名建议：`知识空间本体图`
- 目的：
  - 讲清楚“系统本体不是导出文件，而是库与引用关系”
- 必须包含：
  - `Project`
  - `Session`
  - `Artifact`
  - `Version`
  - `Reference`
  - `CandidateChange`
  - `Member`
- 必须表达：
  - `Artifact` 是按需外化结果，不是本体
  - `Reference` 形成知识网络

### 1.3 `P0` Studio 多模态内容工坊图

- 放置章节：`01-overview` 或 `04-architecture`
- 图名建议：`Studio 多模态内容工坊图`
- 目的：
  - 把前端产品面立起来
- 必须包含：
  - `PPT`
  - `Word 教案`
  - `思维导图`
  - `演示动画`
  - `互动小测`
  - `互动游戏`
  - `说课助手`
  - `学情预演`
- 必须表达：
  - 这些不是孤立插件
  - 它们是同一课程空间的不同外化切面

### 1.4 `P0` 工作流闭环图

- 放置章节：`01-overview`
- 图名建议：`生产-沉淀-交付-回流闭环图`
- 目的：
  - 视觉化核心口号
- 主链建议：
  - 资料进入
  - 检索增强
  - 会话生成
  - `Studio` 预览/refine
  - 标准导出/多模态外化
  - 正式沉淀
  - 版本演化/引用复用
- 图上建议直接打一句：
  - `生产即沉淀，沉淀即交付`

## 2. 系统设计图

### 2.1 `P0` 分层架构图

- 放置章节：`04-architecture`
- 图名建议：`前端工作台-控制平面-正式能力层分层图`
- 目的：
  - 说明系统不是大单体，也不是空心网关
- 必须包含三层：
  - 前端工作台层
  - 控制平面层
  - 正式能力层
- 必须体现：
  - `Studio` 在前端层
  - `Spectra Backend` 是 orchestration kernel
  - 六服务是 formal authorities

### 2.2 `P0` 六能力层职责边界图

- 放置章节：`04-architecture`
- 图名建议：`六能力层边界图`
- 目的：
  - 解释六个服务各自负责什么
- 必须包含：
  - `Diego`
  - `Pagevra`
  - `Ourograph`
  - `Dualweave`
  - `Stratumind`
  - `Limora`
- 每个服务只写：
  - 负责什么
  - 不负责什么
- 注意：
  - 不要让它们压过“知识空间本体图”

### 2.3 `P0` 生成闭环图

- 放置章节：`04-architecture`
- 图名建议：`Session 生成闭环图`
- 目的：
  - 说明正式生成不是黑箱一次性输出
- 建议链路：
  - `Session`
  - `Diego outline`
  - `confirm outline`
  - `Diego generation`
  - `Studio preview/refine`
  - `Pagevra export`
  - `Ourograph bind`
- 必须表达：
  - 用户可参与
  - 可预览、可修改、可回流

### 2.4 `P1` 多模态资料进入主链图

- 放置章节：`04-architecture`
- 图名建议：`多模态资料进入与证据组织图`
- 目的：
  - 说明“支持上传”不是表面能力
- 必须包含：
  - PDF / Word / 图片 / 视频 等资料源
  - 解析
  - 检索增强
  - 证据组织
  - 进入生成主链
- 低披露要求：
  - `Dualweave` 只画位置、阶段、价值
  - 不画可复刻的细粒度机制

### 2.5 `P1` 前端真实 preview contract 图

- 放置章节：`04-architecture` 或 `06-testing-evaluation`
- 图名建议：`真实预览契约图`
- 目的：
  - 强调“前端不伪造假预览”
- 必须表达：
  - 后端未返回真实产物时：placeholder / waiting
  - 后端返回真实产物后：preview / refine / history / download
- 建议覆盖：
  - `Word`
  - mindmap
  - animation
  - game
  - speaker notes
  - simulation

## 3. 关键技术图

### 3.1 `P0` 知识状态演化图

- 放置章节：`05-key-technologies`
- 图名建议：`知识状态与版本演化图`
- 目的：
  - 解释 `Ourograph` 为什么重要
- 必须包含：
  - `Project`
  - `Artifact`
  - `CandidateChange`
  - `Version`
  - `Reference`
- 低披露要求：
  - 只画关系与作用
  - 不画可直接复刻 formal kernel 的内部规则

### 3.2 `P1` 检索增强证据组织图

- 放置章节：`05-key-technologies`
- 图名建议：`Stratumind 检索与引证核心分层图`
- 目的：
  - 讲清楚 `Stratumind` 不只是召回，而是由多个内部能力面组合成的检索与引证核心
- 必须包含：
  - 资料进入层
  - `Stratumind` 控制面：Search API、Query Rewrite、Adaptive Planning
  - `Stratumind` 召回面：dense retrieval、sparse retrieval、hybrid fusion
  - `Stratumind` 排序面：API rerank、late interaction、no-rerank path
  - `Stratumind` 证据面：Evidence Packing、Citation-Aware Package
  - `Stratumind` 评估与观测面：Trace、Telemetry、Benchmark、Scan、Compare
  - 产品消费层：Spectra Backend、Diego / Studio、Artifact / Reference
- 建议配一句：
  - `不是查到一点内容，而是把课程资料转化为可引用、可观测、可评测的证据结果`

### 3.3 `P1` Pagevra 统一交付图

- 放置章节：`05-key-technologies`
- 图名建议：`预览-渲染-导出统一图`
- 目的：
  - 说明 preview/render/export 是同一 authority
- 必须包含：
  - preview
  - render
  - `PPTX`
  - `DOCX`
- 建议表达：
  - 展示结果和交付结果一致

### 3.4 `P2` 身份与组织边界图

- 放置章节：`05-key-technologies`
- 图名建议：`身份与组织边界图`
- 目的：
  - 解释 `Limora` 对长期交付的价值
- 必须包含：
  - identity
  - session authority
  - organization
  - member boundary

### 3.5 `P1` Session 生成与 refine 闭环图

- 放置章节：`05-key-technologies`
- 图名建议：`Session 生成与 refine 闭环图`
- 目的：
  - 说明生成不是一次性黑箱输出，而是教师可参与、可确认、可修改、可回流的工作流
- 必须包含：
  - 教师
  - `Studio`
  - `Spectra Backend`
  - `Diego`
  - `Pagevra`
  - `Ourograph`
- 必须表达：
  - outline
  - confirm
  - generation
  - preview
  - refine
  - bind / persist

### 3.6 `P1` 系统级能力闭环图

- 放置章节：`05-key-technologies`
- 图名建议：`关键技术组合带来的系统级结果图`
- 目的：
  - 收束第 5 章，说明六个正式能力层不是服务清单，而是围绕课程知识空间形成闭环
- 必须包含：
  - 课程知识空间
  - 多模态资料进入
  - 证据组织
  - 会话生成
  - 真实预览与标准交付
  - 正式状态沉淀
  - 身份与组织边界
- 必须表达：
  - `生产即沉淀，沉淀即交付`
  - 资料、证据、生成、交付、沉淀和复用属于同一系统主线

## 4. 成果展示图

### 4.1 `P0` 教师工作台首页截图

- 放置章节：`06-testing-evaluation`
- 目的：
  - 第一眼证明“做成了”
- 最好能看到：
  - 项目/会话
  - 资料入口
  - 对话/工作台主界面

### 4.2 `P0` Studio 卡片工坊截图

- 放置章节：`06-testing-evaluation`
- 目的：
  - 证明多模态产物工坊真实存在
- 建议一张图里展示：
  - 左侧卡片列表
  - 中间一个已展开卡片
  - 右侧或上方上下文/交互
- 如果一张太挤，可以拆成 2 张

### 4.3 `P0` PPT 预览/导出结果图

- 放置章节：`06-testing-evaluation`
- 目的：
  - 证明 PPT 主产物链已成立
- 可选内容：
  - 预览页
  - 导出后结果页
  - artifact history

### 4.4 `P0` Word 教案结果图

- 放置章节：`06-testing-evaluation`
- 目的：
  - 证明不是只有 PPT
- 建议体现：
  - 教案内容区
  - 与源 `PPT` 的绑定语义
  - 下载/结果状态

### 4.5 `P1` 思维导图结果图

- 放置章节：`06-testing-evaluation`
- 目的：
  - 证明有真实结构化外化结果
- 最好体现：
  - 导图节点
  - 可选中 / refine 痕迹

### 4.6 `P1` 动画或游戏结果图

- 放置章节：`06-testing-evaluation`
- 目的：
  - 证明互动/动态内容不是嘴上说说
- 二选一即可：
  - 动画结果图
  - 游戏结果图
- 如果素材足够，最好两张

### 4.7 `P1` 说课助手或学情预演结果图

- 放置章节：`06-testing-evaluation`
- 目的：
  - 证明系统已经进入更高阶教学辅助，而不只是内容生成

## 5. 数据图

### 5.1 `P0` Stratumind 正式集对比图

- 放置章节：`06-testing-evaluation`
- 图名建议：`正式评估集检索增强结果图`
- 目的：
  - 把数据吹点图形化
- 建议做法：
  - `60题正式集` 一张柱状图
  - `105题正式集` 一张柱状图
- 建议指标：
  - `Hit@3`
  - `MRR@3`
  - `Evidence Hit`
  - `Evidence MRR`
  - `Quality`
- baseline：
  - `raw_dense_topk`
  - `dense_only`
  - `advanced`

### 5.2 `P1` 成果矩阵图

- 放置章节：`06-testing-evaluation` 或 `08-business-plan`
- 图名建议：`多模态成果矩阵图`
- 目的：
  - 一眼看出系统输出不止一种
- 横轴建议：
  - 产物类型
- 纵轴建议：
  - 使用对象 / 场景 / 交付方式
- 行或列可包括：
  - `PPT`
  - `Word 教案`
  - 导图
  - 动画
  - 游戏
  - 说课稿
  - 学情预演

## 6. 商业表达图

### 6.1 `P1` 价值链图

- 放置章节：`08-business-plan`
- 目的：
  - 说明教师、学生、学校三层价值
- 必须包含：
  - 教师侧减负增效
  - 学生侧派生学习材料
  - 学校/机构侧课程数据库与资产治理

### 6.2 `P1` 交付路径图

- 放置章节：`08-business-plan`
- 目的：
  - 说明从试点到平台化的商业路径
- 建议三阶段：
  - 教师 / 小团队
  - 教研组 / 学校
  - 平台化 / 机构化

## 7. 绘制规范

### 7.1 统一规范

- 风格统一：
  - 全套图使用同一色板、字号、箭头、边框样式
- 一图一事：
  - 一张图只回答一个核心问题
- 先整体后局部：
  - 先让读者知道系统整体位置，再解释主链和局部机制
- 尽量横向：
  - 方便后续进 Word 排版
- 所有图都要可独立阅读：
  - 不依赖口头解释
- 图中文字别太密：
  - 关键词优先，不要塞长段话
- 图文要互相解释：
  - 正文必须明确说明图在解释什么问题，不能让图单独悬空

### 7.2 披露规范

- `Dualweave`
  - 只画系统位置、阶段语义、价值
  - 不画内部诀窍
- `Ourograph`
  - 只画 ontology、关系、系统价值
  - 不画可直接复刻的 formal kernel 内部机制

### 7.3 命名规范

- 架构类：`图 4-x`
- 技术类：`图 5-x`
- 成果展示类：`图 6-x`
- 商业类：`图 8-x`

## 8. Assumptions

- 现在不优先做图，但要把图清单一次性发给执行同学，能直接分工。
- 如果时间不够，先做所有 `P0`。
- 所有截图优先选“能证明系统已经做成”的页面，不选单纯好看的局部。
- 结果图优先体现：
  - `知识空间`
  - `Studio`
  - `多模态外化`
  - `真实 preview/refine`
  - `标准交付`
