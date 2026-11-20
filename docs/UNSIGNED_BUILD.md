# 未签名 IPA · 网页极简构建清单（无需证书 / 无需命令行）

目标：借用 GitHub 的云 Mac 验证工程能否编译，产出一个**未签名 IPA**。
整个过程只需 4 步，全部在 GitHub 网页完成，不需要 p12 / 描述文件 / Secrets。

> 未签名 IPA 不能直接装进未越狱的 iPhone。它的用途是：① 验证编译是否通过；② 交给第三方签名平台代签（豆包那种方式）。

---

## 第 1 步：建一个私有仓库

1. 打开 https://github.com/new
2. Repository name 填 `nasview`（或任意名字）
3. 勾选 **Private**
4. 不要勾选 "Initialize this repository with a README"（保持空仓库）
5. 点 **Create repository**

---

## 第 2 步：把工程上传上去（网页拖拽，不用命令行）

1. 在电脑资源管理器打开工程目录：`E:\work\aiProject\nasview`
2. 全选里面的**所有文件和文件夹**，但**排除**这三项：
   - `node_modules`（很大，不需要上传）
   - `.git`（本地 git 元数据，不需要上传）
   - `build`（如果有，构建产物）
3. 把选中的文件**直接拖到**刚建好的 GitHub 仓库网页的上传区域（页面上有 "uploading an existing file" 链接，点它）
4. 等待上传完成，页面底部点 **Commit changes**

> 如果拖拽的是文件夹，GitHub 网页支持整个文件夹上传。上传后目录结构应是：根目录下有 `www/`、`ios/`、`scripts/`、`docs/`、`.github/`、`package.json` 等。

---

## 第 3 步：触发构建

1. 在仓库页面上方点 **Actions** 标签
2. 左侧列表里找到并点击 **Build NodePulse IPA (unsigned / 编译验证)**
3. 右侧点 **Run workflow** → 再点绿色的 **Run workflow** 按钮
4. 这时会出现一个黄色的运行中任务，点进去可以看到实时日志

---

## 第 4 步：下载 IPA

1. 等 10–20 分钟，任务变成绿色对勾 ✅ 表示编译成功
2. 在这个 Run 页面的最下方，找到 **Artifacts** 区域的 `NodePulse-unsigned-IPA`
3. 点它下载，解压后就是 `NodePulse-unsigned.ipa`

---

## 如果构建失败（红色 ❌）

1. 点进失败的 Run，再点失败的那一步（通常是 `Build unsigned IPA`）
2. 把**最后 30 行红色报错日志**复制发给我
3. 我根据报错直接改代码，你重新上传 / 重新触发即可

---

## 想让我直接帮你操作？

当前对话的 GitHub 工具没挂载，无法代操作。**新开一个对话**，说：

> "GitHub 已授权，用连接器把 E:/work/aiProject/nasview 建私有仓库、push、触发 unsigned 工作流构建。"

新会话会自动加载 GitHub 工具，我就能一步到位。

---

## 拿到未签名 IPA 之后

- **只是想验证编译**：到这里就结束了，Artifact 就是证明。
- **想装进 iPhone**：需要签名，两条路：
  1. 上传到第三方企业签名平台代签（豆包那种，需信任企业证书、有掉签风险）；
  2. 用你自己的 p12 + 描述文件，走仓库里的 `Build NodePulse IPA (sideload)` 工作流。
