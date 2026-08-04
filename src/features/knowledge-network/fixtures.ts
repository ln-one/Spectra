import type {
  KnowledgeNetworkChunk,
  KnowledgeNetworkSource,
  KnowledgeNetworkTrace,
  KnowledgeNetworkWorkspace,
} from "./model";

const referenceKnowledgeNetworkTraceBase: KnowledgeNetworkTrace = {
  id: "reference-and-artifact-source-return",
  query: "解释跨 Workspace 检索如何帮助回答去中心化身份验证问题",
  answer: {
    streaming:
      "去中心化身份验证把身份凭证的控制权交还给用户，并通过可验证凭证降低对中心身份提供方的依赖。",
    completed:
      "去中心化身份验证把身份凭证的控制权交还给用户，并通过 DID 架构降低对中心身份提供方的依赖¹。明确的用户授权机制进一步减少了不必要的数据暴露²。",
  },
  currentWorkspaceId: "workspace-human-computer-interaction",
  workspaces: [
    {
      id: "workspace-human-computer-interaction",
      name: "人机交互",
      detail: "当前 Workspace · 4 个直接 Source",
      relation: "current",
    },
    {
      id: "workspace-blockchain",
      name: "区块链课程",
      detail: "引用 Workspace · 12 份资料",
      relation: "referenced",
    },
    {
      id: "workspace-digital-identity",
      name: "数字身份",
      detail: "引用 Workspace · 8 份资料",
      relation: "referenced",
    },
    {
      id: "workspace-verifiable-credentials",
      name: "可信凭证",
      detail: "间接引用 Workspace · 5 份资料",
      relation: "referenced",
    },
  ],
  references: [
    {
      id: "reference-a-b",
      sourceWorkspaceId: "workspace-human-computer-interaction",
      targetWorkspaceId: "workspace-blockchain",
    },
    {
      id: "reference-a-c",
      sourceWorkspaceId: "workspace-human-computer-interaction",
      targetWorkspaceId: "workspace-digital-identity",
    },
    {
      id: "reference-b-d",
      sourceWorkspaceId: "workspace-blockchain",
      targetWorkspaceId: "workspace-verifiable-credentials",
    },
    {
      id: "reference-c-d",
      sourceWorkspaceId: "workspace-digital-identity",
      targetWorkspaceId: "workspace-verifiable-credentials",
    },
    {
      id: "reference-d-a",
      sourceWorkspaceId: "workspace-verifiable-credentials",
      targetWorkspaceId: "workspace-human-computer-interaction",
    },
  ],
  sources: [
    {
      id: "source-hci-basics",
      workspaceId: "workspace-human-computer-interaction",
      name: "人机交互基础.docx",
      detail: "Document · 33 chunks",
      family: "document",
      chunkCount: 33,
    },
    {
      id: "source-did-review",
      workspaceId: "workspace-blockchain",
      name: "去中心化身份综述.pdf",
      detail: "PDF · 48 chunks",
      family: "pdf",
      chunkCount: 48,
    },
    {
      id: "source-credential-lifecycle",
      workspaceId: "workspace-digital-identity",
      name: "凭证生命周期.pptx",
      detail: "Presentation · 24 chunks",
      family: "presentation",
      chunkCount: 24,
    },
    {
      id: "source-authorization-notes",
      workspaceId: "workspace-verifiable-credentials",
      name: "用户授权笔记.md",
      detail: "Text · 19 chunks",
      family: "text",
      chunkCount: 19,
    },
  ],
  chunks: [
    {
      id: "chunk-did-architecture",
      sourceId: "source-did-review",
      label: "DID 架构",
      locator: "P12",
      rank: 1,
    },
    {
      id: "chunk-credential-lifecycle",
      sourceId: "source-credential-lifecycle",
      label: "凭证生命周期",
      locator: "P08",
      rank: 2,
    },
    {
      id: "chunk-user-authorization",
      sourceId: "source-authorization-notes",
      label: "用户授权",
      locator: "§3.2",
      rank: 3,
    },
    {
      id: "chunk-central-provider",
      sourceId: "source-did-review",
      label: "中心身份提供方",
      locator: "P19",
      rank: 4,
    },
    {
      id: "chunk-privacy-boundary",
      sourceId: "source-authorization-notes",
      label: "隐私边界",
      locator: "§4.1",
      rank: 5,
    },
    {
      id: "chunk-hci-context",
      sourceId: "source-hci-basics",
      label: "用户控制权",
      locator: "P27",
      rank: 7,
    },
  ],
  paths: [
    {
      id: "path-current-to-blockchain",
      workspaceIds: ["workspace-human-computer-interaction", "workspace-blockchain"],
      sourceId: "source-did-review",
      chunkId: "chunk-did-architecture",
    },
    {
      id: "path-current-to-digital-identity",
      workspaceIds: ["workspace-human-computer-interaction", "workspace-digital-identity"],
    },
    {
      id: "path-current-to-credentials",
      workspaceIds: [
        "workspace-human-computer-interaction",
        "workspace-blockchain",
        "workspace-verifiable-credentials",
      ],
      sourceId: "source-authorization-notes",
      chunkId: "chunk-user-authorization",
    },
  ],
  selectedChunkIds: ["chunk-did-architecture", "chunk-user-authorization"],
  citedChunkIds: ["chunk-did-architecture"],
};

export const referenceKnowledgeNetworkTrace = referenceKnowledgeNetworkTraceBase;

const expandedKnowledgeNetworkTraceBase: KnowledgeNetworkTrace = {
  ...referenceKnowledgeNetworkTrace,
  id: "expanded-reference-trace",
  workspaces: [
    ...referenceKnowledgeNetworkTrace.workspaces,
    {
      id: "workspace-user-research",
      name: "用户研究",
      detail: "引用 Workspace · 9 份资料",
      relation: "referenced",
    },
    {
      id: "workspace-privacy-engineering",
      name: "隐私工程",
      detail: "引用 Workspace · 11 份资料",
      relation: "referenced",
    },
    {
      id: "workspace-identity-governance",
      name: "身份治理",
      detail: "间接引用 Workspace · 7 份资料",
      relation: "referenced",
    },
    {
      id: "workspace-inclusive-design",
      name: "包容性设计",
      detail: "间接引用 Workspace · 6 份资料",
      relation: "referenced",
    },
    {
      id: "workspace-credential-interoperability",
      name: "凭证互操作",
      detail: "间接引用 Workspace · 4 份资料",
      relation: "referenced",
    },
  ],
  references: [
    ...referenceKnowledgeNetworkTrace.references,
    {
      id: "reference-a-research",
      sourceWorkspaceId: "workspace-human-computer-interaction",
      targetWorkspaceId: "workspace-user-research",
    },
    {
      id: "reference-a-privacy",
      sourceWorkspaceId: "workspace-human-computer-interaction",
      targetWorkspaceId: "workspace-privacy-engineering",
    },
    {
      id: "reference-b-interop",
      sourceWorkspaceId: "workspace-blockchain",
      targetWorkspaceId: "workspace-credential-interoperability",
    },
    {
      id: "reference-c-governance",
      sourceWorkspaceId: "workspace-digital-identity",
      targetWorkspaceId: "workspace-identity-governance",
    },
    {
      id: "reference-research-inclusive",
      sourceWorkspaceId: "workspace-user-research",
      targetWorkspaceId: "workspace-inclusive-design",
    },
    {
      id: "reference-privacy-governance",
      sourceWorkspaceId: "workspace-privacy-engineering",
      targetWorkspaceId: "workspace-identity-governance",
    },
    {
      id: "reference-governance-privacy",
      sourceWorkspaceId: "workspace-identity-governance",
      targetWorkspaceId: "workspace-privacy-engineering",
    },
    {
      id: "reference-inclusive-research",
      sourceWorkspaceId: "workspace-inclusive-design",
      targetWorkspaceId: "workspace-user-research",
    },
  ],
  sources: [
    ...referenceKnowledgeNetworkTrace.sources,
    {
      id: "source-user-research",
      workspaceId: "workspace-human-computer-interaction",
      name: "用户访谈研究.pdf",
      detail: "PDF · 28 chunks",
      family: "pdf",
      chunkCount: 28,
    },
    {
      id: "source-interaction-principles",
      workspaceId: "workspace-human-computer-interaction",
      name: "交互原则.pptx",
      detail: "Presentation · 16 chunks",
      family: "presentation",
      chunkCount: 16,
    },
    {
      id: "source-did-implementation",
      workspaceId: "workspace-blockchain",
      name: "DID 实现指南.md",
      detail: "Text · 21 chunks",
      family: "text",
      chunkCount: 21,
    },
    {
      id: "source-identity-standards",
      workspaceId: "workspace-digital-identity",
      name: "数字身份标准.pdf",
      detail: "PDF · 42 chunks",
      family: "pdf",
      chunkCount: 42,
    },
    {
      id: "source-governance-framework",
      workspaceId: "workspace-identity-governance",
      name: "身份治理框架.pdf",
      detail: "PDF · 36 chunks",
      family: "pdf",
      chunkCount: 36,
    },
    {
      id: "source-accessibility-audit",
      workspaceId: "workspace-inclusive-design",
      name: "可访问性评估.pptx",
      detail: "Presentation · 18 chunks",
      family: "presentation",
      chunkCount: 18,
    },
    {
      id: "source-privacy-threat-model",
      workspaceId: "workspace-privacy-engineering",
      name: "隐私威胁建模.md",
      detail: "Text · 14 chunks",
      family: "text",
      chunkCount: 14,
    },
    {
      id: "source-interoperability-spec",
      workspaceId: "workspace-credential-interoperability",
      name: "凭证互操作规范.pdf",
      detail: "PDF · 31 chunks",
      family: "pdf",
      chunkCount: 31,
    },
  ],
  chunks: [
    ...referenceKnowledgeNetworkTrace.chunks,
    {
      id: "chunk-user-consent-observation",
      sourceId: "source-user-research",
      label: "用户同意边界",
      locator: "P18",
      rank: 6,
    },
    {
      id: "chunk-feedback-loop",
      sourceId: "source-interaction-principles",
      label: "反馈闭环",
      locator: "P09",
      rank: 8,
    },
    {
      id: "chunk-did-resolution",
      sourceId: "source-did-implementation",
      label: "DID 解析",
      locator: "§2.4",
      rank: 9,
    },
    {
      id: "chunk-issuer-verifier",
      sourceId: "source-identity-standards",
      label: "签发与验证",
      locator: "P21",
      rank: 10,
    },
    {
      id: "chunk-policy-ownership",
      sourceId: "source-governance-framework",
      label: "策略归属",
      locator: "P14",
      rank: 11,
    },
    {
      id: "chunk-accessibility",
      sourceId: "source-accessibility-audit",
      label: "无障碍提示",
      locator: "P07",
      rank: 12,
    },
    {
      id: "chunk-privacy-threat-model",
      sourceId: "source-privacy-threat-model",
      label: "威胁建模",
      locator: "§3.1",
      rank: 13,
    },
    {
      id: "chunk-credential-interoperability",
      sourceId: "source-interoperability-spec",
      label: "跨域互操作",
      locator: "P16",
      rank: 14,
    },
  ],
  paths: [
    ...referenceKnowledgeNetworkTrace.paths,
    {
      id: "path-current-to-research",
      workspaceIds: ["workspace-human-computer-interaction", "workspace-user-research"],
    },
    {
      id: "path-current-to-privacy",
      workspaceIds: ["workspace-human-computer-interaction", "workspace-privacy-engineering"],
      sourceId: "source-privacy-threat-model",
      chunkId: "chunk-privacy-threat-model",
    },
    {
      id: "path-current-to-inclusive",
      workspaceIds: [
        "workspace-human-computer-interaction",
        "workspace-user-research",
        "workspace-inclusive-design",
      ],
      sourceId: "source-accessibility-audit",
      chunkId: "chunk-accessibility",
    },
    {
      id: "path-current-to-interop",
      workspaceIds: [
        "workspace-human-computer-interaction",
        "workspace-blockchain",
        "workspace-credential-interoperability",
      ],
    },
    {
      id: "path-current-to-governance",
      workspaceIds: [
        "workspace-human-computer-interaction",
        "workspace-digital-identity",
        "workspace-identity-governance",
      ],
    },
  ],
  selectedChunkIds: [
    "chunk-did-architecture",
    "chunk-user-authorization",
    "chunk-accessibility",
    "chunk-privacy-threat-model",
  ],
  citedChunkIds: ["chunk-did-architecture", "chunk-accessibility"],
};

const expandedKnowledgeNetworkTrace = expandedKnowledgeNetworkTraceBase;

type CircularExpansionSourceSeed = {
  name: string;
  format: string;
  family: KnowledgeNetworkSource["family"];
  chunks: string[];
};

type CircularExpansionBranch = KnowledgeNetworkWorkspace & {
  parentId: string;
  sources: CircularExpansionSourceSeed[];
};

const circularExpansionCoreBranches: CircularExpansionBranch[] = [
  {
    id: "workspace-wallet-architecture",
    name: "钱包架构",
    detail: "引用 Workspace · 10 份资料",
    relation: "referenced",
    parentId: "workspace-blockchain",
    sources: [
      {
        name: "钱包安全设计.pdf",
        format: "PDF",
        family: "pdf",
        chunks: ["密钥轮换", "恢复策略", "密钥隔离"],
      },
      {
        name: "自主身份钱包.md",
        format: "Text",
        family: "text",
        chunks: ["本地密钥", "钱包授权", "离线凭证"],
      },
      {
        name: "移动凭证.pptx",
        format: "Presentation",
        family: "presentation",
        chunks: ["设备绑定", "离线验证", "移动端交互"],
      },
    ],
  },
  {
    id: "workspace-credential-issuance",
    name: "凭证签发",
    detail: "引用 Workspace · 9 份资料",
    relation: "referenced",
    parentId: "workspace-digital-identity",
    sources: [
      {
        name: "凭证签发流程.pdf",
        format: "PDF",
        family: "pdf",
        chunks: ["签发流程", "状态转换", "撤销条件"],
      },
      {
        name: "签发服务接口.json",
        format: "Structured",
        family: "structured",
        chunks: ["签发接口", "凭证载荷", "响应校验"],
      },
      {
        name: "验证者配置.xlsx",
        format: "Spreadsheet",
        family: "spreadsheet",
        chunks: ["验证者清单", "信任锚", "配置版本"],
      },
    ],
  },
  {
    id: "workspace-privacy-compliance",
    name: "隐私合规",
    detail: "引用 Workspace · 11 份资料",
    relation: "referenced",
    parentId: "workspace-privacy-engineering",
    sources: [
      {
        name: "隐私合规检查表.xlsx",
        format: "Spreadsheet",
        family: "spreadsheet",
        chunks: ["合规检查项", "审计证据", "例外处理"],
      },
      {
        name: "数据保留政策.docx",
        format: "Document",
        family: "document",
        chunks: ["保留期限", "删除请求", "目的限制"],
      },
      {
        name: "风险例外登记.csv",
        format: "Table",
        family: "table",
        chunks: ["风险等级", "例外负责人", "复核日期"],
      },
    ],
  },
  {
    id: "workspace-consent-design",
    name: "同意交互",
    detail: "引用 Workspace · 8 份资料",
    relation: "referenced",
    parentId: "workspace-user-research",
    sources: [
      {
        name: "同意管理研究.pdf",
        format: "PDF",
        family: "pdf",
        chunks: ["同意边界", "撤回路径", "用户理解"],
      },
      {
        name: "授权界面草案.pptx",
        format: "Presentation",
        family: "presentation",
        chunks: ["授权提示", "权限分层", "反馈文案"],
      },
      {
        name: "同意状态模型.md",
        format: "Text",
        family: "text",
        chunks: ["状态机", "状态同步", "冲突处理"],
      },
    ],
  },
  {
    id: "workspace-key-management",
    name: "密钥管理",
    detail: "间接引用 Workspace · 7 份资料",
    relation: "referenced",
    parentId: "workspace-wallet-architecture",
    sources: [
      {
        name: "密钥托管规范.pdf",
        format: "PDF",
        family: "pdf",
        chunks: ["托管边界", "密钥备份", "访问隔离"],
      },
      {
        name: "硬件安全模块.docx",
        format: "Document",
        family: "document",
        chunks: ["硬件隔离", "签名操作", "密钥销毁"],
      },
      {
        name: "密钥生命周期.xlsx",
        format: "Spreadsheet",
        family: "spreadsheet",
        chunks: ["生成阶段", "轮换阶段", "归档阶段"],
      },
    ],
  },
  {
    id: "workspace-trust-registry",
    name: "信任注册表",
    detail: "间接引用 Workspace · 8 份资料",
    relation: "referenced",
    parentId: "workspace-identity-governance",
    sources: [
      {
        name: "信任注册表设计.pdf",
        format: "PDF",
        family: "pdf",
        chunks: ["注册表模型", "信任关系", "变更记录"],
      },
      {
        name: "治理角色定义.md",
        format: "Text",
        family: "text",
        chunks: ["治理角色", "审批职责", "升级路径"],
      },
      {
        name: "信任锚目录.json",
        format: "Structured",
        family: "structured",
        chunks: ["锚点目录", "版本规则", "来源校验"],
      },
    ],
  },
  {
    id: "workspace-interop-protocols",
    name: "互操作协议",
    detail: "间接引用 Workspace · 9 份资料",
    relation: "referenced",
    parentId: "workspace-credential-interoperability",
    sources: [
      {
        name: "凭证交换协议.pdf",
        format: "PDF",
        family: "pdf",
        chunks: ["交换协议", "兼容字段", "错误码"],
      },
      {
        name: "跨域映射表.xlsx",
        format: "Spreadsheet",
        family: "spreadsheet",
        chunks: ["字段映射", "格式转换", "兼容矩阵"],
      },
      {
        name: "互操作示例.json",
        format: "Structured",
        family: "structured",
        chunks: ["示例请求", "示例响应", "验证步骤"],
      },
    ],
  },
  {
    id: "workspace-authentication-patterns",
    name: "认证模式",
    detail: "引用 Workspace · 10 份资料",
    relation: "referenced",
    parentId: "workspace-blockchain",
    sources: [
      {
        name: "认证模式综述.pdf",
        format: "PDF",
        family: "pdf",
        chunks: ["认证模式", "信任转移", "风险比较"],
      },
      {
        name: "挑战响应流程.pptx",
        format: "Presentation",
        family: "presentation",
        chunks: ["挑战生成", "响应校验", "重放防护"],
      },
      {
        name: "会话安全笔记.md",
        format: "Text",
        family: "text",
        chunks: ["会话绑定", "过期策略", "恢复机制"],
      },
    ],
  },
  {
    id: "workspace-data-minimization",
    name: "数据最小化",
    detail: "间接引用 Workspace · 8 份资料",
    relation: "referenced",
    parentId: "workspace-privacy-engineering",
    sources: [
      {
        name: "最小披露原则.pdf",
        format: "PDF",
        family: "pdf",
        chunks: ["最小披露", "选择性披露", "披露证明"],
      },
      {
        name: "数据字段分级.xlsx",
        format: "Spreadsheet",
        family: "spreadsheet",
        chunks: ["字段分级", "敏感字段", "默认策略"],
      },
      {
        name: "隐私预算模型.json",
        format: "Structured",
        family: "structured",
        chunks: ["预算模型", "消耗记录", "阈值告警"],
      },
    ],
  },
  {
    id: "workspace-accessibility-research",
    name: "无障碍研究",
    detail: "间接引用 Workspace · 6 份资料",
    relation: "referenced",
    parentId: "workspace-inclusive-design",
    sources: [
      {
        name: "辅助技术测试.pdf",
        format: "PDF",
        family: "pdf",
        chunks: ["屏幕阅读", "键盘路径", "认知负担"],
      },
      {
        name: "可感知反馈.pptx",
        format: "Presentation",
        family: "presentation",
        chunks: ["反馈层级", "颜色替代", "状态提示"],
      },
      {
        name: "无障碍验收表.csv",
        format: "Table",
        family: "table",
        chunks: ["验收规则", "缺陷等级", "回归结果"],
      },
    ],
  },
  {
    id: "workspace-agent-identity",
    name: "代理身份",
    detail: "引用 Workspace · 9 份资料",
    relation: "referenced",
    parentId: "workspace-digital-identity",
    sources: [
      {
        name: "代理身份模型.pdf",
        format: "PDF",
        family: "pdf",
        chunks: ["代理主体", "代表关系", "权限边界"],
      },
      {
        name: "自动化凭证.md",
        format: "Text",
        family: "text",
        chunks: ["自动签发", "代理验证", "审计轨迹"],
      },
      {
        name: "代理策略配置.json",
        format: "Structured",
        family: "structured",
        chunks: ["策略配置", "条件匹配", "策略撤销"],
      },
    ],
  },
  {
    id: "workspace-audit-practices",
    name: "审计实践",
    detail: "间接引用 Workspace · 7 份资料",
    relation: "referenced",
    parentId: "workspace-identity-governance",
    sources: [
      {
        name: "身份审计指南.pdf",
        format: "PDF",
        family: "pdf",
        chunks: ["审计范围", "证据链", "审计结论"],
      },
      {
        name: "操作日志规范.docx",
        format: "Document",
        family: "document",
        chunks: ["日志字段", "完整性保护", "访问留痕"],
      },
      {
        name: "审计事件字典.xlsx",
        format: "Spreadsheet",
        family: "spreadsheet",
        chunks: ["事件分类", "严重级别", "处置状态"],
      },
    ],
  },
  {
    id: "workspace-recovery-experience",
    name: "恢复体验",
    detail: "间接引用 Workspace · 8 份资料",
    relation: "referenced",
    parentId: "workspace-wallet-architecture",
    sources: [
      {
        name: "凭证恢复研究.pdf",
        format: "PDF",
        family: "pdf",
        chunks: ["恢复触发", "备份选择", "恢复确认"],
      },
      {
        name: "恢复流程原型.pptx",
        format: "Presentation",
        family: "presentation",
        chunks: ["流程分步", "错误回退", "完成反馈"],
      },
      {
        name: "恢复状态说明.md",
        format: "Text",
        family: "text",
        chunks: ["状态说明", "风险提示", "人工介入"],
      },
    ],
  },
];

type CircularExpansionSourceTuple = readonly [
  name: string,
  format: string,
  family: KnowledgeNetworkSource["family"],
  chunks: readonly string[],
];

function createCircularExpansionBranch(
  id: string,
  name: string,
  parentId: string,
  sources: readonly CircularExpansionSourceTuple[],
): CircularExpansionBranch {
  return {
    id,
    name,
    detail: `扩展引用 Workspace · ${sources.length * 3} 份资料`,
    relation: "referenced",
    parentId,
    sources: sources.map(([sourceName, format, family, chunks]) => ({
      name: sourceName,
      format,
      family,
      chunks: [...chunks],
    })),
  };
}

const circularExpansionAdditionalBranches: CircularExpansionBranch[] = [
  createCircularExpansionBranch(
    "workspace-policy-automation",
    "策略自动化",
    "workspace-privacy-engineering",
    [
      ["策略评估.pdf", "PDF", "pdf", ["策略评估", "规则优先级", "决策依据"]],
      ["同意账本.json", "Structured", "structured", ["同意账本", "事件签名", "撤回同步"]],
      ["隐私工作流.pptx", "Presentation", "presentation", ["流程触发", "人工复核", "闭环状态"]],
    ],
  ),
  createCircularExpansionBranch(
    "workspace-credential-exchange",
    "凭证交换",
    "workspace-blockchain",
    [
      ["凭证交换协议.pdf", "PDF", "pdf", ["交换握手", "格式协商", "失败重试"]],
      ["联邦桥接说明.md", "Text", "text", ["桥接信任", "域间授权", "边界检查"]],
      ["交换测试矩阵.xlsx", "Spreadsheet", "spreadsheet", ["互通样例", "兼容测试", "回归矩阵"]],
    ],
  ),
  createCircularExpansionBranch(
    "workspace-identity-analytics",
    "身份分析",
    "workspace-digital-identity",
    [
      ["身份信号研究.pdf", "PDF", "pdf", ["身份信号", "风险评分", "异常模式"]],
      ["验证遥测.json", "Structured", "structured", ["验证遥测", "事件采样", "指标聚合"]],
      ["身份指标笔记.md", "Text", "text", ["覆盖率", "误拒分析", "审计指标"]],
    ],
  ),
  createCircularExpansionBranch(
    "workspace-assistive-flows",
    "辅助流程",
    "workspace-user-research",
    [
      ["辅助流程研究.pdf", "PDF", "pdf", ["辅助流程", "认知负担", "反馈节奏"]],
      ["访谈编码表.xlsx", "Spreadsheet", "spreadsheet", ["访谈编码", "主题聚类", "研究置信度"]],
      ["包容性模式.pptx", "Presentation", "presentation", ["包容模式", "提示替代", "任务完成"]],
    ],
  ),
  createCircularExpansionBranch(
    "workspace-wallet-security-ops",
    "钱包安全运维",
    "workspace-key-management",
    [
      ["密钥操作规范.pdf", "PDF", "pdf", ["密钥操作", "双人复核", "应急封存"]],
      ["HSM 运维手册.docx", "Document", "document", ["硬件巡检", "故障切换", "恢复演练"]],
      ["轮换策略笔记.md", "Text", "text", ["轮换窗口", "过期提醒", "旧钥销毁"]],
    ],
  ),
  createCircularExpansionBranch(
    "workspace-issuer-operations",
    "签发运维",
    "workspace-credential-issuance",
    [
      ["签发运维手册.pdf", "PDF", "pdf", ["签发运维", "队列管理", "故障分流"]],
      ["签发事件模型.json", "Structured", "structured", ["签发事件", "状态索引", "事件重放"]],
      ["验证者接入.pptx", "Presentation", "presentation", ["验证者接入", "配置校验", "上线检查"]],
    ],
  ),
  createCircularExpansionBranch(
    "workspace-consent-observability",
    "同意观测",
    "workspace-consent-design",
    [
      ["同意观测研究.pdf", "PDF", "pdf", ["同意观测", "授权漏斗", "异常撤回"]],
      ["授权事件.json", "Structured", "structured", ["授权事件", "状态追踪", "数据留痕"]],
      ["同意质量笔记.md", "Text", "text", ["文案质量", "理解检查", "反馈修正"]],
    ],
  ),
  createCircularExpansionBranch(
    "workspace-compliance-evidence",
    "合规证据",
    "workspace-privacy-compliance",
    [
      ["合规证据规范.pdf", "PDF", "pdf", ["合规证据", "控制映射", "证据保全"]],
      ["保留审计表.xlsx", "Spreadsheet", "spreadsheet", ["保留审计", "删除核验", "周期复盘"]],
      ["例外审查记录.md", "Text", "text", ["例外审查", "审批链", "关闭条件"]],
    ],
  ),
  createCircularExpansionBranch(
    "workspace-policy-catalog",
    "策略目录",
    "workspace-policy-automation",
    [
      ["策略目录设计.pdf", "PDF", "pdf", ["策略目录", "版本继承", "适用范围"]],
      ["规则测试样例.json", "Structured", "structured", ["规则测试", "边界样例", "结果比对"]],
      ["策略发布流程.pptx", "Presentation", "presentation", ["策略发布", "灰度窗口", "回滚预案"]],
    ],
  ),
  createCircularExpansionBranch(
    "workspace-exchange-validation",
    "交换验收",
    "workspace-credential-exchange",
    [
      ["交换验收报告.pdf", "PDF", "pdf", ["交换验收", "协议覆盖", "互操作风险"]],
      ["桥接契约说明.md", "Text", "text", ["桥接契约", "字段约束", "兼容声明"]],
      ["跨域案例表.xlsx", "Spreadsheet", "spreadsheet", ["跨域案例", "异常映射", "验收结果"]],
    ],
  ),
  createCircularExpansionBranch(
    "workspace-identity-portability",
    "身份迁移",
    "workspace-identity-analytics",
    [
      ["身份迁移研究.pdf", "PDF", "pdf", ["身份迁移", "数据可携", "迁移边界"]],
      ["可携声明模型.json", "Structured", "structured", ["可携声明", "声明映射", "验证结果"]],
      ["迁移操作手册.md", "Text", "text", ["迁移步骤", "回退窗口", "完成校验"]],
    ],
  ),
  createCircularExpansionBranch(
    "workspace-assistive-technology",
    "辅助技术",
    "workspace-assistive-flows",
    [
      ["辅助技术评估.pdf", "PDF", "pdf", ["辅助技术", "设备适配", "输入替代"]],
      ["无障碍组件.pptx", "Presentation", "presentation", ["组件适配", "语义提示", "键盘导航"]],
      ["支持矩阵.xlsx", "Spreadsheet", "spreadsheet", ["支持矩阵", "环境覆盖", "缺陷闭环"]],
    ],
  ),
];

const circularExpansionBranches = [
  ...circularExpansionCoreBranches,
  ...circularExpansionAdditionalBranches,
];

const circularExpansionWorkspaces = circularExpansionBranches.map(
  ({ parentId: _parentId, sources: _sources, ...workspace }) => workspace,
);

const circularExpansionReferences = circularExpansionBranches.map((branch) => ({
  id: `reference-expanded-${branch.id}`,
  sourceWorkspaceId: branch.parentId,
  targetWorkspaceId: branch.id,
}));

const circularExpansionSources: KnowledgeNetworkSource[] = circularExpansionBranches.flatMap(
  (branch) =>
    branch.sources.map((source, sourceIndex) => ({
      id: `source-expanded-${branch.id}-${sourceIndex + 1}`,
      workspaceId: branch.id,
      name: source.name,
      detail: `${source.format} · ${source.chunks.length * 9 + 9} chunks`,
      family: source.family,
      chunkCount: source.chunks.length * 9 + 9,
    })),
);

const circularExpansionChunks: KnowledgeNetworkChunk[] = circularExpansionBranches.flatMap(
  (branch) =>
    branch.sources.flatMap((source, sourceIndex) => {
      const sourceId = `source-expanded-${branch.id}-${sourceIndex + 1}`;
      return source.chunks.map((label, chunkIndex) => ({
        id: `chunk-expanded-${branch.id}-${sourceIndex + 1}-${chunkIndex + 1}`,
        sourceId,
        label,
        locator:
          source.format === "PDF" ? `P${chunkIndex + 24}` : `§${chunkIndex + 2}.${sourceIndex + 1}`,
        rank:
          referenceKnowledgeNetworkTrace.chunks.length +
          circularExpansionBranches
            .slice(0, circularExpansionBranches.indexOf(branch))
            .reduce(
              (count, previousBranch) =>
                count + previousBranch.sources.reduce((sum, item) => sum + item.chunks.length, 0),
              0,
            ) +
          branch.sources
            .slice(0, sourceIndex)
            .reduce((count, previousSource) => count + previousSource.chunks.length, 0) +
          chunkIndex +
          1,
      }));
    }),
);

const circularExpandedKnowledgeNetworkTraceBase: KnowledgeNetworkTrace = {
  ...expandedKnowledgeNetworkTrace,
  id: "circular-expanded-reference-trace",
  workspaces: [...expandedKnowledgeNetworkTrace.workspaces, ...circularExpansionWorkspaces],
  references: [...expandedKnowledgeNetworkTrace.references, ...circularExpansionReferences],
  sources: [...expandedKnowledgeNetworkTrace.sources, ...circularExpansionSources],
  chunks: [...expandedKnowledgeNetworkTrace.chunks, ...circularExpansionChunks],
  selectedChunkIds: [...expandedKnowledgeNetworkTrace.selectedChunkIds],
  citedChunkIds: [...expandedKnowledgeNetworkTrace.citedChunkIds],
};

export const circularExpandedKnowledgeNetworkTrace = circularExpandedKnowledgeNetworkTraceBase;

const incrementalKnowledgeNetworkTraceBase: KnowledgeNetworkTrace = {
  ...referenceKnowledgeNetworkTrace,
  id: "incremental-reference-trace",
  query: "补充说明可验证凭证如何减少不必要的数据暴露",
  chunks: [
    ...referenceKnowledgeNetworkTrace.chunks,
    {
      id: "chunk-minimal-disclosure",
      sourceId: "source-authorization-notes",
      label: "最小披露",
      locator: "§5.3",
      rank: 1,
    },
  ],
  paths: [
    ...referenceKnowledgeNetworkTrace.paths,
    {
      id: "path-current-to-minimal-disclosure",
      workspaceIds: [
        "workspace-human-computer-interaction",
        "workspace-blockchain",
        "workspace-verifiable-credentials",
      ],
      sourceId: "source-authorization-notes",
      chunkId: "chunk-minimal-disclosure",
    },
  ],
  selectedChunkIds: [
    "chunk-did-architecture",
    "chunk-user-authorization",
    "chunk-minimal-disclosure",
  ],
  citedChunkIds: ["chunk-did-architecture", "chunk-minimal-disclosure"],
};

export const incrementalKnowledgeNetworkTrace = incrementalKnowledgeNetworkTraceBase;

const emptyKnowledgeNetworkTraceBase: KnowledgeNetworkTrace = {
  id: "empty-knowledge-network",
  query: "查找一个没有资料支持的问题",
  answer: {
    streaming: "我正在检查当前资料范围。",
    completed: "当前资料中没有足够证据支持这个问题。",
  },
  currentWorkspaceId: referenceKnowledgeNetworkTrace.currentWorkspaceId,
  workspaces: referenceKnowledgeNetworkTrace.workspaces.slice(0, 1),
  references: [],
  sources: referenceKnowledgeNetworkTrace.sources.slice(0, 1),
  chunks: [],
  paths: [],
  selectedChunkIds: [],
  citedChunkIds: [],
};

export const emptyKnowledgeNetworkTrace = emptyKnowledgeNetworkTraceBase;
