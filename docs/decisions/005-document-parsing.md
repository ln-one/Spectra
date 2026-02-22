# ADR-005: 文档解析方案

**状态**: ✅ 已接受  
**日期**: 2026-02-19  
**更新**: 2026-02-19（增加 LlamaParse 作为备选）

## 背景

教学 PDF 含有大量公式、表格和复杂排版，需要高质量的文档解析方案来提取结构化内容。

## 考虑的方案

| 方案 | 部署    | 优势                   | 劣势                          |
|------|-------|----------------------|-----------------------------|
| **MinerU (Magic-PDF)** | 本地/云端 | 公式识别率极高，中文优化，结构分析能力强 | 文件上传需用url                   |
| **LlamaParse** | 云端    | 零配置，API 简单，版面分析强     | 数据上云，按量付费                   |
| Docling (IBM) | 本地    | 速度快                  | LaTeX 转化准确度不如 MinerU        |
| 多模态大模型直读 | 云端    | 准确度高                 | Token 消耗恐怖（单页 1-10 万 Token） |
| PyMuPDF | 本地    | 轻量免费                 | 复杂排版处理能力弱                   |

## 决策

采用 **可插拔架构**，支持两种解析后端：

| 场景 | 推荐方案              | 理由 |
|------|-------------------|------|
| **快速开发/原型** | MinerU/LlamaParse | 零配置，API 调用即可 |
| **比赛演示/生产** | MinerU            | 满足"本地知识库"要求，完全离线 |

```python
# 可插拔解析器设计
class DocumentParser:
    def __init__(self, backend: str = "mineru"):
        if backend == "mineru":
            self.parser = MinerUParser()
        elif backend == "llamaparse":
            self.parser = LlamaParseParser()
    
    async def parse(self, file_path: str) -> StructuredDocument:
        return await self.parser.parse(file_path)
```

## MinerU 优势（主选）

### 实测结果
- 教材 PDF 公式识别率很高
- 能将复杂跨页表格转为完美的 Markdown
- 正确识别阅读顺序和层级结构

### 技术优势
- 开源自研，针对中文文档深度优化
- 输出标准 Markdown + LaTeX 格式
- 支持 PDF、Word、PPT 多种格式
- **完全满足赛题"本地知识库"要求**

### 成本优势
- 可本地服务器部署，无 API 费用
- 仅需消耗 GPU 算力（支持 CPU 模式）
- 官方API有较大免费额度

## LlamaParse 优势（备选）

### 开发效率
- 零配置，pip install + API key 即可
- 云端处理，无需本地 GPU
- 有免费额度，适合原型验证

### 技术优势
- 版面分析（Layout Analysis）能力强
- 结构化 Markdown 输出
- 持续更新优化

### 适用场景
- 快速验证想法
- 对数据上云不敏感

## 权衡

| 考量 | MinerU    | LlamaParse |
|------|-----------|------------|
| 数据隐私 | ✅ 可选择完全本地 | ⚠️ 上传云端 |
| 部署复杂度 | ✅ 简单      | ✅ 简单 |
| 离线能力 | ✅ 支持      | ❌ 需要网络 |
| 中文公式 | ✅ 极好      | 一般 |
| 成本 | ✅ 免费      | 按量付费 |

## 影响

- 后端需要实现可插拔的解析器接口
- 通过环境变量配置选择后端：`DOCUMENT_PARSER=mineru|llamaparse`
- 文件上传后异步处理，需要任务队列
- 解析结果统一存储为 Markdown 格式

## 参考

- [技术调研报告](../requirements/ai/2.tech-research.md)
- [MinerU 演示](https://www.bilibili.com/video/BV1UVnkzKEnk/)
