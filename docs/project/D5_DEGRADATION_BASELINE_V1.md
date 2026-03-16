# D5 草案（降级策略质量基线）

## 版本信息
- 版本：v1.0-draft
- 日期：2026-03-16（增量更新）
- 负责人：成员 D
- 目的：定义解析/视频/语音三类能力降级后的最低可用标准与回退优先级
- 当前状态：D-5.1 已完成首轮收口（真实样本 + 评测结果 + 基线冻结）；D5 整体验收仍进行中

## 1. 统一判定原则
1. 降级后不追求等质量，但必须“可用且可解释”。
2. 前端必须能明确展示：
   - 当前能力状态
   - 是否降级
   - 回退目标
   - 可能差异
3. 失败优先转“可解释失败”，避免静默失败。

## 2. 三能力最低可用标准

### A. 文档解析（document_parser）
最低可用标准：
- 可产出非空文本（`text_length > 0`）
- 可进入分块与索引流程（`chunk_count >= 1`）
- 返回降级语义字段（`status/fallback_used/reason_code/user_message`）

不可接受：
- 空文本且无错误语义
- 主流程中断且无回退

### B. 视频理解（video_understanding）
最低可用标准：
- 至少产出 1 条结构化片段（含时间信息）
- 若降级，明确标注回退到何种模式（如字幕解析）
- 可用于后续课件生成（即输出可读文本片段）

不可接受：
- 无片段输出且无原因码
- 前端无法判断当前是否为降级结果

### C. 语音识别（speech_recognition）
最低可用标准：
- 至少产出可读文本（`text` 非空）
- 返回置信度（或标注低置信）
- 失败时返回明确 `reason_code + user_message`

不可接受：
- 返回占位文本却标记为 `available`
- 低质量识别无告警直接进入主链路

## 3. 回退优先级建议

### 文档解析
1. MinerU（主）
2. LlamaParse（备）
3. local_parser（兜底）

### 视频理解
1. Qwen-VL（主）
2. caption_only_parser（备，字幕/ASR文本模式）
3. unavailable（可解释失败）

### 语音识别
1. Faster-Whisper（主）
2. conservative_asr_mode（备，参数更保守）
3. keyword_parser（兜底，关键词提取）

## 4. 预期质量差异说明（给 B 展示）

### 文档解析降级提示
- 文案：
  - "高级解析暂不可用，已切换基础解析，版面结构与公式识别可能不完整。"

### 视频理解降级提示
- 文案：
  - "视频画面理解暂不可用，已切换字幕解析，结果可能缺少视觉细节。"

### 语音识别降级提示
- 文案：
  - "语音识别质量较低，已切换保守模式，术语准确性可能下降。"

## 5. 抽样验证规则（先行）
1. 每种能力每轮至少抽样 10 条（成功/降级/失败均覆盖）。
2. 统计三项：
   - 主流程可继续率
   - 用户可解释率（是否有可读提示）
   - 回退命中率（是否按优先级执行）
3. 若任一能力“用户可解释率 < 95%”，不得通过 D5 验收。

## 6. 输出物（供 B/C/A）
1. 降级质量基线说明（本文件）
2. 前端提示语模板（第 4 节）
3. 验证结果报告模板（后续 D5 实测阶段补充）

## 7. 联调检查项
1. C：确保所有降级分支返回 `status/fallback_used/fallback_target/reason_code/user_message`。
2. B：按统一字段渲染，不通过字符串猜测状态。
3. A：将“可解释失败 + 主流程不断”纳入上线门禁。

## 8. D-5.1 真实样本记录（2026-03-16）
本节记录首个真实链路样本（非测试用 `test_proj_*`），用于冻结 D-5.1 基线输入。

样本元数据：
- `project_id`：`19ada801-2d6e-4258-9814-d7b02ce328fd`
- `upload_id`：`9a46136d-66b7-486e-ae97-5cd1ee223b2d`
- 文件：`requirements.md`
- 文件类型：`word`（由当前后端映射策略识别）
- 文件大小：`4810` bytes

索引结果：
- `chunk_count = 7`
- `indexed_count = 7`
- `text_length = 1908`
- 上传最终状态：`ready`
- 证据日志：`Indexed 7 chunks for project ...`、`index_complete ... chunks=7 indexed=7`、`POST /api/v1/files 200`

阶段结论：
1. 文档解析链路已满足本文件第 2.A 节最低可用标准（非空文本、可分块、可索引）。
2. 该样本可作为 D-5.1 后续审计与回归的真实锚点。
3. 在该真实样本上已完成 D-5.1 评测收口并冻结基线：
   - 评测数据集：`backend/eval/dataset_d51_real_project_space.json`
   - 评测结果：`keyword_hit_rate=90.00%`、`failure_rate=0.00%`、`avg_latency_ms=743.70`
   - 基线文件：`backend/eval/baselines/rag-baseline-v1.json`
4. D5 整体（解析/视频/语音降级策略）仍需继续补足样本与门禁结果，不等于 D5 全量验收完成。

## 9. D-5.1 剩余缺口与下一步
1. D-5.1 首轮基线已冻结，后续每次优化需执行 `baseline_manager.py check` 做退化门禁。
2. 文档解析降级策略样本量从 `1` 提升到 `>=10`（覆盖成功/降级/失败）。
3. 增补视频理解（2.B）真实样本 `>=10`，并记录降级分支命中情况。
4. 增补语音识别（2.C）真实样本 `>=10`，并记录低置信告警表现。
5. 输出“用户可解释率/回退命中率/主流程可继续率”三项统计结果。
6. 任一能力“用户可解释率 < 95%”则 D5 验收不通过。

## 10. 复现命令（真实 project_id 生成）
在 `backend` 目录执行：

```powershell
python -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

新终端执行：

```powershell
.\venv\Scripts\python.exe .\scripts\bootstrap_real_project_data.py --base-url http://127.0.0.1:8000/api/v1 --file "D:\Code\Spectra\docs\project\requirements.md"
```
