# NodePulse 服务端 API 契约（对接你自己的 NAS）

App 的数据层在 `www/js/data.js`。设置页填入「服务端地址 + TOKEN」后切到「真实 NAS」模式，App 会带上 `Authorization: Bearer <TOKEN>` 请求下面三个接口。

## 鉴权

所有请求 Header：
```
Authorization: Bearer <你的TOKEN>
Accept: application/json
```
服务端应校验 TOKEN，无效时返回 `401`。

## 接口

### 1. 获取节点列表
`GET /api/v1/nodes`

返回：
```json
{
  "nodes": [
    {
      "id": "nas-01",
      "name": "客厅 NAS",
      "type": "NAS",
      "location": "家庭存储",
      "online": true,
      "connType": "本地连接",
      "ip": "192.168.1.10",
      "os": "DSM 7.2",
      "uptime": "32 天 14 小时",
      "cpuUsage": 23, "memUsage": 58, "storageUsage": 72
    }
  ]
}
```
> 列表接口只需给概览卡用到的 `cpuUsage / memUsage / storageUsage`（0-100 数字）即可。

### 2. 获取单个节点详情
`GET /api/v1/nodes/{id}`

返回字段（与演示数据结构一致，`data.js` 的 `normalizeNode` 会补默认值，所以字段可以缺省）：

```json
{
  "id": "nas-01", "name": "客厅 NAS", "type": "NAS", "online": true,
  "connType": "本地连接", "ip": "192.168.1.10", "mac": "A4:BB:6D:3E:91:02",
  "os": "DSM 7.2", "uptime": "32 天 14 小时", "lastSeen": "刚刚",
  "services": { "ok": 8, "total": 8, "list": ["文件服务", "Docker"] },
  "cpu": {
    "usage": 23, "cores": 8, "model": "Intel J4125", "temp": 41,
    "load": [0.42, 0.56, 0.61],
    "history": [20, 22, 19, 25, 23, 24]
  },
  "memory": { "used": 4.6, "total": 8, "usage": 58, "history": [55, 57, 58] },
  "storage": {
    "used": 11240, "total": 15600, "usage": 72,
    "pools": [
      { "name": "Storage Pool 1", "fs": "Btrfs", "used": 8240, "total": 10400, "usage": 79 }
    ]
  },
  "disks": [
    {
      "name": "Disk 1", "model": "WD Red Plus 4TB", "size": "3.6 TB", "type": "HDD",
      "health": "良好", "temp": 36,
      "smart": ["通电 18240 小时", "重映射扇区 0"]
    }
  ],
  "temps": { "cpu": 41, "disk": 38, "board": 35, "max": 44 },
  "fans": [{ "name": "系统风扇 1", "rpm": 1240 }],
  "network": { "ip": "192.168.1.10", "mask": "255.255.255.0", "speed": "1 Gbps", "rx": 2.4, "tx": 0.8, "conns": 46 },
  "containers": [
    { "name": "jellyfin", "image": "jellyfin/jellyfin", "status": "运行中", "uptime": "32 天", "warn": false }
  ]
}
```

单位约定：
- `memory.used / total`：GB
- `storage.used / total`：**GB**（App 内部 >=1024 显示为 TB）
- `network.rx / tx`：MB/s
- `temps.*`、`disks[].temp`：摄氏度
- `health` 取值：`良好 / 注意 / 危险 / 未知`（映射为绿/黄/红/灰）

### 3. 绑定校验（TOKEN 连接时用）
App 绑定时会调 `GET /api/v1/nodes` 校验 TOKEN。只要该接口能正确返回即视为绑定成功。若你想单独提供绑定接口，也可让 App 侧改造为 `POST /api/v1/nodes/bind`。

## 最快接入方式

如果你只是想尽快在 App 里看到自己 NAS 的数据，最简单：**在你 NAS 上跑一个把系统信息包装成上述 JSON 的小服务**（Python/Node 均可，监听如 `8787` 端口），App 里服务端地址填 `http://<NAS的IP>:8787`，TOKEN 填你在该服务里设定的字符串即可。

需要注意：iOS 默认禁止明文 HTTP（ATS）。若你的服务端是 http，需要在 `capacitor.config.json` 加入：
```json
"ios": { "allowNavigation": ["*"] }
```
并在 `ios/App/App/Info.plist` 增加 `NSAppTransportSecurity` 的 `NSAllowsArbitraryLoads = true`（或仅对你的局域网 IP 设置例外）。用 HTTPS 则无需处理。
