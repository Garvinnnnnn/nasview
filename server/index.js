#!/usr/bin/env node
/* =============================================================
 * NodePulse 参考服务端 · 零依赖（Node.js >= 18）
 *
 * 接口契约见 docs/API.md；本文件直接采集宿主机真实指标，
 * 缺失的命令/权限会自动降级，不会导致接口报错。
 *
 * 环境变量：
 *   NP_TOKEN          连接 TOKEN（不填则自动生成并保存到 data/token.txt）
 *   NP_PORT           监听端口，默认 8787
 *   NP_HOST           监听地址，默认 0.0.0.0
 *   NP_PUBLIC_URL     对外地址，用于生成连接串，如 http://192.168.1.10:8787
 *   NP_NODE_ID        节点 ID（默认取主机名）
 *   NP_NODE_NAME      节点名称（默认取主机名）
 *   NP_NODE_TYPE      节点类型，默认自动识别
 *   NP_LOCATION       位置描述
 *   NP_CONN_TYPE      连接类型，默认「本地连接」
 *   NP_OS             系统名称覆盖
 *   NP_IP / NP_MAC / NP_MASK / NP_IFACE   网络信息覆盖（容器部署时有用）
 *   NP_PEERS          逗号分隔的其他 NodePulse 服务地址，用于多节点聚合
 *   NP_SHOW_TOKEN     1 = 首页显示完整 TOKEN（默认隐藏）
 *   NP_CACHE_MS       指标缓存毫秒数，默认 2000
 *   NP_DATA_DIR       数据目录，默认 ./data
 *
 * 容器部署时可把宿主机 /proc /sys 挂到 /host/proc /host/sys（只读），
 * 服务会自动优先读取这两个路径，以拿到宿主机而非容器的指标。
 * ============================================================= */
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const execFileAsync = promisify(execFile);

/* ---------------- 配置 ---------------- */
const env = (k, d) => (process.env[k] !== undefined && process.env[k] !== '' ? process.env[k] : d);
const PORT = Number(env('NP_PORT', 8787));
const HOST = env('NP_HOST', '0.0.0.0');
const CACHE_MS = Math.max(500, Number(env('NP_CACHE_MS', 2000)));
const DATA_DIR = env('NP_DATA_DIR', path.join(__dirname, 'data'));
const SHOW_TOKEN = env('NP_SHOW_TOKEN', '0') === '1';
const PEERS = env('NP_PEERS', '').split(',').map(s => s.trim().replace(/\/+$/, '')).filter(Boolean);
const PROC = fs.existsSync('/host/proc/stat') ? '/host/proc' : '/proc';
const SYS = fs.existsSync('/host/sys/class') ? '/host/sys' : '/sys';
const OS_RELEASE = fs.existsSync('/host/etc/os-release') ? '/host/etc/os-release' : '/etc/os-release';
const VERSION = '1.0.0';

function ensureDataDir() {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (e) { /* 只读环境忽略 */ }
}
function resolveToken() {
  const fromEnv = env('NP_TOKEN', '');
  if (fromEnv) return fromEnv;
  ensureDataDir();
  const f = path.join(DATA_DIR, 'token.txt');
  try { const t = fs.readFileSync(f, 'utf8').trim(); if (t) return t; } catch (e) { /* no file */ }
  const t = crypto.randomBytes(18).toString('base64url');
  try { fs.writeFileSync(f, t + '\n', { mode: 0o600 }); } catch (e) { /* 只读环境只打印 */ }
  return t;
}
const TOKEN = resolveToken();

/* ---------------- 工具 ---------------- */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const r1 = v => Math.round(v * 10) / 10;
const sleep = ms => new Promise(r => setTimeout(r, ms));
function readText(p) { try { return fs.readFileSync(p, 'utf8'); } catch (e) { return ''; } }
function readNum(p) { const v = Number(readText(p).trim()); return Number.isFinite(v) ? v : null; }
function listDir(p) { try { return fs.readdirSync(p); } catch (e) { return []; } }
async function run(cmd, args, timeout) {
  try {
    const { stdout } = await execFileAsync(cmd, args, { timeout: timeout || 1800, maxBuffer: 2 * 1024 * 1024 });
    return String(stdout || '');
  } catch (e) { return ''; }
}
async function fetchJson(url, token, ms) {
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json', Authorization: 'Bearer ' + token, 'X-Client': 'NodePulse-Server' },
      signal: AbortSignal.timeout(ms || 2500)
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) { return null; }
}
function humanSize(bytes) {
  bytes = Number(bytes) || 0;
  if (bytes >= 1024 ** 4) return (bytes / 1024 ** 4).toFixed(1) + ' TB';
  if (bytes >= 1024 ** 3) return Math.round(bytes / 1024 ** 3) + ' GB';
  return Math.max(1, Math.round(bytes / 1024 ** 2)) + ' MB';
}
function fmtUptime(sec) {
  sec = Math.max(0, Math.floor(sec));
  const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60);
  if (d) return d + ' 天 ' + h + ' 小时';
  if (h) return h + ' 小时 ' + m + ' 分钟';
  return m + ' 分钟';
}
function pushHistory(arr, v) {
  const out = Array.isArray(arr) ? arr.slice() : [];
  out.push(v);
  while (out.length > 24) out.shift();
  while (out.length < 24) out.unshift(v);
  return out;
}

/* ---------------- CPU ---------------- */
function cpuTimes() {
  const stat = readText(PROC + '/stat').split('\n')[0];
  if (stat && /^cpu\s/.test(stat)) {
    const p = stat.trim().split(/\s+/).slice(1).map(Number);
    if (p.length >= 4) {
      return { idle: p[3] + (p[4] || 0), total: p.reduce((a, b) => a + b, 0) };
    }
  }
  // macOS / 无 /proc 环境
  let idle = 0, total = 0;
  for (const c of os.cpus()) {
    idle += c.times.idle;
    total += c.times.user + c.times.nice + c.times.sys + c.times.idle + c.times.irq;
  }
  return { idle, total };
}
let prevCpu = null;
async function cpuUsage() {
  const a = prevCpu || cpuTimes();
  if (!prevCpu) await sleep(120);
  const b = cpuTimes(); prevCpu = b;
  const dt = b.total - a.total, di = b.idle - a.idle;
  return dt > 0 ? clamp(Math.round((1 - di / dt) * 100), 0, 100) : 0;
}

/* ---------------- 内存 ---------------- */
function memory() {
  const info = readText(PROC + '/meminfo');
  let totalB, availB;
  if (info) {
    const get = k => { const m = info.match(new RegExp('^' + k + ':\\s+(\\d+)\\s+kB', 'm')); return m ? Number(m[1]) * 1024 : 0; };
    totalB = get('MemTotal');
    availB = get('MemAvailable') || (get('MemFree') + get('Buffers') + get('Cached'));
  } else {
    totalB = os.totalmem(); availB = os.freemem();
  }
  if (!totalB) return { used: 0, total: 0, usage: 0 };
  const usedB = Math.max(0, totalB - availB);
  const total = r1(totalB / 1024 ** 3), used = r1(usedB / 1024 ** 3);
  return { used, total, usage: clamp(Math.round(usedB / totalB * 100), 0, 100) };
}

/* ---------------- 系统信息 ---------------- */
function osLabel() {
  const override = env('NP_OS', '');
  if (override) return override;
  const txt = readText(OS_RELEASE);
  const m = txt.match(/^PRETTY_NAME="?([^"\n]+)"?/m);
  if (m) return m[1].trim();
  if (fs.existsSync('/etc/synoinfo.conf')) return 'Synology DSM';
  if (fs.existsSync('/etc/openwrt_release')) return 'OpenWrt';
  return os.type() + ' ' + os.release();
}
function guessType() {
  const override = env('NP_NODE_TYPE', '');
  if (override) return override;
  if (fs.existsSync('/etc/synoinfo.conf') || fs.existsSync('/volume1')) return 'NAS';
  if (fs.existsSync('/etc/openwrt_release')) return '迷你主机';
  if (fs.existsSync('/.dockerenv')) return '服务器';
  return 'Linux 设备';
}
function identity() {
  const hostname = os.hostname() || 'node';
  return {
    id: env('NP_NODE_ID', hostname.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '') || 'node'),
    name: env('NP_NODE_NAME', hostname),
    type: guessType(),
    location: env('NP_LOCATION', '本地设备'),
    connType: env('NP_CONN_TYPE', '本地连接')
  };
}

/* ---------------- 网络 ---------------- */
let prevNet = null;
function pickIface() {
  const want = env('NP_IFACE', '');
  const found = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    const v4 = (addrs || []).find(a => a.family === 'IPv4' && !a.internal);
    if (v4) found.push({ name, ip: v4.address, mask: v4.netmask, mac: v4.mac });
  }
  if (want) { const hit = found.find(f => f.name === want); if (hit) return hit; }
  const order = ['eth0', 'en0', 'ens', 'eno', 'enp', 'bond0', 'br0', 'wlan0'];
  for (const pre of order) { const hit = found.find(f => f.name.startsWith(pre)); if (hit) return hit; }
  return found[0] || null;
}
function netBytes(iface) {
  const txt = readText(PROC + '/net/dev');
  if (!txt || !iface) return null;
  for (const line of txt.split('\n')) {
    const i = line.indexOf(':');
    if (i < 0) continue;
    if (line.slice(0, i).trim() !== iface) continue;
    const p = line.slice(i + 1).trim().split(/\s+/).map(Number);
    if (p.length >= 9) return { rx: p[0], tx: p[8] };
  }
  return null;
}
function netRates(iface) {
  const now = Date.now(), cur = netBytes(iface);
  if (!cur || !prevNet) { prevNet = cur ? { ...cur, t: now } : null; return { rx: 0, tx: 0 }; }
  const secs = Math.max(0.001, (now - prevNet.t) / 1000);
  const rx = Math.max(0, (cur.rx - prevNet.rx) / secs / 1024 / 1024);
  const tx = Math.max(0, (cur.tx - prevNet.tx) / secs / 1024 / 1024);
  prevNet = { ...cur, t: now };
  return { rx: r1(rx), tx: r1(tx) };
}
function socketStats() {
  const PORT_NAMES = {
    20: 'FTP', 21: 'FTP', 22: 'SSH', 23: 'Telnet', 25: 'SMTP', 53: 'DNS', 80: 'Web', 110: 'POP3',
    139: 'SMB', 143: 'IMAP', 443: 'HTTPS', 445: 'SMB', 587: 'SMTP', 990: 'FTPS', 993: 'IMAPS',
    2049: 'NFS', 2375: 'Docker', 2376: 'Docker', 3000: 'Web 应用', 3306: 'MySQL', 3389: 'RDP',
    5000: 'DSM', 5001: 'DSM', 5432: 'PostgreSQL', 5900: 'VNC', 6379: 'Redis', 6881: 'BT',
    8080: 'Web', 8081: 'Web', 8123: 'Home Assistant', 9000: 'Web', 9090: '监控', 51413: 'BT'
  };
  let listening = [], established = 0;
  for (const f of ['net/tcp', 'net/tcp6']) {
    const txt = readText(PROC + '/' + f);
    for (const line of txt.split('\n').slice(1)) {
      const p = line.trim().split(/\s+/);
      if (p.length < 4) continue;
      const local = p[1] || '', state = p[3] || '';
      const port = parseInt((local.split(':')[1] || ''), 16);
      if (state === '0A' && Number.isFinite(port)) listening.push(port);
      if (state === '01') established++;
    }
  }
  const names = [];
  for (const port of Array.from(new Set(listening)).sort((a, b) => a - b)) {
    const n = PORT_NAMES[port];
    if (n && !names.includes(n)) names.push(n);
  }
  if (!names.length && listening.length) names.push('端口 ' + listening.length + ' 个');
  return { names: names.slice(0, 12), conns: established };
}
function network() {
  const f = pickIface();
  const speedRaw = f ? readNum(SYS + '/class/net/' + f.name + '/speed') : null;
  const speed = speedRaw && speedRaw > 0 ? (speedRaw >= 1000 ? (speedRaw / 1000) + ' Gbps' : speedRaw + ' Mbps') : '—';
  const rates = netRates(f && f.name);
  const socks = socketStats();
  return {
    ip: env('NP_IP', f ? f.ip : '—'),
    mask: env('NP_MASK', f ? f.mask : '—'),
    mac: env('NP_MAC', f ? f.mac : '—'),
    speed, rx: rates.rx, tx: rates.tx, conns: socks.conns
  };
}

/* ---------------- 温度与风扇 ---------------- */
function hwmon() {
  const temps = [], fans = [];
  const base = SYS + '/class/hwmon';
  for (const dir of listDir(base)) {
    for (const file of listDir(path.join(base, dir))) {
      let m;
      if ((m = file.match(/^temp(\d+)_input$/))) {
        const v = readNum(path.join(base, dir, file));
        if (v != null) {
          const label = readText(path.join(base, dir, 'temp' + m[1] + '_label')).trim();
          temps.push({ label, c: Math.round(v / 1000) });
        }
      } else if ((m = file.match(/^fan(\d+)_input$/))) {
        const v = readNum(path.join(base, dir, file));
        if (v != null) {
          const label = readText(path.join(base, dir, 'fan' + m[1] + '_label')).trim();
          fans.push({ name: label || '风扇 ' + (fans.length + 1), rpm: Math.round(v) });
        }
      }
    }
  }
  if (!temps.length) {
    const thermal = SYS + '/class/thermal';
    for (const dir of listDir(thermal)) {
      const v = readNum(path.join(thermal, dir, 'temp'));
      if (v != null) temps.push({ label: dir, c: Math.round(v / 1000) });
    }
  }
  return { temps, fans };
}

/* ---------------- 存储池 ---------------- */
const SKIP_FS = /^(tmpfs|devtmpfs|ramfs|overlay|squashfs|efivarfs|cgroup2?|proc|sysfs|devpts|mqueue|hugetlbfs|securityfs|pstore|binfmt_misc|autofs|nsfs|fuse\.docker|configfs|debugfs|tracefs)$/;
const SKIP_MOUNT = /^(\/proc|\/sys|\/dev|\/run|\/snap|\/var\/lib\/docker|\/var\/lib\/kubelet|\/etc\/hosts|\/etc\/resolv\.conf)/;
async function storage() {
  let out = await run('df', ['-B1', '-P']);
  let scale = 1;
  if (!out) { out = await run('df', ['-kP']); scale = 1024; }
  const seen = new Set(), seenSize = new Set(), pools = [];
  for (const line of out.split('\n').slice(1)) {
    const p = line.trim().split(/\s+/);
    if (p.length < 6) continue;
    const [dev, blocks, usedRaw, availRaw, , mount] = p;
    if (SKIP_FS.test(dev) || /\/dev\/loop/.test(dev) || SKIP_MOUNT.test(mount)) continue;
    // APFS / 快照类卷会重复报同一块空间，按「总块数+可用块数」去重
    const sizeKey = blocks + '|' + availRaw;
    if (seen.has(dev) || seenSize.has(sizeKey)) continue;
    seen.add(dev); seenSize.add(sizeKey);
    const totalB = Number(blocks) * scale, usedB = Number(usedRaw) * scale, availB = Number(availRaw) * scale;
    if (![totalB, usedB, availB].every(Number.isFinite) || totalB <= 0) continue;
    const total = totalB / 1024 ** 3, used = usedB / 1024 ** 3;
    if (total < 0.5) continue;
    const usage = clamp(Math.round(usedB / Math.max(1, usedB + availB) * 100), 0, 100);
    const fs = (dev.startsWith('/dev/') ? guessFs(dev) : (dev === 'overlay' ? 'overlay' : '本地文件系统'));
    pools.push({
      name: mount === '/' ? '/ (根分区)' : mount,
      fs, used: r1(used), total: r1(total), usage
    });
  }
  pools.sort((a, b) => b.total - a.total);
  const list = pools.slice(0, 8);
  const sumTotal = list.reduce((a, p) => a + p.total, 0), sumUsed = list.reduce((a, p) => a + p.used, 0);
  return {
    used: r1(sumUsed), total: r1(sumTotal),
    usage: sumTotal > 0 ? clamp(Math.round(sumUsed / sumTotal * 100), 0, 100) : 0,
    pools: list
  };
}
function guessFs(dev) {
  const mounts = readText(PROC + '/mounts');
  const hit = mounts.split('\n').find(l => l.startsWith(dev + ' '));
  if (hit) { const p = hit.split(/\s+/); if (p[2]) return p[2]; }
  return '本地磁盘';
}

/* ---------------- 硬盘 / SMART ---------------- */
async function disksBase() {
  let out = await run('lsblk', ['-J', '-b', '-o', 'NAME,MODEL,SIZE,TYPE,ROTA,TRAN'], 2500);
  if (!out) out = await run('lsblk', ['-J', '-b', '-o', 'NAME,MODEL,SIZE,TYPE,ROTA'], 2500);
  if (!out) return disksFromSys();
  let json;
  try { json = JSON.parse(out); } catch (e) { return disksFromSys(); }
  const list = [];
  function walk(items) {
    for (const d of items || []) {
      if (d.type === 'disk' && !/^(loop|ram|zram)/.test(d.name || '') && Number(d.size) > 0) {
        const isSSD = d.rota === false || d.rota === '0' || String(d.rota) === 'false' || /nvme/i.test(d.name || '');
        list.push({
          name: d.name,
          model: (d.model || '').trim() || (isSSD ? 'NVMe / SSD' : '本地磁盘'),
          size: humanSize(d.size),
          type: isSSD ? 'SSD' : 'HDD',
          health: '未知', temp: 0,
          smart: ['SMART 读取中…']
        });
      }
      if (d.children) walk(d.children);
    }
  }
  walk(json.blockdevices);
  return list.length ? list.slice(0, 10) : disksFromSys();
}
// 没有 lsblk（如部分 DSM / OpenWrt）时，直接读 /sys/block
function disksFromSys() {
  const list = [];
  for (const name of listDir(SYS + '/block')) {
    if (/^(loop|ram|zram|dm-|md|sr)/.test(name)) continue;
    const sectors = readNum(SYS + '/block/' + name + '/size') || 0;
    const bytes = sectors * 512;
    if (bytes < 512 * 1024 * 1024) continue;
    const model = readText(SYS + '/block/' + name + '/device/model').trim();
    const rot = readNum(SYS + '/block/' + name + '/queue/rotational');
    const isSSD = rot === 0 || /nvme|mmcblk/.test(name);
    list.push({
      name,
      model: model || (isSSD ? 'NVMe / SSD' : '本地磁盘'),
      size: humanSize(bytes),
      type: isSSD ? 'SSD' : 'HDD',
      health: '未知', temp: 0,
      smart: ['SMART 读取中…']
    });
  }
  return list.slice(0, 10);
}
const smartCache = new Map();
async function refreshSmart(disks) {
  await Promise.all(disks.map(async d => {
    const out = await run('smartctl', ['-A', '-j', '/dev/' + d.name], 3000);
    if (!out) { smartCache.set(d.name, null); return; }
    let j; try { j = JSON.parse(out); } catch (e) { smartCache.set(d.name, null); return; }
    const table = (j.ata_smart_attributes && j.ata_smart_attributes.table) || [];
    const attr = id => { const a = table.find(x => x.id === id || x.name === id); return a ? Number(a.raw && a.raw.value != null ? a.raw.value : a.value) : null; };
    const nvme = j.nvme_smart_health_information_log || {};
    const temp = j.temperature && j.temperature.current != null ? j.temperature.current
      : nvme.temperature != null ? nvme.temperature : attr(194) ?? attr(190) ?? 0;
    const powerOn = (j.power_on_time && j.power_on_time.hours) || attr(9) || 0;
    const realloc = attr(5) || 0, pending = attr(197) || 0;
    const passed = j.smart_status && j.smart_status.passed;
    let health = '良好';
    if (passed === false || realloc > 50 || pending > 0) health = '危险';
    else if (realloc > 0 || (nvme.percentage_used || 0) >= 90) health = '注意';
    const smart = ['通电 ' + Number(powerOn).toLocaleString('zh-CN') + ' 小时'];
    if (j.ata_smart_attributes) smart.push('重映射扇区 ' + realloc);
    if (pending) smart.push('待映射扇区 ' + pending);
    if (nvme.percentage_used != null) smart.push('磨损 ' + nvme.percentage_used + '%');
    smartCache.set(d.name, { health, temp: Math.round(Number(temp) || 0), smart });
  }));
}
function disks() {
  const base = disksBaseCache || [];
  return base.map(d => {
    const s = smartCache.get(d.name);
    if (s) return Object.assign({}, d, s);
    return Object.assign({}, d, {
      health: '未知', temp: 0,
      smart: ['未读取到 SMART（需安装 smartmontools 并以 root 运行）']
    });
  });
}
let disksBaseCache = null;

/* ---------------- Docker 容器 ---------------- */
function cnUptime(s) {
  const m = (s || '').match(/(\d+)\s*(second|minute|hour|day|week|month|year)s?/i);
  if (!m) return '—';
  const map = { second: '秒', minute: '分钟', hour: '小时', day: '天', week: '周', month: '个月', year: '年' };
  return m[1] + ' ' + (map[m[2].toLowerCase()] || m[2]);
}
async function containers() {
  const out = await run('docker', ['ps', '-a', '--format', '{{.Names}}\t{{.Image}}\t{{.Status}}\t{{.RunningFor}}'], 2500);
  if (!out) return [];
  return out.split('\n').filter(Boolean).slice(0, 20).map(line => {
    const [name, image, status, runningFor] = line.split('\t');
    const running = /^Up\b/i.test(status || '');
    return {
      name: name || 'container', image: image || '—',
      status: running ? '运行中' : '已停止',
      uptime: running ? cnUptime(runningFor) : '—',
      warn: !running
    };
  });
}

/* ---------------- 汇总采集 ---------------- */
let histCpu = [], histMem = [];
let cache = null, lastCollect = 0, collecting = null;
async function collect() {
  const idn = identity();
  const [usage, mem, sto, dskBase, cts, hw] = await Promise.all([
    cpuUsage(), Promise.resolve(memory()), storage(), disksBase(), containers(), Promise.resolve(hwmon())
  ]);
  disksBaseCache = dskBase;
  // SMART 后台刷新，不阻塞本次响应
  if (dskBase.length) refreshSmart(dskBase).catch(() => {});
  const diskList = disks();
  histCpu = pushHistory(histCpu, usage);
  histMem = pushHistory(histMem, mem.usage);
  const cpuVals = hw.temps.map(t => t.c).filter(v => v > 0 && v < 120);
  const cpuTemp = cpuVals.length ? Math.max.apply(null, cpuVals) : 0;
  const diskTemps = diskList.map(d => d.temp).filter(v => v > 0);
  const diskTemp = diskTemps.length ? Math.max.apply(null, diskTemps) : 0;
  const boardTemp = cpuVals.length > 1 ? cpuVals.slice().sort((a, b) => a - b)[Math.floor(cpuVals.length / 2)] : cpuTemp;
  const allT = [cpuTemp, diskTemp, boardTemp].filter(v => v > 0);
  const socks = socketStats();
  const cpus = os.cpus();
  const net = network();
  const cpuModel = cpus.length ? String(cpus[0].model).replace(/\(R\)|\(TM\)|CPU @.*/g, '').trim() : '—';
  return {
    id: idn.id, name: idn.name, type: idn.type, location: idn.location,
    online: true, connType: idn.connType,
    ip: net.ip, mac: net.mac,
    os: osLabel(), uptime: fmtUptime(os.uptime()), lastSeen: '刚刚',
    services: { ok: socks.names.length, total: socks.names.length, list: socks.names },
    cpu: {
      usage, cores: cpus.length,
      model: cpus.length ? String(cpus[0].model).replace(/\(R\)|\(TM\)|CPU @.*/g, '').trim() : '—',
      temp: cpuTemp, load: os.loadavg().map(v => r1(v)), history: histCpu
    },
    memory: Object.assign({}, mem, { history: histMem }),
    storage: sto,
    disks: diskList,
    temps: { cpu: cpuTemp, disk: diskTemp, board: boardTemp, max: allT.length ? Math.max.apply(null, allT) : 0 },
    fans: hw.fans,
    network: net,
    containers: cts
  };
}
async function snapshot() {
  const now = Date.now();
  if (cache && now - lastCollect < CACHE_MS) return cache;
  if (collecting) return collecting;
  collecting = collect().then(v => { cache = v; lastCollect = Date.now(); return v; }).catch(e => {
    console.error('[collect] ' + (e && e.stack || e));
    return cache || null;
  }).finally(() => { collecting = null; });
  return collecting;
}

/* ---------------- 多节点聚合 ---------------- */
let peerIndex = new Map();
async function allNodes() {
  const own = await snapshot();
  const nodes = own ? [own] : [];
  const next = new Map();
  if (own) next.set(own.id, null);
  if (PEERS.length) {
    const results = await Promise.all(PEERS.map(base => fetchJson(base + '/api/v1/nodes', TOKEN, 2500)));
    results.forEach((data, i) => {
      const list = data && (Array.isArray(data) ? data : (data.nodes || data.data)) || [];
      list.forEach(n => {
        if (!n || !n.id) return;
        if (n.id === (own && own.id)) return;
        nodes.push(n);
        next.set(n.id, PEERS[i]);
      });
    });
  }
  peerIndex = next;
  return nodes;
}
async function nodeDetail(id) {
  const own = await snapshot();
  if (own && own.id === id) return own;
  if (!peerIndex.has(id)) await allNodes();
  const base = peerIndex.get(id);
  if (base) {
    const d = await fetchJson(base + '/api/v1/nodes/' + encodeURIComponent(id), TOKEN, 2500);
    if (d) return d.node || d;
  }
  const list = await allNodes();
  return list.find(n => n.id === id) || null;
}

/* ---------------- HTTP ---------------- */
function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, X-Client, Content-Type, Accept');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-NodePulse-Version', VERSION);
}
function json(res, status, data) {
  cors(res);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}
function tokenEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}
function authorized(req, url) {
  const h = String(req.headers.authorization || '');
  const bearer = /^Bearer\s+(.+)$/i.exec(h);
  const got = bearer ? bearer[1].trim() : (req.headers['x-nodepulse-token'] || url.searchParams.get('token') || '');
  return tokenEqual(got, TOKEN);
}
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now(), k = ip || '?';
  let e = hits.get(k);
  if (!e || now - e.t > 60000) { e = { t: now, n: 0 }; hits.set(k, e); }
  e.n++;
  return e.n > 300;
}
function rootPage() {
  const publicUrl = env('NP_PUBLIC_URL', '') || ('http://<服务器IP>:' + PORT);
  const shown = SHOW_TOKEN ? TOKEN : TOKEN.slice(0, 4) + '••••••' + TOKEN.slice(-4);
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>NodePulse 服务端</title><style>
:root{color-scheme:dark}body{margin:0;background:#080d17;color:#e8eef9;font:14px/1.7 -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif}
.wrap{max-width:640px;margin:0 auto;padding:48px 24px}h1{font-size:22px;margin:0 0 6px}p{color:#94a6c2}
code{display:block;background:#0f1726;border:1px solid rgba(148,163,184,.12);border-radius:10px;padding:12px 14px;margin:10px 0;word-break:break-all;color:#3ddc97;font-family:ui-monospace,Menlo,monospace;font-size:12.5px}
.ok{display:inline-flex;align-items:center;gap:6px;color:#3ddc97;background:rgba(61,220,151,.1);border:1px solid rgba(61,220,151,.22);border-radius:999px;padding:3px 10px;font-size:12px}
h2{font-size:13px;color:#64748b;letter-spacing:.12em;text-transform:uppercase;margin:32px 0 8px}ul{color:#94a6c2;padding-left:18px}li{margin:4px 0}
</style></head><body><div class="wrap">
<h1>NodePulse 服务端</h1><p><span class="ok">● 运行中</span> &nbsp; v${VERSION} · 数据源：本机实时指标</p>
<h2>App 连接串（可直接粘贴到「扫码添加节点」）</h2>
<code>${publicUrl}/?token=${shown}</code>
<p>服务端地址填 <b>${publicUrl}</b>，TOKEN 填部署时输出的完整字符串，然后在设置页切到「真实 NAS」。</p>
${SHOW_TOKEN ? '' : '<p>TOKEN 已打码。完整值见部署命令输出、<code style="display:inline;padding:2px 6px">cat ' + DATA_DIR + '/token.txt</code> 或容器日志。</p>'}
<h2>接口</h2><ul>
<li>GET /api/v1/nodes — 节点列表</li>
<li>GET /api/v1/nodes/{id} — 节点详情</li>
<li>POST /api/v1/nodes/bind — 绑定校验（可选）</li>
<li>GET /healthz — 健康检查（无需鉴权）</li>
</ul><p>所有接口需 Header：<code style="display:inline;padding:2px 6px">Authorization: Bearer &lt;TOKEN&gt;</code></p>
</div></body></html>`;
}

const server = http.createServer(async (req, res) => {
  let url;
  try { url = new URL(req.url, 'http://localhost'); }
  catch (e) { return json(res, 400, { error: 'bad request' }); }
  if (rateLimited(req.socket && req.socket.remoteAddress)) return json(res, 429, { error: 'too many requests' });
  if (req.method === 'OPTIONS') { cors(res); res.writeHead(204); return res.end(); }

  const p = url.pathname.replace(/\/+$/, '') || '/';

  if (p === '/healthz' || p === '/api/v1/health') {
    return json(res, 200, { ok: true, version: VERSION, uptime: fmtUptime(process.uptime()), nodes: 1 + PEERS.length });
  }
  if (p === '/' && req.method === 'GET') {
    cors(res); res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(rootPage());
  }
  if (!p.startsWith('/api/v1/')) return json(res, 404, { error: 'not found' });
  if (!authorized(req, url)) return json(res, 401, { error: 'invalid token' });

  try {
    if (p === '/api/v1/nodes' && req.method === 'GET') {
      const nodes = await allNodes();
      return json(res, 200, { nodes });
    }
    if (p === '/api/v1/nodes/bind' && req.method === 'POST') {
      const nodes = await allNodes();
      return json(res, 200, { ok: true, nodes });
    }
    if (p.startsWith('/api/v1/nodes/') && req.method === 'GET') {
      const id = decodeURIComponent(p.slice('/api/v1/nodes/'.length));
      const node = await nodeDetail(id);
      return node ? json(res, 200, node) : json(res, 404, { error: 'node not found' });
    }
    return json(res, 404, { error: 'not found' });
  } catch (e) {
    console.error('[http] ' + (e && e.stack || e));
    return json(res, 500, { error: 'internal error' });
  }
});
server.requestTimeout = 15000;
server.headersTimeout = 20000;
server.listen(PORT, HOST, () => {
  const pub = env('NP_PUBLIC_URL', '') || ('http://<服务器IP>:' + PORT);
  console.log('');
  console.log('  NodePulse 服务端 v' + VERSION + ' 已启动');
  console.log('  监听        : ' + HOST + ':' + PORT);
  console.log('  节点        : ' + identity().name + ' (' + identity().id + ')');
  console.log('  数据源      : ' + (fs.existsSync('/host/proc/stat') ? '/host/proc + /host/sys（宿主机）' : '本机 /proc + /sys'));
  console.log('  TOKEN       : ' + TOKEN);
  console.log('  连接串      : ' + pub + '/?token=' + TOKEN);
  console.log('  健康检查    : ' + pub + '/healthz');
  console.log('');
});
