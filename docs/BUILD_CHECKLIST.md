# 云打包 IPA · 最小操作清单（你自己操作版）

目标：用 GitHub 的云 Mac 编译并签名，产出一个能装进手机的 `.ipa`。
全程证书不经过 AI，**只在你自己的电脑和 GitHub 之间流转**。

---

## 第 0 步：把证书转成可粘贴的值（1 分钟）

在**你自己电脑**上装好 Node.js，打开终端，进入本工程目录，执行：

```bash
node scripts/prepare-signing.js "你的证书.p12路径" "你的描述文件.mobileprovision路径"
```

例：
```bash
node scripts/prepare-signing.js "C:/Users/me/certs/cert.p12" "C:/Users/me/certs/profile.mobileprovision"
```

会生成 `signing-secrets.txt`，里面有 5 段值。**打开它，保留着，下一步要用。**

> 这个文件含敏感信息，别提交 git、别发给任何人。

---

## 第 1 步：建一个 GitHub 私有仓库（网页，1 分钟）

1. 打开 https://github.com/new
2. Repository name 随便填，如 `nodepulse-ios`
3. 选 **Private**（私有）
4. **不要**勾选 "Add a README"（我们已经有了）
5. 点 **Create repository**
6. 创建后页面会显示一个仓库地址，形如：
   `https://github.com/你的用户名/nodepulse-ios.git`
   **复制这个地址**，下一步要用。

---

## 第 2 步：把代码推上去（终端，1 分钟）

在本工程根目录（`E:/work/aiProject/nasview`）执行，把上面复制的地址替换进去：

```bash
git remote add origin https://github.com/你的用户名/nodepulse-ios.git
git branch -M main
git push -u origin main
```

如果提示登录：Git 会弹窗让你登录 GitHub（或用 Personal Access Token 当密码）。

---

## 第 3 步：配置 5 个 Secrets（网页，2 分钟）

进入你的仓库 → **Settings** → 左侧 **Secrets and variables** → **Actions** → **New repository secret**。

把第 0 步生成的 `signing-secrets.txt` 里 5 个值，逐个新建：

| Name | Value（来自 signing-secrets.txt） |
|---|---|
| `SIGNING_CERTIFICATE_BASE64` | `[Secret 1]` 下面那长串 base64 |
| `PROVISIONING_PROFILE_BASE64` | `[Secret 2]` 下面那长串 base64 |
| `KEYCHAIN_PASSWORD` | 填 `nodepulse123` |
| `EXPORT_METHOD` | 付费账号填 `ad-hoc`；个人免费 Apple ID 填 `development` |
| `SIGNING_CERTIFICATE_PASSWORD` | 你导出 p12 时的密码（个人团队通常留空） |

---

## 第 4 步：触发构建（网页，1 分钟）

1. 仓库顶部点 **Actions** 标签
2. 左侧选 **Build NodePulse IPA (sideload)**
3. 右侧点 **Run workflow** → 再点绿色 **Run workflow** 按钮
4. 等 10–20 分钟（首次可能久一点）。macOS runner 按 10 倍分钟数计费，注意 GitHub 免费额度每月 2000 分钟。

---

## 第 5 步：下载 IPA（网页，1 分钟）

构建成功后，点开这次运行记录，页面拉到底 **Artifacts** → 下载 `NodePulse-IPA`（是个 zip）→ 解压得到 `.ipa`。

装到手机：
- **付费账号 Ad Hoc 签名**：用 Xcode → Window → Devices and Simulators → 拖入 IPA；或 Apple Configurator 2。
- **个人免费签名**：用 AltStore / SideStore / Sideloadly 安装。
- 首次安装后，去 iPhone **设置 → 通用 → VPN与设备管理** 信任你的证书。

---

## 可能遇到的问题

| 现象 | 原因 / 解决 |
|---|---|
| push 要登录但没弹窗 | 用 GitHub Personal Access Token 当密码（需 repo 权限） |
| 构建报签名错误 | Secrets 的 base64 不能有多余换行/空格；Bundle ID 要与描述文件一致（脚本会自动对齐） |
| 构建报 `EXPORT_METHOD` 相关 | 个人免费账号必须填 `development` |
| 装不上 / 打开闪退 | 描述文件里的设备 UDID 不含你的手机；或个人签名满 7 天需重装 |
| 构建排队很久 | 免费账户 macOS runner 并发有限，稍等 |

---

## 为什么必须这么麻烦？

- IPA 只能在 **macOS + Xcode** 上编译，Windows 做不到——所以借 GitHub 的云 Mac。
- IPA 必须用**苹果证书签名**才能装进手机——所以必须有 p12 + 描述文件。
- 这两条是苹果的硬性规定，任何工具都绕不开。
