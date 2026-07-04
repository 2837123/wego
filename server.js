const express = require('express');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const puppeteer = require('puppeteer');

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const EXPORT_DIR = path.join(__dirname, 'exports');
const PROFILE_DIR = path.join(__dirname, 'szwego-profile');

// Ensure data directories exist
[DATA_DIR, EXPORT_DIR, PROFILE_DIR].forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

const DATA_FILE_READ = fs.existsSync(path.join(DATA_DIR, 'all_items.json'))
  ? path.join(DATA_DIR, 'all_items.json')
  : path.join(__dirname, 'all_items.json');
const DATA_FILE_WRITE = path.join(DATA_DIR, 'all_items.json');
const SAVED_FILE = path.join(DATA_DIR, 'saved_products.json');
const STATE_FILE = path.join(DATA_DIR, 'work_state.json');
const LOG_FILE = path.join(DATA_DIR, 'work_log.json');
const AI_CONFIG_FILE = path.join(DATA_DIR, 'ai_config.json');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

// AI 处理常量
const AI_SYSTEM_STRICT = '你是专业的电商商品数据助手。只输出结果，不解释。输出内容绝对不能为空。';
const AI_CONCURRENCY = 20;
const AI_RETRY_DEADLINE_MS = 120000;

// szwego 配置：albumId/shopId 因账号而异，可由 data/config.json 覆盖
function loadConfig() {
  const cfg = {
    albumId: '_dwoY7I0-PgBaikbKPfnkdJxRsJi5naAnTpu9TZA',
    shopId: '_JY7Y7QN0GBV3Ft6ZJV2GOiQm5ezvLM3vX',
  };
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      Object.assign(cfg, JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8')));
    }
  } catch (e) {
    console.warn('config.json parse failed:', e.message);
  }
  return cfg;
}
const SZWEGO_CONFIG = loadConfig();

// ── Load data into memory ──────────────────────────────────────────
let allItems = [];
let itemProductType = {};

function loadData() {
  console.log('Loading data...');
  const t0 = Date.now();
  if (!fs.existsSync(DATA_FILE_READ)) {
    console.log('Warning: all_items.json not found, starting with empty data');
    allItems = [];
    return;
  }
  const raw = fs.readFileSync(DATA_FILE_READ, 'utf-8');
  allItems = JSON.parse(raw);
  allItems.sort((a, b) => (b.time_stamp || 0) - (a.time_stamp || 0));

  // Precompute product type (单品/套装) for each item
  itemProductType = {};
  let mainIndices = [];
  for (let i = 0; i < allItems.length; i++) {
    const t = allItems[i].title || '';
    if (/#\d{5}/.test(t) && /新款|大货|现货/.test(t) && /🛒/.test(t)) {
      mainIndices.push(i);
    }
  }
  for (let mi = 0; mi < mainIndices.length; mi++) {
    const mainIdx = mainIndices[mi];
    const t = allItems[mainIdx].title || '';
    const styleCount = (t.match(/#\d{5}/g) || []).length;
    const type = styleCount >= 2 ? 'set' : 'single';
    const prevIdx = mi > 0 ? mainIndices[mi - 1] : -1;
    for (let k = prevIdx + 1; k <= mainIdx; k++) {
      itemProductType[allItems[k].goods_id] = type;
    }
  }
  console.log(`Loaded ${allItems.length} items in ${Date.now() - t0}ms`);
}

// ── Helpers ─────────────────────────────────────────────────────────
function appendLog(action, detail) {
  try {
    const entry = JSON.stringify({ time: new Date().toISOString(), action, detail: detail || '' }) + '\n';
    fs.appendFileSync(LOG_FILE, entry, 'utf-8');
  } catch (e) {}
}

function readLogArray() {
  try {
    if (!fs.existsSync(LOG_FILE)) return [];
    const raw = fs.readFileSync(LOG_FILE, 'utf-8').trim();
    if (!raw) return [];
    // 兼容旧 JSON 数组格式
    if (raw.startsWith('[')) {
      try { return JSON.parse(raw); } catch { return []; }
    }
    return raw.split('\n').slice(-500).map(l => {
      try { return JSON.parse(l); } catch { return null; }
    }).filter(Boolean);
  } catch (e) { return []; }
}

// 启动时迁移旧 JSON 数组格式 → NDJSON，并截断保留最后 500 条
function migrateLogIfNeeded() {
  try {
    if (!fs.existsSync(LOG_FILE)) return;
    const raw = fs.readFileSync(LOG_FILE, 'utf-8').trim();
    if (!raw || !raw.startsWith('[')) return;
    const arr = JSON.parse(raw);
    const ndjson = arr.slice(-500).map(e => JSON.stringify(e)).join('\n') + '\n';
    fs.writeFileSync(LOG_FILE, ndjson, 'utf-8');
    console.log(`Migrated log: ${arr.length} → ${Math.min(arr.length, 500)} entries (NDJSON)`);
  } catch (e) {
    console.warn('Log migration failed:', e.message);
  }
}

function readFileSafe(filePath, fallback) {
  try {
    if (fs.existsSync(filePath)) {
      let raw = fs.readFileSync(filePath, 'utf-8');
      if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1); // strip BOM
      return raw;
    }
  } catch (e) {}
  return fallback;
}

// ── Express Setup ───────────────────────────────────────────────────
const app = express();
app.use(express.json({ limit: '200mb' }));
app.use(express.static(__dirname));
app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// ── REST API Routes ─────────────────────────────────────────────────

// Page: paginated + filtered query
app.post('/api/page', (req, res) => {
  const filter = req.body || {};
  const search = (filter.search || '').toLowerCase();
  const date = filter.date || '';
  const imgMode = filter.img || '0';
  const setMode = filter.set || '0';
  const offset = filter.offset || 0;
  const limit = Math.min(filter.limit || 200, 200);

  let result = allItems;
  if (search) result = result.filter(i => (i.title || '').toLowerCase().includes(search));
  if (date) result = result.filter(i => i.time === date);
  if (imgMode === '1') result = result.filter(i => i.imgsSrc && i.imgsSrc.length);
  if (imgMode === '2') result = result.filter(i => !i.imgsSrc || !i.imgsSrc.length);
  if (setMode === '1') result = result.filter(i => itemProductType[i.goods_id] !== 'set');
  if (setMode === '2') result = result.filter(i => itemProductType[i.goods_id] === 'set');

  const total = result.length;
  const page = result.slice(offset, offset + limit).map(i => ({
    ...i,
    isSet: itemProductType[i.goods_id] === 'set'
  }));
  res.json({ total, items: page });
});

// Dates: unique sorted dates
app.get('/api/dates', (_req, res) => {
  const set = new Set();
  for (const i of allItems) { if (i.time) set.add(i.time); }
  res.json([...set].sort().reverse());
});

// Smart select: find related items for a main post
app.get('/api/smart-select/:goodsId', (req, res) => {
  const refIdx = allItems.findIndex(i => String(i.goods_id) === String(req.params.goodsId));
  if (refIdx < 0) return res.json({ items: [] });

  const ref = allItems[refIdx];
  const refDate = ref.time || '';
  const refTs = ref.time_stamp || 0;

  // Collect items posted after the main post (higher time_stamp = lower index)
  const candidates = [];
  for (let k = refIdx - 1; k >= 0; k--) {
    const item = allItems[k];
    if (item.time !== refDate) break;
    // Stop at another main post
    const t = item.title || '';
    if (/#\d{5}/.test(t) && /新款|大货|现货/.test(t) && /🛒/.test(t)) break;
    candidates.push(item);
  }

  // Classify each candidate
  function tagOrder(item) {
    const t = item.title || '';
    const isMain = /#\d{5}/.test(t) && /新款|大货|现货/.test(t) && /🛒/.test(t);
    const isDetail = /实拍细节图/.test(t);
    const isSize = !isMain && /THE NEXT TREND/i.test(t);
    const isSep = !isMain && (/——/.test(t) || /〰️/.test(t)) && !/🛒/.test(t);
    if (isSep) return 9; // skip separators
    // Model with text = 1, model empty = 2
    if (!isMain && !isDetail && !isSize) return t.trim() ? 1 : 2;
    if (isDetail) return 3;
    if (isSize) return 4;
    return 9;
  }

  // Filter out separators and sort by tag order, oldest first within same type
  const filtered = candidates.filter(c => tagOrder(c) !== 9);
  filtered.sort((a, b) => {
    const diff = tagOrder(a) - tagOrder(b);
    if (diff !== 0) return diff;
    return (a.time_stamp || 0) - (b.time_stamp || 0);
  });

  res.json({ items: filtered });
});

// Saved products
app.get('/api/saved', (_req, res) => res.send(readFileSafe(SAVED_FILE, '[]')));
app.post('/api/saved', (req, res) => {
  try {
    fs.writeFileSync(SAVED_FILE, JSON.stringify(req.body), 'utf-8');
    res.json({ ok: true });
  } catch (e) { res.json({ error: e.message }); }
});

// Work state
app.get('/api/state', (_req, res) => res.send(readFileSafe(STATE_FILE, '{}')));
app.post('/api/state', (req, res) => {
  try {
    fs.writeFileSync(STATE_FILE, typeof req.body === 'string' ? req.body : JSON.stringify(req.body), 'utf-8');
    res.json({ ok: true });
  } catch (e) { res.json({ error: e.message }); }
});

// Work log
app.get('/api/log', (_req, res) => res.send(JSON.stringify(readLogArray())));
app.post('/api/log', (req, res) => {
  appendLog(req.body.action, req.body.detail);
  res.json({ ok: true });
});

// Export Excel
app.post('/api/export', async (req, res) => {
  try {
    const products = req.body;
    const ts = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    const outPath = path.join(EXPORT_DIR, `products_${ts}.xlsx`);
    const dataPath = path.join(EXPORT_DIR, '_export_data.json');
    fs.writeFileSync(dataPath, JSON.stringify(products), 'utf-8');

    const pyScript = path.join(__dirname, 'export_template.py');
    const stdout = await new Promise((resolve, reject) => {
      execFile('python3', [pyScript, dataPath, outPath], { timeout: 30000, maxBuffer: 1024 * 1024 },
        (err, stdout) => err ? reject(err) : resolve(stdout));
    });
    console.log('Export:', stdout.trim());
    // Return path relative to server so user can download by opening it
    res.json({ ok: true, path: outPath, filename: `products_${ts}.xlsx` });
  } catch (e) {
    console.error('Export error:', e);
    res.json({ error: e.message });
  }
});

// Download exported file
app.get('/api/download', (req, res) => {
  const fp = req.query.file;
  if (!fp || !fp.startsWith(EXPORT_DIR)) return res.status(403).send('Forbidden');
  if (!fs.existsSync(fp)) return res.status(404).send('Not found');
  res.download(fp);
});

// ── AI / DeepSeek API ───────────────────────────────────────────────
async function callAi(apiKey, model, maxTokens, systemPrompt, userMessage) {
  if (!userMessage || !userMessage.trim()) return { ok: false, error: 'empty prompt' };
  try {
    const resp = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + (apiKey || ''),
        'User-Agent': 'SzwegoScraper/2.0',
      },
      body: JSON.stringify({
        model: model || 'deepseek-v4-flash',
        messages: [
          { role: 'system', content: systemPrompt || '你是电商商品数据助手。' },
          { role: 'user', content: userMessage },
        ],
        max_tokens: maxTokens || 4096,
        temperature: 0.3,
      }),
      signal: AbortSignal.timeout(30000),
    });
    const j = await resp.json();
    if (j.choices && j.choices[0]) {
      return { ok: true, reply: (j.choices[0].message.content || '').trim() };
    }
    return { ok: false, error: (j.error || {}).message || 'API error' };
  } catch (e) {
    return { ok: false, error: e.name === 'TimeoutError' ? 'timeout' : e.message };
  }
}

// AI config
app.get('/api/ai/config', (_req, res) => res.send(readFileSafe(AI_CONFIG_FILE, '{}')));
app.post('/api/ai/config', (req, res) => {
  try {
    fs.writeFileSync(AI_CONFIG_FILE, JSON.stringify(req.body, null, 2), 'utf-8');
    res.json({ ok: true });
  } catch (e) { res.json({ error: e.message }); }
});

// AI test connection
app.post('/api/ai/test', async (req, res) => {
  const result = await callAi(req.body.apiKey, req.body.model, 50,
    '', '你好，请回复"连接成功"两个字');
  res.json(result);
});

// AI chat
app.post('/api/ai/chat', async (req, res) => {
  const { config, messages } = req.body;
  const result = await callAi(config.apiKey, config.model, config.maxTokens || 2000,
    '', messages);
  res.json(result);
});

// SSE clients for AI progress
let aiProgressClients = [];
let lastAiResult = null;  // { results, failed, jobId }

app.get('/api/ai/progress', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });
  aiProgressClients.push(res);
  req.on('close', () => { aiProgressClients = aiProgressClients.filter(c => c !== res); });
});

function sendAiProgress(data) {
  aiProgressClients.forEach(c => c.write(`data: ${JSON.stringify(data)}\n\n`));
}

// ── AI Process ──────────────────────────────────────────────────────
app.post('/api/ai/process', async (req, res) => {
  const { config, products, prompts, enabled } = req.body;
  const jobId = String(Date.now()) + Math.random().toString(36).slice(2, 8);

  // Start processing and stream progress via SSE
  res.json({ ok: true, message: 'processing started', jobId });

  function fillTpl(tpl, vars) {
    let s = tpl || '';
    Object.keys(vars).forEach(k => { s = s.replace(new RegExp('\\{' + k + '\\}', 'g'), vars[k]); });
    return s;
  }

  const results = new Array(products.length);

  async function callField(promptText) {
    const r = await callAi(config.apiKey, config.model, config.maxTokens, AI_SYSTEM_STRICT, promptText);
    return (r.ok && r.reply && r.reply.trim()) ? r.reply.trim() : null;
  }

  async function retryFieldUntilOK(promptText, deadline) {
    while (Date.now() < deadline) {
      const result = await callField(promptText);
      if (result) return result;
      await new Promise(r => setTimeout(r, 1000));
    }
    return null;
  }

  for (let batch = 0; batch < products.length; batch += AI_CONCURRENCY) {
    const batchProducts = products.slice(batch, batch + AI_CONCURRENCY);
    await Promise.all(batchProducts.map(async (pr) => {
      const i = products.indexOf(pr);
      const copy = (pr.copy || '').substring(0, 3000);
      const vars = { copy, style: pr.style || '', price: pr.price || '', imgs_count: (pr.imgs || []).length };
      const fields = {};

      const allKeys = ['title', 'subtitle', 'short', 'keywords', 'features', 'category'];
      const enabledKeys = allKeys.filter(k => !enabled || enabled[k] !== false);

      // Phase 1: fire all enabled fields in parallel
      const firstResults = await Promise.all(enabledKeys.map(async (key) => {
        const tpl = prompts[key];
        if (!tpl) return { key, result: '' };
        const result = await callField(fillTpl(tpl, vars));
        return { key, result: result || '' };
      }));
      firstResults.forEach(({ key, result }) => { fields[key] = result; });

      // Phase 2: retry failed fields for up to 2 min
      const failedKeys = firstResults.filter(f => !f.result).map(f => f.key);
      if (failedKeys.length > 0) {
        const deadline = Date.now() + AI_RETRY_DEADLINE_MS;
        const retryResults = await Promise.all(failedKeys.map(async (key) => {
          const tpl = prompts[key];
          if (!tpl) return { key, result: '' };
          const result = await retryFieldUntilOK(fillTpl(tpl, vars), deadline);
          return { key, result: result || '' };
        }));
        retryResults.forEach(({ key, result }) => { fields[key] = result; });
      }

      results[i] = { index: i, fields, _pid: pr.id };
      sendAiProgress({ index: results.filter(r => r).length, total: products.length, jobId });
    }));
  }

  // Collect failed fields
  const failedFields = [];
  results.forEach((res, idx) => {
    const allKeys = ['title', 'subtitle', 'short', 'keywords', 'features', 'category'];
    allKeys.forEach(key => {
      if ((!enabled || enabled[key] !== false) && (!res.fields[key] || !res.fields[key].trim())) {
        failedFields.push({ productIndex: idx, field: key });
      }
    });
  });

  if (failedFields.length > 0) {
    console.log(`WARNING: ${failedFields.length} empty fields: ${JSON.stringify(failedFields.slice(0, 10))}`);
  }

  lastAiResult = { results, failed: failedFields.length ? failedFields : null, jobId };

  sendAiProgress({ index: results.length, total: products.length, done: true, failed: failedFields.length ? failedFields : null, jobId });
});

// Endpoint for frontend to poll AI result after processing completes
app.get('/api/ai/result', (req, res) => {
  const jobId = req.query.jobId;
  if (!lastAiResult || (jobId && lastAiResult.jobId !== jobId)) {
    res.json({ ok: false, error: 'no result or jobId mismatch' });
    return;
  }
  res.json({ ok: true, results: lastAiResult.results, failed: lastAiResult.failed });
});

// ── Puppeteer: Fetch fresh data ─────────────────────────────────────
app.post('/api/fetch', async (_req, res) => {
  const today = new Date();
  const monthAgo = new Date(today.getTime() - 30 * 86400000);
  const fmt = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const sd = fmt(monthAgo), ed = fmt(today);
  const { albumId, shopId } = SZWEGO_CONFIG;

  console.log('Fetching szwego data via Puppeteer...');
  try {
    const browser = await puppeteer.launch({
      headless: true,
      userDataDir: PROFILE_DIR,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();
    await page.goto('https://www.szwego.com/static/index.html', { waitUntil: 'networkidle2', timeout: 30000 });

    const result = await page.evaluate(async ({ albumId, sd, ed, shopId }) => {
      const all = [];
      let ts = '';
      const MAX_PAGES = 20;
      const DELAY = 600;
      let pg = 0;
      while (pg < MAX_PAGES) {
        pg++;
        let url = `https://www.szwego.com/album/personal/all?albumId=${albumId}&searchValue=&searchImg=&startDate=${sd}&endDate=${ed}&noCache=0&requestDataType=&link_type=pc_home&shop_id=${shopId}`;
        if (ts) url += '&slipType=1&timestamp=' + ts;
        try {
          const r = await fetch(url);
          const d = await r.json();
          if (!d.result || !d.result.items) return { error: JSON.stringify(d).slice(0, 200) };
          all.push(...d.result.items);
          if (!d.result.pagination.isLoadMore || !d.result.items.length) break;
          const nts = String(d.result.pagination.pageTimestamp || '');
          if (nts === ts || !nts) break;
          ts = nts;
          if (all.length > 5000) break;
          await new Promise(r => setTimeout(r, DELAY));
        } catch (e) {
          return { error: e.message };
        }
      }
      return { items: all };
    }, { albumId, sd, ed, shopId });

    await browser.close();

    if (result.error) {
      const hint = result.error.includes('1111') || result.error.includes('errcode')
        ? '可能需要先登录 szwego。请点击"重新登录"扫码后再刷新。' : '';
      res.json({ error: result.error + (hint ? ' ' + hint : '') });
      return;
    }

    const fmtTs = ts => {
      const d = new Date(ts);
      return d.getFullYear() + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + String(d.getDate()).padStart(2, '0');
    };
    const exist = new Set(allItems.map(i => i.goods_id));
    const newItems = [];
    for (const item of result.items) {
      // Use time_stamp as the canonical time field
      if (item.time_stamp) item.time = fmtTs(item.time_stamp);
      if (!exist.has(item.goods_id)) { newItems.push(item); exist.add(item.goods_id); }
    }
    if (newItems.length) {
      // 合并后整体排序一次，避免 unshift 的 O(n²)
      allItems = newItems.concat(allItems);
      allItems.sort((a, b) => (b.time_stamp || 0) - (a.time_stamp || 0));
    }
    fs.writeFileSync(DATA_FILE_WRITE, JSON.stringify(allItems), 'utf-8');
    console.log(`Fetched: ${newItems.length} new items`);
    res.json({ ok: true, count: newItems.length });
  } catch (e) {
    console.error('Fetch error:', e);
    res.json({ error: e.message });
  }
});

// ── Puppeteer: Login ───────────────────────────────────────────────
let loginSseClients = [];
app.get('/api/login/status', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });
  loginSseClients.push(res);
  req.on('close', () => { loginSseClients = loginSseClients.filter(c => c !== res); });
});

function notifyLoginClients(payload) {
  loginSseClients.forEach(c => c.write(`data: ${JSON.stringify(payload)}\n\n`));
}

app.post('/api/login', async (_req, res) => {
  let browser = null;
  let checkInterval = null;
  let settled = false;

  const finish = async (payload) => {
    if (settled) return;
    settled = true;
    if (checkInterval) { clearInterval(checkInterval); checkInterval = null; }
    notifyLoginClients(payload);
    if (browser) {
      try { await browser.close(); } catch (_) {}
      browser = null;
    }
  };

  try {
    browser = await puppeteer.launch({
      headless: false,
      userDataDir: PROFILE_DIR,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();
    await page.goto('https://www.szwego.com/static/index.html', { waitUntil: 'networkidle2', timeout: 30000 });

    // 清掉失效的 szwego cookie，避免登录页带旧 cookie 直接显示"已失效"
    try {
      const stale = await page.cookies('https://www.szwego.com');
      for (const c of stale) {
        await page.deleteCookie({ name: c.name, domain: c.domain });
      }
      if (stale.length) {
        await page.reload({ waitUntil: 'networkidle2', timeout: 30000 });
        console.log(`Cleared ${stale.length} stale szwego cookies before login`);
      }
    } catch (e) {
      console.warn('Pre-login cookie clear failed:', e.message);
    }

    res.json({ ok: true, message: '请在打开的浏览器窗口中扫码登录' });

    // 用户手动关闭浏览器窗口 → 立即通知前端
    browser.on('disconnected', () => {
      finish({ closed: true, reason: 'browser_closed' });
    });

    // Poll for login cookie
    let checkCount = 0;
    checkInterval = setInterval(async () => {
      checkCount++;
      if (settled) return;
      try {
        const cookies = await page.cookies();
        const tokenCookie = cookies.find(c => c.name === 'token' && c.domain === 'www.szwego.com');
        if (tokenCookie && tokenCookie.value) {
          console.log('Login detected, cookie saved');
          await finish({ done: true });
          return;
        }
      } catch (e) {
        // page 调用失败一般是浏览器正在关闭，disconnected 事件会处理通知
        return;
      }
      if (checkCount > 100) {
        console.log('Login timeout after 5 min');
        await finish({ closed: true, reason: 'timeout' });
      }
    }, 3000);
  } catch (e) {
    console.error('Login error:', e);
    try { res.json({ error: '浏览器启动失败: ' + e.message }); } catch (_) {}
    await finish({ closed: true, reason: 'launch_failed' });
  }
});

// ── Start server ────────────────────────────────────────────────────
loadData();
migrateLogIfNeeded();
app.listen(PORT, () => {
  console.log(`商品组装器已启动: http://localhost:${PORT}`);
  appendLog('server-started', `端口 ${PORT}`);
});
