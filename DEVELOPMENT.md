# 二次开发说明

本文档列出所有硬编码配置项及其修改方法，帮助你将此工具适配到自己的数据源和导出目标。

## 目录

- [硬编码清单（完整）](#硬编码清单完整)
- [1. 更换数据源](#1-更换数据源)
- [2. 更换导出模板](#2-更换导出模板)
- [3. 更换 AI 服务](#3-更换-ai-服务)
- [4. 更换登录方式](#4-更换登录方式)
- [5. 修改端口与路径](#5-修改端口与路径)
- [6. 修改前端 UI](#6-修改前端-ui)
- [关键文件对照表](#关键文件对照表)

---

## 硬编码清单（完整）

下面列出了项目中所有写死的值及其修改位置。

### server.js — 后端

| 行号 | 硬编码内容 | 说明 | 如何修改 |
|------|-----------|------|---------|
| `7` | `PORT = 3000` | 服务端口 | `PORT=8080 npm start` 或直接改代码 |
| `10` | `szwego-profile` | 浏览器 Profile 目录名 | 改为你的项目名 |
| `163-164` | `model: 'deepseek-v4-flash'` | AI 模型名 | 改成你的模型，如 `gpt-4o` |
| `169` | `max_tokens: 4096` | AI 最大输出 token | 按需调整 |
| `170` | `temperature: 0.3` | AI 输出随机性 | 0-2，越大越随机 |
| `174` | `api.deepseek.com` | AI API 域名 | 改成你的 AI 服务地址 |
| `180` | `timeout: 30000` | AI 请求超时(ms) | 网络慢可调大 |
| `282` | `substring(0, 3000)` | 传给 AI 的文案最大长度 | 调大可用更多上下文 |
| `363` | `albumId = '_dwoY7...'` | 微购相册 ID | 你的相册 ID |
| `364` | `shopId = '_JY7Y7...'` | 微购店铺 ID | 你的店铺 ID |
| `374` | `szwego.com/static/index.html` | 数据抓取登录页 | 你的平台地址 |
| `384` | `szwego.com/album/personal/all?...` | 相册数据 API | 你的 API 地址 |
| `458` | `szwego.com/static/index.html` | 重新登录页 | 你的平台地址 |
| `468` | `c.name === 'token'` | 登录 Cookie 名 | 你的平台 Cookie 名 |
| `468` | `c.domain === 'www.szwego.com'` | Cookie 域名 | 你的平台域名 |
| `490` | `app.listen(PORT)` | 监听端口 | 见上方 PORT |

### server.js — 数据解析（376-402 行）

`page.evaluate()` 内部的字段映射也需要根据你的 API 返回结构调整：

```js
// 当前写死的字段映射
return d.result.items.map(item => ({
  id: item.goods_id,        // ← 你的商品 ID 字段
  img: item.pic_url,        // ← 你的图片 URL 字段
  price: item.price,        // ← 你的价格字段
  title: item.title,        // ← 你的标题字段
  date: item.create_time,   // ← 你的日期字段
}));
```

### export_template.py — 导出

| 行号/区域 | 硬编码内容 | 说明 |
|-----------|-----------|------|
| 全局 | 31 列 eweishop 表头 | 换成你的目标系统列名和列数 |
| `generate_excel()` | S/M/L 三行尺码 | 换成你的尺码列表 |
| `generate_excel()` | 列映射逻辑 | 按你的字段对应关系重写 |

### builder.js — 前端

| 区域 | 硬编码内容 | 说明 |
|------|-----------|------|
| AI 配置 Tab | DeepSeek 默认提示词 | 9 个字段的 system prompt 可自定义 |
| 导出按钮 | 调用 `/api/export` 后下载 `products_*.xlsx` | 文件名格式可改 |
| `PAGE_SIZE` | 每次加载 500 条 | 在 `api('GET', '/api/page?...')` 调用的 `limit` 参数中 |

---

## 1. 更换数据源

### 1.1 如果你也用微购（szwego）

只需修改 `server.js` 中第 363-364 行的两个 ID：

```js
const albumId = '_你的相册ID';  // szwego 后台「相册管理」URL 中获取
const shopId  = '_你的店铺ID';   // szwego 后台「店铺设置」中获取
```

### 1.2 如果你用其他平台

三处需要改：

**① 登录** — `/api/login` 路由（第 458 行）：
```js
await page.goto('https://你的平台.com/login', { ... });
```

**② Cookie 检测**（第 468 行）：
```js
const tokenCookie = cookies.find(c => c.name === '你的cookie名' && c.domain === '你的域名');
```

**③ 数据拉取** — `/api/page` 中 `page.evaluate()` 内的 fetch URL（第 384 行）和字段映射（第 376-402 行）。

### 1.3 如果用 API 直连（不用 Puppeteer）

可以完全移除 Puppeteer，在 `server.js` 中直接用 `fetch`/`axios` 调 API：

```js
const axios = require('axios');
app.get('/api/page', async (req, res) => {
  const resp = await axios.get('https://你的API/items', {
    headers: { Authorization: 'Bearer ' + process.env.API_TOKEN }
  });
  // 解析并返回...
});
```

---

## 2. 更换导出模板

修改 `export_template.py` 中的 `generate_excel()` 函数：

- **列定义**：替换 `headers` 列表为你目标系统的列名
- **尺码行**：修改 `sizes = ['S', 'M', 'L']` 为你需要的尺码
- **字段映射**：重写数据行组装逻辑，将 product JSON 字段映射到 Excel 列

`shitimoban.xlsx` 是目标系统的导入模板文件，用 Excel 打开查看列结构作为参考。

---

## 3. 更换 AI 服务

当前使用 DeepSeek API（OpenAI 兼容格式），更换只需改 `server.js` 第 156-180 行：

```js
// DeepSeek → OpenAI
hostname: 'api.openai.com',
headers: { 'Authorization': 'Bearer ' + apiKey },
// body 中
model: 'gpt-4o',

// 或换成其他兼容 OpenAI 格式的服务
hostname: '你的API地址',
path: '/v1/chat/completions',
```

---

## 4. 更换登录方式

| 场景 | 方案 |
|------|------|
| 账号密码 | 在 `page.goto` 后用 Puppeteer 定位输入框，填入用户名密码并点击登录 |
| API Token | 放弃 Puppeteer，前端加一个 Token 输入框，请求时带 `Authorization` 头 |
| OAuth 2.0 | 类似的 Cookie 轮询机制，替换授权页 URL 和 Cookie 名 |
| 无需登录 | 删除 `/api/login` 路由，移除登录相关 UI |

---

## 5. 修改端口与路径

```bash
# 改端口（推荐用环境变量）
PORT=8080 npm start

# 或直接改 server.js 第 7 行
const PORT = process.env.PORT || 8080;
```

路径常量在 `server.js` 第 9-10 行：
```js
const EXPORT_DIR = path.join(__dirname, 'exports');
const PROFILE_DIR = path.join(__dirname, 'szwego-profile');
```

---

## 6. 修改前端 UI

| 文件 | 改什么 |
|------|--------|
| `index.html` | 页面标题、logo、配色（`:root` CSS 变量）、Tab 名称 |
| `builder.js` | 卡片渲染样式、搜索逻辑、分页大小、AI 字段数量和名称 |

---

## 关键文件对照表

| 文件 | 作用 | 改什么 |
|------|------|--------|
| `server.js` | 后端核心 | 数据源、API、AI、登录、端口 |
| `builder.js` | 前端逻辑 | 卡片渲染、商品组装、搜索、AI 配置 |
| `index.html` | 前端 UI | 界面布局、配色、Tab |
| `export_template.py` | 导出脚本 | Excel 列定义、尺码、字段映射 |
| `shitimoban.xlsx` | 导入模板 | 替换为目标系统模板 |
| `DEVELOPMENT.md` | 本文件 | 二次开发参考 |

---

## 典型二次开发流程

1. Fork → 克隆
2. 改 `server.js`：albumId、shopId、API 地址
3. 改 `export_template.py`：列定义和字段映射
4. 替换 `shitimoban.xlsx` 为目标系统模板
5. 启动 → 登录 → 测试数据抓取 → 组装 → 导出 → 目标系统导入验证
6. 提交推送
