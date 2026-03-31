# LlamaParse 汇总报告（2026-03-31）

## 1. 目标
- 提升 PDF 解析质量，减少纯 `local` 方案在复杂版面下的信息损失。

## 2. 环境与配置
- 当前主策略：`DOCUMENT_PARSER=llamaparse`
- 回退链路：`llamaparse -> mineru -> local`（mineru 当前不可用时回退 local）
- 新增诊断字段：`provider_error`、`provider_error_type`

## 3. 样本与方法
- 样本A：`第3章 基本图形生成算法1-20250926.pdf`（约 3.8MB）
- 样本B：`第2章 图形显示设备-20250919.pdf`（约 36.6MB，87页）
- 评估指标：
- `provider_used`
- `chunk_count`
- `text_length`
- `parse_ms`
- fallback 状态（是否降级）

## 4. 结果概览

### 4.1 样本A（同文件对比）
- `local`：`chunk_count=23`，`text_length=6513`，`parse_ms=1735.64`
- `llamaparse`：`chunk_count=31`，`text_length=8737`，`parse_ms=71362.12`
- 结论：解析覆盖提升约 34%，解析耗时显著增加。

### 4.2 样本B（整本）
- 结果：`provider_error_type=empty_output`
- 最终：回退 `local`

### 4.3 样本B（分段验证）
- `p31-60`：`llamaparse` 成功
- `p61-87`：`llamaparse` 成功
- `p1-30`：`empty_output`，回退 `local`
- 二分后：
- `p1-15`：`llamaparse` 成功
- `p16-30`：`llamaparse` 成功
- 结论：问题更偏向“单次解析规模/稳定性”，不是固定页内容不可解析。

## 5. 关键发现
- LlamaParse 已可用，且对中小规模文档有明显质量收益。
- 大体量/大段解析存在不稳定（`empty_output` 或上传挂起）。
- fallback 机制有效，主流程未中断。

## 6. 当前结论
- LlamaParse 适合作为主解析方案，但必须配套“分段解析 + local fallback”。
- 整本大文件直接解析不稳定，不建议作为默认路径。

## 7. 上线建议
1. 默认使用 `llamaparse`。
2. 上传后按 `10~15 页/段` 自动拆分解析。
3. 单段失败（`provider_error_type=empty_output`）自动回退 `local`。
4. 合并分段结果入库，并保留错误追踪字段。
5. 持续收集失败样本，动态调整分段阈值（页数/文件大小）。

## 8. 后续计划
- 增加问答命中率 A/B 验证（`local` vs `llamaparse`）作为质量验收。
- 评估 `MinerU API/sidecar` 作为第二解析通道，避免主后端依赖冲突。
