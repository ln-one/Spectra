# 4. 系统设计

## 4.1 设计目标

`Spectra` 的系统设计对应课程知识空间系统必须采取的结构形态。它服务于教师一次真实备课行为的四件事同时成立：

1. 教学内容生产；
2. 多模态成果外化；
3. 正式知识状态沉淀；
4. 后续复用、引用与持续演化。

本章重点说明，当前真实系统为什么能够同时成立以下四个判断：

- 系统本体是课程知识空间，不是导出文件集合；
- `Studio` 是统一多模态内容工坊，不是若干功能按钮的拼盘；
- `Spectra Backend` 是 control plane，不是大一统能力后端；
- 六个正式能力层承接正式 authority，但不替代系统本体。

## 4.2 系统本体与设计判断

从系统本体出发，`Spectra` 是一套围绕课程知识空间运作的课程知识系统。只要系统长期目标是沉淀、复用、引用和演化课程知识，它就不能沿着“前端 + 大后端 + 导出文件”的旧形态成立。

系统长期维护的是 `Project` 所承载的课程知识空间，以及围绕它形成的 `Version`、`Reference`、`CandidateChange` 和 `Member` 关系。`PPT`、教案、导图、动画、互动内容、说课稿和学情预演都只是知识空间的按需外化结果。

系统必须同时容纳过程态和正式态。`Session` 承接一次具体工作展开，负责把会话、资料、任务、事件和生成过程组织起来；正式知识状态则由 `Project / Artifact / Version / Reference / CandidateChange / Member` 承接。两者若被混成一层，系统最终会退化成一次性工具。

产品体验也必须统一，内部边界必须清晰。教师看到的是统一工作台和 `Studio` 多模态内容工坊，内部则是控制平面和六个正式能力层协同运作。统一体验不能建立在边界失真之上。

## 4.3 前端工作台与 Studio 产品面

`Spectra` 的前端产品面更接近一个课程知识工作台，教师在其中完成资料进入、会话推进、成果预览、修改、下载和后续沉淀。这里要成立的是同一个工作空间，而不是一组彼此脱节的工具页。

`Studio` 是这个工作台中最重要的产品面。它围绕同一课程知识空间组织起多模态内容工坊。当前真实产品面已经覆盖以下能力簇：

- `PPT / 智能课件`：负责课堂主展示内容的结构化生成与讲解节奏组织；
- `Word 教案 / 教学文档`：负责输出教案、讲稿、讲义和课堂资料，承接教师备课与交付材料；
- `思维导图`：负责提炼章节逻辑、概念层次和知识结构，帮助教师梳理课程骨架，也便于学生复习回看；
- `互动小测`：负责围绕当前知识点快速生成测验与答案解析，用于课堂即时理解检查；
- `互动游戏`：负责把课程知识转化为可交互的练习玩法和规则流程，提高参与度与练习动机；
- `演示动画`：负责把抽象过程、动态机制和步骤变化转化为可视化演示内容；
- `说课助手`：负责围绕课件或成果生成讲解提示、过渡语、板书要点与说课材料；
- `学情预演`：负责模拟课堂反馈、学生追问和理解偏差，帮助教师在授课前预判难点与应对策略。

这些能力共享同一套工作台契约：catalog、execution、preview、refine、history、download 与 source binding。系统交付的是一组围绕课程知识空间展开的多模态外化能力。`Studio` 的制度性意义正在于此：它把原本会散落成多个产品的能力，收束成同一工作台中的不同外化切面。

图 4-1 对应系统总体分层结构，用于说明产品面、控制平面和正式能力层如何被放入同一系统视野。

```mermaid
flowchart TB
    subgraph UI["前端工作台层"]
        FE["Project Workbench<br/>项目 / 资料 / 会话入口"]
        ST["Studio<br/>多模态内容工坊"]
        CARDS["Studio Cards<br/>catalog / execution / preview / refine"]
        FE --> ST
        ST --> CARDS
    end

    subgraph CP["Spectra Backend 控制平面"]
        API["API / Router Layer"]
        SR["Session Runtime<br/>run / event / command / query"]
        AB["Artifact Binding<br/>history / download / source binding"]
        ACL["Clients / Adapters<br/>anti-corruption layer"]
        API --> SR
        SR --> AB
        SR --> ACL
    end

    subgraph AUTH["六个正式能力层"]
        DG["Diego"]
        PV["Pagevra"]
        OG["Ourograph"]
        DW["Dualweave"]
        STR["Stratumind"]
        LM["Limora"]
    end

    CARDS --> API
    ACL --> DG
    ACL --> PV
    ACL --> OG
    ACL --> DW
    ACL --> STR
    ACL --> LM
```

图 4-1 对应 `Spectra` 的真实结构：前端工作台层、控制平面层和六个正式能力层共同组成统一系统。用户看到统一产品，系统内部则保持 authority 分离。

图 4-2 进一步解释 `Studio` 为什么是系统级产品面。这里关注的不是能力项数量，而是同一课程知识空间如何同时承接课堂主交付、互动练习和教学辅助三类外化结果。

```mermaid
flowchart LR
    S["Studio<br/>多模态内容工坊"]

    subgraph A["课堂主交付"]
        PPT["PPT / 智能课件"]
        WORD["Word 教案 / 教学文档"]
        MIND["思维导图"]
        ANIM["演示动画"]
    end

    subgraph B["互动与练习"]
        QUIZ["互动小测"]
        GAME["互动游戏"]
    end

    subgraph C["教学辅助"]
        NOTES["说课助手"]
        SIM["学情预演"]
    end

    S --> A
    S --> B
    S --> C
```

图 4-2 对应 `Studio` 的产品面组织方式：不同成果共同构成同一课程知识空间在不同教学场景中的外化切面。

## 4.4 Spectra Backend 控制平面

`Spectra Backend` 的职责是作为 workflow shell / orchestration kernel 统一承接产品主链。它的真实工作可以概括为三类。

第一类是 `Session` 与会话编排。后端负责创建和推进 `Session`，管理 run、event、command、query，把用户操作、任务执行、中间状态和最终结果组织成可追踪的工作过程。

第二类是 artifact binding 与结果整形。后端负责把生成、预览、导出和下载契约收成统一产品语义，并将外化结果绑定回课程知识空间，而不是让每条链路各自输出一堆互不关联的文件。

第三类是 authority integration。后端通过 clients / adapters 接入六个正式能力层，承担反腐层职责：翻译契约、整形响应、组织统一产品语义，而不是重新长出第二套正式语义。

因此，`Spectra Backend` 的价值不在于“能力最多”，而在于把主链组织成统一产品契约。它不是空心网关，因为它拥有会话、事件、任务、绑定和契约整形这些真实责任；它也不是大一统后端，因为正式能力 authority 已经明确落在六个能力层中。

## 4.5 六个正式能力层如何承接系统

在当前系统中，真正值得被强调的已经不只是“有六个正式能力层”，而是 `Spectra` 本体和六个正式能力层一起构成了一套异构系统。课程知识空间系统要成立，既要有统一工作台、控制平面和数据底座，也要把生成、预览交付、正式状态、资料进入、检索证据和身份治理这六类 authority 明确拆开，避免重新回流成一个难以治理的大仓。

这组 authority 同时定义了主仓的边界：

- 主仓不重新实现正式 PPT generation；
- 主仓不恢复本地正式 render / export 链；
- 主仓不重新定义 formal knowledge-state；
- 主仓不把 retrieval 或 identity 重新做回一团本地逻辑。

真正需要被看见的，不只是六个正式能力层各自承担什么职责，而是整套系统如何围绕不同 authority 共同成立。`Spectra` 自身并不是空壳，它负责工作台、控制平面和运行底座；六个正式能力层则分别承接生成、渲染、知识状态、资料进入、检索引证和身份治理。这些部分合在一起，才构成今天这套系统的真实工程形态。

| 系统层 | 核心职责 | 当前技术栈 | 工程特征 |
| --- | --- | --- | --- |
| `Spectra Frontend` | 统一工作台、`Studio` 多模态内容工坊、catalog / preview / refine 产品面 | Next.js + React + TypeScript + Tailwind + Radix + Zustand | 面向统一产品体验与多模态外化工作台，而不是单点生成页面 |
| `Spectra Backend` | `Session` 编排、event / command / query、artifact binding、authority integration | FastAPI + Pydantic + Prisma async | 面向控制平面、契约整形与主链组织，而不是大一统能力后端 |
| `数据与运行底座` | 持久化、缓存、队列、向量检索与容器化运行 | PostgreSQL + Redis + RQ + Qdrant + Docker Compose | 面向真实运行拓扑、异步执行与知识检索底座 |
| `Diego` | 课件 outline、生成、QA 与产物链 | Python + FastAPI，结合 Node / PptxGenJS 能力 | 面向可管理生成链，而不是单次文本输出 |
| `Pagevra` | preview、render、`PPTX / DOCX` 标准导出 | Node + TypeScript + Mermaid + Playwright | 面向高保真 compile-bundle、预览与正式交付统一 |
| `Ourograph` | `Project / Artifact / Version / Reference / CandidateChange / Member` 语义 | Kotlin + Ktor + jOOQ + Flyway + HikariCP + PostgreSQL | 面向 formal knowledge-state、版本与引用语义的强 schema 内核 |
| `Dualweave` | ingest、delivery、replay、阶段状态与资料进入治理 | Go | 面向上传编排、交付语义、telemetry 和 staged runtime |
| `Stratumind` | rewrite、planning、hybrid retrieval、rerank、evidence | Go retrieval core + Qdrant + Python late-interaction sidecar | 面向 retrieval core、证据组织和 benchmark 驱动演进 |
| `Limora` | identity、session、organization、membership authority | TypeScript + Fastify + Better Auth + Prisma + PostgreSQL | 面向身份边界、组织治理和可复用认证基础设施 |

这张矩阵说明的是整套系统如何共同成立。前端工作台、控制平面和数据底座提供统一产品面与运行底座；六个正式能力层则围绕不同 authority 分别承担生成、渲染、知识状态、资料进入、检索引证和身份治理。生成、渲染、知识状态、资料进入、检索引证和身份治理并不是同一种工程问题，因此它们天然需要不同的运行时、框架组合和工程路径。`Spectra` 的工程分量，正体现在这种围绕 authority 分治形成的异构系统结构上。

## 4.6 三条核心主链

第 4 章最关键的，是三条核心主链。系统之所以可信，是因为这三条链把资料、生成、交付、沉淀和演化接成了同一套业务语言。

### 4.6.1 资料进入与证据组织链

第一条链回答“资料如何真正进入内容生产”：

`资料进入 -> Dualweave ingest / delivery -> 标准化内容 -> Stratumind 检索增强 -> 证据组织 -> Session / Studio 生成主链`

它回答的是：资料如何成为后续生成、引用和知识沉淀的真实来源。

### 4.6.2 Session 生成与交付链

第二条链回答“生成如何不是单次黑箱输出”：

`Session 建立 -> Diego outline -> 教师确认 -> Diego generation -> Studio preview / refine -> Pagevra export -> Ourograph bind`

这条链保证教师始终处在可参与、可确认、可修改的工作流中。生成出来的结果会进入 preview、交付和正式状态绑定的同一链路。

图 4-3 解释的正是这条系统主链。

```mermaid
flowchart LR
    A["资料进入"] --> B["Dualweave<br/>ingest / delivery"]
    B --> C["Stratumind<br/>检索增强 / 证据组织"]
    C --> D["Session<br/>上下文与任务组织"]
    D --> E["Diego<br/>outline / generation"]
    E --> F["Studio<br/>preview / refine"]
    F --> G["Pagevra<br/>render / export"]
    G --> H["Ourograph<br/>artifact bind / version"]
```

图 4-3 对应从资料进入到正式知识状态回流的连续主链。它把课程资料、检索证据、会话生成、多模态外化和正式沉淀收进了同一套系统语言。

### 4.6.3 知识回流与演化链

第三条链回答“结果为什么不是死文件”：

`Artifact -> CandidateChange -> Version -> Project -> Reference`

这条链意味着成果不会在导出后终止，而是能继续进入课程知识空间，形成版本锚点，并成为未来复用与引用的条件。也正因为这条链存在，系统交付的才是课程知识资产，而不是一次性材料。

## 4.7 知识空间对象关系

系统主链能够成立，依赖的是一套稳定对象语言。

图 4-4 解释这套对象关系如何构成课程知识空间的本体。

```mermaid
flowchart LR
    P["Project<br/>课程知识空间"] --> S["Session<br/>局部工作过程"]
    P --> V["Version<br/>正式状态锚点"]
    P --> R["Reference<br/>跨空间引用"]
    P --> M["Member<br/>成员与组织边界"]
    S --> A["Artifact<br/>按需外化结果"]
    A --> C["CandidateChange<br/>候选变更入口"]
    C --> V
    V --> P
    R --> P
```

图 4-4 把四个关键判断收进同一套对象关系里：

- `Project` 是课程知识空间，而不是普通文件夹；
- `Session` 是工作过程，不是正式状态；
- `Artifact` 是外化结果，不是系统本体；
- `Version / Reference / CandidateChange / Member` 共同让系统具备演化、复用、协作和治理能力。

也正因为对象关系是这样组织的，系统才不会在“生成结果”和“正式知识状态”之间断裂。

## 4.8 数据与状态设计（数据库设计）

这里需要显式回答详细设计方案最容易被追问的问题：这套系统的数据和状态到底是怎么成立的。`Spectra` 的数据库设计围绕不同 authority 拆成多层数据与状态结构。课程知识空间系统同时存在过程态、正式态、身份态与检索态，它们天然不该挤进同一套真相源。

从当前真实实现看，系统至少存在四层稳定的数据与状态分工：

| 数据与状态层 | 典型对象 | 主要存储 | formal authority | 设计意义 |
| --- | --- | --- | --- | --- |
| 控制平面过程态 | `GenerationSession`、`SessionEvent`、`Upload`、`ParsedChunk`、任务与会话上下文 | PostgreSQL + Redis | `Spectra Backend` | 负责工作过程、事件流、队列执行和过程追踪，不冒充正式知识状态 |
| 正式知识状态 | `Project`、`ProjectVersion`、`ProjectReference`、`Artifact`、`CandidateChange`、`ProjectMember` | Ourograph PostgreSQL | `Ourograph` | 负责课程知识空间、版本锚点、引用关系、候选变更与成员边界 |
| 身份与组织状态 | `User`、`Session`、`Organization`、`Membership`、`AuditEvent` | Limora PostgreSQL | `Limora` | 负责身份、登录会话、组织容器与成员治理，不污染课程知识空间本体 |
| 检索与证据状态 | 向量索引、chunk evidence、检索结果组织 | Qdrant + retrieval cache | `Stratumind` | 负责 retrieval core、证据组织与可评测检索底座，不把检索状态硬塞进关系型主库 |

这张分层表说明，系统已经围绕不同 authority 把过程态、正式态、身份态和检索态拆开。课程知识空间要长期成立，就不能把工作过程、正式知识、组织边界和证据索引混成一层。

图 4-5 对应系统的数据与状态拓扑。不同 formal authority 已经拥有各自的数据与状态位置。

```mermaid
flowchart LR
    subgraph CP["控制平面过程态"]
        GS["GenerationSession / SessionEvent"]
        UP["Upload / ParsedChunk"]
        BR["PostgreSQL + Redis"]
    end

    subgraph OG["Ourograph 正式知识状态"]
        PJ["Project / Version"]
        RF["Reference / CandidateChange"]
        AR["Artifact / Member"]
        OPG["PostgreSQL"]
    end

    subgraph LM["Limora 身份与组织状态"]
        ID["User / Session"]
        ORG["Organization / Membership / AuditEvent"]
        LPG["PostgreSQL"]
    end

    subgraph STR["Stratumind 检索与证据状态"]
        EV["Chunk / Evidence / Retrieval Index"]
        QD["Qdrant"]
    end

    GS --> BR
    UP --> BR
    PJ --> OPG
    RF --> OPG
    AR --> OPG
    ID --> LPG
    ORG --> LPG
    EV --> QD
```

这套设计让“生产即沉淀，沉淀即交付”具备了真实落点。工作过程可以在控制平面里被追踪，正式知识状态由 `Ourograph` 承接，身份与组织边界由 `Limora` 承接，检索与证据组织由 `Stratumind` 承接。数据库设计因此不再只是存表，而是支撑不同 authority 同时成立的状态结构。

## 4.9 关键接口与契约总览

系统能够形成闭环，不只因为有很多服务，还因为关键契约已经被清楚分布。第 4 章不展开接口细节，而是先回答一个更重要的问题：前端工作台、控制平面和六个正式能力层之间，到底通过哪些类型的契约协同。

从当前主链看，至少有三类关键契约已经形成稳定分工：

- `工作台契约`：前端工作台与 `Spectra Backend` 之间围绕 `Session`、catalog、preview、history、download 与 artifact binding 交互；
- `authority 契约`：`Spectra Backend` 与 `Diego / Pagevra / Ourograph / Dualweave / Stratumind / Limora` 之间分别围绕 generation、render/export、formal state、ingest、retrieval 和 identity 消费正式能力；
- `结果回流契约`：preview、export、artifact bind、candidate change、version update 组成结果回到知识空间的正式链路。

图 4-6 对应关键接口与契约总览。重点是系统靠什么连接起来，而不是每个接口参数长什么样。

```mermaid
flowchart LR
    FE["Frontend Workbench / Studio"] -->|"Session / preview / refine / history / download"| BE["Spectra Backend"]

    BE -->|"generation contract"| DG["Diego"]
    BE -->|"preview / render / export contract"| PV["Pagevra"]
    BE -->|"formal state / bind contract"| OG["Ourograph"]
    BE -->|"ingest / delivery contract"| DW["Dualweave"]
    BE -->|"retrieval / evidence contract"| STR["Stratumind"]
    BE -->|"identity / membership contract"| LM["Limora"]

    PV -->|"artifact result"| BE
    OG -->|"version / reference / member state"| BE
    STR -->|"evidence package"| BE
```

这张图说明：`Spectra Backend` 统一承接工作台契约、authority 契约和结果回流契约。正因为契约分布清楚，前端工作台才能面对统一产品面，正式能力层才能保持各自 authority。

## 4.10 运行拓扑与当前实现现实

`Spectra` 当前并不是停留在文档规划层面。运行现实已经表现为：主系统作为统一控制平面，六个正式能力层同时接入并承担各自 authority。这一点很重要，因为只有运行现实与架构判断一致，系统设计章才不会退化成漂亮但空心的图解。

图 4-7 用最小拓扑表达当前协作现实。

```mermaid
flowchart LR
    FE["Frontend Workbench / Studio"] --> BE["Spectra Backend<br/>control plane"]
    BE --> DG["Diego"]
    BE --> PV["Pagevra"]
    BE --> OG["Ourograph"]
    BE --> DW["Dualweave"]
    BE --> STR["Stratumind"]
    BE --> LM["Limora"]
    DW --> STR
    STR --> DG
    DG --> PV
    DG --> OG
    PV --> OG
    LM --> OG
```

图 4-7 对应的是当前系统的真实协作拓扑。它说明这套系统已经形成稳定协同关系和可交付运行结构。

当前实现现实可以概括为三点：

1. 六个正式能力层已经进入主系统运行拓扑；
2. 主系统已经通过稳定契约消费其能力，而不是停留在概念对接；
3. 前端 `Studio` 产品面、后端控制平面和正式能力层之间已经形成稳定协作关系。

当前系统已经给出四类足够硬的运行与交付成熟信号。

第一，系统是容器化协同运行的真实系统，而不是“几个仓库 + 一张总图”的说明文。前端工作台、控制平面、数据库、缓存、向量库、worker 与六个正式能力层已经形成明确的运行拓扑。

第二，各能力层之间的关系由正式交付链组织起来。资料进入、检索增强、生成、预览、导出、状态绑定和后续沉淀都已经进入同一业务主线。

第三，数据与运行底座已经进入正式结构，而不是临时附属物。数据库、缓存、向量检索和异步执行共同支撑主链，使系统具备持续协作、失败表达和结果交付所需的运行基础。

第四，这套运行现实天然支持从演示、试点到组织级交付的渐进扩展。健康检查、依赖关系、正式交付链和稳定协作拓扑共同构成了当前系统的交付成熟度信号。

## 4.11 为什么这套设计更适合长期交付

与传统“前端 + 大后端 + 模型调用 + 文件导出”的结构相比，这套设计更适合长期交付，原因不在于它更复杂，而在于它更诚实地贴合了教学内容生产的真实对象和真实链路。

第一，系统本体更清晰。课程知识空间与引用关系是长期真相，文件只是按需外化结果。

第二，产品面更完整。`Studio` 承接的是多模态内容工坊，而不是 PPT 单点工具。

第三，主链更完整。资料进入、检索增强、生成、预览、交付、沉淀和回流属于同一闭环，而不是七八条断裂流程。

第四，边界更可信。六个正式能力层各自拥有 authority，主仓专注于控制平面职责，因此系统更容易解释、治理和持续演进。

第五，商业交付路径已经成立。采购方购买的是一套可持续生产、沉淀、治理和放大课程知识资产的系统。

## 4.12 本章结论

`Spectra` 当前系统设计的关键，是让课程知识空间、多模态内容工坊、正式能力边界和知识回流主链在同一系统里同时成立。

它的第一主角始终是课程知识空间系统本身；六个正式能力层的意义，在于让这套系统有可信的生成、交付、状态、资料进入、检索和身份边界支撑。

也正因为如此，`Spectra` 才能被准确描述为商业级课程知识空间系统。第 4 章立住的，是这套系统已经具备值得认真评估的结构合法性。
