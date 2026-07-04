<div align="center">

<img src="https://img.shields.io/badge/WeGo_Product_Builder-v1.0.0-000000?style=for-the-badge&logo=windowsterminal&logoColor=white" alt="WeGo">

<img src="https://img.shields.io/badge/Node.js-22%2B-339933?style=flat-square&logo=nodedotjs&logoColor=white" alt="node">
<img src="https://img.shields.io/badge/Python-3.12%2B-3776AB?style=flat-square&logo=python&logoColor=white" alt="python">
<img src="https://img.shields.io/badge/Puppeteer-24-40B5A4?style=flat-square&logo=puppeteer&logoColor=white" alt="puppeteer">
<img src="https://img.shields.io/badge/DeepSeek_API-Ready-4D6BFE?style=flat-square&logo=openai&logoColor=white" alt="deepseek">
<img src="https://img.shields.io/badge/license-MIT-yellow?style=flat-square" alt="license">

<br>
<br>

<img src="https://img.shields.io/badge/📦_数据-22,541_条动态-blue?style=for-the-badge" alt="data">
<img src="https://img.shields.io/badge/🤖_AI-9_字段并行-green?style=for-the-badge" alt="ai">
<img src="https://img.shields.io/badge/📊_导出-31_列_Excel-orange?style=for-the-badge" alt="export">
<img src="https://img.shields.io/badge/⚡_速度-3秒_导出-red?style=for-the-badge" alt="speed">

<br>
<br>

<h1>商品组装器</h1>
<h3><em>WeGo Product Builder</em></h3>

**抓取 · 组装 · AI 填充 · 导出 — 私域电商商品上架，从一天缩短到几分钟**

</div>

---

## 场景

做私域服装批发的都经历过——**相册里堆了几千条动态，每条一张图配一段文案**。要把它们变成一件件能上架的商品：找图、拼描述、取标题、选分类、标价格、填尺码……

> 一个人，一天，搞不了 10 件。

这个工具把整条链路压成了 **4 步操作**：

```
① 扫码登录 → ② 搜索选中 → ③ AI 一鍵填充 → ④ 导出 Excel
```

---

## 目录

| # | 章节 |
|---|------|
| 🚀 | [快速开始](#快速开始) |
| ⌨️ | [快捷键](#快捷键) |
| 🧠 | [工作流程](#工作流程) |
| ⚙️ | [功能矩阵](#功能矩阵) |
| 🏗 | [技术架构](#技术架构) |
| 🔧 | [二次开发](#二次开发) |
| ❓ | [常见问题](#常见问题) |

---

## 快速开始

```bash
git clone https://github.com/2837123/wego.git && cd wego
npm install && pip install openpyxl
npm start
```

打开 `http://localhost:3000` → 扫码 → 刷新 → 开工。

---

## 快捷键

| `Enter` | `Shift` + `Enter` | 右键 |
|:--:|:--:|:--:|
| 保存商品 | 拆分保存 | 同 Enter |

---

## 工作流程

<table>
<tr>
<td align="center" width="20%"><b>🔐 登录</b><br><sub>微信扫码</sub></td>
<td align="center" width="5%">→</td>
<td align="center" width="20%"><b>📥 抓取</b><br><sub>22K+ 条本地缓存</sub></td>
<td align="center" width="5%">→</td>
<td align="center" width="20%"><b>🔍 筛选</b><br><sub>款号/关键词搜索</sub></td>
<td align="center" width="5%">→</td>
<td align="center" width="20%"><b>🧩 组装</b><br><sub>多选合并·自动去重</sub></td>
</tr>
<tr><td colspan="7"></td></tr>
<tr>
<td colspan="3" align="center"><b>🤖 AI 填充</b><br><sub>名称·副标题·关键词·分类·规格·详情·9字段并行生成</sub></td>
<td align="center">→</td>
<td colspan="3" align="center"><b>📊 导出 Excel</b><br><sub>31 列模板 · S/M/L 自动三行 · 3 秒出文件</sub></td>
</tr>
</table>

---

## 功能矩阵

<table>
<tr>
<td width="50%" valign="top">

> ### 📦 数据处理
>
> | 功能 | 细节 |
> |------|------|
> | 数据量 | 22,541 条动态，74MB 本地缓存 |
> | 更新方式 | 增量拉取，Puppeteer 自动登录 |
> | 浏览模式 | 按日期分组，无限滚动分页 |
> | 搜索 | 实时过滤：款号 · 关键词 · 日期 |
> | 状态标记 | ✓ 已保存 · AI 已处理 · 重启恢复 |

</td>
<td width="50%" valign="top">

> ### 🧩 商品组装
>
> | 功能 | 细节 |
> |------|------|
> | 多选合并 | 跨日期多选，自动图文拼接 |
> | 款号提取 | 正则自动匹配款号格式 |
> | 价格识别 | 多来源价格智能去重汇总 |
> | 图片处理 | 自动去重 + 保持原始顺序 |
> | 拆分模式 | Shift+Enter 一键拆成多件 |

</td>
</tr>
<tr>
<td width="50%" valign="top">

> ### 🤖 AI 引擎
>
> | 功能 | 细节 |
> |------|------|
> | 模型 | DeepSeek v4 (兼容 OpenAI 格式) |
> | 并行生成 | 9 个字段同时请求，5-10 秒完成 |
> | 提示词 | 每字段独立模板，支持自定义 |
> | 容错 | 失败自动重试，流式输出 |
> | 可控性 | 每字段独立开关，可部分 AI / 部分手填 |

</td>
<td width="50%" valign="top">

> ### 📊 导出引擎
>
> | 功能 | 细节 |
> |------|------|
> | 格式 | Excel .xlsx (openpyxl) |
> | 模板 | 31 列 eweishop 标准 |
> | 尺码 | S / M / L 自动三行展开 |
> | 性能 | 单文件 ≤3 秒 |
> | 历史 | 导出记录可回溯，支持重新下载 |

</td>
</tr>
</table>

---

## 技术架构

```
┌──────────────────────────────────────────────────┐
│                   Browser UI                     │
│              Vanilla JS · 深色主题                 │
├──────────────────────────────────────────────────┤
│              Express API Server                  │
│   /api/page   /api/saved   /api/ai   /api/export │
├──────────────────┬───────────────────────────────┤
│    Puppeteer     │       DeepSeek API            │
│  szwego 登录抓取  │   9 字段并行 · 流式生成        │
├──────────────────┴───────────────────────────────┤
│              Python openpyxl                     │
│        31 列模板 · S/M/L 尺码 · 3 秒导出           │
└──────────────────────────────────────────────────┘
```

| Layer | Stack | Purpose |
|-------|-------|---------|
| 🖥 Frontend | Vanilla JS + CSS Grid | 卡片浏览 · 多选组装 · 实时搜索 |
| ⚙️ Backend | Node.js + Express | REST API · 路由 · 状态管理 |
| 🔐 Auth | Puppeteer + Cookie Persist | 扫码登录 · 会话保持 |
| 🤖 AI | DeepSeek API (OpenAI Compatible) | 9 字段智能填充 |
| 📊 Export | Python openpyxl | 31 列模板 · 三行尺码输出 |

---

## 二次开发

硬编码项极少且高度集中，适配新平台只需改 **一处文件** 的 **几个常量**。

```yaml
数据源: data/config.json         # albumId / shopId（默认值在 server.js loadConfig）
AI:     server.js callAi()       # DeepSeek hostname/model → OpenAI / 其他
登录:   server.js /api/login     # 扫码登录（puppeteer + cookie 持久化）
导出:   export_template.py       # 31 列模板 → 你的模板
端口:   PORT 环境变量            # 默认 3000
```

> 📖 完整指南 → **[DEVELOPMENT.md](DEVELOPMENT.md)**

---

## 常见问题

<details>
<summary>数据刷不出来？</summary>

**重新登录 → 扫码 → 刷新数据**。还不行就重启：`Ctrl+C` → `npm start`。
</details>

<details>
<summary>AI 填充失败？</summary>

检查 API Key 有效 + 余额充足。超时可调 `callAi()` 里的 `AbortSignal.timeout(30000)`。
</details>

<details>
<summary>端口冲突？</summary>

`PORT=8080 npm start`
</details>

<details>
<summary>清除登录？</summary>

`rm -rf szwego-profile/` 后重启。
</details>

---

## 更新日志

### v1.0.0 正式版

**架构清理**
- 移除 Electron 时代死代码（`main.js` / `preload.js` / `export_excel.py`）
- 移除开发期产物（`captured_apis.json` / `szwego_export.xlsx`）
- `readJsonSafe` → `readFileSafe`（命名与行为一致）
- 删除 `getPuppeteer` try-require 保护，直接 `require('puppeteer')`
- `_req` → `req`（仅在使用 body/query/on 的路由，避免命名误导）

**AI 流程加固**
- `global._lastAiResult` → 模块级 `lastAiResult` + `jobId` 校验，防并发覆盖
- 前端 SSE 携带 `jobId`，仅处理当前任务的进度消息
- `callAi`：手写 `https.request` → 原生 `fetch`（30 行 → 15 行）
- 常量 `AI_SYSTEM_STRICT` / `AI_CONCURRENCY` / `AI_RETRY_DEADLINE_MS` 提到模块顶层

**性能与可靠性**
- `/api/fetch` 合并：`unshift` O(n²) → `concat + sort` 单次排序
- `appendLog` 改 `fs.appendFileSync`（O(1) 写入）+ NDJSON 格式，启动时自动迁移旧 JSON 数组
- 重新登录修复：清失效 cookie 避免登录页显示"已失效"+ 监听 `browser.disconnected` 即时通知前端
- 刷新数据时间窗：7 天 → 30 天

**配置**
- `albumId` / `shopId` 抽离到 `data/config.json`（默认值兜底）

---

<div align="center">

### ⭐ 觉得有用？给个 Star

**Built with**

Node.js · Express · Puppeteer · DeepSeek API · Python · openpyxl

[MIT License](LICENSE) · [二次开发指南](DEVELOPMENT.md) · [更新日志](https://github.com/2837123/wego/releases)

<br>

<a href="https://img.shields.io/badge/WeChat-QF12--17-07C160?style=for-the-badge&logo=wechat&logoColor=white"><img src="https://img.shields.io/badge/WeChat-QF12--17-07C160?style=for-the-badge&logo=wechat&logoColor=white" alt="wechat"></a>

<sub>技术咨询 · 定制开发 · 商务合作</sub>

<br>
<br>

## ⚠️ 免责声明 Disclaimer

本工具为开源软件，仅供学习研究和技术交流使用。

- 本项目**不提供**任何商品数据。所有数据均由用户自行获取和管理。
- 用户应确保其获取和使用商品数据的行为**符合相关平台的服务条款**及适用法律法规。
- 本项目**不隶属于**任何电商平台，亦不代表任何平台的立场或观点。
- 使用本项目导出的内容所引发的任何纠纷或法律责任，**均由使用者自行承担**。
- 本项目以 MIT 协议开源，**不提供任何明示或暗示的担保**。

*This is an open-source tool for educational and research purposes only. Users are solely responsible for ensuring compliance with applicable platform terms of service and laws.*

</div>
