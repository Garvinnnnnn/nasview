/* NodePulse · 模拟数据（可随时切换为真实 API） */
(function (global) {
  'use strict';

  function rnd(min, max, dec) {
    var v = min + Math.random() * (max - min);
    return dec === undefined ? Math.round(v) : +v.toFixed(dec);
  }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  // 生成一段平滑的历史曲线（0-100）
  function history(base, amp, n) {
    n = n || 24;
    var out = [], v = base;
    for (var i = 0; i < n; i++) {
      v += (Math.random() - 0.5) * amp;
      v = Math.max(3, Math.min(97, v));
      v = v * 0.72 + base * 0.28;
      out.push(+v.toFixed(1));
    }
    return out;
  }
  function gb(n) { return +(n / 1024).toFixed(1); }

  function makeNode(cfg) {
    return {
      id: cfg.id,
      name: cfg.name,
      type: cfg.type,
      location: cfg.location,
      online: cfg.online,
      connType: cfg.connType,
      ip: cfg.ip,
      mac: cfg.mac,
      os: cfg.os,
      uptime: cfg.uptime,
      lastSeen: cfg.online ? '刚刚' : '2 小时前',
      services: cfg.services,
      cpu: cfg.cpu,
      memory: cfg.memory,
      storage: cfg.storage,
      disks: cfg.disks,
      temps: cfg.temps,
      fans: cfg.fans,
      network: cfg.network,
      containers: cfg.containers
    };
  }

  var NODES = [
    makeNode({
      id: 'nas-living', name: '客厅 NAS', type: 'NAS', location: '家庭存储 · 本地设备',
      online: true, connType: '本地连接', ip: '192.168.1.10', mac: 'A4:BB:6D:3E:91:02',
      os: 'DSM 7.2', uptime: '32 天 14 小时',
      services: { ok: 8, total: 8, list: ['文件服务', '相册', '影音库', '下载中心', '备份', 'Docker', 'SSH', 'Web'] },
      cpu: { usage: 23, cores: 8, model: 'Intel Celeron J4125', temp: 41, load: [0.42, 0.56, 0.61], history: history(24, 14) },
      memory: { used: 4.6, total: 8, usage: 58, history: history(58, 8) },
      storage: {
        used: 11240, total: 15600, usage: 72,
        pools: [
          { name: 'Storage Pool 1', fs: 'Btrfs', used: 8240, total: 10400, usage: 79 },
          { name: 'Storage Pool 2', fs: 'ext4', used: 3000, total: 5200, usage: 58 }
        ]
      },
      disks: [
        { name: 'Disk 1', model: 'WD Red Plus 4TB', size: '3.6 TB', type: 'HDD', health: '良好', temp: 36, smart: ['通电 18,240 小时', '重映射扇区 0', '腐蚀 0'] },
        { name: 'Disk 2', model: 'WD Red Plus 4TB', size: '3.6 TB', type: 'HDD', health: '良好', temp: 37, smart: ['通电 18,240 小时', '重映射扇区 0', '腐蚀 0'] },
        { name: 'Disk 3', model: 'Seagate 4TB', size: '3.6 TB', type: 'HDD', health: '注意', temp: 44, smart: ['通电 26,110 小时', '重映射扇区 3', '待映射扇区 1'] },
        { name: 'NVMe 1', model: 'Kingston KC2000', size: '512 GB', type: 'SSD', health: '良好', temp: 34, smart: ['通电 9,860 小时', '磨损 6%', '剩余寿命 94%'] }
      ],
      temps: { cpu: 41, disk: 38, board: 35, max: 44 },
      fans: [{ name: '系统风扇 1', rpm: 1240 }, { name: '系统风扇 2', rpm: 1180 }, { name: 'CPU 风扇', rpm: 1520 }],
      network: { ip: '192.168.1.10', mask: '255.255.255.0', speed: '1 Gbps', rx: 2.4, tx: 0.8, conns: 46 },
      containers: [
        { name: 'nginx-proxy-manager', image: 'jc21/nginx-proxy-manager', status: '运行中', uptime: '12 天', warn: false },
        { name: 'jellyfin', image: 'jellyfin/jellyfin', status: '运行中', uptime: '32 天', warn: false },
        { name: 'qbittorrent', image: 'linuxserver/qbittorrent', status: '运行中', uptime: '8 天', warn: false },
        { name: 'home-assistant', image: 'ghcr.io/home-assistant', status: '已停止', uptime: '—', warn: true },
        { name: 'postgres', image: 'postgres:15', status: '运行中', uptime: '32 天', warn: false }
      ]
    }),
    makeNode({
      id: 'cloud-vps', name: '云服务器', type: '服务器', location: '远程主机 · 云机房',
      online: true, connType: '远程连接', ip: '45.77.23.18', mac: '00:16:3E:8F:2A:11',
      os: 'Ubuntu 24.04 LTS', uptime: '118 天 6 小时',
      services: { ok: 12, total: 12, list: ['Web', 'API', '数据库', '缓存', '队列', '监控', '日志', '备份', 'Docker', 'SSH', '防火墙', '证书'] },
      cpu: { usage: 47, cores: 4, model: 'AMD EPYC 7B12', temp: 53, load: [1.28, 1.14, 0.97], history: history(48, 20) },
      memory: { used: 6.1, total: 8, usage: 76, history: history(76, 9) },
      storage: {
        used: 9860, total: 20480, usage: 48,
        pools: [{ name: '/ (ext4)', fs: 'ext4', used: 9860, total: 20480, usage: 48 }]
      },
      disks: [
        { name: 'vda', model: 'Cloud SSD', size: '200 GB', type: 'SSD', health: '良好', temp: 32, smart: ['通电 51,200 小时', '磨损 11%', '剩余寿命 89%'] }
      ],
      temps: { cpu: 53, disk: 32, board: 39, max: 53 },
      fans: [{ name: '风扇（虚拟）', rpm: 0 }],
      network: { ip: '45.77.23.18', mask: '255.255.255.0', speed: '1 Gbps', rx: 18.6, tx: 6.2, conns: 218 },
      containers: [
        { name: 'api-gateway', image: 'internal/api-gw:2.4', status: '运行中', uptime: '118 天', warn: false },
        { name: 'redis', image: 'redis:7-alpine', status: '运行中', uptime: '118 天', warn: false },
        { name: 'mysql', image: 'mysql:8', status: '运行中', uptime: '118 天', warn: false },
        { name: 'grafana', image: 'grafana/grafana', status: '运行中', uptime: '46 天', warn: false },
        { name: 'worker-01', image: 'internal/worker:latest', status: '运行中', uptime: '9 天', warn: false }
      ]
    }),
    makeNode({
      id: 'mini-host', name: '软路由小主机', type: '迷你主机', location: '旁路设备 · 本地设备',
      online: false, connType: '本地连接', ip: '192.168.1.2', mac: 'E4:5F:01:2C:77:9B',
      os: 'OpenWrt 23.05', uptime: '—', lastSeen: '2 小时前',
      services: { ok: 0, total: 5, list: ['网络', 'DHCP', 'DNS', '防火墙', 'WireGuard'] },
      cpu: { usage: 0, cores: 4, model: 'Intel N100', temp: 0, load: [0, 0, 0], history: history(8, 4) },
      memory: { used: 0, total: 4, usage: 0, history: history(20, 4) },
      storage: { used: 0, total: 128, usage: 0, pools: [{ name: '/', fs: 'overlay', used: 0, total: 128, usage: 0 }] },
      disks: [{ name: 'mmcblk0', model: 'SanDisk 128GB', size: '119 GB', type: 'SSD', health: '未知', temp: 0, smart: ['离线 · 无法读取'] }],
      temps: { cpu: 0, disk: 0, board: 0, max: 0 },
      fans: [],
      network: { ip: '192.168.1.2', mask: '255.255.255.0', speed: '1 Gbps', rx: 0, tx: 0, conns: 0 },
      containers: []
    })
  ];

  // 轻微波动，模拟实时刷新
  function jitter(node) {
    if (!node.online) return node;
    var d = function (v, amp, min, max) { return Math.max(min, Math.min(max, v + rnd(-amp, amp, 1))); };
    node.cpu.usage = d(node.cpu.usage, 6, 2, 95);
    node.cpu.temp = d(node.cpu.temp, 2, 25, 90);
    node.cpu.history.push(node.cpu.usage); node.cpu.history.shift();
    node.memory.usage = d(node.memory.usage, 2, 10, 95);
    node.memory.used = +(node.memory.total * node.memory.usage / 100).toFixed(1);
    node.memory.history.push(node.memory.usage); node.memory.history.shift();
    node.network.rx = d(node.network.rx, 1.2, 0, 100);
    node.network.tx = d(node.network.tx, .6, 0, 100);
    return node;
  }

  global.MockData = {
    getNodes: function () { return JSON.parse(JSON.stringify(NODES)); },
    refresh: function (nodes) {
      nodes.forEach(jitter);
      return JSON.parse(JSON.stringify(nodes));
    },
    getNode: function (id) {
      var n = NODES.find(function (x) { return x.id === id; });
      return n ? JSON.parse(JSON.stringify(n)) : null;
    }
  };
})(window);
