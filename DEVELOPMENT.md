# 二次开发说明

本文档帮助你将此工具适配到自己的数据源和导出目标。

## 目录

- [快速概览](#快速概览)
- [1. 更换数据源](#1-更换数据源)
- [2. 更换导出模板](#2-更换导出模板)
- [3. 更换登录方式](#3-更换登录方式)
- [4. 关键配置文件](#4-关键配置文件)

---

## 快速概览

当前实现写死了以下内容，二次开发时需替换：

| 硬编码项 | 位置 | 说明 |
|---------|------|------|
| `albumId` | `server.js:363` | 微购相册 ID，每个店铺唯一 |
| `shopId` | `server.js:364` | 微购店铺 ID |
| API 域名 | `server.js:374,384,458` | `www.szwego.com` |
| 导出模板 | `export_template.py` | 31 列 eweishop 格式 |

---

## 1. 更换数据源

### 1.1 如果你也用微购（szwego）

只需修改 `server.js` 中的两个 ID：

```js
// server.js 第 363-364 行
const albumId = '_你的相册ID';   // 在 szwego 后台「相册管理」URL 中获取
const shopId  = '_你的店铺ID';   // 在 szwego 后台「店铺设置」中获取
```

> **如何获取？** 打开 szwego 相册页面，URL 中的 `albumId` 和 `shop_id` 参数即为所需值。

### 1.2 如果你用其他平台

需要修改以下三处：

**① 登录逻辑** — `server.js` 中的 `/api/login` 路由：
```js
// 第 458 行，替换为目标平台的登录地址
await page.goto('https://你的平台.com/login', { ... });

// 第 468 行，替换为目标平台的 Cookie 名称和域名
const tokenCookie = cookies.find(c => c.name === '你的token名' && c.domain === '你的域名');
```

**② 数据拉取** — `server.js` 中的 `/api/page` 路由（Puppeteer 部分）：
```js
// 第 384 行，替换为你的 API 地址和数据格式
let url = `https://你的API地址?参数1=值1&参数2=值2`;
```

**③ 数据解析** — `server.js` 第 376-402 行，适配返回的 JSON 数据结构：
```js
const result = await page.evaluate(async ({ ... }) => {
  const response = await fetch(url, { ... });
  const d = await response.json();
  // ↓ 修改这里的字段映射
  return d.result.items.map(item => ({
    id: item.你的ID字段,
    img: item.你的图片字段,
    price: item.你的价格字段,
    title: item.你的标题字段,
    date: item.你的日期字段,
  }));
}, { ... });
```

### 1.3 如果用 API 直连（非 Puppeteer）

可以完全移除 Puppeteer 登录流程，改为在 `server.js` 中直接发 HTTP 请求：

```js
// 替换 /api/page 和 /api/login 路由
const axios = require('axios');

app.get('/api/page', async (req, res) => {
  const response = await axios.get('https://你的API/items', {
    headers: { 'Authorization': 'Bearer 你的Token' }
  });
  // 解析并返回数据...
});
```

---

## 2. 更换导出模板

### 2.1 修改 `export_template.py`

`export_template.py` 目前生成 31 列 eweishop 格式。查看其中的 `generate_excel()` 函数：

```python
# 修改列定义
headers = ['你的列1', '你的列2', ...]

# 修改每行数据组装
for product in products:
    row = [product['字段1'], product['字段2'], ...]
```

### 2.2 如果需要每种尺码生成一行

当前逻辑为每个商品生成 S/M/L 三行。如需修改：

```python
sizes = ['S', 'M', 'L']   # 改为你需要的尺码列表
```

### 2.3 模板文件

`shitimoban.xlsx` 是目标系统的导入模板。用 Excel 打开查看列结构，然后修改 `export_template.py` 中的列映射。

---

## 3. 更换登录方式

当前使用 Puppeteer 打开 szwego 扫码页，轮询检测 Cookie。如需其他方式：

| 场景 | 方案 |
|------|------|
| 账号密码登录 | 在 `page.goto` 后定位输入框，填入用户名密码并点击登录 |
| API Token | 放弃 Puppeteer，直接在前端配置页填入 Token，请求时带 `Authorization` 头 |
| OAuth 2.0 | 类似的 Cookie 轮询机制，将授权页 URL 和 Cookie 名替换即可 |

---

## 4. 关键配置文件

| 文件 | 作用 | 修改频率 |
|------|------|---------|
| `server.js` | 后端核心：登录、数据抓取、API 路由、AI 调用 | 二次开发时集中修改 |
| `builder.js` | 前端交互：卡片渲染、商品组装、AI 配置、导出触发 | 修改 UI 行为时 |
| `index.html` | 前端界面布局和样式 | 修改 UI 外观时 |
| `export_template.py` | Excel 导出逻辑 | 更换导出目标格式时 |
| `shitimoban.xlsx` | 目标系统导入模板 | 更换目标系统时替换 |
| `data/all_items.json` | 本地数据缓存（运行时自动生成） | 无需手动修改 |
| `szwego-profile/` | 浏览器 Cookie 持久化目录 | 清除登录状态时删除 |

---

## 典型二次开发流程

1. **Fork 本仓库** → 克隆到本地
2. **修改数据源** → 按第 1 节替换 `albumId`、`shopId`、API 地址
3. **修改导出模板** → 按第 2 节调整 `export_template.py`
4. **测试登录** → 启动后点「重新登录」验证
5. **测试导出** → 组装一条商品 → 导出 Excel → 用目标系统导入验证
6. **提交修改** → 推送到你自己的仓库

有问题提 Issue。
