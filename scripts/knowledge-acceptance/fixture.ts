import { createHash } from "node:crypto";
import { v5 as uuidV5 } from "uuid";
import { z } from "zod";

const ACCEPTANCE_ID_NAMESPACE = "7e153f7e-1df6-4ef7-93f1-9fd60fffc886";

const sourceSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    title: z.string().trim().min(1),
    filename: z.string().trim().min(1),
    content: z.string().trim().min(1),
    features: z
      .array(
        z.enum([
          "chinese",
          "english",
          "mixed",
          "headings",
          "list",
          "table",
          "code",
          "oversized",
          "duplicate",
          "timestamp",
        ]),
      )
      .min(1),
  })
  .strict();

const querySchema = z
  .object({
    id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    intent: z.string().trim().min(1),
    query: z.string().trim().min(1),
    expectedSourceIds: z.array(z.string().min(1)).min(1),
    expectedEvidenceAny: z.array(z.string().trim().min(1)).min(1),
    negativeSourceIds: z.array(z.string().min(1)),
  })
  .strict();

export const acceptanceFixtureSchema = z
  .object({
    version: z.literal("knowledge-acceptance-v1"),
    sources: z.array(sourceSchema).length(16),
    queries: z.array(querySchema).length(32),
  })
  .strict()
  .superRefine((fixture, context) => {
    const sourceIds = new Set<string>();
    for (const [index, source] of fixture.sources.entries()) {
      if (sourceIds.has(source.id)) {
        context.addIssue({
          code: "custom",
          message: "duplicate source id",
          path: ["sources", index],
        });
      }
      sourceIds.add(source.id);
    }
    const queryIds = new Set<string>();
    for (const [index, query] of fixture.queries.entries()) {
      if (queryIds.has(query.id)) {
        context.addIssue({
          code: "custom",
          message: "duplicate query id",
          path: ["queries", index],
        });
      }
      queryIds.add(query.id);
      for (const sourceId of [...query.expectedSourceIds, ...query.negativeSourceIds]) {
        if (!sourceIds.has(sourceId)) {
          context.addIssue({
            code: "custom",
            message: `unknown source id: ${sourceId}`,
            path: ["queries", index],
          });
        }
      }
      if (query.expectedSourceIds.some((sourceId) => query.negativeSourceIds.includes(sourceId))) {
        context.addIssue({
          code: "custom",
          message: "expected and negative sources must be disjoint",
          path: ["queries", index],
        });
      }
    }
  });

type SourceFeature = z.infer<typeof sourceSchema>["features"][number];

function source(
  id: string,
  title: string,
  firstHeading: string,
  firstBody: string,
  secondHeading: string,
  secondBody: string,
  features: SourceFeature[],
) {
  return {
    id,
    title,
    filename: `${id}.md`,
    content: `# ${title}\n\n## ${firstHeading}\n\n${firstBody}\n\n## ${secondHeading}\n\n${secondBody}`,
    features,
  };
}

function query(
  id: string,
  intent: string,
  text: string,
  expectedSourceId: string,
  evidence: string,
  negativeSourceId: string,
) {
  return {
    id,
    intent,
    query: text,
    expectedSourceIds: [expectedSourceId],
    expectedEvidenceAny: [evidence],
    negativeSourceIds: [negativeSourceId],
  };
}

const oversizedSentence = `档案保留边界说明：${"甲级记录必须保持原始定位。".repeat(46)}`;

export const acceptanceFixtureV1 = acceptanceFixtureSchema.parse({
  version: "knowledge-acceptance-v1",
  sources: [
    source(
      "solar-storage",
      "星港储能运行手册",
      "调度指标",
      "星港储能站采用磷酸铁锂电池。峰谷套利效率达到 91%。调度口令为 SG-DELTA。",
      "安全边界",
      "电芯温度达到 55 摄氏度时必须停止充电。恢复运行需要值班长和安全员双签。",
      ["chinese", "headings"],
    ),
    source(
      "database-isolation",
      "数据库隔离级别指南",
      "订单写入",
      "订单结算使用可串行化隔离级别。事务冲突采用指数退避，最多重试三次。",
      "报表读取",
      "月度报表使用可重复读快照。只读事务不得持有业务咨询锁。",
      ["chinese", "headings"],
    ),
    source(
      "exact-rrf",
      "Stratumind 精确融合合同",
      "融合语义",
      "exact-rrf 等价于完整 Dense 与 Sparse 排名执行 WRRF 后的 Top-K。默认 WRRF 常数 k 为 60。",
      "失败规则",
      "无法维持一致视图时禁止返回精确成功。平局必须按照 point identity 升序处理。",
      ["mixed", "headings"],
    ),
    source(
      "oauth-security",
      "OAuth 安全检查表",
      "授权码",
      "公共客户端必须启用 PKCE，并使用 S256 challenge method。回调地址要求完全匹配。",
      "令牌",
      "刷新令牌每次使用后都要轮换。检测到旧令牌重放时撤销整个令牌家族。",
      ["mixed", "headings"],
    ),
    source(
      "python-retry",
      "Python 重试实现",
      "策略",
      "网络请求仅对 429 和 503 状态重试。最大尝试次数是四次，并加入随机抖动。",
      "参考代码",
      "```python\nfor attempt in range(4):\n    delay = min(8, 2 ** attempt) + jitter()\n    request_or_wait(delay)\n```",
      ["mixed", "headings", "code"],
    ),
    source(
      "quarterly-metrics",
      "北辰产品季度指标",
      "收入",
      "| 季度 | 收入 |\n| --- | ---: |\n| Q1 | 120 万元 |\n| Q2 | 168 万元 |",
      "留存",
      "| 指标 | 数值 |\n| --- | ---: |\n| 七日留存 | 72% |\n| 三十日留存 | 48% |",
      ["chinese", "headings", "table"],
    ),
    source(
      "climate-adaptation",
      "Coastal Climate Adaptation Plan",
      "Flood barrier",
      "The Harbor North barrier is designed for a 2.4 meter storm surge. Construction milestone HN-204 starts in October.",
      "Wetland buffer",
      "The eastern wetland buffer must remain at least 320 meters wide. Native reeds are restored every spring.",
      ["english", "headings"],
    ),
    source(
      "neural-retrieval",
      "Neural Retrieval Notes",
      "Dense channel",
      "The dense channel uses cosine similarity over 512-dimensional embeddings. Query and document encoders are frozen together.",
      "Sparse channel",
      "The sparse channel uses native BM25 with IDF modification. Exact term matches preserve identifiers such as NR-17.",
      ["english", "headings"],
    ),
    source(
      "api-rate-limit",
      "API Rate Limit Policy",
      "交互请求",
      "交互请求的默认限制是每分钟 120 次。响应头 Retry-After 给出下一次安全请求时间。",
      "Batch traffic",
      "Batch clients receive a quota of 900 requests per hour. The bucket key is tenant plus endpoint.",
      ["mixed", "headings"],
    ),
    source(
      "deployment-runbook",
      "蓝绿部署运行手册",
      "切换前",
      "- 验证数据库迁移向后兼容\n- 检查绿色环境健康探针\n- 保存发布编号 BG-42",
      "回滚",
      "- 将流量切回蓝色环境\n- 保留失败实例十五分钟\n- 不得回滚已经提交的数据迁移",
      ["chinese", "headings", "list"],
    ),
    source(
      "long-retention-policy",
      "超长档案保留政策",
      "不可变记录",
      oversizedSentence,
      "销毁条件",
      "保留期满七年后才能申请销毁。销毁批准编号必须以 RET-7 开头。",
      ["chinese", "headings", "oversized"],
    ),
    source(
      "duplicate-alpha",
      "Alpha 机房值班记录",
      "共享说明",
      "共享安全说明：紧急出口必须保持畅通。Alpha 机房的灭火系统使用惰性气体。",
      "专属事实",
      "Alpha 机房位于东楼三层，值班代码是 ALPHA-31。",
      ["chinese", "headings", "duplicate"],
    ),
    source(
      "duplicate-beta",
      "Beta 机房值班记录",
      "共享说明",
      "共享安全说明：紧急出口必须保持畅通。Beta 机房的灭火系统使用细水雾。",
      "专属事实",
      "Beta 机房位于西楼二层，值班代码是 BETA-22。",
      ["chinese", "headings", "duplicate"],
    ),
    source(
      "audio-transcript",
      "故障复盘录音转写",
      "发现",
      "[00:01:12.000–00:01:28.000] 监控发现缓存命中率下降到 34%。事件编号为 INC-704。",
      "恢复",
      "[00:08:40.000–00:09:05.000] 清理错误路由后缓存命中率恢复到 88%。",
      ["chinese", "headings", "timestamp"],
    ),
    source(
      "nested-headings",
      "多级标题操作规范",
      "一级审批 > 风险复核",
      "高风险变更需要两名复核人。风险标签是 NEST-R2。",
      "一级审批 > 发布确认",
      "发布确认必须记录 commit hash、操作者和 UTC 时间。",
      ["mixed", "headings"],
    ),
    source(
      "falcon-decoy",
      "Falcon 搜索服务旧说明",
      "旧排序",
      "Falcon 使用固定截断的候选并集，不提供 exact-rrf 正确性保证。旧常数是 40。",
      "退役",
      "Falcon 已于 2025 年退役。新请求不得发送到端口 7444。",
      ["mixed", "headings"],
    ),
  ],
  queries: [
    query(
      "solar-efficiency",
      "查找储能效率",
      "星港储能站峰谷套利效率是多少？",
      "solar-storage",
      "峰谷套利效率达到 91%。",
      "falcon-decoy",
    ),
    query(
      "solar-temperature",
      "查找充电停止温度",
      "电芯达到多少摄氏度必须停止充电？",
      "solar-storage",
      "电芯温度达到 55 摄氏度时必须停止充电。",
      "climate-adaptation",
    ),
    query(
      "db-order-isolation",
      "确定订单事务隔离级别",
      "订单结算使用什么数据库隔离级别？",
      "database-isolation",
      "订单结算使用可串行化隔离级别。",
      "api-rate-limit",
    ),
    query(
      "db-report-snapshot",
      "确定月报读取策略",
      "月度报表使用哪一种快照？",
      "database-isolation",
      "月度报表使用可重复读快照。",
      "quarterly-metrics",
    ),
    query(
      "rrf-equivalence",
      "解释 exact-rrf 等价性",
      "exact-rrf 的 Top-K 等价于什么？",
      "exact-rrf",
      "等价于完整 Dense 与 Sparse 排名执行 WRRF 后的 Top-K。",
      "falcon-decoy",
    ),
    query(
      "rrf-tie",
      "查找融合平局规则",
      "Stratumind 精确融合出现平局时如何排序？",
      "exact-rrf",
      "平局必须按照 point identity 升序处理。",
      "neural-retrieval",
    ),
    query(
      "oauth-pkce",
      "查找公共客户端安全要求",
      "OAuth 公共客户端必须启用什么机制？",
      "oauth-security",
      "公共客户端必须启用 PKCE",
      "api-rate-limit",
    ),
    query(
      "oauth-replay",
      "查找刷新令牌重放处理",
      "检测到旧刷新令牌重放后应该撤销什么？",
      "oauth-security",
      "撤销整个令牌家族。",
      "deployment-runbook",
    ),
    query(
      "retry-status",
      "查找可重试状态码",
      "Python 网络请求只对哪些状态码重试？",
      "python-retry",
      "仅对 429 和 503 状态重试。",
      "api-rate-limit",
    ),
    query(
      "retry-attempts",
      "查找最大重试次数",
      "参考重试代码最多尝试多少次？",
      "python-retry",
      "最大尝试次数是四次",
      "database-isolation",
    ),
    query(
      "metrics-q2",
      "查找 Q2 收入",
      "北辰产品 Q2 收入是多少？",
      "quarterly-metrics",
      "| Q2 | 168 万元 |",
      "api-rate-limit",
    ),
    query(
      "metrics-retention",
      "查找三十日留存",
      "北辰产品三十日留存是多少？",
      "quarterly-metrics",
      "| 三十日留存 | 48% |",
      "neural-retrieval",
    ),
    query(
      "climate-surge",
      "查找防洪屏障设计值",
      "What storm surge is Harbor North designed for?",
      "climate-adaptation",
      "designed for a 2.4 meter storm surge.",
      "solar-storage",
    ),
    query(
      "climate-wetland",
      "查找湿地缓冲区宽度",
      "How wide must the eastern wetland buffer remain?",
      "climate-adaptation",
      "remain at least 320 meters wide.",
      "solar-storage",
    ),
    query(
      "neural-dimension",
      "查找 Dense 向量维度",
      "How many dimensions does the dense retrieval channel use?",
      "neural-retrieval",
      "512-dimensional embeddings.",
      "exact-rrf",
    ),
    query(
      "neural-sparse",
      "查找 Sparse 算法",
      "Which sparse algorithm preserves identifier NR-17?",
      "neural-retrieval",
      "native BM25 with IDF modification.",
      "falcon-decoy",
    ),
    query(
      "rate-interactive",
      "查找交互请求限额",
      "交互 API 每分钟默认允许多少次请求？",
      "api-rate-limit",
      "默认限制是每分钟 120 次。",
      "quarterly-metrics",
    ),
    query(
      "rate-batch",
      "查找批处理配额",
      "What is the hourly quota for batch clients?",
      "api-rate-limit",
      "900 requests per hour.",
      "python-retry",
    ),
    query(
      "deploy-precheck",
      "查找蓝绿切换前检查",
      "蓝绿部署切换前必须验证什么迁移性质？",
      "deployment-runbook",
      "验证数据库迁移向后兼容",
      "database-isolation",
    ),
    query(
      "deploy-rollback",
      "查找蓝绿回滚限制",
      "蓝绿部署回滚时什么迁移不得回滚？",
      "deployment-runbook",
      "不得回滚已经提交的数据迁移",
      "falcon-decoy",
    ),
    query(
      "retention-locator",
      "查找超长档案定位要求",
      "甲级记录必须保持什么定位？",
      "long-retention-policy",
      "甲级记录必须保持原始定位。",
      "nested-headings",
    ),
    query(
      "retention-destroy",
      "查找档案销毁年限",
      "档案保留期满多少年后才能申请销毁？",
      "long-retention-policy",
      "保留期满七年后才能申请销毁。",
      "duplicate-alpha",
    ),
    query(
      "alpha-location",
      "区分 Alpha 机房",
      "Alpha 机房位于哪里？",
      "duplicate-alpha",
      "Alpha 机房位于东楼三层",
      "duplicate-beta",
    ),
    query(
      "alpha-fire",
      "查找 Alpha 灭火系统",
      "Alpha 机房使用什么灭火系统？",
      "duplicate-alpha",
      "Alpha 机房的灭火系统使用惰性气体。",
      "duplicate-beta",
    ),
    query(
      "beta-location",
      "区分 Beta 机房",
      "Beta 机房位于哪里？",
      "duplicate-beta",
      "Beta 机房位于西楼二层",
      "duplicate-alpha",
    ),
    query(
      "beta-fire",
      "查找 Beta 灭火系统",
      "Beta 机房使用什么灭火系统？",
      "duplicate-beta",
      "Beta 机房的灭火系统使用细水雾。",
      "duplicate-alpha",
    ),
    query(
      "incident-drop",
      "查找故障最低缓存命中率",
      "INC-704 中缓存命中率下降到多少？",
      "audio-transcript",
      "缓存命中率下降到 34%。",
      "quarterly-metrics",
    ),
    query(
      "incident-recovery",
      "查找故障恢复指标",
      "清理错误路由后缓存命中率恢复到多少？",
      "audio-transcript",
      "缓存命中率恢复到 88%。",
      "api-rate-limit",
    ),
    query(
      "nested-review",
      "查找高风险复核人数",
      "NEST-R2 高风险变更需要几名复核人？",
      "nested-headings",
      "高风险变更需要两名复核人。",
      "oauth-security",
    ),
    query(
      "nested-release",
      "查找发布确认字段",
      "发布确认必须记录哪些信息？",
      "nested-headings",
      "必须记录 commit hash、操作者和 UTC 时间。",
      "deployment-runbook",
    ),
    query(
      "falcon-port",
      "查找退役服务禁用端口",
      "Falcon 退役后新请求不得发送到哪个端口？",
      "falcon-decoy",
      "不得发送到端口 7444。",
      "exact-rrf",
    ),
    query(
      "falcon-limit",
      "查找旧系统固定常数",
      "Falcon 旧排序使用的固定常数是多少？",
      "falcon-decoy",
      "旧常数是 40。",
      "exact-rrf",
    ),
  ],
});

export type AcceptanceFixture = z.infer<typeof acceptanceFixtureSchema>;

export function acceptanceIdentity(kind: string, logicalId: string) {
  return uuidV5(
    `${acceptanceFixtureV1.version}\u001f${kind}\u001f${logicalId}`,
    ACCEPTANCE_ID_NAMESPACE,
  );
}

export function acceptanceCorpusHash(fixture: AcceptanceFixture = acceptanceFixtureV1) {
  return createHash("sha256").update(JSON.stringify(fixture)).digest("hex");
}
