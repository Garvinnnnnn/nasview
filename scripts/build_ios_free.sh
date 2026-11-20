#!/usr/bin/env bash
# NodePulse · 使用「个人免费 Apple ID」团队证书构建 IPA（无需付费开发者账号）
# 限制：签名 7 天过期，且描述文件需包含目标设备的 UDID。
#
# 前置：先在 Mac 上用 Xcode 登录你的 Apple ID（Preferences > Accounts），
#       生成包含目标设备的 iOS Development 证书与描述文件，导出为 p12 + mobileprovision。
#       个人团队导出的 p12 密码通常为空字符串。
#
# Secrets(环境变量):
#   SIGNING_CERTIFICATE_BASE64   p12 证书 base64
#   SIGNING_CERTIFICATE_PASSWORD p12 密码（个人团队通常留空，设为空字符串）
#   PROVISIONING_PROFILE_BASE64  mobileprovision 的 base64
#   KEYCHAIN_PASSWORD            临时钥匙串密码（任意）
set -euo pipefail
export EXPORT_METHOD="development"
bash "$(dirname "$0")/build_ios.sh"
