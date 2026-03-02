# ADR-007: 课件生成方案 - Marp + Pandoc

**状态**: 已接受 
**日期**: 2026-02-19

## 背景

需要将 AI 生成的内容转换为标准格式的 PPT 和 Word 教案，要求排版稳定、风格统一。

## 考虑的方案

### PPT 生成

| 方案 | 优势 | 劣势 |
|------|------|------|
| **Marp** | 排版 100% 稳定，通过 Markdown 控制 | 自定义布局受限 |
| python-pptx | 完全控制 PPT 元素 | 坐标计算复杂，排版不稳定 |
| Slidev | 代码驱动，适合技术演示 | 不适合教学场景 |

### Word 生成

| 方案 | 优势 | 劣势 |
|------|------|------|
| **Pandoc** | 万能转换器，支持多种格式 | 复杂排版需要模板 |
| python-docx | 完全控制 Word 元素 | 开发工作量大 |

## 决策

- PPT 生成：**Marp** (Markdown → HTML5/PPTX)
- Word 生成：**Pandoc** (Markdown → DOCX)

## 理由

### Marp 优势
- **逻辑即排版**：AI 输出 Markdown，无需计算坐标
- **风格统一**：预设 CSS 教学主题，一键切换
- **多格式输出**：HTML5、PPTX、PDF 一键导出
- **公式支持**：原生支持 LaTeX 数学公式

### Pandoc 优势
- **万能转换**：Markdown → Word/PDF/HTML
- **模板系统**：支持自定义 Word 模板
- **公式保真**：LaTeX 公式完美转换

### 工作流

```
AI (Qwen) 输出 Markdown
 │
 ├──→ Marp CLI ──→ .pptx / HTML5 课件
 │
 └──→ Pandoc ──→ .docx 教案
```

## 权衡

- Marp 自定义布局受限 → 预设足够多的教学主题模板
- 复杂互动功能 → 后期可扩展 HTML5 游戏模块

## 影响

- AI Prompt 输出标准 Markdown 格式
- 后端集成 Marp CLI 和 Pandoc
- 预设 Spectra 专属教学主题 CSS

## 示例

### AI 输出的 Markdown
```markdown
---
marp: true
theme: spectra-edu
paginate: true
---

# 牛顿第二定律

## 核心公式

$$F = ma$$

- **F**: 力（单位：牛顿 N）
- **m**: 质量（单位：千克 kg）
- **a**: 加速度（单位：m/s²）

---

## 生活案例

![bg right:40%](./images/rocket.png)

火箭发射时，推力 F 越大，加速度 a 越大
```

### 输出结果
- Marp → 精美 PPT 课件
- Pandoc → 配套 Word 教案

## 参考

- [技术调研报告](../requirements/ai/2.tech-research.md)
- [Marp 官网](https://marp.app/)
- [Pandoc 官网](https://pandoc.org/)
