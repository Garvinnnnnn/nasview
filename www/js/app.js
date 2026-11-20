/* NodePulse · 主应用逻辑 */
(function () {
  'use strict';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };

  var state = { nodes: [], activeId: '', tab: 'dashboard', updatedAt: '' };
  var gradSeq = 0;

  /* ---------------- 通用工具 ---------------- */
  function fmtSize(gb) {
    gb = Number(gb) || 0;
    return gb >= 1024 ? (gb / 1024).toFixed(1) + ' TB' : gb.toFixed(gb < 10 ? 1 : 0) + ' GB';
  }
  function fmtRate(mb) { return (Number(mb) || 0).toFixed(1) + ' MB/s'; }
  function healthClass(h) {
    if (h === '良好' || h === '正常' || h === '健康') return 'ok';
    if (h === '注意' || h === '警告' || h === '预警') return 'warn';
    if (h === '危险' || h === '失败' || h === '错误') return 'danger';
    return 'mute';
  }
  function ring(pct, cls, label, sub, size) {
    var C = 2 * Math.PI * 26;
    var p = Math.max(0, Math.min(100, Number(pct) || 0));
    var off = (C * (1 - p / 100)).toFixed(1);
    var wrapStyle = size ? ' style="width:' + size + 'px;height:' + size + 'px"' : '';
    return '<div class="ring-wrap"' + wrapStyle + '>' +
      '<svg class="ring ' + (cls || '') + '" viewBox="0 0 64 64">' +
      '<circle class="ring-bg" cx="32" cy="32" r="26"/>' +
      '<circle class="ring-fg" cx="32" cy="32" r="26" stroke-dasharray="' + C.toFixed(1) + '" stroke-dashoffset="' + off + '"/>' +
      '</svg><div class="ring-center"><b>' + esc(label) + '</b>' + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</div></div>';
  }
  function spark(data, color) {
    var arr = (data && data.length ? data : [0, 0]).map(Number);
    var w = 300, h = 46, n = arr.length;
    var min = Math.min.apply(null, arr), max = Math.max.apply(null, arr);
    var range = max - min || 1;
    var pts = arr.map(function (v, i) {
      var x = n === 1 ? 0 : (i / (n - 1)) * w;
      var y = h - 4 - ((v - min) / range) * (h - 10);
      return x.toFixed(1) + ',' + y.toFixed(1);
    }).join(' ');
    var gid = 'sparkgrad' + (++gradSeq);
    return '<svg class="spark" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none">' +
      '<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="' + color + '" stop-opacity=".32"/>' +
      '<stop offset="1" stop-color="' + color + '" stop-opacity="0"/></linearGradient></defs>' +
      '<path d="M0,' + h + ' L' + pts.replace(/ /g, ' L') + ' L' + w + ',' + h + ' Z" fill="url(#' + gid + ')"/>' +
      '<polyline points="' + pts + '" fill="none" stroke="' + color + '" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round"/>' +
      '</svg>';
  }
  function bar(pct, cls) {
    var p = Math.max(0, Math.min(100, Number(pct) || 0));
    return '<div class="bar"><div class="bar-fill ' + (cls || '') + '" style="width:' + p + '%"></div></div>';
  }
  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.classList.remove('show'); }, 2600);
  }
  function openSheet(html) {
    $('#sheet').innerHTML = '<div class="sheet-handle"></div>' + html;
    $('#sheet').classList.remove('hidden');
    $('#sheet-backdrop').classList.remove('hidden');
    Icons.hydrate($('#sheet'));
  }
  function closeSheet() {
    $('#sheet').classList.add('hidden');
    $('#sheet-backdrop').classList.add('hidden');
  }
  function currentNode() {
    return state.nodes.find(function (n) { return n.id === state.activeId; }) || state.nodes[0] || null;
  }

  /* ---------------- 启动 ---------------- */
  function boot() {
    Icons.hydrate();
    Provider.applyTheme();
    setTimeout(function () {
      var cfg = Provider.config();
      $('#screen-splash').classList.add('hidden');
      if (cfg.onboarded) enterApp(); else showOnboarding();
    }, 1150);
  }
  function showOnboarding() {
    $('#screen-onboarding').classList.remove('hidden');
    Icons.hydrate($('#screen-onboarding'));
  }
  function enterApp() {
    $('#screen-onboarding').classList.add('hidden');
    $('#screen-app').classList.remove('hidden');
    loadNodes();
  }

  function loadNodes(silent) {
    if (!silent) { state.nodes = []; renderAll(); }
    return Provider.getNodes().then(function (nodes) {
      state.nodes = nodes || [];
      var cfg = Provider.config();
      var active = state.nodes.find(function (n) { return n.id === cfg.active; }) ||
        state.nodes.find(function (n) { return n.online; }) || state.nodes[0];
      state.activeId = active ? active.id : '';
      Provider.set('active', state.activeId);
      state.updatedAt = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
      updateHeader();
      renderAll();
    }).catch(function (err) {
      toast('连接失败：' + err.message + ' · 已回退演示数据');
      Provider.setMode('demo');
      state.nodes = window.MockData.getNodes();
      state.activeId = state.nodes[0] ? state.nodes[0].id : '';
      updateHeader(); renderAll();
    });
  }

  function updateHeader() {
    var n = currentNode();
    if (!n) return;
    $('#ns-name').textContent = n.name;
    $('#ns-sub').textContent = (n.online ? '在线' : '离线') + ' · ' + n.connType +
      (state.updatedAt ? ' · 更新于 ' + state.updatedAt : '');
    $('#ns-dot').classList.toggle('off', !n.online);
  }

  function renderAll() {
    var n = currentNode();
    $('#page-dashboard').innerHTML = n ? renderDashboard(n) : emptyDashboard();
    $('#page-nodes').innerHTML = renderNodes();
    $('#page-settings').innerHTML = renderSettings();
    $$('.page').forEach(function (p) { Icons.hydrate(p); });
    bindPageEvents();
  }

  /* ---------------- 总览页 ---------------- */
  function emptyDashboard() {
    return '<div class="card" style="text-align:center;padding:40px 18px">' +
      '<div style="color:var(--text-3);margin-bottom:10px">' + Icons.svg('server', 34) + '</div>' +
      '<b>还没有节点</b><p style="color:var(--text-2);font-size:12px">扫码或输入 TOKEN 添加你的第一台设备</p>' +
      '<button class="btn primary" id="empty-add" style="margin-top:12px;width:100%">添加节点</button></div>';
  }

  function renderDashboard(n) {
    var c = Provider.config();
    var online = n.online;
    var svcOk = n.services.ok || 0, svcTotal = n.services.total || 0;
    var html = '';

    // 离线横幅
    if (!online) {
      html += '<div class="card" style="border-color:rgba(255,107,122,.3);background:linear-gradient(135deg,rgba(255,107,122,.1),var(--card));display:flex;gap:12px;align-items:center">' +
        '<span style="color:var(--danger)">' + Icons.svg('alert-triangle', 22) + '</span>' +
        '<div style="flex:1"><b style="font-size:13px">节点当前离线</b>' +
        '<small style="color:var(--text-2);font-size:11px;display:block;margin-top:2px">上次在线：' + esc(n.lastSeen) + ' · 以下为最近一次上报的数据</small></div></div>';
    }

    // 状态大卡
    html += '<div class="hero-card"><div class="hero-top"><div>' +
      '<div class="hero-hello">' + esc(n.name) + ' · ' + esc(n.os) + '</div>' +
      '<div class="hero-status">' + (online ? '运行' : '离线') + ' <span class="em">' + (online ? '正常' : '未连接') + '</span></div>' +
      '</div><div class="hero-icon">' + Icons.svg(online ? 'activity' : 'alert-triangle', 24) + '</div></div>' +
      '<div class="hero-chips">' +
      '<div class="hero-chip"><small>服务状态</small><b class="' + (svcOk === svcTotal && svcTotal > 0 ? 'good' : '') + '">' + svcOk + ' / ' + svcTotal + '</b></div>' +
      '<div class="hero-chip"><small>运行时长</small><b>' + esc(n.uptime) + '</b></div>' +
      '<div class="hero-chip"><small>设备类型</small><b style="font-size:12px">' + esc(n.type) + '</b></div>' +
      '</div></div>';

    // 三环：CPU / 内存 / 负载
    var load = n.cpu.load && n.cpu.load[0] != null ? n.cpu.load[0] : 0;
    var loadPct = Math.min(100, (load / (n.cpu.cores || 1)) * 100);
    html += '<div class="stat-grid">' +
      '<div class="stat-card">' + ring(n.cpu.usage, '', n.cpu.usage + '%', 'CPU') + '<b>处理器</b><small>' + esc(n.cpu.cores || '—') + ' 核</small></div>' +
      '<div class="stat-card">' + ring(n.memory.usage, 'c2', n.memory.usage + '%', '内存') + '<b>内存</b><small>' + esc(n.memory.used) + '/' + esc(n.memory.total) + ' GB</small></div>' +
      '<div class="stat-card">' + ring(loadPct, 'c3', load.toFixed(2), '负载') + '<b>系统负载</b><small>1 分钟均值</small></div>' +
      '</div>';

    // 性能资源
    html += '<div class="card"><div class="card-head"><div class="card-title">' + Icons.svg('cpu', 17) + '性能资源</div>' +
      '<div class="card-sub">' + esc(n.cpu.model) + '</div></div>' +
      '<div class="metric"><div class="metric-top"><span>CPU 占用</span><b>' + n.cpu.usage + '%</b></div>' + bar(n.cpu.usage, n.cpu.usage > 80 ? 'danger' : '') + '</div>' +
      '<div class="metric"><div class="metric-top"><span>内存占用</span><b>' + n.memory.usage + '% · ' + n.memory.used + ' GB</b></div>' + bar(n.memory.usage, n.memory.usage > 85 ? 'warn' : 'c2') + '</div>' +
      '<div class="metric"><div class="metric-top"><span>负载 (1 / 5 / 15 分钟)</span><b>' + (n.cpu.load || []).map(function (x) { return Number(x).toFixed(2); }).join(' / ') + '</b></div></div>' +
      spark(n.cpu.history, '#38d6c4') + '</div>';

    // 存储
    var s = n.storage;
    html += '<div class="card"><div class="card-head"><div class="card-title">' + Icons.svg('hard-drive', 17) + '存储状态</div>' +
      '<div class="card-sub">' + s.pools.length + ' 个存储池</div></div>' +
      '<div class="storage-top"><div class="storage-ring">' + ring(s.usage, '', s.usage + '%', '已用') + '</div>' +
      '<div class="storage-info"><div class="big">' + fmtSize(s.used) + ' <small>/ ' + fmtSize(s.total) + '</small></div>' +
      '<p>可用 ' + fmtSize(Math.max(0, s.total - s.used)) + ' · ' + esc(n.type === 'NAS' ? 'Btrfs / ext4' : '本地文件系统') + '</p></div></div>';
    if (s.pools.length) {
      html += '<div class="pool-list">';
      s.pools.forEach(function (p) {
        html += '<div class="pool-row"><span class="pi">' + Icons.svg('database', 15) + '</span>' +
          '<div class="pn"><b>' + esc(p.name) + '</b><small>' + esc(p.fs) + ' · ' + fmtSize(p.used) + ' / ' + fmtSize(p.total) + '</small>' +
          bar(p.usage, p.usage > 85 ? 'warn' : '') + '</div>' +
          '<div class="pv">' + p.usage + '%<br/><span style="color:var(--text-3)">已用</span></div></div>';
      });
      html += '</div>';
    }
    html += '</div>';

    // 硬盘 SMART
    html += '<div class="card"><div class="card-head"><div class="card-title">' + Icons.svg('hard-drive', 17) + '硬盘 SMART</div>' +
      '<div class="card-sub">' + n.disks.length + ' 块硬盘</div></div>';
    if (n.disks.length) {
      n.disks.forEach(function (d) {
        var hc = healthClass(d.health);
        html += '<div class="disk-item"><div class="disk-head">' +
          '<span class="disk-ico">' + Icons.svg(d.type === 'SSD' ? 'zap' : 'hard-drive', 17) + '</span>' +
          '<div class="disk-name"><b>' + esc(d.name) + ' · ' + esc(d.size) + '</b><small>' + esc(d.model) + '</small></div>' +
          '<span class="badge ' + hc + '"><i class="dot"></i>' + esc(d.health) + '</span>' +
          '<span class="disk-temp ' + (d.temp >= 45 ? 'hot' : '') + '">' + (d.temp ? d.temp + '°C' : '—') + '</span>' +
          '</div><div class="disk-meta">' + (d.smart || []).map(function (x) { return '<span class="chip">' + esc(x) + '</span>'; }).join('') + '</div></div>';
      });
    } else {
      html += '<div style="color:var(--text-3);font-size:12px;text-align:center;padding:10px">暂无硬盘信息</div>';
    }
    html += '</div>';

    // 风扇与温度
    html += '<div class="card"><div class="card-head"><div class="card-title">' + Icons.svg('thermometer', 17) + '风扇与温度</div>' +
      '<div class="card-sub">最高 ' + (n.temps.max || 0) + '°C</div></div>' +
      '<div class="temp-grid">' +
      '<div class="temp-item"><small>' + Icons.svg('cpu', 12) + 'CPU 温度</small><div class="val ' + (n.temps.cpu >= 60 ? 'hot' : '') + '">' + n.temps.cpu + '<span> °C</span></div></div>' +
      '<div class="temp-item"><small>' + Icons.svg('hard-drive', 12) + '硬盘温度</small><div class="val ' + (n.temps.disk >= 45 ? 'hot' : '') + '">' + n.temps.disk + '<span> °C</span></div></div>' +
      '</div>';
    if (n.fans.length) {
      html += '<div style="margin-top:14px;padding-top:4px">';
      n.fans.forEach(function (f) {
        html += '<div class="fan-row"><div class="fl">' + Icons.svg('fan', 14) + esc(f.name) + '</div>' +
          '<div class="fr">' + (f.rpm ? f.rpm.toLocaleString() + ' RPM' : '—') + '</div></div>';
      });
      html += '</div>';
    }
    html += '</div>';

    // 网络
    var net = n.network;
    html += '<div class="card"><div class="card-head"><div class="card-title">' + Icons.svg('wifi', 17) + '网络与连接</div>' +
      '<div class="card-sub">' + esc(net.speed) + '</div></div>' +
      '<div class="ip-row"><div class="ip">' + Icons.svg('globe', 15) + '<b>' + esc(net.ip) + '</b><small>' + esc(net.mask) + '</small></div>' +
      '<span class="badge ok"><i class="dot"></i>' + (online ? '已连接' : '已断开') + '</span></div>' +
      '<div class="net-grid">' +
      '<div class="net-cell"><small>下载速率 ↓</small><b class="down">' + fmtRate(net.rx) + '</b></div>' +
      '<div class="net-cell"><small>上传速率 ↑</small><b class="up">' + fmtRate(net.tx) + '</b></div>' +
      '<div class="net-cell"><small>活动连接数</small><b>' + net.conns + '</b></div>' +
      '<div class="net-cell"><small>MAC 地址</small><b style="font-size:11px">' + esc(net.mac) + '</b></div>' +
      '</div></div>';

    // 容器
    html += '<div class="card"><div class="card-head"><div class="card-title">' + Icons.svg('box', 17) + '容器服务</div>' +
      '<div class="card-sub">Docker · ' + n.containers.length + ' 个容器</div></div>';
    if (n.containers.length) {
      n.containers.forEach(function (ct) {
        var running = ct.status === '运行中';
        html += '<div class="ct-item"><div class="ct-ico ' + (ct.warn ? 'warn' : '') + '">' + Icons.svg('box', 16) + '</div>' +
          '<div class="ct-main"><b>' + esc(ct.name) + '</b><small>' + esc(ct.image) + ' · ' + esc(ct.uptime) + '</small></div>' +
          '<span class="ct-state badge ' + (running ? 'ok' : 'warn') + '"><i class="dot"></i>' + esc(ct.status) + '</span></div>';
      });
    } else {
      html += '<div style="color:var(--text-3);font-size:12px;text-align:center;padding:10px">未检测到容器</div>';
    }
    html += '</div>';

    html += '<div style="text-align:center;color:var(--text-3);font-size:10.5px;padding:6px 0 2px">NodePulse · 节点脉搏 · ' + (c.mode === 'api' ? '实时数据' : '演示数据') + '</div>';
    return html;
  }

  /* ---------------- 节点页 ---------------- */
  function renderNodes() {
    var html = '<div class="section-label">我的节点 · ' + state.nodes.length + '</div>';
    if (!state.nodes.length) {
      html += '<div class="card" style="text-align:center;color:var(--text-3);font-size:12px">暂无节点</div>';
    }
    state.nodes.forEach(function (n) {
      var current = n.id === state.activeId;
      html += '<div class="node-card ' + (current ? 'current' : '') + '" data-node="' + esc(n.id) + '">' +
        '<div class="nc-top"><div class="nc-av ' + (n.online ? '' : 'gray') + '">' + Icons.svg('server', 20) + '</div>' +
        '<div class="nc-info"><b>' + esc(n.name) + (current ? ' <span class="badge ok" style="margin-left:2px">当前</span>' : '') + '</b>' +
        '<small>' + esc(n.location) + ' · ' + esc(n.ip) + '</small></div>' +
        '<span class="badge ' + (n.online ? 'ok' : 'mute') + '"><i class="dot"></i>' + (n.online ? '在线' : '离线') + '</span></div>' +
        '<div class="nc-stats">' +
        '<div class="nc-stat"><b>' + (n.online ? n.cpu.usage + '%' : '—') + '</b><small>CPU</small></div>' +
        '<div class="nc-stat"><b>' + (n.online ? n.memory.usage + '%' : '—') + '</b><small>内存</small></div>' +
        '<div class="nc-stat"><b>' + (n.online ? n.storage.usage + '%' : '—') + '</b><small>存储</small></div>' +
        '</div></div>';
    });
    html += '<button class="add-node" id="add-node">' + Icons.svg('plus', 17) + '添加新节点</button>';
    html += '<div style="text-align:center;color:var(--text-3);font-size:11px;line-height:1.7;margin-top:18px">' +
      '支持 NAS / 服务器 / 迷你主机 / 其他 Linux 设备<br/>在服务端生成 TOKEN 后即可扫码绑定</div>';
    return html;
  }

  /* ---------------- 设置页 ---------------- */
  function renderSettings() {
    var c = Provider.config();
    var html = '';
    html += '<div class="about-logo"><div class="brand-mark">' +
      '<svg viewBox="0 0 64 64" width="48" height="48"><defs><linearGradient id="lg2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5eead4"/><stop offset="1" stop-color="#3b82f6"/></linearGradient></defs>' +
      '<rect x="4" y="4" width="56" height="56" rx="16" fill="url(#lg2)"/><path d="M14 33 h9 l5 -12 l7 22 l5 -12 h10" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg></div>' +
      '<b>NodePulse</b><small>节点脉搏 · v1.0.0 (sideload build)</small></div>';

    html += '<div class="settings-group"><h3>连接设置</h3><div class="setting-card">' +
      '<div class="setting-row"><span class="sr-ico">' + Icons.svg('database', 16) + '</span>' +
      '<div class="sr-label"><b>数据来源</b><small>演示模式使用内置模拟数据</small></div>' +
      '<div class="segment" id="seg-mode"><button data-mode="demo" class="' + (c.mode === 'demo' ? 'active' : '') + '">演示</button>' +
      '<button data-mode="api" class="' + (c.mode === 'api' ? 'active' : '') + '">真实 NAS</button></div></div>' +

      '<div class="setting-row" data-edit="server"><span class="sr-ico">' + Icons.svg('globe', 16) + '</span>' +
      '<div class="sr-label"><b>服务端地址</b><small>' + esc(c.server || '未设置') + '</small></div>' +
      '<span class="sr-value">' + Icons.svg('chevron-right', 16) + '</span></div>' +

      '<div class="setting-row" data-edit="token"><span class="sr-ico">' + Icons.svg('key', 16) + '</span>' +
      '<div class="sr-label"><b>连接 TOKEN</b><small>' + (c.token ? esc(c.token.slice(0, 6) + '••••••' + c.token.slice(-4)) : '未设置') + '</small></div>' +
      '<span class="sr-value">' + Icons.svg('chevron-right', 16) + '</span></div>' +

      '<div class="setting-row" id="row-test"><span class="sr-ico">' + Icons.svg('link', 16) + '</span>' +
      '<div class="sr-label"><b>测试连接</b><small>校验服务端与 TOKEN 是否可用</small></div>' +
      '<span class="sr-value">' + Icons.svg('chevron-right', 16) + '</span></div>' +
      '</div></div>';

    html += '<div class="settings-group"><h3>外观</h3><div class="setting-card">' +
      '<div class="setting-row"><span class="sr-ico">' + Icons.svg(c.theme === 'light' ? 'sun' : 'moon', 16) + '</span>' +
      '<div class="sr-label"><b>浅色外观</b><small>切换界面配色</small></div>' +
      '<div class="switch ' + (c.theme === 'light' ? 'on' : '') + '" id="sw-theme"></div></div>' +
      '</div></div>';

    html += '<div class="settings-group"><h3>节点管理</h3><div class="setting-card">' +
      '<div class="setting-row" id="row-scan"><span class="sr-ico">' + Icons.svg('scan', 16) + '</span>' +
      '<div class="sr-label"><b>扫码添加节点</b><small>扫描服务端生成的绑定二维码</small></div>' +
      '<span class="sr-value">' + Icons.svg('chevron-right', 16) + '</span></div>' +
      '<div class="setting-row" id="row-reset"><span class="sr-ico" style="color:var(--danger);background:rgba(255,107,122,.12)">' + Icons.svg('trash-2', 16) + '</span>' +
      '<div class="sr-label"><b style="color:var(--danger)">清除绑定并重置</b><small>删除本地配置，回到引导页</small></div></div>' +
      '</div></div>';

    html += '<div style="text-align:center;color:var(--text-3);font-size:10.5px;line-height:1.8;padding:4px 0 10px">' +
      '非官方仿制演示应用 · 与 NasPulse 无关联<br/>API 契约见 docs/API.md</div>';
    return html;
  }

  /* ---------------- 事件绑定 ---------------- */
  function bindPageEvents() {
    var add = $('#add-node'); if (add) add.onclick = showBindSheet;
    var emptyAdd = $('#empty-add'); if (emptyAdd) emptyAdd.onclick = showBindSheet;

    $$('.node-card').forEach(function (el) {
      el.onclick = function () {
        var id = el.getAttribute('data-node');
        if (id === state.activeId) return;
        state.activeId = id; Provider.set('active', id);
        updateHeader(); renderAll();
        toast('已切换到 ' + (currentNode() ? currentNode().name : '节点'));
      };
    });

    $$('#seg-mode button').forEach(function (b) {
      b.onclick = function () {
        var mode = b.getAttribute('data-mode');
        if (mode === 'api' && !Provider.isConfigured()) {
          toast('请先填写服务端地址和 TOKEN');
          Provider.setMode('demo');
        } else {
          Provider.setMode(mode);
          toast(mode === 'api' ? '已切换到真实 NAS 数据' : '已切换到演示数据');
        }
        renderAll(); loadNodes(true);
      };
    });

    $$('[data-edit]').forEach(function (el) {
      el.onclick = function () { showEditSheet(el.getAttribute('data-edit')); };
    });

    var test = $('#row-test'); if (test) test.onclick = function () {
      var c = Provider.config();
      if (!c.server || !c.token) { toast('请先填写服务端地址和 TOKEN'); return; }
      toast('正在测试连接…');
      Provider.getNodes().then(function () { toast('连接成功 ✓'); })
        .catch(function (e) { toast('连接失败：' + e.message); });
    };

    var sw = $('#sw-theme'); if (sw) sw.onclick = function () {
      var next = Provider.config().theme === 'light' ? 'dark' : 'light';
      Provider.set('theme', next); Provider.applyTheme(); renderAll();
      toast(next === 'light' ? '已切换浅色外观' : '已切换深色外观');
    };

    var scan = $('#row-scan'); if (scan) scan.onclick = showScanSheet;
    var reset = $('#row-reset'); if (reset) reset.onclick = function () {
      openSheet('<h2>清除绑定并重置？</h2><p class="sheet-desc">将删除本机的服务端地址、TOKEN 与节点缓存，回到引导页。此操作只影响 App 本地数据。</p>' +
        '<div class="sheet-actions"><button class="btn primary" id="confirm-reset">确认重置</button>' +
        '<button class="btn ghost" id="cancel-reset">取消</button></div>');
      $('#confirm-reset').onclick = function () {
        ['mode', 'server', 'token', 'onboarded', 'active'].forEach(function (k) { Provider.del(k); });
        closeSheet(); location.reload();
      };
      $('#cancel-reset').onclick = closeSheet;
    };
  }

  /* ---------------- 弹层 ---------------- */
  function showBindSheet() {
    openSheet('<h2>添加节点</h2><p class="sheet-desc">在 NAS 或服务器上运行服务端，生成连接凭证后即可绑定。</p>' +
      '<div class="sheet-actions">' +
      '<button class="btn primary" id="bs-scan">扫码添加节点</button>' +
      '<button class="btn ghost" id="bs-token">使用 TOKEN 连接</button>' +
      '<button class="btn text" id="bs-demo">先用演示数据体验 →</button></div>');
    $('#bs-scan').onclick = showScanSheet;
    $('#bs-token').onclick = showTokenSheet;
    $('#bs-demo').onclick = function () { Provider.setMode('demo'); closeSheet(); loadNodes(); toast('已进入演示模式'); };
  }

  function showScanSheet() {
    openSheet('<h2>扫码添加节点</h2><p class="sheet-desc">将摄像头对准服务端生成的绑定二维码。若当前环境无相机权限，可手动粘贴连接串。</p>' +
      '<div style="width:100%;aspect-ratio:1/1;max-height:230px;border-radius:18px;border:1.5px dashed var(--border-strong);display:grid;place-items:center;color:var(--text-3);background:var(--card-2);margin-bottom:14px">' +
      '<div style="text-align:center">' + Icons.svg('scan', 40) + '<div style="font-size:11px;margin-top:8px">二维码取景区域</div></div></div>' +
      '<div class="field"><label>或粘贴连接串 / TOKEN</label><input class="input" id="qr-input" placeholder="https://192.168.1.10:8787/?token=xxxx 或纯 TOKEN" /></div>' +
      '<div class="sheet-actions"><button class="btn primary" id="qr-ok">解析并连接</button>' +
      '<button class="btn ghost" id="qr-cancel">取消</button></div>');
    $('#qr-ok').onclick = function () {
      var v = $('#qr-input').value.trim();
      if (!v) { toast('请输入连接串或 TOKEN'); return; }
      var parsed = Provider.parseQR(v);
      if (parsed.server) Provider.setServer(parsed.server);
      var token = parsed.token || v;
      doBind(token);
    };
    $('#qr-cancel').onclick = closeSheet;
    // 若原生扫码插件可用则优先调用（可选安装）
    if (window.NodePulseScanner && typeof window.NodePulseScanner.scan === 'function') {
      window.NodePulseScanner.scan().then(function (text) {
        var p = Provider.parseQR(text);
        if (p.server) Provider.setServer(p.server);
        if (p.token) doBind(p.token);
      }).catch(function () {});
    }
  }

  function showTokenSheet() {
    var c = Provider.config();
    openSheet('<h2>使用 TOKEN 连接</h2><p class="sheet-desc">在服务端「连接设置」中生成 TOKEN，粘贴到下方。</p>' +
      '<div class="field"><label>服务端地址</label><input class="input" id="tk-server" placeholder="http://192.168.1.10:8787" value="' + esc(c.server) + '" /></div>' +
      '<div class="field"><label>连接 TOKEN</label><input class="input" id="tk-token" placeholder="粘贴 TOKEN" value="' + esc(c.token) + '" /></div>' +
      '<div class="sheet-actions"><button class="btn primary" id="tk-ok">连接</button>' +
      '<button class="btn ghost" id="tk-cancel">取消</button></div>');
    $('#tk-ok').onclick = function () {
      var server = $('#tk-server').value.trim().replace(/\/+$/, '');
      var token = $('#tk-token').value.trim();
      if (!server || !token) { toast('请填写服务端地址和 TOKEN'); return; }
      Provider.setServer(server);
      doBind(token);
    };
    $('#tk-cancel').onclick = closeSheet;
  }

  function doBind(token) {
    toast('正在校验连接…');
    Provider.bindToken(token).then(function (nodes) {
      Provider.setMode('api');
      closeSheet();
      Provider.set('onboarded', '1');
      state.nodes = nodes;
      state.activeId = nodes[0] ? nodes[0].id : '';
      Provider.set('active', state.activeId);
      updateHeader(); renderAll();
      toast('绑定成功 · 已发现 ' + nodes.length + ' 个节点');
    }).catch(function (err) {
      toast('绑定失败：' + err.message + ' · 可先用演示数据');
    });
  }

  function showEditSheet(field) {
    var c = Provider.config();
    var isToken = field === 'token';
    openSheet('<h2>' + (isToken ? '连接 TOKEN' : '服务端地址') + '</h2>' +
      '<p class="sheet-desc">' + (isToken ? 'TOKEN 仅保存在本机，用于向服务端鉴权。' : '示例：http://192.168.1.10:8787 或 https://your.domain') + '</p>' +
      '<div class="field"><input class="input" id="edit-val" value="' + esc(isToken ? c.token : c.server) + '" placeholder="' + (isToken ? 'TOKEN' : 'http://…') + '" /></div>' +
      '<div class="sheet-actions"><button class="btn primary" id="edit-ok">保存</button>' +
      '<button class="btn ghost" id="edit-cancel">取消</button></div>');
    $('#edit-ok').onclick = function () {
      var v = $('#edit-val').value.trim();
      Provider.set(field, v);
      closeSheet(); renderAll();
      toast('已保存');
      if (Provider.config().mode === 'api') loadNodes(true);
    };
    $('#edit-cancel').onclick = closeSheet;
  }

  /* ---------------- 全局事件 ---------------- */
  $('#btn-demo').onclick = function () {
    Provider.setMode('demo'); Provider.set('onboarded', '1'); enterApp(); toast('已进入演示模式');
  };
  $('#btn-token').onclick = showTokenSheet;
  $('#btn-scan').onclick = showScanSheet;
  $('#sheet-backdrop').onclick = closeSheet;
  $('#btn-refresh').onclick = function () {
    var b = $('#btn-refresh');
    b.classList.add('spinning');
    Provider.refreshNodes(state.nodes).then(function (nodes) {
      state.nodes = nodes; updateHeader(); renderAll();
      state.updatedAt = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
      updateHeader();
      toast('数据已更新');
    }).catch(function (e) { toast('刷新失败：' + e.message); })
      .then(function () { b.classList.remove('spinning'); });
  };
  $('#node-switch').onclick = function () {
    if (!state.nodes.length) { showBindSheet(); return; }
    var html = '<h2>切换节点</h2><p class="sheet-desc">共 ' + state.nodes.length + ' 个设备</p>';
    state.nodes.forEach(function (n) {
      html += '<div class="node-card ' + (n.id === state.activeId ? 'current' : '') + '" data-switch="' + esc(n.id) + '" style="margin-bottom:9px">' +
        '<div class="nc-top"><div class="nc-av ' + (n.online ? '' : 'gray') + '">' + Icons.svg('server', 18) + '</div>' +
        '<div class="nc-info"><b>' + esc(n.name) + '</b><small>' + esc(n.location) + ' · ' + esc(n.ip) + '</small></div>' +
        '<span class="badge ' + (n.online ? 'ok' : 'mute') + '"><i class="dot"></i>' + (n.online ? '在线' : '离线') + '</span></div></div>';
    });
    html += '<button class="btn ghost" id="sw-add" style="margin-top:4px">' + Icons.svg('plus', 16) + ' 添加节点</button>';
    openSheet(html);
    $$('[data-switch]').forEach(function (el) {
      el.onclick = function () {
        state.activeId = el.getAttribute('data-switch');
        Provider.set('active', state.activeId);
        closeSheet(); updateHeader(); renderAll();
      };
    });
    $('#sw-add').onclick = showBindSheet;
  };
  $$('.tab').forEach(function (t) {
    t.onclick = function () {
      var name = t.getAttribute('data-tab');
      state.tab = name;
      $$('.tab').forEach(function (x) { x.classList.toggle('active', x === t); });
      $$('.page').forEach(function (p) { p.classList.toggle('hidden', p.id !== 'page-' + name); });
      $('#app-main').scrollTop = 0;
      Icons.hydrate();
    };
  });

  boot();
})();
