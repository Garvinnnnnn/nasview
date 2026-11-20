/* NodePulse · 数据访问层：演示数据 / 真实 NAS API 统一抽象 */
(function (global) {
  'use strict';

  var KEYS = {
    mode: 'np_mode',            // 'demo' | 'api'
    server: 'np_server',        // http://192.168.1.10:8787
    token: 'np_token',          // 连接 TOKEN
    theme: 'np_theme',          // dark | light
    onboarded: 'np_onboarded',
    active: 'np_active_node'
  };

  function get(k, def) {
    try { var v = localStorage.getItem(KEYS[k] || k); return v === null ? def : v; }
    catch (e) { return def; }
  }
  function set(k, v) {
    try { localStorage.setItem(KEYS[k] || k, v); } catch (e) {}
  }
  function del(k) { try { localStorage.removeItem(KEYS[k] || k); } catch (e) {} }

  function config() {
    return {
      mode: get('mode', 'demo'),
      server: get('server', ''),
      token: get('token', ''),
      theme: get('theme', 'dark'),
      onboarded: get('onboarded', '') === '1',
      active: get('active', '')
    };
  }

  function normalizeNode(raw) {
    // 对真实 API 返回做容错，缺失字段填默认值
    var n = raw || {};
    return {
      id: n.id || ('node-' + Math.random().toString(36).slice(2, 8)),
      name: n.name || '未命名节点',
      type: n.type || 'Linux 设备',
      location: n.location || '远程设备',
      online: n.online !== false,
      connType: n.connType || '远程连接',
      ip: n.ip || '—', mac: n.mac || '—', os: n.os || '—', uptime: n.uptime || '—',
      lastSeen: n.lastSeen || (n.online !== false ? '刚刚' : '未知'),
      services: n.services || { ok: 0, total: 0, list: [] },
      cpu: n.cpu || { usage: 0, cores: 0, model: '—', temp: 0, load: [0, 0, 0], history: [] },
      memory: n.memory || { used: 0, total: 0, usage: 0, history: [] },
      storage: n.storage || { used: 0, total: 0, usage: 0, pools: [] },
      disks: n.disks || [],
      temps: n.temps || { cpu: 0, disk: 0, board: 0, max: 0 },
      fans: n.fans || [],
      network: n.network || { ip: n.ip || '—', mask: '—', speed: '—', rx: 0, tx: 0, conns: 0 },
      containers: n.containers || []
    };
  }

  function apiBase() {
    var s = config().server.trim().replace(/\/+$/, '');
    return s;
  }

  function request(path, options) {
    var cfg = config();
    if (!cfg.server) return Promise.reject(new Error('尚未设置服务端地址'));
    var url = apiBase() + path;
    var opts = Object.assign({
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Authorization': 'Bearer ' + cfg.token,
        'X-Client': 'NodePulse-iOS'
      }
    }, options || {});
    opts.headers = Object.assign({
      'Accept': 'application/json',
      'Authorization': 'Bearer ' + cfg.token,
      'X-Client': 'NodePulse-iOS'
    }, (options && options.headers) || {});
    if (opts.body && typeof opts.body !== 'string') {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(opts.body);
    }
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    if (ctrl) { opts.signal = ctrl.signal; setTimeout(function () { ctrl.abort(); }, 12000); }
    return fetch(url, opts).then(function (res) {
      if (!res.ok) throw new Error('服务端返回 ' + res.status);
      return res.json();
    });
  }

  var Provider = {
    config: config,
    set: set,
    del: del,
    isApi: function () { return config().mode === 'api'; },
    isConfigured: function () { var c = config(); return !!(c.server && c.token); },

    getNodes: function () {
      if (config().mode === 'api') {
        return request('/api/v1/nodes').then(function (data) {
          var list = Array.isArray(data) ? data : (data.nodes || data.data || []);
          return list.map(normalizeNode);
        });
      }
      return Promise.resolve(global.MockData.getNodes());
    },

    refreshNodes: function (nodes) {
      if (config().mode === 'api') return this.getNodes();
      return Promise.resolve(global.MockData.refresh(nodes));
    },

    getNode: function (id, cache) {
      if (config().mode === 'api') {
        return request('/api/v1/nodes/' + encodeURIComponent(id)).then(function (d) {
          return normalizeNode(d.node || d);
        }).catch(function () {
          var hit = (cache || []).find(function (n) { return n.id === id; });
          return hit || null;
        });
      }
      return Promise.resolve(global.MockData.getNode(id));
    },

    // 用 TOKEN 绑定：向服务端校验凭证并拉取节点
    bindToken: function (token) {
      set('token', token);
      return request('/api/v1/nodes').then(function (data) {
        var list = Array.isArray(data) ? data : (data.nodes || data.data || []);
        return list.map(normalizeNode);
      });
    },

    // 扫码内容支持 https://…?token=xxx 或直接 token 字符串
    parseQR: function (text) {
      text = (text || '').trim();
      try {
        var u = new URL(text);
        var t = u.searchParams.get('token') || u.searchParams.get('t');
        var s = u.searchParams.get('server') || (u.protocol + '//' + u.host);
        return { token: t || '', server: s || '' };
      } catch (e) {
        return { token: text, server: '' };
      }
    },

    setMode: function (mode) { set('mode', mode); },
    setServer: function (v) { set('server', v); },
    setToken: function (v) { set('token', v); },
    applyTheme: function () {
      var t = config().theme;
      document.documentElement.setAttribute('data-theme', t);
      var meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', t === 'light' ? '#f1f4f9' : '#0b1020');
    }
  };

  global.Provider = Provider;
})(window);
