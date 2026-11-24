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

> 当前侧载 IPA 已内置 `NSAllowsArbitraryLoads = true`，局域网 `http://` 可直接连。

---

## 参考服务端（本仓库已实现）

`server/index.js` 是一个**零依赖**的 Node.js（>= 18）实现，直接采集宿主机真实指标，字段与本契约 / `www/js/mock.js` 完全一致，并额外提供：

| 接口 | 说明 |
|---|---|
| `GET /healthz` | 健康检查，无需鉴权 |
| `GET /` | 部署信息页（TOKEN 默认打码） |
| `GET /api/v1/nodes` | 节点列表（返回完整对象，App 的 `getNode` 失败时也能回退） |
| `GET /api/v1/nodes/{id}` | 节点详情 |
| `POST /api/v1/nodes/bind` | 可选绑定校验 |

自动采集：CPU 占用 / 核数 / 型号 / 负载 / 历史曲线、内存、运行时长、系统版本、监听端口映射的「服务」、IPv4 / 掩码 / MAC / 网卡速率 / 实时上下行速率 / TCP 连接数、存储池（`df`）、硬盘（`lsblk`）、SMART（`smartctl -j`）、温度与风扇（`/sys/class/hwmon`、`thermal_zone`）、Docker 容器（`docker ps`）。

**降级策略**：任一命令缺失、无权限或非 Linux 环境时对应字段给 `0 / [] / 未知`，接口始终返回 200，不会让 App 报错。CORS 已放开（含 `Authorization`、`X-Client` 预检），TOKEN 用 `timingSafeEqual` 校验。

### 一键部署（在你的 Mac 上执行一条命令）

```bash
bash server/deploy.sh root@192.168.1.10
```

脚本会：SSH 探测服务器 → 有 Node 18+ 走裸机（指标最准），否则走 Docker Compose → 上传文件 → 自动生成 TOKEN → 后台启动 + `@reboot` 自启 → 健康检查 → 打印连接串。常用参数：

```bash
NP_TOKEN=my-secret bash server/deploy.sh root@192.168.1.10 \
  --name "客厅 NAS" --type NAS --mode bare
# --port 8787 / --url http://nas.local:8787 / --dir /opt/nodepulse
# --mode auto|bare|docker / --systemd（额外装 systemd 服务）
```

部署完成后终端会输出 `http://<IP>:8787/?token=<TOKEN>`，把它粘贴到 App 引导页的「连接串 / TOKEN」即可；或在设置页分别填服务端地址与 TOKEN，再切到「真实 NAS」。

### 在服务器上直接一键安装（无需 Mac）

代码推送到 GitHub 后，在服务器执行：

```bash
curl -fsSL https://raw.githubusercontent.com/Garvinnnnnn/nasview/main/server/install.sh | NP_TOKEN=my-secret bash
```

### 本地调试 / Docker

```bash
npm run server                       # 本地起在 8787
cd server && cp .env.example .env && docker compose up -d --build
```

Docker 方式通过只读挂载 `/proc:/host/proc`、`/sys:/host/sys` 读取宿主机指标；SMART 需要 `NP_PRIVILEGED=true`。裸机方式无需挂载，SMART / 风扇 / 存储池数据最完整。

### 环境变量

`NP_TOKEN`（不填自动生成并写入 `data/token.txt`）、`NP_PORT`、`NP_HOST`、`NP_PUBLIC_URL`、`NP_NODE_ID`、`NP_NODE_NAME`、`NP_NODE_TYPE`、`NP_LOCATION`、`NP_CONN_TYPE`、`NP_OS`、`NP_IP`、`NP_MAC`、`NP_MASK`、`NP_IFACE`、`NP_PEERS`（逗号分隔的其他 NodePulse 地址，用于多节点聚合）、`NP_SHOW_TOKEN`、`NP_CACHE_MS`、`NP_DATA_DIR`。

### 多节点

每台设备各部署一个服务端，然后把其中一台设为聚合节点：`NP_PEERS=http://192.168.1.11:8787,http://192.168.1.12:8787`，App 只需连这一台即可看到全部节点（详情接口会自动转发到对应设备）。
