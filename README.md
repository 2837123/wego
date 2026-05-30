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

浏览器访问 `http://localhost:3000`。

### 基本操作流程

1. 点击 **「重新登录」** → 弹出扫码窗口 → 微信扫码授权
2. 点击 **「刷新数据」** → 拉取最新商品动态（首次全量，后续增量）
3. 顶部搜索框输入款号/关键词 → **Enter** 搜索，**点击 ×** 清除
4. 左侧卡片 **点击选中**（蓝色边框），再次点击取消，可多选
5. 右侧自动组装：款号自动提取、图片合并去重、价格汇总
6. 点击 **「AI 填充」** → 自动生成名称/关键词/分类/详情等字段
7. 点击 **「导出 Excel」** → 生成 31 列模板文件并自动下载

### 快捷键与操作技巧

| 操作 | 方式 |
|------|------|
| **保存商品** | `Enter` 键 / 右键点击素材面板 / 点击「💾 保存」按钮 |
| **拆分保存** | `Shift + Enter` / `Shift + 右键点击`（将多选素材拆成多件独立商品分别保存） |
| **搜索** | 输入框键入关键词 → `Enter` |
| **清除搜索** | 点击搜索框右侧 × 按钮 |
| **选中/取消** | 点击卡片（蓝框=已选），支持跨日期多选 |
| **快速定位** | 左侧日期分组可折叠，点击日期标题展开/收起 |
| **AI 填充** | 选中商品 → 点击 AI 填充 → 等待几秒 → 自动填好 9 个字段 |
| **编辑字段** | AI 填充后可直接在输入框中修改，覆盖 AI 结果 |
| **标记追踪** | 已保存的素材卡片右上角显示 ✓，已 AI 处理过的显示 AI 标签 |
| **工作恢复** | 关闭页面/重启服务后，之前选中的素材和保存的商品自动恢复 |

### AI 配置说明

在顶部 Tab 切换到「AI 配置」：

- **API Key**：填入 DeepSeek API Key（[获取地址](https://platform.deepseek.com)）
- **自定义提示词**：每个字段（名称/副标题/关键词/分类/规格/详情等）都有独立提示词模板，可按需调整
- **字段开关**：可单独关闭某个字段的 AI 生成，保留手动填写
- **模型选择**：默认 `deepseek-v4-flash`，可切换为其他兼容 OpenAI 格式的模型

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

## 二次开发

当前实现写死了 szwego 微购相册的数据源和 eweishop 的导出模板。如需适配自己的平台，请阅读 **[二次开发说明 →](DEVELOPMENT.md)**

核心可替换点：
- **数据源**：修改 `server.js` 中的 `albumId` / `shopId` 或替换 API 地址
- **导出格式**：修改 `export_template.py` 中的列定义和模板映射
- **登录方式**：替换 Puppeteer 登录流程为账号密码 / API Token / OAuth

## 技术栈

Node.js · Express · Puppeteer · Python · DeepSeek API · openpyxl
