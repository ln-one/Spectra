# Import Report

- source file: `侬要有腔调队—项目详细方案.pdf`
- input format: `pdf`
- provider used: `local`
- requested provider: `mineru_cloud`
- fallback used: `true`
- acceptable quality: `true`
- quality grade: `A`
- quality score: `1.0`

## Route Attempts

- `mineru_cloud` -> `unavailable`
  - error: MINERU_CLOUD_API_TOKEN is not configured.
- `mineru_api` -> `unavailable`
  - error: MINERU_API_URL is not configured. Set it to a MinerU FastAPI base URL or a direct parse endpoint.
- `mineru` -> `unavailable`
  - error: MinerU (magic-pdf) 未安装。请通过 `pip install magic-pdf` 安装，或将 DOCUMENT_PARSER 设为 local 使用本地轻量解析。
- `llamaparse` -> `unavailable`
  - error: llama-parse 未安装。请通过 `pip install llama-parse` 安装，或将 DOCUMENT_PARSER 设为 local 使用本地轻量解析。
- `local` -> `accepted`
  - text_length: 76864
  - quality_grade: A
  - quality_score: 1.0

## Degraded Output Policy

- Full-quality chapter recovery was not reached.
- `outline.md`, chapter summaries, and mapping are provided for manual review and later rewrite.
