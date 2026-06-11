const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');

const USER_DATA = app.getPath('userData');
const DATA_FILE_READ = path.join(__dirname, 'all_items.json');
const DATA_FILE_WRITE = path.join(USER_DATA, 'all_items.json');
const SAVED_FILE = path.join(USER_DATA, 'saved_products.json');
let EXPORT_DIR = path.join(app.getPath('desktop'), '商品导出');

let mainWindow;
let allItems = [];

function loadData() {
  console.log('Loading data...');
  const t0 = Date.now();
  const raw = fs.readFileSync(fs.existsSync(DATA_FILE_WRITE) ? DATA_FILE_WRITE : DATA_FILE_READ, 'utf-8');
  allItems = JSON.parse(raw);
  allItems.sort((a, b) => (b.time_stamp || 0) - (a.time_stamp || 0));
  console.log('Loaded ' + allItems.length + ' items in ' + (Date.now() - t0) + 'ms');
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 950,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      partition: 'persist:szwego',
    },
    title: '商品组装器',
  });

  // Add Referer for images
  mainWindow.webContents.session.webRequest.onBeforeSendHeaders(
    { urls: ['https://xcimg.szwego.com/*'] },
    (details, callback) => {
      details.requestHeaders['Referer'] = 'https://www.szwego.com/';
      callback({ requestHeaders: details.requestHeaders });
    }
  );

  mainWindow.loadFile('index.html');
}

// ---- IPC Handlers ----

// Get one page of filtered items
ipcMain.handle('page', (_e, filter) => {
  const search = (filter.search || '').toLowerCase();
  const date = filter.date || '';
  const imgMode = filter.img || '0';
  const offset = filter.offset || 0;
  const limit = Math.min(filter.limit || 200, 200);

  let result = allItems;
  if (search) result = result.filter(i => (i.title || '').toLowerCase().includes(search));
  if (date) result = result.filter(i => i.time === date);
  if (imgMode === '1') result = result.filter(i => i.imgsSrc && i.imgsSrc.length);
  if (imgMode === '2') result = result.filter(i => !i.imgsSrc || !i.imgsSrc.length);

  const total = result.length;
  const page = result.slice(offset, offset + limit);
  return { total, items: page };
});

// Get all available dates
ipcMain.handle('dates', () => {
  const set = new Set();
  for (const i of allItems) { if (i.time) set.add(i.time); }
  return [...set].sort().reverse();
});

// ---- Work state persistence ----
const STATE_FILE = path.join(USER_DATA, 'work_state.json');
const LOG_FILE = path.join(USER_DATA, 'work_log.json');

function appendLog(action, detail) {
  try {
    let log = [];
    if (fs.existsSync(LOG_FILE)) {
      log = JSON.parse(fs.readFileSync(LOG_FILE, 'utf-8'));
    }
    log.push({ time: new Date().toISOString(), action: action, detail: detail || '' });
    // Keep last 500 entries
    if (log.length > 500) log = log.slice(-500);
    fs.writeFileSync(LOG_FILE, JSON.stringify(log, null, 2), 'utf-8');
  } catch(e) {}
}

ipcMain.handle('save-state', (_e, json) => {
  try { fs.writeFileSync(STATE_FILE, json, 'utf-8'); } catch(e) {}
});

ipcMain.handle('load-state', () => {
  try {
    if (fs.existsSync(STATE_FILE)) {
      let raw = fs.readFileSync(STATE_FILE, 'utf-8');
      if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
      return raw;
    }
  } catch(e) {}
  return '{}';
});

ipcMain.handle('log', (_e, action, detail) => {
  appendLog(action, detail);
});

ipcMain.handle('get-log', () => {
  try {
    if (fs.existsSync(LOG_FILE)) return fs.readFileSync(LOG_FILE, 'utf-8');
  } catch(e) {}
  return '[]';
});

// Save products to disk
ipcMain.handle('save', (_e, json) => {
  try {
    fs.writeFileSync(SAVED_FILE, json, 'utf-8');
    return 'ok';
  } catch(e) { return 'Error: ' + e.message; }
});

// Load saved products
ipcMain.handle('load-saved', () => {
  try {
    const p = SAVED_FILE;
    if (fs.existsSync(p)) {
      let raw = fs.readFileSync(p, 'utf-8');
      if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
      return raw;
    }
  } catch(e) {}
  return '[]';
});

// Export
ipcMain.handle('export', async (_e, json) => {
  try {
    if (!fs.existsSync(EXPORT_DIR)) fs.mkdirSync(EXPORT_DIR, { recursive: true });
    const products = JSON.parse(json);
    const ts = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    const outPath = path.join(EXPORT_DIR, 'products_' + ts + '.xlsx');
    const dataPath = path.join(EXPORT_DIR, '_export_data.json');
    fs.writeFileSync(dataPath, JSON.stringify(products), 'utf-8');

    const pyScript = fs.existsSync(path.join(__dirname, 'export_template.py'))
      ? path.join(__dirname, 'export_template.py')
      : path.join(process.resourcesPath, 'export_template.py');
    const stdout = await new Promise((resolve, reject) => {
      execFile('python', [pyScript, dataPath, outPath], {
        timeout: 30000, maxBuffer: 1024 * 1024
      }, (err, stdout, stderr) => {
        if (err) reject(err);
        else resolve(stdout);
      });
    });
    console.log('Export:', stdout.trim());
    return outPath;
  } catch (e) {
    console.error('Export error:', e);
    return 'Error: ' + e.message;
  }
});

// Fetch fresh data from API (via hidden window with cookies)
ipcMain.handle('fetch', async () => {
  const today = new Date();
  const weekAgo = new Date(today.getTime() - 7 * 86400000);
  const fmt = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const sd = fmt(weekAgo), ed = fmt(today);
  const albumId = '_dwoY7I0-PgBaikbKPfnkdJxRsJi5naAnTpu9TZA';
  const shopId = '_JY7Y7QN0GBV3Ft6ZJV2GOiQm5ezvLM3vX';

  return new Promise(resolve => {
    const win = new BrowserWindow({
      width: 1, height: 1, show: false,
      webPreferences: { partition: 'persist:szwego', contextIsolation: true, nodeIntegration: false }
    });
    win.loadURL('https://www.szwego.com/static/index.html');
    win.webContents.on('did-finish-load', () => {
      setTimeout(async () => {
        try {
          const result = await win.webContents.executeJavaScript(`
            (async () => {
              const all = [];
              let ts = '';
              const MAX_PAGES = 20;  // max 20 pages per refresh
              const DELAY = 600;      // 600ms between requests
              let pg = 0;
              while (pg < MAX_PAGES) {
                pg++;
                let url = 'https://www.szwego.com/album/personal/all?albumId=${albumId}&searchValue=&searchImg=&startDate=${sd}&endDate=${ed}&noCache=0&requestDataType=&link_type=pc_home&shop_id=${shopId}';
                if (ts) url += '&slipType=1&timestamp=' + ts;
                const r = await fetch(url);
                const d = await r.json();
                if (!d.result || !d.result.items) return {error: JSON.stringify(d).slice(0,200)};
                all.push(...d.result.items);
                if (!d.result.pagination.isLoadMore || !d.result.items.length) break;
                const nts = String(d.result.pagination.pageTimestamp||'');
                if (nts === ts || !nts) break;
                ts = nts;
                if (all.length > 5000) break;
                // Delay between requests to avoid rate limiting
                await new Promise(r => setTimeout(r, DELAY));
              }
              return {items: all};
            })();
          `);
          win.close();
          if (result.error) { resolve({error: result.error}); return; }
          const now = new Date();
          const fmtDate = d => d.getFullYear() + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + String(d.getDate()).padStart(2, '0');
          const convertTime = (t) => {
            if (!t) return t;
            const hMatch = t.match(/^(\d+)小时前$/);
            if (hMatch) {
              const d = new Date(now.getTime() - parseInt(hMatch[1]) * 3600000);
              return fmtDate(d);
            }
            const mMatch = t.match(/^(\d+)分钟前$/);
            if (mMatch) {
              const d = new Date(now.getTime() - parseInt(mMatch[1]) * 60000);
              return fmtDate(d);
            }
            const dMatch = t.match(/^(\d+)天前$/);
            if (dMatch) {
              const d = new Date(now.getTime() - parseInt(dMatch[1]) * 86400000);
              return fmtDate(d);
            }
            return t;
          };
          const exist = new Set(allItems.map(i => i.goods_id));
          let added = 0;
          for (const item of result.items) {
            if (item.time) item.time = convertTime(item.time);
            if (!exist.has(item.goods_id)) { allItems.unshift(item); exist.add(item.goods_id); added++; }
          }
          allItems.sort((a, b) => (b.time_stamp || 0) - (a.time_stamp || 0));
          fs.writeFileSync(DATA_FILE_WRITE, JSON.stringify(allItems), 'utf-8');
          console.log('Fetched: ' + added + ' new items');
          resolve({ok: true, count: added});
        } catch (e) {
          win.close();
          resolve({error: e.message});
        }
      }, 2000);
    });
    setTimeout(() => { if (!win.isDestroyed()) { win.close(); resolve({error: 'timeout'}); } }, 300000);
  });
});

// ---- AI Product Processing ----
ipcMain.handle('ai-process', async (_e, config, products, prompts, enabled) => {
  const https = require('https');

  function callAi(systemPrompt, userMessage) {
    return new Promise(resolve => {
      // Validate input
      if (!userMessage || !userMessage.trim()) {
        console.log('AI call rejected: empty userMessage');
        resolve({ ok: false, error: 'empty prompt' });
        return;
      }

      const body = JSON.stringify({
        model: config.model || 'deepseek-v4-flash',
        messages: [
          { role: 'system', content: systemPrompt || '你是电商商品数据助手。' },
          { role: 'user', content: userMessage }
        ],
        max_tokens: config.maxTokens || 4096,
        temperature: 0.3,
      });

      const req = https.request({
        hostname: 'api.deepseek.com', path: '/v1/chat/completions', method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + (config.apiKey || ''),
          'User-Agent': 'SzwegoScraper/1.0',
        },
        timeout: 30000,
      }, res => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          try {
            const j = JSON.parse(data);
            if (j.choices && j.choices[0]) {
              const content = (j.choices[0].message.content || '').trim();
              if (!content) {
                // Log why empty: check finish_reason
                const reason = j.choices[0].finish_reason || 'unknown';
                console.log('AI empty response: finish_reason=' + reason + ' model=' + (j.model||'?') + ' usage=' + JSON.stringify(j.usage||{}));
              }
              resolve({ ok: true, reply: content });
            } else {
              console.log('AI API error: ' + JSON.stringify(j).substring(0, 300));
              resolve({ ok: false, error: (j.error||{}).message || 'API error' });
            }
          } catch(e) {
            console.log('AI parse error: ' + data.substring(0, 200));
            resolve({ ok: false, error: 'parse error' });
          }
        });
      });
      req.on('error', e => {
        console.log('AI network error: ' + e.message);
        resolve({ ok: false, error: e.message });
      });
      req.on('timeout', () => {
        console.log('AI timeout');
        req.destroy(); resolve({ ok: false, error: 'timeout' });
      });
      req.write(body); req.end();
    });
  }

  const results = new Array(products.length);
  const CONCURRENCY = 20;
  const RETRY_DEADLINE_MS = 120000; // 2 minutes max retry
  const SYSTEM_STRICT = '你是专业的电商商品数据助手。只输出结果，不解释。输出内容绝对不能为空。';

  function fillTpl(tpl, vars) {
    let s = tpl || '';
    Object.keys(vars).forEach(k => { s = s.replace(new RegExp('\\{' + k + '\\}', 'g'), vars[k]); });
    return s;
  }

  // Single API call
  async function callField(promptText) {
    const r = await callAi(SYSTEM_STRICT, promptText);
    if (r.ok && r.reply && r.reply.trim()) return r.reply.trim();
    return null;
  }

  // Retry a single field until success or 2min deadline
  async function retryFieldUntilOK(promptText, deadline) {
    while (Date.now() < deadline) {
      const result = await callField(promptText);
      if (result) return result;
      await new Promise(resolve => setTimeout(resolve, 1000)); // 1s between retries
    }
    return null;
  }

  for (let batch = 0; batch < products.length; batch += CONCURRENCY) {
    const batchProducts = products.slice(batch, batch + CONCURRENCY);

    await Promise.all(batchProducts.map(async (pr) => {
      const i = products.indexOf(pr);
      const copy = (pr.copy || '').substring(0, 3000);
      const vars = { copy, style: pr.style || '', price: pr.price || '', imgs_count: (pr.imgs||[]).length };
      const fields = {};

      const allKeys = ['title', 'subtitle', 'short', 'keywords', 'features', 'category'];
      const enabledKeys = allKeys.filter(k => !enabled || enabled[k] !== false);

      // Phase 1: Fire ALL 8 fields in parallel
      const firstResults = await Promise.all(enabledKeys.map(async (key) => {
        const tpl = prompts[key];
        if (!tpl) return { key, result: '' };
        const result = await callField(fillTpl(tpl, vars));
        return { key, result: result || '' };
      }));

      // Collect results
      firstResults.forEach(({ key, result }) => { fields[key] = result; });

      // Phase 2: Find failed fields, retry each until 2min deadline
      const failedKeys = firstResults.filter(f => !f.result).map(f => f.key);
      if (failedKeys.length > 0) {
        console.log('Product ' + i + ': ' + failedKeys.length + ' fields failed, retrying for 2min: ' + failedKeys.join(', '));
        const deadline = Date.now() + RETRY_DEADLINE_MS;

        const retryResults = await Promise.all(failedKeys.map(async (key) => {
          const tpl = prompts[key];
          if (!tpl) return { key, result: '' };
          const result = await retryFieldUntilOK(fillTpl(tpl, vars), deadline);
          return { key, result: result || '' };
        }));

        retryResults.forEach(({ key, result }) => { fields[key] = result; });

        // Log still-failed fields
        const stillFailed = retryResults.filter(f => !f.result).map(f => f.key);
        if (stillFailed.length > 0) {
          console.log('Product ' + i + ': STILL failed after 2min: ' + stillFailed.join(', '));
        }
      }

      results[i] = { index: i, fields };
      mainWindow.webContents.send('ai-process-progress', {
        index: results.filter(r => r).length,
        total: products.length
      });
    }));
  }

  // Final validation: collect failed fields for retry
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
    console.log('WARNING: ' + failedFields.length + ' empty fields: ' + JSON.stringify(failedFields.slice(0, 10)));
    return { ok: true, results, failed: failedFields };
  }

  return { ok: true, results };
});

// ---- AI / DeepSeek API ----
const AI_CONFIG_FILE = path.join(USER_DATA, 'ai_config.json');

ipcMain.handle('ai-save-config', (_e, config) => {
  try {
    fs.writeFileSync(AI_CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
    return 'ok';
  } catch(e) { return 'Error: ' + e.message; }
});

ipcMain.handle('ai-load-config', () => {
  try {
    if (fs.existsSync(AI_CONFIG_FILE)) return fs.readFileSync(AI_CONFIG_FILE, 'utf-8');
  } catch(e) {}
  return '{}';
});

ipcMain.handle('ai-test', async (_e, config) => {
  const https = require('https');
  return new Promise(resolve => {
    const body = JSON.stringify({
      model: config.model || 'deepseek-v4-flash',
      messages: [{ role: 'user', content: '你好，请回复"连接成功"两个字' }],
      max_tokens: 50,
      temperature: 0.3,
    });

    const req = https.request({
      hostname: 'api.deepseek.com',
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + (config.apiKey || ''),
        'User-Agent': 'SzwegoScraper/1.0',
      },
      timeout: 15000,
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const j = JSON.parse(data);
          if (j.choices && j.choices[0]) {
            resolve({ ok: true, reply: j.choices[0].message.content, model: j.model });
          } else if (j.error) {
            resolve({ ok: false, error: j.error.message || JSON.stringify(j.error) });
          } else {
            resolve({ ok: false, error: '未知响应: ' + data.substring(0, 200) });
          }
        } catch(e) {
          resolve({ ok: false, error: '解析失败: ' + data.substring(0, 200) });
        }
      });
    });
    req.on('error', e => resolve({ ok: false, error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: '连接超时' }); });
    req.write(body);
    req.end();
  });
});

ipcMain.handle('ai-chat', async (_e, config, messages) => {
  const https = require('https');
  return new Promise(resolve => {
    const body = JSON.stringify({
      model: config.model || 'deepseek-v4-flash',
      messages: messages,
      max_tokens: config.maxTokens || 2000,
      temperature: config.temperature || 0.7,
    });

    const req = https.request({
      hostname: 'api.deepseek.com',
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + (config.apiKey || ''),
        'User-Agent': 'SzwegoScraper/1.0',
      },
      timeout: 60000,
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const j = JSON.parse(data);
          if (j.choices && j.choices[0]) {
            resolve({ ok: true, reply: j.choices[0].message.content, usage: j.usage });
          } else if (j.error) {
            resolve({ ok: false, error: j.error.message || JSON.stringify(j.error) });
          } else {
            resolve({ ok: false, error: '未知响应' });
          }
        } catch(e) {
          resolve({ ok: false, error: '解析失败' });
        }
      });
    });
    req.on('error', e => resolve({ ok: false, error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: '超时' }); });
    req.write(body);
    req.end();
  });
});

// Open login window
ipcMain.handle('login', () => {
  const win = new BrowserWindow({
    width: 800, height: 700,
    webPreferences: { partition: 'persist:szwego', contextIsolation: true, nodeIntegration: false },
    title: '登录 Szwego - 请扫码',
  });
  win.loadURL('https://www.szwego.com/static/index.html');

  // Detect login by checking cookie every 3 seconds
  let checkCount = 0;
  const checkInterval = setInterval(async () => {
    checkCount++;
    try {
      const cookies = await win.webContents.session.cookies.get({ name: 'token', domain: 'www.szwego.com' });
      if (cookies && cookies.length > 0 && cookies[0].value) {
        clearInterval(checkInterval);
        console.log('Login detected, closing window');
        mainWindow.webContents.send('login-done', true);
        win.close();
      }
    } catch(e) {}
    // Timeout after 5 minutes
    if (checkCount > 100) {
      clearInterval(checkInterval);
      if (!win.isDestroyed()) win.close();
    }
  }, 3000);

  return 'ok';
});

app.whenReady().then(() => {
  loadData();
  createWindow();
});

app.on('window-all-closed', () => {
  appendLog('app-closed', '应用关闭');
  if (process.platform !== 'darwin') app.quit();
});
