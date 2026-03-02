# ADR-001: 前端框架选择 - Next.js 15

**状态**: 已接受 
**日期**: 2026-02-15

## 背景

需要选择一个现代化的前端框架来构建 AI 教学智能体的用户界面。

## 考虑的方案

1. Next.js 15 (App Router)
2. Create React App
3. Vite + React
4. Vue.js / Nuxt.js

## 决策

选择 **Next.js 15 (App Router)**

## 理由

- 服务端组件减少客户端 JavaScript，提升性能
- 流式渲染 (Streaming) 完美适配 AI 响应场景
- 内置优化（图片、字体、代码分割）
- 优秀的开发体验和生态系统
- 团队熟悉 React 生态

## 权衡

- 学习曲线：App Router 是新特性，需要学习
- 复杂度：比简单的 SPA 框架复杂
- 但收益大于成本

## 影响

- 前端开发基于 Next.js 15
- 需要学习服务端组件和流式渲染
- 部署需要支持 Node.js 环境

