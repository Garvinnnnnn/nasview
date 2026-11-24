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

  function tickClock() {
    var t = $('#dash-clock-time');
    if (!t) return;
    var now = new Date();
    t.textContent = now.toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    var d = $('#dash-clock-date');
    if (d) d.textContent = now.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'long' });
  }

  function renderAll() {
    var n = currentNode();
    $('#page-dashboard').innerHTML = n ? renderDashboard(n) : emptyDashboard();
    $('#page-nodes').innerHTML = renderNodes();
    $('#page-settings').innerHTML = renderSettings();
    $$('.page').forEach(function (p) { Icons.hydrate(p); });
    bindPageEvents();
    tickClock();
  }

  /* ---------------- 总览页 ---------------- */
  function emptyDashboard() {
    return '<div class="card" style="text-align:center;padding:40px 18px">' +
      '<div style="color:var(--text-3);margin-bottom:10px">' + Icons.svg('server', 34) + '</div>' +
      '<b>还没有节点</b><p style="color:var(--text-2);font-size:12px">扫码或输入 TOKEN 添加你的第一台设备</p>' +
      '<button class="btn primary" id="empty-add" style="margin-top:12px;width:100%">添加节点</button></div>';
  }

  function panelHead(icon, title, right) {
    return '<div class="panel-head"><div class="panel-title">' + Icons.svg(icon, 16) + ' ' + title + '</div>' + (right || '') + '</div>';
  }
  function specItem(label, value, cls) {
    return '<div class="spec-item"><small>' + label + '</small><b class="' + (cls || '') + '">' + value + '</b></div>';
  }
  function rateBox(label, value, cls) {
    var ico = cls === 'up' ? 'arrow-up-right' : 'download';
    return '<div class="rate-box ' + cls + '"><small>' + Icons.svg(ico, 12) + ' ' + label + '</small><b>' + value + '</b></div>';
  }
  function summaryCell(label, value, cls) {
    return '<div><small>' + label + '</small><b class="' + (cls || '') + '">' + value + '</b></div>';
  }

  function renderDashboard(n) {
    var c = Provider.config();
    var online = n.online;
    var svcOk = n.services.ok || 0, svcTotal = n.services.total || 0;
    var net = n.network || {};
    var s = n.storage || { used: 0, total: 0, usage: 0, pools: [] };
    var disks = n.disks || [];
    var fans = n.fans || [];
    var containers = n.containers || [];
    var loadArr = (n.cpu.load || [0, 0, 0]).map(function (x) { return Number(x) || 0; });
    while (loadArr.length < 3) loadArr.push(0);
    var loadPct = Math.min(100, (loadArr[0] / (n.cpu.cores || 1)) * 100);
    var onlineNodes = state.nodes.filter(function (x) { return x.online; }).length;
    var totalNodes = state.nodes.length;
    var totalRpm = fans.reduce(function (sum, f) { return sum + (Number(f.rpm) || 0); }, 0);
    var activeFans = fans.filter(function (f) { return Number(f.rpm) > 0; }).length;
    var diskHealthy = disks.filter(function (d) { return healthClass(d.health) === 'ok'; }).length;
    var runningCt = containers.filter(function (ct) { return ct.status === '运行中'; }).length;
    var cpuTemp = Number(n.temps && n.temps.cpu) || 0;
    var tempCls = cpuTemp >= 70 ? 'danger' : cpuTemp >= 60 ? 'warn' : 'ok';
    var tempLabel = cpuTemp >= 70 ? '温度偏高' : cpuTemp >= 60 ? '温度注意' : '温度正常';
    var html = '';

    html += '<div class="dash">';

    if (!online) {
      html += '<div class="notice"><span class="notice-ico">' + Icons.svg('alert-triangle', 22) + '</span>' +
        '<div><b>节点当前离线</b><small>上次在线：' + esc(n.lastSeen) + ' · 以下为最近一次上报的数据</small></div></div>';
    }

    html += '<div class="dash-top">';

    // 时钟卡
    html += '<section class="panel clock-panel">' +
      panelHead('clock', '本地时间', '<span class="status-pill ' + (online ? 'ok' : 'mute') + '"><i class="dot"></i>' + (online ? '在线' : '离线') + '</span>') +
      '<div class="clock-time" id="dash-clock-time">--:--:--</div>' +
      '<div class="clock-date" id="dash-clock-date">正在同步时间</div>' +
      '<div class="clock-foot">' +
        '<span>' + Icons.svg('server', 13) + ' 节点 ' + onlineNodes + ' / ' + totalNodes + ' 在线</span>' +
        '<span>' + Icons.svg('wifi', 13) + ' ' + esc(net.ip || n.ip || '—') + '</span>' +
        '<span>' + Icons.svg('link', 13) + ' ' + esc(n.connType || '—') + '</span>' +
      '</div>' +
      '</section>';

    // 设备信息卡
    html += '<section class="panel identity-panel">' +
      panelHead('server', '设备名称', '<span class="status-pill ' + (online ? 'ok' : 'danger') + '"><i class="dot"></i>' + (online ? '在线' : '离线') + '</span>') +
      '<div class="identity-name">' + esc(n.name) + '</div>' +
      '<div class="identity-sub">NODE ID: ' + esc(n.id) + ' · ' + esc(n.type) + ' · ' + esc(n.location) + '</div>' +
      '<div class="spec-grid">' +
        specItem('CPU SPEC', esc(n.cpu.model) + (n.cpu.cores ? ' · ' + esc(n.cpu.cores) + ' 核' : '')) +
        specItem('MEMORY', esc(n.memory.used) + ' / ' + esc(n.memory.total) + ' GB') +
        specItem('LOCAL IP', esc(net.ip || n.ip || '—')) +
        specItem('UPTIME', esc(n.uptime)) +
        specItem('OS', esc(n.os)) +
        specItem('SERVICES', svcOk + ' / ' + svcTotal + ' 正常', svcOk === svcTotal && svcTotal > 0 ? 'text-ok' : '') +
      '</div>' +
      '</section>';

    html += '</div>'; // dash-top

    html += '<div class="dash-grid">';

    // 资源负载
    html += '<section class="panel resource-panel">' +
      panelHead('activity', '资源负载', '<span class="status-pill ' + (loadPct > 85 ? 'warn' : 'ok') + '"><i class="dot"></i>' + (loadPct > 85 ? '负载偏高' : '负载正常') + '</span>') +
      '<div class="resource-row">' +
        '<div class="resource-metric"><small>CPU LOAD</small><b>' + (Number(n.cpu.usage) || 0) + '%</b>' + bar(n.cpu.usage, n.cpu.usage > 80 ? 'danger' : '') + '</div>' +
        '<div class="resource-metric"><small>MEMORY</small><b>' + (Number(n.memory.usage) || 0) + '%</b>' + bar(n.memory.usage, n.memory.usage > 85 ? 'warn' : 'c2') + '</div>' +
      '</div>' +
      '<div class="resource-foot"><span>AVG <b>' + loadArr.map(function (x) { return x.toFixed(2); }).join(' / ') + '</b></span><span>UP <b>' + esc(n.uptime) + '</b></span></div>' +
      '</section>';

    // 网络
    html += '<section class="panel network-panel">' +
      panelHead('wifi', '网络', '<span class="panel-sub">' + esc(net.speed || '—') + '</span>') +
      '<div class="net-iface">INTERFACE · ' + esc(net.ip || n.ip || '—') + ' / ' + esc(net.mask || '—') + '</div>' +
      '<div class="net-body">' +
        '<div class="net-rates">' +
          rateBox('上传 UPLOAD', fmtRate(net.tx), 'up') +
          rateBox('下载 DOWNLOAD', fmtRate(net.rx), 'down') +
        '</div>' +
        '<div class="net-side">' +
          '<div class="net-stat"><small>活动连接</small><b>' + (Number(net.conns) || 0) + '</b></div>' +
          '<div class="net-stat"><small>MAC</small><b>' + esc(net.mac || n.mac || '—') + '</b></div>' +
          '<div class="net-stat"><small>连接状态</small><b class="' + (online ? 'text-ok' : 'text-danger') + '">' + (online ? '已连接' : '已断开') + '</b></div>' +
        '</div>' +
      '</div>' +
      '</section>';

    // 性能
    var dots = '';
    for (var i = 0; i < 5; i++) dots += '<span class="fan-dot' + (i < Math.min(5, activeFans) ? ' on' : '') + '"></span>';
    html += '<section class="panel performance-panel">' +
      panelHead('gauge', '性能', '<span class="status-pill ' + tempCls + '"><i class="dot"></i>' + tempLabel + '</span>') +
      '<div class="perf-main">' +
        '<div><small>CPU 温度</small><b class="' + (cpuTemp >= 60 ? 'text-warn' : '') + '">' + cpuTemp + '<em>°C</em></b></div>' +
        '<div><small>风扇总转速</small><b>' + totalRpm.toLocaleString() + '<em>RPM</em></b></div>' +
      '</div>' +
      '<div class="fan-dots">' + dots + '</div>' +
      '<div class="perf-spark">' + spark(n.cpu.history, '#3ddc97') + '</div>' +
      '</section>';

    // 风扇
    var fanRows = fans.length ? fans.map(function (f) {
      return '<div class="fan-row"><div class="fl">' + Icons.svg('fan', 13) + ' ' + esc(f.name) + '</div>' +
        '<div class="fr">' + (f.rpm ? Number(f.rpm).toLocaleString() + ' RPM' : '—') + '</div></div>';
    }).join('') : '<div class="empty-line">未检测到风扇</div>';
    html += '<section class="panel fans-panel">' +
      panelHead('fan', '风扇', '<span class="panel-sub">' + fans.length + ' 路</span>') +
      '<div class="fan-total"><b>' + totalRpm.toLocaleString() + '</b><span>RPM</span></div>' +
      '<div class="fan-list">' + fanRows + '</div>' +
      '</section>';

    // 容器
    var ctRows = containers.length ? containers.slice(0, 4).map(function (ct) {
      var running = ct.status === '运行中';
      return '<div class="ct-item"><div class="ct-ico ' + (ct.warn ? 'warn' : '') + '">' + Icons.svg('box', 14) + '</div>' +
        '<div class="ct-main"><b>' + esc(ct.name) + '</b><small>' + esc(ct.image) + '</small></div>' +
        '<span class="ct-state badge ' + (running ? 'ok' : 'warn') + '"><i class="dot"></i>' + esc(ct.status) + '</span></div>';
    }).join('') : '<div class="empty-line">未检测到容器</div>';
    html += '<section class="panel container-panel">' +
      panelHead('box', '容器服务', '<span class="panel-sub">Docker</span>') +
      '<div class="container-summary"><b>' + runningCt + '</b><span>/ ' + containers.length + '</span><small>RUNNING / TOTAL</small></div>' +
      '<div class="ct-list">' + ctRows + '</div>' +
      '</section>';

    // 存储池
    var poolCards = s.pools.length ? s.pools.map(function (p) {
      return '<div class="pool-card">' +
        '<div class="pool-top"><span class="pool-tag">' + esc(p.fs || 'POOL') + '</span><b>' + esc(p.name) + '</b><span class="pool-pct">' + (Number(p.usage) || 0) + '%</span></div>' +
        bar(p.usage, p.usage > 85 ? 'warn' : '') +
        '<small>' + fmtSize(p.used) + ' / ' + fmtSize(p.total) + '</small>' +
        '</div>';
    }).join('') : '<div class="empty-line">暂无存储池信息</div>';
    html += '<section class="panel storage-panel">' +
      panelHead('database', '存储池', '<span class="panel-sub">' + s.pools.length + ' 个存储池 · ' + (s.usage || 0) + '% 已用</span>') +
      '<div class="storage-summary">' +
        summaryCell('总容量', fmtSize(s.total)) +
        summaryCell('已使用', fmtSize(s.used)) +
        summaryCell('可用', fmtSize(Math.max(0, s.total - s.used))) +
        summaryCell('使用率', (Number(s.usage) || 0) + '%', 'text-accent') +
      '</div>' +
      '<div class="pool-grid">' + poolCards + '</div>' +
      '</section>';

    // 硬盘
    var diskCards = disks.length ? disks.map(function (d) {
      var hc = healthClass(d.health);
      var hcText = hc === 'ok' ? 'text-ok' : hc === 'warn' ? 'text-warn' : hc === 'danger' ? 'text-danger' : '';
      return '<div class="disk-card">' +
        '<div class="disk-card-top"><span class="disk-tag ' + (d.type === 'SSD' ? 'ssd' : '') + '">' + esc(d.type || 'DISK') + '</span>' +
        '<span class="status-pill ' + hc + '"><i class="dot"></i>' + esc(d.health) + '</span></div>' +
        '<b>' + esc(d.name) + '</b><small>' + esc(d.model) + ' · ' + esc(d.size) + '</small>' +
        '<div class="disk-card-foot">' +
          '<span><small>TEMP</small><b class="' + (d.temp >= 45 ? 'text-warn' : 'text-ok') + '">' + (d.temp ? esc(d.temp) + '°C' : '—') + '</b></span>' +
          '<span><small>HEALTH</small><b class="' + hcText + '">' + esc(d.health) + '</b></span>' +
        '</div>' +
        '</div>';
    }).join('') : '<div class="empty-line">暂无硬盘信息</div>';
    html += '<section class="panel disks-panel">' +
      panelHead('hard-drive', '硬盘', '<span class="panel-sub">' + diskHealthy + ' / ' + disks.length + ' 健康</span>') +
      '<div class="disk-grid">' + diskCards + '</div>' +
      '</section>';

    html += '</div>'; // dash-grid
    html += '<div class="dash-footer">NodePulse · 节点脉搏 · ' + (c.mode === 'api' ? '实时数据' : '演示数据') + ' · 更新于 ' + (state.updatedAt || '--') + '</div>';
    html += '</div>'; // dash
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
    html += '<div class="nodes-foot" style="text-align:center;color:var(--text-3);font-size:11px;line-height:1.7;margin-top:18px">' +
      '支持 NAS / 服务器 / 迷你主机 / 其他 Linux 设备<br/>在服务端生成 TOKEN 后即可扫码绑定</div>';
    return html;
  }

  /* ---------------- 设置页 ---------------- */
  function renderSettings() {
    var c = Provider.config();
    var connection =
      '<div class="settings-group settings-connection"><h3>连接设置</h3><div class="setting-card">' +
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

      '<div class="setting-row" id="row-preview" style="background:var(--grad-soft)">' +
      '<span class="sr-ico" style="background:var(--grad);color:#fff">' + Icons.svg('activity', 16) + '</span>' +
      '<div class="sr-label"><b>连接预览测试</b><small>填地址即可预览节点数据，无需保存配置</small></div>' +
      '<span class="sr-value" style="color:var(--accent)">' + Icons.svg('chevron-right', 16) + '</span></div>' +
      '</div></div>';

    var appearance =
      '<div class="settings-group settings-appearance"><h3>外观</h3><div class="setting-card">' +
      '<div class="setting-row"><span class="sr-ico">' + Icons.svg(c.theme === 'light' ? 'sun' : 'moon', 16) + '</span>' +
      '<div class="sr-label"><b>浅色外观</b><small>切换界面配色</small></div>' +
      '<div class="switch ' + (c.theme === 'light' ? 'on' : '') + '" id="sw-theme"></div></div>' +
      '</div></div>';

    var nodes =
      '<div class="settings-group settings-nodes"><h3>节点管理</h3><div class="setting-card">' +
      '<div class="setting-row" id="row-scan"><span class="sr-ico">' + Icons.svg('scan', 16) + '</span>' +
      '<div class="sr-label"><b>扫码添加节点</b><small>扫描服务端生成的绑定二维码</small></div>' +
      '<span class="sr-value">' + Icons.svg('chevron-right', 16) + '</span></div>' +
      '<div class="setting-row" id="row-reset"><span class="sr-ico" style="color:var(--danger);background:rgba(255,107,122,.12)">' + Icons.svg('trash-2', 16) + '</span>' +
      '<div class="sr-label"><b style="color:var(--danger)">清除绑定并重置</b><small>删除本地配置，回到引导页</small></div></div>' +
      '</div></div>';

    var html = '<div class="about-logo"><div class="brand-mark">' +
      '<svg viewBox="0 0 64 64" width="48" height="48"><defs><linearGradient id="lg2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5eead4"/><stop offset="1" stop-color="#3b82f6"/></linearGradient></defs>' +
      '<rect x="4" y="4" width="56" height="56" rx="16" fill="url(#lg2)"/><path d="M14 33 h9 l5 -12 l7 22 l5 -12 h10" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg></div>' +
      '<b>NodePulse</b><small>节点脉搏 · v1.1.0 (sideload build)</small></div>';

    html += '<div class="settings-columns">' +
      '<div class="settings-column">' + connection + '</div>' +
      '<div class="settings-column">' + appearance + nodes + '</div>' +
      '</div>';
    html += '<div class="settings-foot" style="text-align:center;color:var(--text-3);font-size:10.5px;line-height:1.8;padding:4px 0 10px">' +
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

    var preview = $('#row-preview'); if (preview) preview.onclick = showPreviewSheet;

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

  // 连接预览测试：输入地址/TOKEN -> 请求 -> 展示节点摘要，不改动已保存配置
  function showPreviewSheet() {
    var c = Provider.config();
    openSheet(
      '<h2>连接预览测试</h2>' +
      '<p class="sheet-desc">输入 NAS 服务端地址与 TOKEN，直接预览它能返回的节点数据。此测试不会修改你已保存的连接配置。</p>' +
      '<div class="field"><label>服务端地址</label><input class="input" id="pv-server" placeholder="http://192.168.1.10:8787" value="' + esc(c.server) + '" /></div>' +
      '<div class="field"><label>连接 TOKEN（可选，仅校验时能通就用）</label><input class="input" id="pv-token" placeholder="粘贴 TOKEN" value="' + esc(c.token) + '" /></div>' +
      '<div class="sheet-actions"><button class="btn primary" id="pv-run">' + Icons.svg('activity', 16) + ' 开始预览测试</button>' +
      '<button class="btn ghost" id="pv-cancel">取消</button></div>' +
      '<div id="pv-result" style="margin-top:14px"></div>'
    );
    $('#pv-cancel').onclick = closeSheet;
    $('#pv-run').onclick = function () {
      var server = $('#pv-server').value.trim();
      var token = $('#pv-token').value.trim();
      var box = $('#pv-result');
      var btn = $('#pv-run');
      btn.disabled = true;
      box.innerHTML = '<div class="card" style="margin:0;text-align:center;padding:22px">' +
        '<div style="color:var(--accent)">' + Icons.svg('refresh-cw', 24) + '</div>' +
        '<div style="font-size:12px;color:var(--text-2);margin-top:10px">正在连接 ' + esc(server || '（未填地址）') + ' …</div></div>';
      Provider.testConnection(server, token).then(function (r) {
        btn.disabled = false;
        var nodesHtml = r.nodes.map(function (n) {
          return '<div class="ct-item"><div class="ct-ico ' + (n.online ? '' : 'warn') + '">' + Icons.svg('server', 16) + '</div>' +
            '<div class="ct-main"><b>' + esc(n.name) + '</b><small>' + esc(n.type) + ' · CPU ' + (n.cpu != null ? n.cpu + '%' : '—') +
            ' · 内存 ' + (n.mem != null ? n.mem + '%' : '—') + '</small></div>' +
            '<span class="badge ' + (n.online ? 'ok' : 'mute') + '"><i class="dot"></i>' + (n.online ? '在线' : '离线') + '</span></div>';
        }).join('');
        box.innerHTML = '<div class="card" style="margin:0">' +
          '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">' +
          '<span class="badge ok"><i class="dot"></i>连接成功</span>' +
          '<span style="font-size:11px;color:var(--text-3);margin-left:auto">耗时 ' + r.ms + ' ms</span></div>' +
          '<div style="font-size:11px;color:var(--text-3);word-break:break-all;margin-bottom:8px">' + esc(r.url) + '</div>' +
          '<div style="font-size:12px;margin-bottom:6px">发现 <b>' + r.count + '</b> 个节点</div>' +
          (nodesHtml || '<div style="color:var(--text-3);font-size:11px">接口返回了空节点列表</div>') +
          '<button class="btn ghost" id="pv-apply" style="margin-top:12px;width:100%;height:42px">使用这组配置并绑定</button>' +
          '</div>';
        $('#pv-apply').onclick = function () {
          Provider.setServer(server);
          doBind(token || Provider.config().token);
        };
      }).catch(function (e) {
        btn.disabled = false;
        box.innerHTML = '<div class="card" style="margin:0;border-color:rgba(255,107,122,.3)">' +
          '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">' +
          '<span style="color:var(--danger)">' + Icons.svg('alert-triangle', 18) + '</span>' +
          '<b style="font-size:13px;color:var(--danger)">连接失败</b>' +
          '<span style="font-size:11px;color:var(--text-3);margin-left:auto">' + (e.ms != null ? e.ms + ' ms' : '') + '</span></div>' +
          '<div style="font-size:12px;color:var(--text);margin-bottom:6px">' + esc(e.friendly || e.message || '未知错误') + '</div>' +
          '<div style="font-size:11px;color:var(--text-3);word-break:break-all">' + esc(e.url || '') + '</div>' +
          '<div style="font-size:11px;color:var(--text-2);margin-top:10px;line-height:1.7;border-top:1px solid var(--border);padding-top:10px">' +
          '排查建议：<br/>① 确认服务端已启动且监听 0.0.0.0<br/>② 手机与 NAS 在同一局域网<br/>③ 地址用 http:// 开头并带正确端口<br/>④ TOKEN 与服务端生成的一致</div>' +
          '</div>';
      });
    };
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

  setInterval(tickClock, 1000);
  boot();
})();
