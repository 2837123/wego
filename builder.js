var R = {};    // rendered IDs
var S = {};    // selected IDs
var SC = {};   // selected cache (id -> item)
var P = [];    // saved products
var CP = null; // current product being built
var savedIds = {};  // goods_ids that have been saved
var aiDone = false;
var processedIds = {};  // products that have been AI processed
var total = 0;
var offset = 0;
var lastDate = null;
var PAGE = 200;

var $ = function(id) { return document.getElementById(id); };
var esc = function(s) { var d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; };

function api(method, url, body) {
  var opts = { method: method, headers: { 'Content-Type': 'application/json' } };
  if (body !== undefined) {
    opts.body = typeof body === 'string' ? body : JSON.stringify(body);
  }
  return fetch(url, opts).then(function(r) {
    var ct = r.headers.get('content-type') || '';
    return ct.includes('application/json') ? r.json() : r.text();
  });
}

function rebuildSavedIds() {
  savedIds = {};
  P.forEach(function(p) {
    (p.sourceIds || []).forEach(function(id) { savedIds[id] = true; });
  });
  refreshCardMarks();
}

function refreshCardMarks() {
  document.querySelectorAll('.item-card').forEach(function(card) {
    var id = card.getAttribute('data-id');
    // Saved mark
    var sm = card.querySelector('.saved-mark');
    if (savedIds[id]) {
      if (!sm) { sm = document.createElement('div'); sm.className = 'saved-mark'; sm.textContent = '✓'; card.appendChild(sm); }
    } else {
      if (sm) sm.remove();
    }
    // AI-processed mark
    var am = card.querySelector('.ai-mark');
    if (processedIds[id]) {
      if (!am) { am = document.createElement('div'); am.className = 'ai-mark'; am.textContent = 'AI'; card.appendChild(am); }
    } else {
      if (am) am.remove();
    }
  });
}

// ---- Init ----
(function() {
  var panel = $('item-panel');
  panel.innerHTML = '<div style="padding:20px;color:#888">初始化...</div>';

  // Load saved products AND work state together, then restore
  Promise.all([
    api('GET', '/api/saved'),
    api('GET', '/api/state')
  ]).then(function(results) {
    // Restore saved products
    try { P = JSON.parse(results[0]) || []; } catch(e) {}
    rebuildSavedIds();
    // Restore work state (marks, processed IDs)
    try {
      var state = JSON.parse(results[1]);
      if (state.savedIds) { state.savedIds.forEach(function(id) { savedIds[id] = true; }); }
      if (state.processedIds) { state.processedIds.forEach(function(id) { processedIds[id] = true; }); }
      if (state.selectedIds && state.selectedIds.length) {
        panel.innerHTML += '<div style="color:#f39c12;font-size:12px">上次选中 ' + state.selectedIds.length + ' 条' +
          (state.lastProduct ? ' | 组装中: #' + state.lastProduct.style + ' ' + state.lastProduct.imgs + '图 ¥' + state.lastProduct.price : '') +
          (state.time ? ' | ' + new Date(state.time).toLocaleString() : '') + '</div></div>';
      }
    } catch(e) {}
    refreshCardMarks();
    renderSaved();
  });

  // Load work log summary
  api('GET', '/api/log').then(function(json) {
    try {
      var log = JSON.parse(json);
      if (log.length) {
        var last = log[log.length - 1];
        var created = log.filter(function(l) { return l.action === 'product-saved'; }).length;
        panel.innerHTML += '<div style="color:#888;font-size:11px">工作日志: ' + log.length + ' 条 | 已创建 ' + created + ' 个商品 | 最后: ' + (last.action || '') + ' (' + new Date(last.time).toLocaleString() + ')</div>';
      }
    } catch(e) {}
  });

  // Log app start
  api('POST', '/api/log', { action: 'app-started', detail: '应用启动' });

  // Load dates
  api('GET', '/api/dates').then(function(dates) {
    var sel = $('dateFilter');
    dates.forEach(function(d) {
      var o = document.createElement('option');
      o.value = d; o.textContent = d; sel.appendChild(o);
    });
    return loadPage({ offset: 0 });
  }).catch(function(e) {
    panel.innerHTML = '<div style="padding:20px;color:#e74c3c">加载失败: ' + e.message + '</div>';
  });
})();

// ---- Data loading ----
function loadPage(filter) {
  filter = filter || {};
  filter.search = $('searchInput').value;
  filter.date = $('dateFilter').value;
  filter.img = $('imgFilter').value;
  filter.limit = PAGE;

  return api('POST', '/api/page', filter).then(function(r) {
    total = r.total;
    offset = filter.offset + r.items.length;

    if (filter.offset === 0) {
      R = {}; lastDate = null; $('item-panel').innerHTML = '';
    }
    render(r.items);
    updateStatus();
  });
}

function render(items) {
  var panel = $('item-panel');
  var frag = document.createDocumentFragment();

  items.forEach(function(item) {
    if (R[item.goods_id]) return;
    R[item.goods_id] = true;

    // Date header
    var d = item.time || '';
    if (d !== lastDate) {
      lastDate = d;
      var h = document.createElement('div');
      h.className = 'date-head';
      h.textContent = d;
      frag.appendChild(h);
    }

    var card = document.createElement('div');
    card.className = 'item-card' + (S[item.goods_id] ? ' selected' : '');
    card.setAttribute('data-id', item.goods_id);
    card.onclick = function() { toggle(item); };

    var img = (item.imgsSrc && item.imgsSrc[0]) ? item.imgsSrc[0] : '';
    var imgHTML = img
      ? '<div class="thumb-wrap"><img class="thumb" src="' + esc(img) + '" loading="lazy" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'block\'" /><div class="no-img" style="display:none">?</div></div>'
      : '<div class="thumb-wrap"><div class="no-img">?</div></div>';

    var imgCount = (item.imgsSrc || []).length;
    card.innerHTML = imgHTML +
      '<div class="check">' + (S[item.goods_id] ? '✓' : '') + '</div>' +
      (imgCount > 1 ? '<div class="img-badge">' + imgCount + '</div>' : '') +
      (savedIds[item.goods_id] ? '<div class="saved-mark">✓</div>' : '') +
      '<div class="info"><div class="title">' + esc((item.title || '').substring(0, 50)) + '</div>' +
      '<div class="meta"><span>' + imgCount + '图</span></div></div>';
    frag.appendChild(card);
  });

  var sentinel = $('loadMoreSentinel');
  if (sentinel) sentinel.remove();
  panel.appendChild(frag);

  if (offset < total) {
    var s = document.createElement('div');
    s.id = 'loadMoreSentinel';
    s.textContent = offset + ' / ' + total + ' — 加载更多';
    s.onclick = function() { loadPage({ offset: offset }); };
    panel.appendChild(s);
  }
}

function updateStatus() {
  $('stats').textContent = Object.keys(R).length + ' / ' + total + ' 条 | 已选 ' + Object.keys(S).length;
  $('selCount').textContent = Object.keys(S).length;
}

// ---- Selection ----
function toggle(item) {
  var id = item.goods_id;
  if (S[id]) { delete S[id]; delete SC[id]; }
  else { S[id] = true; SC[id] = item; }

  var card = document.querySelector('.item-card[data-id="' + id + '"]');
  if (card) {
    card.classList.toggle('selected', !!S[id]);
    card.querySelector('.check').textContent = S[id] ? '✓' : '';
  }
  updateStatus();
  autoMerge();
}

$('btnDeselect').onclick = function() {
  S = {}; SC = {};
  document.querySelectorAll('.item-card').forEach(function(c) { c.classList.remove('selected'); c.querySelector('.check').textContent = ''; });
  updateStatus();
  autoMerge();
};

// ---- Filters ----
var ft;
$('searchInput').oninput = function() { clearTimeout(ft); ft = setTimeout(function() { loadPage({ offset: 0 }); }, 300); };
$('dateFilter').onchange = function() { loadPage({ offset: 0 }); };
$('imgFilter').onchange = function() { loadPage({ offset: 0 }); };

// ---- Work state auto-save (debounced) ----
var saveStateTimer;
function scheduleStateSave() {
  clearTimeout(saveStateTimer);
  saveStateTimer = setTimeout(function() {
    var state = {
      selectedIds: Object.keys(S),
      savedCount: P.length,
      savedIds: Object.keys(savedIds),
      processedIds: Object.keys(processedIds),
      lastProduct: CP ? { style: CP.style, imgs: CP.imgs.length, price: CP.price } : null,
      time: new Date().toISOString()
    };
    api('POST', '/api/state', JSON.stringify(state));
  }, 2000);
}

// ---- Auto-merge on selection change ----
function autoMerge() {
  scheduleStateSave();

  var items = Object.values(SC);
  if (!items.length) {
    CP = null;
    clearBuilder();
    $('mergeStatus').textContent = '';
    $('selCount').textContent = '(选中0条)';
    return;
  }

  // Collect images in selection order, deduplicate
  var imgs = [];
  var titles = [];
  items.forEach(function(item) {
    (item.imgsSrc || []).forEach(function(img) {
      if (imgs.indexOf(img) < 0) imgs.push(img);
    });
    if (item.title) titles.push(item.title);
  });

  // Auto-extract style numbers: ALL 5-digit #XXXXX patterns
  var allStyles = [];
  var allPrices = [];
  for (var i = 0; i < titles.length; i++) {
    var t = titles[i];
    // Collect all style numbers
    var sm = t.match(/#(\d{5})/g);
    if (sm) {
      sm.forEach(function(s) {
        var num = s.replace('#', '');
        if (allStyles.indexOf(num) < 0) allStyles.push(num);
      });
    }
    // Collect all prices from titles
    var pm = t.match(/[¥¥💰](\d{3,4})\b/g);
    if (pm) {
      pm.forEach(function(p) {
        var num = p.replace(/[¥¥💰]/, '');
        if (allPrices.indexOf(num) < 0 && parseInt(num) >= 50 && parseInt(num) <= 9999) {
          allPrices.push(num);
        }
      });
    }
    // Also try pattern like "上衣💰299" without space
    var pm2 = t.match(/(?:上衣|裙子|裤子|外套|衬衫|背心|T恤|马甲|抹胸|半裙|短裤|长裤|阔腿裤|直筒裤|工装裤|牛仔裤|皮裤|开衫|毛衣|针织|防晒衫|吊带|半身裙|休闲裤)[💰¥¥](\d{3,4})/g);
    if (pm2) {
      pm2.forEach(function(p) {
        var num = p.match(/\d+/)[0];
        if (allPrices.indexOf(num) < 0 && parseInt(num) >= 50 && parseInt(num) <= 9999) {
          allPrices.push(num);
        }
      });
    }
  }
  // Also get prices from itemPrice fields
  for (var j = 0; j < items.length; j++) {
    if (items[j].itemPrice) {
      var ip = String(parseInt(items[j].itemPrice));
      if (allPrices.indexOf(ip) < 0) allPrices.push(ip);
    }
  }

  // Use comma-separated if multiple, otherwise single
  var style = allStyles.join(',');
  var price = allPrices.join(',');

  // Concatenate copy in selection order
  var copy = titles.join('\n---\n');

  // Auto-classify by keywords
  var classify = function(text) {
    var t = (text || '');
    var head = t.substring(0, 120);
    if (/t恤|t桖|tee\b|短t\b|棉t|小t/i.test(head)) return 'T恤';
    if (/短袖/.test(head) && !/衬衫|衬衣/.test(head)) return 'T恤';
    if (/衬衫|衬衣/.test(head)) return '衬衫';
    if (/针织|毛衣/.test(head)) return '针织衫';
    if (/卫衣/.test(head)) return '卫衣';
    if (/大衣/.test(head)) return '大衣';
    if (/外套|开衫|风衣/.test(head)) return '外套';
    if (/背心|吊带|抹胸/.test(head)) return '背心';
    if (/打底/.test(head)) return '打底';
    if (/连衣裙/.test(head)) return '连衣裙';
    if (/短裙|半身裙|半裙/.test(head)) return '短裙';
    if (/长裙/.test(head)) return '长裙';
    if (/牛仔裤|牛仔/.test(head)) return '牛仔裤';
    if (/休闲裤|休闲长裤/.test(head)) return '休闲裤';
    if (/短裤/.test(head) && !/短裤裙/.test(head)) return '短裤';
    if (/t恤|t桖|tee\b|短t\b|棉t|小t/i.test(t)) return 'T恤';
    if (/衬衫|衬衣/.test(t)) return '衬衫';
    if (/针织|毛衣/.test(t)) return '针织衫';
    if (/卫衣/.test(t)) return '卫衣';
    if (/大衣/.test(t)) return '大衣';
    if (/外套|开衫|风衣/.test(t)) return '外套';
    if (/背心|吊带|抹胸/.test(t)) return '背心';
    if (/打底/.test(t)) return '打底';
    if (/连衣裙/.test(t)) return '连衣裙';
    if (/短裙|半身裙|半裙/.test(t)) return '短裙';
    if (/长裙/.test(t)) return '长裙';
    if (/牛仔裤|牛仔/.test(t)) return '牛仔裤';
    if (/休闲裤|休闲长裤/.test(t)) return '休闲裤';
    if (/短裤/.test(t) && !/短裤裙/.test(t)) return '短裤';
    return '';
  };

  var autoCate = classify(copy);
  var cateStr = autoCate ? '[女装;' + autoCate + ']' : '[女装]';

  // Auto-generate detail: [img][img]... + copy with <br>
  var detail = imgs.map(function(u) { return '[' + u + ']'; }).join('') + '\n' + copy.replace(/\n/g, '<br>');

  CP = { imgs: imgs.slice(), style: style, price: price, copy: copy, category: cateStr, detail: detail, allStyles: allStyles, allPrices: allPrices };
  $('selCount').textContent = '(选中' + items.length + '条 ' + imgs.length + '图)';
  renderBuilder();
  var multiHint = allStyles.length > 1 ? ' (套装' + allStyles.length + '件)' : '';
  var priceHint = allPrices.length > 1 ? ' (多价需确认)' : '';
  $('mergeStatus').textContent = imgs.length + '图  #' + style + multiHint + '  ¥' + price + priceHint;

  // Remove old split button
  var oldBtn = $('btnSplitSet');
  if (oldBtn) oldBtn.remove();

  // If multiple styles detected, show split button
  if (allStyles.length > 1) {
    toast('检测到套装！款号: ' + style + '  价格: ' + price + ' — 可拆分', 'ok');
    if (!$('btnSplitSet')) {
      var splitBtn = document.createElement('button');
      splitBtn.id = 'btnSplitSet';
      splitBtn.style.cssText = 'width:100%;padding:8px;margin-top:6px;background:#d2991d;color:#000;border:none;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600';
      splitBtn.textContent = '拆分套装 (' + allStyles.length + '件)';
      splitBtn.onclick = function() { splitSet(allStyles, allPrices); };
      $('btnSave').parentNode.appendChild(splitBtn);
    }
  }
}

function renderBuilder() {
  if (!CP) return;
  $('imgPool').innerHTML = CP.imgs.length
    ? CP.imgs.map(function(img) {
        return '<img class="pool-img keep" src="' + esc(img) + '" />';
      }).join('')
    : '<span class="empty-hint">无</span>';
  $('prodStyle').value = CP.style;
  $('prodPrice').value = CP.price;
  $('prodCopy').value = CP.copy;
}

// Form sync
['prodStyle','prodPrice','prodCopy'].forEach(function(id) {
  $(id).oninput = function() {
    if (!CP) return;
    if (id === 'prodStyle') CP.style = $(id).value;
    else if (id === 'prodPrice') CP.price = $(id).value;
    else if (id === 'prodCopy') CP.copy = $(id).value;
  };
});

// ---- Save ----
function persistProducts() {
  api('POST', '/api/saved', P).catch(function(e) { console.error(e); });
}

function doSave() {
  if (!CP) { toast('请先选中商品', 'err'); return; }
  CP.style = $('prodStyle').value.trim();
  CP.price = $('prodPrice').value.trim();
  CP.copy = $('prodCopy').value.trim();
  if (!CP.style) { toast('未识别到款号，禁止保存', 'err'); return; }
  if (!CP.price) { toast('未识别到价格，禁止保存', 'err'); return; }

  P.push({
    id: Date.now(),
    imgs: CP.imgs.slice(),
    style: CP.style,
    price: CP.price,
    copy: CP.copy,
    category: CP.category || '[女装]',
    detail: CP.detail || '',
    sourceIds: Object.keys(S)
  });
  persistProducts();
  api('POST', '/api/log', { action: 'product-saved', detail: '#' + CP.style + ' ' + CP.imgs.length + '图 ¥' + CP.price });
  S = {}; SC = {}; CP = null;
  document.querySelectorAll('.item-card').forEach(function(c) { c.classList.remove('selected'); c.querySelector('.check').textContent = ''; });
  clearBuilder(); updateStatus(); renderSaved();
  rebuildSavedIds();
  toast('已保存 (' + P.length + '个商品)', 'ok');
}

$('btnSave').onclick = doSave;

function doSplitSave() {
  if (!CP) { toast('请先选中商品', 'err'); return; }
  if (!CP.style || !CP.price) { toast('未识别到款号和价格，禁止拆分', 'err'); return; }
  if (!CP.allStyles || CP.allStyles.length < 2) { toast('未检测到套装，无需拆分', 'err'); return; }
  splitSet(CP.allStyles, CP.allPrices);
}

function clearBuilder() {
  $('imgPool').innerHTML = '<span class="empty-hint">-</span>';
  ['prodStyle','prodPrice','prodCopy'].forEach(function(id) { $(id).value = ''; });
}

// ---- Saved ----
function renderSaved() {
  $('savedCount').textContent = P.length;
  var list = $('savedList');
  if (!P.length) { list.innerHTML = '<span class="empty-hint">暂无</span>'; return; }
  list.innerHTML = P.map(function(p, i) {
    var thumb = (p.imgs && p.imgs[0]) ? '<img class="prod-thumb" src="' + esc(p.imgs[0]) + '" />' : '<div class="prod-thumb" style="display:flex;align-items:center;justify-content:center;color:#555">?</div>';
    var firstLine = (p.copy || '').split('\n')[0].substring(0, 30);
    return '<div class="prod-item" onclick="editProduct(' + i + ')">' + thumb +
      '<div class="prod-info"><strong>#' + esc(p.style || '?') + ' ¥' + (p.price||'-') + '</strong>' +
      '<span>' + (p.imgs||[]).length + '图 | ' + esc(firstLine) + '</span></div>' +
      '<button style="background:none;border:none;color:#e74c3c;cursor:pointer;font-size:14px;flex-shrink:0" onclick="event.stopPropagation();removeProduct('+i+')">✕</button></div>';
  }).join('');
}

function editProduct(i) {
  var p = P[i];
  CP = { imgs: p.imgs.slice(), style: p.style, price: p.price, copy: p.copy, category: p.category || '[女装]', detail: p.detail || '' };
  S = {}; SC = {};
  p.sourceIds.forEach(function(id) { S[id] = true; });
  // Update rendered cards to show selection
  document.querySelectorAll('.item-card').forEach(function(card) {
    var cid = card.getAttribute('data-id');
    var sel = !!S[cid];
    card.classList.toggle('selected', sel);
    var check = card.querySelector('.check');
    if (check) check.textContent = sel ? '✓' : '';
  });
  renderBuilder(); updateStatus();
}

function removeProduct(i) { if (confirm('删除?')) { P.splice(i,1); renderSaved(); persistProducts(); rebuildSavedIds(); } }

// ---- AI Process ----
var aiResults = null;  // store AI results for export

$('btnAiProcess').onclick = function() {
  if (!P.length) { toast('没有商品', 'err'); return; }
  if (!aiConfig.apiKey) { toast('请先在 AI 配置中设置 API Key', 'err'); return; }

  // Collect prompts and enabled state
  var prompts = {};
  var enabled = {};
  ['title','subtitle','short','tag','keywords','features'].forEach(function(k) {
    var el = $('aiPrompt_' + k);
    prompts[k] = el ? el.value : '';
    var cb = document.querySelector('.ai-toggle[data-key="' + k + '"]');
    enabled[k] = cb ? cb.checked : true;
  });

  // Filter out already-processed products
  var toProcess = P.filter(function(p) { return !processedIds[p.id]; });
  if (!toProcess.length) {
    toast('所有商品已处理过，无需重复处理', 'ok');
    return;
  }

  var btn = $('btnAiProcess');
  btn.disabled = true; btn.textContent = 'AI处理中...';
  $('aiProcessStatus').textContent = '0 / ' + toProcess.length;
  aiResults = null;

  // Store context for retry
  window._aiContext = { config: aiConfig, products: toProcess, prompts: prompts, enabled: enabled };
  window._aiSseDoneReceived = false;

  api('POST', '/api/ai/process', { config: aiConfig, products: toProcess, prompts, enabled })
    .then(function(initR) {
      if (!initR.ok) {
        $('aiProcessStatus').innerHTML = '<span style="color:#f85149">启动失败</span>';
        toast('AI 处理启动失败', 'err');
        btn.disabled = false; btn.textContent = 'AI 处理';
      }
    }).catch(function(e) {
      $('aiProcessStatus').innerHTML = '<span style="color:#f85149">' + e.message + '</span>';
      btn.disabled = false; btn.textContent = 'AI 处理';
    });
};

// Listen for AI progress via SSE
(function initAiSSE() {
  var es = new EventSource('/api/ai/progress');
  window._aiSseDoneReceived = false;
  es.onmessage = function(e) {
    try {
      var d = JSON.parse(e.data);
      if (d.done) {
        if (window._aiSseDoneReceived) return;
        window._aiSseDoneReceived = true;
        // Fetch final result
        fetch('/api/ai/result').then(function(r) { return r.json(); }).then(function(r) {
          if (r.ok && r.results) {
            var ctx = window._aiContext;
            var toProcess = ctx ? ctx.products : P;
            r.results.forEach(function(res) {
              var prod = toProcess[res.index];
              if (prod) {
                processedIds[prod.id] = true;
                res._pid = prod.id;
              }
            });
            if (!aiResults) aiResults = [];
            aiResults.push.apply(aiResults, r.results);
            aiDone = true;
            refreshCardMarks();

            var btn = $('btnAiProcess');
            if (r.failed && r.failed.length) {
              window._lastFailed = {
                config: (ctx || {}).config, products: toProcess,
                prompts: (ctx || {}).prompts, enabled: (ctx || {}).enabled,
                failed: r.failed
              };
              var statusHtml = '<span style="color:#d2991d">⚠ ' + r.failed.length + ' 个字段为空</span>' +
                '<br><button id="btnRetryFailed" style="margin-top:4px;background:#d2991d;color:#000;border:none;padding:4px 10px;border-radius:4px;cursor:pointer;font-size:11px">手动重试失败字段</button>';
              $('aiProcessStatus').innerHTML = statusHtml;
              var retryBtn = document.getElementById('btnRetryFailed');
              if (retryBtn) retryBtn.onclick = retryFailedFields;
              toast('AI 处理完成，但有 ' + r.failed.length + ' 个字段失败', 'err');
              btn.disabled = false; btn.textContent = 'AI 处理';
            } else {
              $('aiProcessStatus').innerHTML = '<span style="color:#7ee787">AI 处理完成 (' + r.results.length + ' 个)</span>';
              toast('AI 处理完成', 'ok');
              btn.disabled = false;
              btn.textContent = 'AI 处理';
              btn.style.background = '';
              scheduleStateSave();
            }
          }
        });
      } else {
        $('aiProcessStatus').textContent = d.index + ' / ' + d.total;
      }
    } catch(ex) {}
  };
})();

// ---- Split set into individual products ----
function splitSet(styles, prices) {
  if (!CP) return;
  var total = styles.length;
  var saved = 0;

  styles.forEach(function(st, idx) {
    // Create a product for each style
    var p = {
      id: Date.now() + idx,
      imgs: CP.imgs.slice(),
      style: st,
      price: prices[idx] || prices[0] || CP.price || '',
      copy: CP.copy,
      category: CP.category || '[女装]',
      detail: CP.detail || '',
      sourceIds: Object.keys(S)
    };
    P.push(p);
    if (p.sourceIds) {
      p.sourceIds.forEach(function(id) { savedIds[id] = true; });
    }
    saved++;
  });

  persistProducts();
  renderSaved();
  rebuildSavedIds();
  clearBuilder();
  CP = null;
  S = {}; SC = {};

  var btn = $('btnSplitSet');
  if (btn) btn.remove();

  toast('已拆分为 ' + saved + ' 个单品并保存', 'ok');
}

// ---- Retry failed fields ----
function retryFailedFields() {
  var info = window._lastFailed;
  if (!info || !info.failed || !info.failed.length) {
    toast('没有需要重试的字段', 'ok');
    return;
  }

  var btn = document.getElementById('btnRetryFailed');
  if (btn) { btn.disabled = true; btn.textContent = '重试中...'; }

  // Only retry products that actually had failures
  var failedIndices = {};
  info.failed.forEach(function(f) { failedIndices[f.productIndex] = true; });
  var retryProducts = info.products.filter(function(p, i) { return failedIndices[i]; });

  // Only enable fields that actually failed
  var failedFields = {};
  info.failed.forEach(function(f) { failedFields[f.field] = true; });
  var retryEnabled = {};
  Object.keys(info.enabled).forEach(function(k) { retryEnabled[k] = !!failedFields[k]; });

  var retryConfig = Object.assign({}, info.config);
  window._aiContext = { config: retryConfig, products: retryProducts, prompts: info.prompts, enabled: retryEnabled };
  window._aiSseDoneReceived = false;
  $('aiProcessStatus').textContent = '0 / ' + retryProducts.length;

  api('POST', '/api/ai/process', { config: retryConfig, products: retryProducts, prompts: info.prompts, enabled: retryEnabled })
    .catch(function(e) { console.error(e); });
}

// ---- Export ----
$('btnExport').onclick = function() {
  if (!P.length) { toast('没有商品', 'err'); return; }

  // Build AI results keyed by product id
  var aiById = {};
  if (aiResults) {
    aiResults.forEach(function(r) {
      if (r._pid) aiById[r._pid] = r.fields;
    });
  }

  // Attach AI fields to each product
  var exportProds = P.map(function(p) {
    return Object.assign({}, p, { aiFields: aiById[p.id] || null });
  });

  var exportData = { products: exportProds, hasAI: !!aiResults };
  api('POST', '/api/export', exportData).then(function(r) {
    if (r.error) { toast('失败: ' + r.error, 'err'); return; }
    api('POST', '/api/log', { action: 'export', detail: '导出 ' + P.length + ' 个商品到 ' + r.path });
    P = [];
    persistProducts();
    renderSaved();
    toast('已导出并清空列表 (标记保留)', 'ok');
  }).catch(function(e) { toast('失败: ' + e.message, 'err'); });
};

// ---- Refresh ----
$('btnRefresh').onclick = function() {
  if (!confirm('从网站获取近一周数据？')) return;
  var btn = $('btnRefresh'); btn.disabled = true; btn.textContent = '刷新中...';
  $('stats').textContent = '获取中...';
  api('POST', '/api/fetch').then(function(r) {
    if (r.error) { toast('刷新失败: ' + r.error, 'err'); }
    else {
      toast('新增 ' + r.count + ' 条', 'ok');
      api('POST', '/api/log', { action: 'refresh', detail: '新增 ' + r.count + ' 条' });
      api('GET', '/api/dates').then(function(dates) {
        var sel = $('dateFilter'); sel.innerHTML = '<option value="">全部日期</option>';
        dates.forEach(function(d) { var o = document.createElement('option'); o.value = d; o.textContent = d; sel.appendChild(o); });
        loadPage({ offset: 0 });
      });
    }
    btn.disabled = false; btn.textContent = '刷新数据';
  });
};

// ---- Login ----
$('btnLogin').onclick = function() {
  $('btnLogin').disabled = true;
  $('btnLogin').textContent = '等待登录...';
  api('POST', '/api/login').then(function() {
    toast('请在弹出的浏览器窗口扫码', 'ok');
  });
};

// Listen for login completion via SSE
(function initLoginSSE() {
  var es = new EventSource('/api/login/status');
  es.onmessage = function(e) {
    try {
      var d = JSON.parse(e.data);
      if (d.done) {
        $('btnLogin').disabled = false;
        $('btnLogin').textContent = '重新登录';
        toast('登录成功！Cookie 已更新', 'ok');
        es.close();
        initLoginSSE();
      }
    } catch(ex) {}
  };
})();

// ---- Toast ----
function toast(msg, type) {
  var t = $('toast');
  t.textContent = msg; t.className = type === 'err' ? 'toast-err' : 'toast-ok';
  t.style.display = 'block';
  clearTimeout(t._timer);
  t._timer = setTimeout(function() { t.style.display = 'none'; }, 2500);
}

// ---- Tabs ----
document.querySelectorAll('.tab').forEach(function(tab) {
  tab.onclick = function() {
    document.querySelectorAll('.tab').forEach(function(t) { t.classList.remove('active'); });
    document.querySelectorAll('.tab-content').forEach(function(c) { c.classList.remove('active'); });
    tab.classList.add('active');
    var target = $('tab-' + tab.getAttribute('data-tab'));
    if (target) target.classList.add('active');
  };
});

// ---- AI Panel ----
var aiConfig = { apiKey: '', model: 'deepseek-v4-flash' };

function setAiDot(ok) {
  var dot = $('aiStatusDot');
  dot.className = 'ai-dot ' + (ok ? 'ok' : 'err');
  dot.title = ok ? 'AI 已连接' : 'AI 未连接';
}

api('GET', '/api/ai/config').then(function(json) {
  try {
    var c = JSON.parse(json);
    if (c.apiKey) { aiConfig.apiKey = c.apiKey; $('aiKey').value = c.apiKey; }
    if (c.model) { aiConfig.model = c.model; $('aiModel').value = c.model; }
    if (c.prompts) {
      Object.keys(c.prompts).forEach(function(k) {
        var el = $('aiPrompt_' + k);
        if (el) el.value = c.prompts[k];
      });
    }
    if (c.prompts_enabled) {
      Object.keys(c.prompts_enabled).forEach(function(k) {
        var cb = document.querySelector('.ai-toggle[data-key="' + k + '"]');
        if (cb) cb.checked = c.prompts_enabled[k];
      });
    }
    if (c.apiKey) setAiDot(true);
  } catch(e) {}
});

$('btnAiSave').onclick = function() {
  aiConfig.apiKey = $('aiKey').value.trim(); aiConfig.model = $('aiModel').value;
  aiConfig.prompts = {};
  ['title','subtitle','short','tag','keywords','features'].forEach(function(k) {
    var el = $('aiPrompt_' + k);
    if (el) aiConfig.prompts[k] = el.value;
  });
  aiConfig.prompts_enabled = {};
  document.querySelectorAll('.ai-toggle').forEach(function(cb) {
    aiConfig.prompts_enabled[cb.getAttribute('data-key')] = cb.checked;
  });
  api('POST', '/api/ai/config', aiConfig).then(function() {
    setAiDot(true);
    toast('AI 配置已保存', 'ok');
  });
};

$('btnAiTest').onclick = function() {
  var cfg = { apiKey: $('aiKey').value.trim(), model: $('aiModel').value };
  if (!cfg.apiKey) { toast('请先输入 API Key', 'err'); return; }
  $('btnAiTest').disabled = true; $('btnAiTest').textContent = '连接中...'; $('aiResult').textContent = '';
  api('POST', '/api/ai/test', cfg).then(function(r) {
    $('btnAiTest').disabled = false; $('btnAiTest').textContent = '测试连接';
    if (r.ok) {
      $('aiResult').innerHTML = '<span style="color:#7ee787">连接成功</span> ' + esc(r.reply||'') + ' (' + (r.model||cfg.model) + ')';
      setAiDot(true); $('aiStatus').textContent = '已连接';
    } else {
      $('aiResult').innerHTML = '<span style="color:#f85149">失败: ' + esc(r.error||'') + '</span>';
      setAiDot(false);
    }
  });
};

// Enter = save, Shift+Enter = split
document.addEventListener('keydown', function(e) {
  if (e.key === 'Enter' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
    e.preventDefault();
    if (e.shiftKey) { doSplitSave(); } else { doSave(); }
  }
});

// Right-click = save, Shift+right-click = split
$('item-panel').addEventListener('contextmenu', function(e) {
  e.preventDefault();
  if (e.shiftKey) { doSplitSave(); } else { doSave(); }
});

clearBuilder();
