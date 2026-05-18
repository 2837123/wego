# 商品组装器

基于 Electron 的桌面应用，用于从 szwego.com（微信私域电商平台）抓取商品动态数据，通过人工筛选 + AI 辅助处理，批量生成符合目标系统导入格式的商品 Excel 表格。

## 核心流程

1. 从 szwego.com 抓取商品相册动态（图片 + 文案）
2. 人工浏览选择多条动态，组装成一件完整商品
3. 调用 DeepSeek AI 自动填充商品名称、关键词、分类、详情等字段
4. 按目标模板格式导出 Excel，支持导入到其他电商系统

## 功能

- **素材浏览** — 22,000+ 条商品动态卡片，瀑布流布局，按日期分组，支持搜索过滤和分页加载
- **商品组装** — 多选自动合并，款号/价格提取，图文拼接，图片去重
- **AI 处理** — 接入 DeepSeek API，9 个字段并行生成（名称、副标题、关键词、分类、规格、详情等），支持自定义提示词模板和独立开关，失败自动重试
- **Excel 导出** — 严格按 31 列模板格式，每商品生成 S/M/L 三行尺码
- **数据刷新** — 增量拉取近 7 天数据，Cookie 持久化，频率控制
- **工作日志** — 自动保存工作状态，重启后恢复标记，操作日志记录

## 环境要求

- Node.js 22+
- Python 3.12+（需安装 openpyxl：`pip install openpyxl`）
- DeepSeek API Key（在 [platform.deepseek.com](https://platform.deepseek.com) 获取）

## 快速开始

```bash
npm install
npm start
```

首次使用需在 AI 配置 Tab 填入 DeepSeek API Key。

## 项目结构

```
├── main.js              主进程 — 数据管理、IPC 处理、AI 调用
├── preload.js           预加载脚本 — contextBridge API 暴露
├── builder.js           渲染进程 — UI 交互逻辑
├── index.html           界面 — 双栏布局 + Tab 面板
├── export_template.py   导出脚本 — 按模板生成 31 列 Excel
├── all_items.json       抓取数据（74MB）
├── saved_products.json  已保存的组装商品
├── work_state.json      工作状态（选中/已处理标记）
├── work_log.json        操作日志
└── exports/             导出文件目录
```

## 技术栈

Electron 33 · Node.js · Python · DeepSeek API · openpyxl
