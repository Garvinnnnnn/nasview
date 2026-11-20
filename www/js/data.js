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
      // 列表接口常用简写字段 cpuUsage/memUsage/storageUsage -> 归一化到嵌套结构
      cpu: (function () {
        var base = { usage: 0, cores: 0, model: '—', temp: 0, load: [0, 0, 0], history: [] };
        var c = Object.assign(base, n.cpu || {});
        if (!n.cpu && n.cpuUsage != null) c.usage = n.cpuUsage;
        return c;
      })(),
      memory: (function () {
        var base = { used: 0, total: 0, usage: 0, history: [] };
        var m = Object.assign(base, n.memory || {});
        if (!n.memory && n.memUsage != null) m.usage = n.memUsage;
        return m;
      })(),
      storage: (function () {
        var base = { used: 0, total: 0, usage: 0, pools: [] };
        var s = Object.assign(base, n.storage || {});
        if (!n.storage && n.storageUsage != null) s.usage = n.storageUsage;
        return s;
      })(),
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

    // 连接预览测试：用临时参数请求，不写入已保存配置。返回耗时、状态、节点摘要。
    testConnection: function (server, token) {
      server = (server || '').trim().replace(/\/+$/, '');
      if (!server) return Promise.reject(new Error('请填写服务端地址'));
      if (!/^https?:\/\//i.test(server)) server = 'http://' + server;
      var start = Date.now();
      var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var opts = {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Authorization': 'Bearer ' + (token || ''),
          'X-Client': 'NodePulse-iOS'
        }
      };
      if (ctrl) { opts.signal = ctrl.signal; setTimeout(function () { ctrl.abort(); }, 10000); }
      return fetch(server + '/api/v1/nodes', opts).then(function (res) {
        var ms = Date.now() - start;
        if (!res.ok) {
          var hint = res.status === 401 ? 'TOKEN 无效或已过期' :
                     res.status === 404 ? '服务端未实现 /api/v1/nodes 接口' :
                     '服务端返回错误状态';
          var err = new Error(hint + '（HTTP ' + res.status + '）');
          err.ms = ms; err.status = res.status;
          throw err;
        }
        return res.json().then(function (data) {
          var list = Array.isArray(data) ? data : (data.nodes || data.data || []);
          var nodes = list.map(normalizeNode);
          return {
            ok: true,
            ms: ms,
            url: server + '/api/v1/nodes',
            nodes: nodes.map(function (n) {
              return { id: n.id, name: n.name, type: n.type, online: n.online,
                       cpu: n.cpu && n.cpu.usage, mem: n.memory && n.memory.usage,
                       storage: n.storage && n.storage.usage };
            }),
            count: nodes.length
          };
        });
      }).catch(function (e) {
        if (e.ms == null) e.ms = Date.now() - start;
        if (e.name === 'AbortError' || /abort/i.test(e.message || '')) {
          e.friendly = '连接超时（10 秒），请检查地址与网络';
        } else if (/Failed to fetch|NetworkError|fetch/i.test(e.message || '')) {
          e.friendly = '无法连接服务端，请检查地址、端口与局域网连通性';
        }
        e.url = server + '/api/v1/nodes';
        throw e;
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
