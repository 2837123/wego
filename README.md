# 商品组装器 v1.0.1

> Web 版商品数据管理工具，用于从 szwego.com（微信私域电商平台）抓取商品动态数据，通过人工筛选 + AI 辅助处理，批量生成符合目标系统导入格式的商品 Excel 表格。

## 核心流程

1. **扫码登录** — Puppeteer 打开 szwego.com 扫码页，登录后 Cookie 自动持久化到本地 Profile
2. **数据抓取** — 从商品相册拉取动态（图片 + 文案 + 款号 + 价格），增量更新，本地缓存
3. **人工筛选** — 22,000+ 卡片按日期浏览，勾选多条动态组装成一件完整商品
4. **AI 填充** — 调用 DeepSeek API 自动生成名称、副标题、关键词、分类、规格、详情等 9 个字段
5. **Excel 导出** — 严格按 31 列模板格式输出，每商品自动生成 S/M/L 三行尺码，支持目标系统直接导入

## 功能

| 模块 | 说明 |
|------|------|
| 素材浏览 | 22,541 条商品动态卡片，按日期分组，支持关键词搜索、分页加载、标记已处理 |
| 商品组装 | 多选自动合并图文，自动提取款号和价格，图片去重排序 |
| AI 处理 | DeepSeek API 并行生成 9 个字段，支持自定义提示词模板、独立字段开关、失败自动重试 |
| Excel 导出 | Python openpyxl 按 31 列模板输出，自动生成 S/M/L 尺码行 |
| 数据刷新 | 增量拉取新数据，Puppeteer 自动登录，Cookie 持久化到 `szwego-profile/` |
| 工作恢复 | 自动保存选中/处理状态，重启后恢复标记，操作日志可追溯 |

## 环境要求

- **Node.js** 22+
- **Python** 3.12+（需 `pip install openpyxl`）
- **DeepSeek API Key** — 在 [platform.deepseek.com](https://platform.deepseek.com) 获取
- **Chrome** — Puppeteer 依赖（自动下载 Chromium）

## 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 安装 Python 依赖
pip install openpyxl

# 3. 启动服务
npm start
```

浏览器访问 `http://localhost:3000`：

1. 点击 **「重新登录」** 扫码授权
2. 点击 **「刷新数据」** 拉取最新商品动态
3. 在左侧卡片中勾选素材 → 右侧组装商品 → AI 填充 → 导出 Excel

## 常见问题

| 问题 | 解决 |
|------|------|
| 数据刷不出来 | 点击「重新登录」扫码，然后再点「刷新数据」 |
| 重新登录没反应 | 重启服务：`Ctrl+C` 停掉后重新 `npm start` |
| 端口被占用 | 默认 3000 端口，如需修改请编辑 `server.js` 末尾 `app.listen(3000)` |
| AI 生成失败 | 检查 AI 配置中的 API Key 是否正确，余额是否充足 |

## 项目结构

```
├── server.js              Express 服务端 — 路由、API、AI 调用、登录管理
├── builder.js             前端 UI 交互逻辑
├── index.html             前端界面（深色主题）
├── main.js                前端主入口
├── preload.js             Electron preload（预留）
├── export_template.py     Python 导出 — 31 列模板 Excel
├── export_excel.py        Python 导出辅助脚本
├── shitimoban.xlsx        目标系统导入模板
├── captured_apis.json     抓取的 API 请求记录（调试用）
├── package.json
├── .gitignore
├── data/                  运行时数据（本地缓存，不进 git）
├── szwego-profile/        浏览器 Profile（Cookie 持久化，不进 git）
├── exports/               导出文件（不进 git）
├── .cache/                缓存（不进 git）
└── node_modules/          依赖（不进 git）
```

## 更新日志

### v1.0.1 (2026-05-30)
- 修复登录会话过期后重新授权流程
- 优化 .gitignore，排除缓存、导出文件、系统文件
- 完善 README 文档

### v1.0.0 (2026-05-21)
- 首次 Web 版发布
- 完整素材浏览 / 商品组装 / AI 填充 / Excel 导出流程

## 技术栈

Node.js · Express · Puppeteer · Python · DeepSeek API · openpyxl
