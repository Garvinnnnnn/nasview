#!/usr/bin/env bash
# NodePulse · 本地 Mac / 黑苹果 一键构建未签名 IPA
# 前置：已安装 Xcode（命令行工具亦可）与 CocoaPods
set -euo pipefail

echo "==> [0/4] 环境检查"
if ! command -v xcodebuild >/dev/null 2>&1; then
  echo "ERROR: 找不到 xcodebuild。请安装 Xcode 后执行 sudo xcode-select -s /Applications/Xcode.app/Contents/Developer" >&2
  exit 1
fi
xcodebuild -version | head -2

if ! command -v pod >/dev/null 2>&1; then
  echo "ERROR: 找不到 pod。请先执行 sudo gem install cocoapods" >&2
  exit 1
fi
pod --version

# 首次安装 Xcode 需接受许可；非交互环境失败也不影响后续（多数机器已接受）
sudo xcodebuild -license accept >/dev/null 2>&1 || true

echo "==> [1/4] 安装 node 依赖"
npm install --no-audit --no-fund

echo "==> [2/4] 生成图标并同步 iOS 工程"
node scripts/gen-icons.js

echo "==> [3/4] 编译并打包未签名 IPA"
bash scripts/build_ios_unsigned.sh

echo ""
echo "==> [4/4] 完成，产物位置："
ls -lh build/export/*.ipa
echo "未签名 IPA 无法直接装机，需送第三方签名平台代签，或用你自己的证书重签。"
