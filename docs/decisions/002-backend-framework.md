# ADR-002: 后端框架选择 - FastAPI

**状态**: 已接受 
**日期**: 2026-02-15

## 背景

需要选择后端框架来处理 AI 服务、文件上传、数据管理等。

## 考虑的方案

1. FastAPI (Python)
2. Flask (Python)
3. Django (Python)
4. Express.js (Node.js)

## 决策

选择 **FastAPI**

## 理由

- 高性能异步框架，适合 AI 长时间处理
- Python 生态丰富，AI 库支持好
- 自动生成 OpenAPI 文档
- 类型提示提升开发体验
- 易于集成 AI 模型和工具

## 权衡

- Python 性能不如 Go/Rust
- 但 AI 库生态是最大优势

## 影响

- 后端开发使用 Python 3.11+
- 需要配置 Python 虚拟环境
- 部署需要 Python 运行时

