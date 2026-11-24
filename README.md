# NodePulse · 节点脉搏（仿制演示版）

仿 [NasPulse](https://www.naspulse.com/) 界面与交互做的 iOS 侧载客户端。前端为 Capacitor 打包的 Web App，支持演示数据与真实 NAS 数据两种模式。

> 这是非官方仿制演示项目，与 NasPulse 官方无关联。仅用于个人学习与局域网设备状态查看。

## 已实现功能

- 启动引导页：扫码添加节点 / TOKEN 连接 / 演示数据体验
- 状态总览：在线状态、服务数、运行时长、CPU/内存/负载环形指标
- 性能资源：CPU、内存、负载、历史曲线
- 存储状态：容量环 + 存储池列表
- 硬盘 SMART：健康状态、温度、SMART 摘要
- 风扇与温度：CPU/硬盘温度、风扇转速
- 网络与连接：IP、速率、连接数、MAC
- 容器服务：Docker 容器运行状态
- 多节点管理：节点列表、切换节点
- 设置：演示/真实模式切换、服务端地址/TOKEN、测试连接、浅色/深色主题
- 数据对接层：见 [docs/API.md](docs/API.md)

## 目录结构

```
nasview/
├── www/                      # Web App 源码（Capacitor webDir）
│   ├── index.html
│   ├── css/style.css
│   ├── js/{icons,mock,data,app}.js
│   └── assets/icons/         # 应用图标
├── scripts/
│   ├── gen-icons.js          # 生成各尺寸 PNG 图标
│   ├── build_ios.sh          # macOS 上构建签名 IPA（付费账号）
│   └── build_ios_free.sh     # 个人免费 Apple ID 构建
├── server/                   # 参考服务端（零依赖 Node.js，采集真实指标）
│   ├── index.js              # API 实现
│   ├── deploy.sh             # 本地一键部署到服务器
│   ├── install.sh            # 服务器端一键安装
│   ├── Dockerfile / docker-compose.yml
│   └── .env.example
├── .github/workflows/build-ios.yml   # GitHub Actions 云打包
├── capacitor.config.json
└── package.json
```

## 本地预览

```bash
cd www && python -m http.server 8080
# 浏览器打开 http://localhost:8080
```

## 打包成可侧载 IPA（GitHub Actions 云打包）

当前是 Windows 环境，无法直接编译 iOS App。用 GitHub 的云 Mac 构建：

### 第 1 步：准备签名材料（二选一）

**A. 付费 Apple Developer 账号（$99/年，推荐，签名 1 年有效）**

1. 在 [Apple Developer](https://developer.apple.com) 创建 **iOS App Development** 或 **Apple Development** 证书，下载 `.p12`（设置密码）。
2. 创建 App ID（Bundle ID，如 `com.nodepulse.client`）。
3. 创建 **Development** 或 **Ad Hoc** 描述文件（Ad Hoc 需填设备 UDID），下载 `.mobileprovision`。

**B. 个人免费 Apple ID（0 元，签名 7 天过期，需重装）**

1. 在 **Mac + Xcode** 中：Xcode → Settings → Accounts → 登录你的 Apple ID。
2. 新建一个 iOS App 项目，Target → Signing 选你的个人 Team，勾选"Automatically manage signing"。
3. 连上你的 iPhone 真机跑一次（这会把设备注册进描述文件）。
4. 从钥匙串导出签名证书为 `.p12`（密码留空），从 Xcode 下载对应的 `.mobileprovision`。
5. 注意：个人团队签名的 App **每 7 天需要用签名设备重新打开一次**，或用 AltStore/SideStore 自动续签。

### 第 2 步：把材料转成 base64

在 Git Bash / 终端执行（把路径换成你的文件）：

```bash
# Windows Git Bash
base64 -w 0 cert.p12
base64 -w 0 profile.mobileprovision

# macOS
base64 -i cert.p12 | tr -d '\n'
base64 -i profile.mobileprovision | tr -d '\n'
```

把输出的长字符串保存好。

### 第 3 步：新建 GitHub 仓库并配置 Secrets

1. 把本项目所有文件 push 到一个新的 GitHub 仓库（私有仓库即可）。
2. 仓库 → Settings → Secrets and variables → Actions → New repository secret，添加：

| Secret 名 | 值 |
|---|---|
| `SIGNING_CERTIFICATE_BASE64` | 第 2 步得到的 p12 base64 |
| `SIGNING_CERTIFICATE_PASSWORD` | p12 密码（个人团队留空字符串） |
| `PROVISIONING_PROFILE_BASE64` | 描述文件 base64 |
| `KEYCHAIN_PASSWORD` | 任意字符串，如 `nodepulse123` |
| `EXPORT_METHOD` | `ad-hoc`（付费/Ad Hoc）或 `development`（个人免费）|

### 第 4 步：触发构建

- 进入仓库 **Actions** 标签 → 选择 **Build NodePulse IPA (sideload)** → **Run workflow**；
- 或 push 一个 `v` 开头的 tag（如 `git tag v1.0 && git push origin v1.0`）。

构建约 10-20 分钟（macOS runner 是 10 倍计费，注意 GitHub Free 每月 2000 分钟额度）。

### 第 5 步：下载 IPA 并侧载

构建完成后，在 Actions 运行页面底部的 **Artifacts** 下载 `NodePulse-IPA`（zip，解压得 `.ipa`）。侧载方式：

- **付费账号 Ad Hoc / Development 签名**：用 Xcode → Devices and Simulators → 拖入 IPA 安装；或 Apple Configurator 2。
- **个人免费签名 / 已越狱 / AltStore**：用 **AltStore**、**SideStore**、**Sideloadly** 等工具，选择 IPA + 你的 Apple ID 安装到手机。
- 首次安装需在 iPhone **设置 → 通用 → VPN与设备管理** 里信任你的开发者证书。

## 连接自己的 NAS

App 已内置对接层。两种路径：

1. **用本仓库的参考服务端（推荐）**：一条命令部署到 NAS / 服务器，自动采集 CPU、内存、存储池、硬盘 SMART、温度风扇、网络、Docker 容器等真实数据：

   ```bash
   bash server/deploy.sh root@192.168.1.10
   ```

   部署完终端会打印服务端地址、TOKEN 和可直接粘贴的连接串。详见 [docs/API.md](docs/API.md)。
2. **有现成服务端**：按 [docs/API.md](docs/API.md) 的契约提供接口（只需 `GET /api/v1/nodes` 和 `GET /api/v1/nodes/{id}` + Bearer TOKEN），在 App 设置页填地址与 TOKEN，切到「真实 NAS」模式。

演示数据用于先看界面效果，随时可在设置页切回。

## 常见问题

- **构建报签名错误**：确认 Secrets 的 base64 不含换行/空格；确认描述文件里的 Bundle ID 与工程一致（脚本会自动对齐）；个人团队 `EXPORT_METHOD` 必须是 `development`。
- **IPA 装不上 / 打开即退**：证书与设备 UDID 不匹配（Ad Hoc/Development 描述文件必须包含目标设备）；或个人签名已过 7 天，需重签。
- **App 里请求 NAS 失败**：若服务端是 http，需在 `ios/App/App/Info.plist` 配置 ATS 例外（见 docs/API.md）；确认手机与 NAS 同局域网。
