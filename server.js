const express = require('express');
const fs = require('fs');
const path = require('path');
const https = require('https');
const { execFile } = require('child_process');

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
    let log = [];
    if (fs.existsSync(LOG_FILE)) log = JSON.parse(fs.readFileSync(LOG_FILE, 'utf-8'));
    log.push({ time: new Date().toISOString(), action, detail: detail || '' });
    if (log.length > 500) log = log.slice(-500);
    fs.writeFileSync(LOG_FILE, JSON.stringify(log, null, 2), 'utf-8');
  } catch (e) {}
}

function readJsonSafe(filePath, fallback) {
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
app.post('/api/page', (_req, res) => {
  const filter = _req.body || {};
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
app.get('/api/saved', (_req, res) => res.send(readJsonSafe(SAVED_FILE, '[]')));
app.post('/api/saved', (_req, res) => {
  try {
    fs.writeFileSync(SAVED_FILE, JSON.stringify(_req.body), 'utf-8');
    res.json({ ok: true });
  } catch (e) { res.json({ error: e.message }); }
});

// Work state
app.get('/api/state', (_req, res) => res.send(readJsonSafe(STATE_FILE, '{}')));
app.post('/api/state', (_req, res) => {
  try {
    fs.writeFileSync(STATE_FILE, typeof _req.body === 'string' ? _req.body : JSON.stringify(_req.body), 'utf-8');
    res.json({ ok: true });
  } catch (e) { res.json({ error: e.message }); }
});

// Work log
app.get('/api/log', (_req, res) => res.send(readJsonSafe(LOG_FILE, '[]')));
app.post('/api/log', (_req, res) => {
  appendLog(_req.body.action, _req.body.detail);
  res.json({ ok: true });
});

// Export Excel
app.post('/api/export', async (_req, res) => {
  try {
    const products = _req.body;
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
app.get('/api/download', (_req, res) => {
  const fp = _req.query.file;
  if (!fp || !fp.startsWith(EXPORT_DIR)) return res.status(403).send('Forbidden');
  if (!fs.existsSync(fp)) return res.status(404).send('Not found');
  res.download(fp);
});

// ── AI / DeepSeek API ───────────────────────────────────────────────
function callAi(apiKey, model, maxTokens, systemPrompt, userMessage) {
  return new Promise(resolve => {
    if (!userMessage || !userMessage.trim()) {
      resolve({ ok: false, error: 'empty prompt' });
      return;
    }
    const body = JSON.stringify({
      model: model || 'deepseek-v4-flash',
      messages: [
        { role: 'system', content: systemPrompt || '你是电商商品数据助手。' },
        { role: 'user', content: userMessage }
      ],
      max_tokens: maxTokens || 4096,
      temperature: 0.3,
    });

    const req = https.request({
      hostname: 'api.deepseek.com', path: '/v1/chat/completions', method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + (apiKey || ''),
        'User-Agent': 'SzwegoScraper/2.0',
      },
      timeout: 30000,
    }, resp => {
      let data = '';
      resp.on('data', c => data += c);
      resp.on('end', () => {
        try {
          const j = JSON.parse(data);
          if (j.choices && j.choices[0]) {
            const content = (j.choices[0].message.content || '').trim();
            resolve({ ok: true, reply: content });
          } else {
            resolve({ ok: false, error: (j.error || {}).message || 'API error' });
          }
        } catch (e) {
          resolve({ ok: false, error: 'parse error' });
        }
      });
    });
    req.on('error', e => resolve({ ok: false, error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
    req.write(body); req.end();
  });
}

// AI config
app.get('/api/ai/config', (_req, res) => res.send(readJsonSafe(AI_CONFIG_FILE, '{}')));
app.post('/api/ai/config', (_req, res) => {
  try {
    fs.writeFileSync(AI_CONFIG_FILE, JSON.stringify(_req.body, null, 2), 'utf-8');
    res.json({ ok: true });
  } catch (e) { res.json({ error: e.message }); }
});

// AI test connection
app.post('/api/ai/test', async (_req, res) => {
  const result = await callAi(_req.body.apiKey, _req.body.model, 50,
    '', '你好，请回复"连接成功"两个字');
  res.json(result);
});

// AI chat
app.post('/api/ai/chat', async (_req, res) => {
  const { config, messages } = _req.body;
  const result = await callAi(config.apiKey, config.model, config.maxTokens || 2000,
    '', messages);
  res.json(result);
});

// SSE clients for AI progress
let aiProgressClients = [];
app.get('/api/ai/progress', (_req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });
  aiProgressClients.push(res);
  _req.on('close', () => { aiProgressClients = aiProgressClients.filter(c => c !== res); });
});

function sendAiProgress(data) {
  aiProgressClients.forEach(c => c.write(`data: ${JSON.stringify(data)}\n\n`));
}

// ── AI Process ──────────────────────────────────────────────────────
app.post('/api/ai/process', async (_req, res) => {
  const { config, products, prompts, enabled } = _req.body;

  // Start processing and stream progress via SSE
  res.json({ ok: true, message: 'processing started' });

  // Process in background
  const SYSTEM_STRICT = '你是专业的电商商品数据助手。只输出结果，不解释。输出内容绝对不能为空。';
  const CONCURRENCY = 20;
  const RETRY_DEADLINE_MS = 120000;

  function fillTpl(tpl, vars) {
    let s = tpl || '';
    Object.keys(vars).forEach(k => { s = s.replace(new RegExp('\\{' + k + '\\}', 'g'), vars[k]); });
    return s;
  }

  const results = new Array(products.length);

  async function callField(promptText) {
    const r = await callAi(config.apiKey, config.model, config.maxTokens, SYSTEM_STRICT, promptText);
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

  for (let batch = 0; batch < products.length; batch += CONCURRENCY) {
    const batchProducts = products.slice(batch, batch + CONCURRENCY);
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
        const deadline = Date.now() + RETRY_DEADLINE_MS;
        const retryResults = await Promise.all(failedKeys.map(async (key) => {
          const tpl = prompts[key];
          if (!tpl) return { key, result: '' };
          const result = await retryFieldUntilOK(fillTpl(tpl, vars), deadline);
          return { key, result: result || '' };
        }));
        retryResults.forEach(({ key, result }) => { fields[key] = result; });
      }

      results[i] = { index: i, fields, _pid: pr.id };
      sendAiProgress({ index: results.filter(r => r).length, total: products.length });
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

  // Store the last result so frontend can pick it up
  global._lastAiResult = { results, failed: failedFields.length ? failedFields : null };

  sendAiProgress({ index: results.length, total: products.length, done: true, failed: failedFields.length ? failedFields : null });
});

// Endpoint for frontend to poll AI result after processing completes
app.get('/api/ai/result', (_req, res) => {
  const r = global._lastAiResult;
  res.json(r ? { ok: true, results: r.results, failed: r.failed } : { ok: false, error: 'no result' });
});

// ── Puppeteer: Fetch fresh data ─────────────────────────────────────
async function getPuppeteer() {
  try {
    return require('puppeteer');
  } catch (e) {
    return null;
  }
}

app.post('/api/fetch', async (_req, res) => {
  const puppeteer = await getPuppeteer();
  if (!puppeteer) {
    res.json({ error: 'Puppeteer 未安装。运行: npm install puppeteer' });
    return;
  }

  const today = new Date();
  const weekAgo = new Date(today.getTime() - 7 * 86400000);
  const fmt = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const sd = fmt(weekAgo), ed = fmt(today);
  const albumId = '_dwoY7I0-PgBaikbKPfnkdJxRsJi5naAnTpu9TZA';
  const shopId = '_JY7Y7QN0GBV3Ft6ZJV2GOiQm5ezvLM3vX';

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
    let added = 0;
    for (const item of result.items) {
      // Use time_stamp as the canonical time field
      if (item.time_stamp) item.time = fmtTs(item.time_stamp);
      if (!exist.has(item.goods_id)) { allItems.unshift(item); exist.add(item.goods_id); added++; }
    }
    allItems.sort((a, b) => (b.time_stamp || 0) - (a.time_stamp || 0));
    fs.writeFileSync(DATA_FILE_WRITE, JSON.stringify(allItems), 'utf-8');
    console.log(`Fetched: ${added} new items`);
    res.json({ ok: true, count: added });
  } catch (e) {
    console.error('Fetch error:', e);
    res.json({ error: e.message });
  }
});

// ── Puppeteer: Login ───────────────────────────────────────────────
let loginSseClients = [];
app.get('/api/login/status', (_req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });
  loginSseClients.push(res);
  _req.on('close', () => { loginSseClients = loginSseClients.filter(c => c !== res); });
});

function notifyLoginDone() {
  loginSseClients.forEach(c => c.write('data: {"done":true}\n\n'));
}

app.post('/api/login', async (_req, res) => {
  const puppeteer = await getPuppeteer();
  if (!puppeteer) {
    res.json({ error: 'Puppeteer 未安装' });
    return;
  }

  try {
    const browser = await puppeteer.launch({
      headless: false,
      userDataDir: PROFILE_DIR,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();
    await page.goto('https://www.szwego.com/static/index.html', { waitUntil: 'networkidle2', timeout: 30000 });

    res.json({ ok: true, message: '请在打开的浏览器窗口中扫码登录' });

    // Poll for login cookie
    let checkCount = 0;
    const checkInterval = setInterval(async () => {
      checkCount++;
      try {
        const cookies = await page.cookies();
        const tokenCookie = cookies.find(c => c.name === 'token' && c.domain === 'www.szwego.com');
        if (tokenCookie && tokenCookie.value) {
          clearInterval(checkInterval);
          notifyLoginDone();
          await browser.close();
          console.log('Login detected, cookie saved');
        }
      } catch (e) {}
      if (checkCount > 100) {
        clearInterval(checkInterval);
        await browser.close();
        console.log('Login timeout after 5 min');
      }
    }, 3000);
  } catch (e) {
    console.error('Login error:', e);
    try { res.json({ error: '浏览器启动失败: ' + e.message }); } catch (_) {}
  }
});

// ── Start server ────────────────────────────────────────────────────
loadData();
app.listen(PORT, () => {
  console.log(`商品组装器已启动: http://localhost:${PORT}`);
  appendLog('server-started', `端口 ${PORT}`);
});
