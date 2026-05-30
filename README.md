<p align="center">
  <img src="https://img.shields.io/badge/version-1.0.1-blue?style=flat-square" alt="version">
  <img src="https://img.shields.io/badge/node-22%2B-green?style=flat-square&logo=node.js" alt="node">
  <img src="https://img.shields.io/badge/license-MIT-yellow?style=flat-square" alt="license">
  <img src="https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square" alt="prs">
</p>

<h1 align="center">商品组装器</h1>
<p align="center"><strong>WeGo Product Builder</strong></p>
<p align="center">一键抓取 · 智能组装 · AI 填充 · 批量导出</p>
<p align="center">将微信私域电商的商品动态，自动转化为可导入任意平台的标准化 Excel</p>

---

## 它解决什么问题？

做私域电商的都知道——商品上架是最痛苦的事。相册里几千条动态，每条都是一张图配一段文案，要手动拼成一件完整商品，再填名称、写详情、选分类、标价格……一个人一天搞不了几件。

**这个工具把整个过程自动化了。**

22,000+ 条商品动态 → 几秒钟检索到你要的 → 点击选中 → AI 自动填充 9 个字段 → 一键导出 31 列标准 Excel，直接导入目标系统。

原来一个人一天的活，现在几分钟干完。

---

## 工作流程

```
扫码登录 → 拉取数据 → 浏览筛选 → 多选组装 → AI 填充 → 导出 Excel
```

| 步骤 | 工具在做什么 | 你只需要 |
|------|-------------|---------|
| 登录 | Puppeteer 自动打开 szwego 扫码页，Cookie 持久化 | 微信扫一下 |
| 抓取 | 增量拉取商品相册，图片/文案/款号/价格全部本地缓存 | 点「刷新」 |
| 筛选 | 22,541 条卡片按日期分组，支持款号/关键词实时搜索 | 输入关键词 → Enter |
| 组装 | 多选卡片自动合并图文、提取款号、汇总价格、图片去重 | 点击选中卡片 |
| AI 填充 | DeepSeek 并行生成名称/关键词/分类/规格/详情等 9 个字段 | 点「AI 填充」 |
| 导出 | Python openpyxl 按 31 列模板输出，自动生成 S/M/L 尺码行 | 点「导出」 |

---

## 功能矩阵

<table>
<tr><td width="50%">

### 数据层
- **22,541 条动态** 本地缓存，增量更新
- 按日期分组浏览，分页加载无延迟
- 实时搜索：款号、标题、价格区间
- 已处理/已保存标记持久化

### 组装层
- 多选卡片自动合并图文
- 款号智能提取 + 价格汇总
- 图片去重排序

</td><td width="50%">

### AI 层
- DeepSeek API 一键填充 9 个字段
- 每个字段独立提示词模板 + 开关
- 失败自动重试，支持流式输出
- 兼容 OpenAI 格式（可切换模型）

### 导出层
- Python openpyxl 专业级 Excel
- 31 列 eweishop 模板
- 每商品自动生成 S/M/L 三行
- 单文件 ≤3 秒

</td></tr>
</table>

---

## 快速开始

```bash
# 1. 安装
npm install
pip install openpyxl

# 2. 启动
npm start

# 3. 使用
# 浏览器打开 http://localhost:3000
# 扫码登录 → 刷新数据 → 开始组装
```

### 快捷键

| 操作 | 按键 |
|------|------|
| 保存商品 | `Enter` |
| 拆分保存 | `Shift + Enter` |
| 右键保存 | 右键点击素材面板 |
| 搜索 | 输入关键词 → `Enter` |

---

## 技术架构

```
┌─────────────────────────────────────────────┐
│                 Browser UI                   │
│         index.html  +  builder.js            │
├─────────────────────────────────────────────┤
│              Express Server                  │
│   API Router · Auth · Data · AI · Export    │
├─────────────────────────────────────────────┤
│   Puppeteer      │   DeepSeek API            │
│   (登录 + 抓取)   │   (AI 字段生成)           │
├─────────────────────────────────────────────┤
│   Python openpyxl                            │
│   (Excel 模板导出)                            │
└─────────────────────────────────────────────┘
```

**技术栈：** Node.js · Express · Puppeteer · Python · DeepSeek API · openpyxl

---

## 环境要求

| 依赖 | 版本 | 用途 |
|------|------|------|
| Node.js | ≥ 22 | 服务端运行 |
| Python | ≥ 3.12 | Excel 导出 |
| openpyxl | latest | Excel 模板生成 |
| Chrome | — | Puppeteer 自动登录（自动下载 Chromium） |
| DeepSeek API Key | — | AI 字段填充（[获取](https://platform.deepseek.com)） |

---

## 二次开发

当前适配 **szwego 微购** 数据源和 **eweishop** 导出格式。如需切换到其他平台，硬编码项极少且集中在 `server.js` 中。

> 完整适配指南 → **[DEVELOPMENT.md](DEVELOPMENT.md)**

```
可替换项：
├── 数据源      server.js:363-364  (albumId / shopId)
├── API 地址    server.js:374,384  (szwego.com → 你的API)
├── 登录方式    server.js:458-468  (扫码 → 账号密码 / Token / OAuth)
├── AI 服务     server.js:174      (DeepSeek → OpenAI / 其他)
├── 导出模板    export_template.py (31列 → 你的格式)
└── 端口        server.js:7        (3000 → 你的端口)
```

---

## 项目结构

```
wego/
├── server.js              # 核心服务端（API、AI、登录、数据）
├── builder.js             # 前端交互逻辑
├── index.html             # 前端界面（深色主题）
├── export_template.py     # Excel 导出（31 列模板）
├── shitimoban.xlsx        # 目标系统导入模板
├── captured_apis.json     # API 请求记录（调试用）
├── data/                  # 本地缓存（不进 git）
├── szwego-profile/        # 浏览器 Profile（不进 git）
├── exports/               # 导出文件（不进 git）
└── DEVELOPMENT.md         # 二次开发指南
```

---

## 常见问题

<details>
<summary><strong>数据刷不出来？</strong></summary>
点击「重新登录」→ 扫码 → 再点「刷新数据」。如果还是没反应，重启服务再试。
</details>

<details>
<summary><strong>AI 填充失败？</strong></summary>
检查 AI 配置中的 API Key 是否正确、余额是否充足。网络超时可调大 `server.js:180` 的 timeout。
</details>

<details>
<summary><strong>端口被占用？</strong></summary>

```bash
PORT=8080 npm start
```
</details>

<details>
<summary><strong>如何清除登录状态重新扫码？</strong></summary>
删除 `szwego-profile/` 目录后重启。
</details>

---

## License

MIT © 2026 qingf

<p align="center">
  <sub>Built with Node.js · Express · Puppeteer · DeepSeek API · Python</sub>
</p>
