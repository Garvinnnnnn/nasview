#!/usr/bin/env bash
# NodePulse · 在 macOS / GitHub Actions 上构建可侧载 IPA
# 依赖 Secrets(环境变量):
#   SIGNING_CERTIFICATE_BASE64   p12 证书的 base64
#   SIGNING_CERTIFICATE_PASSWORD p12 密码
#   PROVISIONING_PROFILE_BASE64  mobileprovision 的 base64
#   KEYCHAIN_PASSWORD            临时钥匙串密码（可任意设置）
# 可选:
#   EXPORT_METHOD                development | ad-hoc（默认 ad-hoc）
set -euo pipefail

: "${SIGNING_CERTIFICATE_BASE64:?缺少 SIGNING_CERTIFICATE_BASE64}"
: "${SIGNING_CERTIFICATE_PASSWORD:?缺少 SIGNING_CERTIFICATE_PASSWORD}"
: "${PROVISIONING_PROFILE_BASE64:?缺少 PROVISIONING_PROFILE_BASE64}"
KEYCHAIN_PASSWORD="${KEYCHAIN_PASSWORD:-nodepulse-temp-kc}"
EXPORT_METHOD="${EXPORT_METHOD:-ad-hoc}"

WORK="${RUNNER_TEMP:-/tmp}/nodepulse-build"
KEYCHAIN="${WORK}/nodepulse.keychain-db"
PROFILE="${WORK}/nodepulse.mobileprovision"
ARCHIVE="${WORK}/NodePulse.xcarchive"
EXPORT_PLIST="${WORK}/ExportOptions.plist"

mkdir -p "${WORK}" build/export
rm -f "${KEYCHAIN}" "${PROFILE}"

echo "==> [1/6] 生成图标"
node scripts/gen-icons.js

echo "==> [2/6] 准备 iOS 平台"
if [ ! -d ios/App/App.xcodeproj ]; then
  npx cap add ios
fi
npx cap sync ios

echo "==> [3/6] 写入 App 图标"
ICONSET="ios/App/App/Assets.xcassets/AppIcon.appiconset"
mkdir -p "${ICONSET}"
cp www/assets/icons/icon-1024.png "${ICONSET}/AppIcon-512@2x.png"
# 兼容部分 Capacitor 版本的多尺寸槽位
for s in 20 29 40 60 76 83.5; do
  for m in 1x 2x 3x; do
    [ -f "${ICONSET}/AppIcon-${s}@${m}.png" ] && cp www/assets/icons/icon-1024.png "${ICONSET}/AppIcon-${s}@${m}.png" || true
  done
done
# 启动图：统一替换为品牌色图标（按 Contents.json 中的实际文件名）
for f in ios/App/App/Assets.xcassets/Splash.imageset/splash-*.png; do
  [ -f "$f" ] && cp www/assets/icons/icon-180.png "$f" || true
done

echo "==> [4/6] 导入签名材料"
echo "${SIGNING_CERTIFICATE_BASE64}" | base64 --decode --output "${WORK}/cert.p12"
echo "${PROVISIONING_PROFILE_BASE64}" | base64 --decode --output "${PROFILE}"
security create-keychain -p "${KEYCHAIN_PASSWORD}" "${KEYCHAIN}"
security set-keychain-settings -lut 21600 "${KEYCHAIN}"
security unlock-keychain -p "${KEYCHAIN_PASSWORD}" "${KEYCHAIN}"
security import "${WORK}/cert.p12" -P "${SIGNING_CERTIFICATE_PASSWORD}" -A -t cert -f pkcs12 -k "${KEYCHAIN}"
security set-key-partition-list -S apple-tool:,apple: -s -k "${KEYCHAIN_PASSWORD}" "${KEYCHAIN}" >/dev/null 2>&1 || true
security list-keychain -d user -s "${KEYCHAIN}"

PP_DIR="${HOME}/Library/MobileDevice/Provisioning Profiles"
mkdir -p "${PP_DIR}"
cp "${PROFILE}" "${PP_DIR}/nodepulse.mobileprovision"
security cms -D -i "${PROFILE}" > "${WORK}/profile.plist"

PROFILE_NAME=$(/usr/libexec/PlistBuddy -c "Print :Name" "${WORK}/profile.plist")
TEAM_ID=$(/usr/libexec/PlistBuddy -c "Print :TeamIdentifier:0" "${WORK}/profile.plist")
APP_ID=$(/usr/libexec/PlistBuddy -c "Print :Entitlements:application-identifier" "${WORK}/profile.plist" | sed "s/^${TEAM_ID}\.//")
IDENTITY=$(security find-identity -v -p codesigning "${KEYCHAIN}" | head -1 | sed -E 's/.*"([^"]+)".*/\1/')

echo "    Profile  : ${PROFILE_NAME}"
echo "    Team ID  : ${TEAM_ID}"
echo "    Bundle ID: ${APP_ID}"
echo "    Identity : ${IDENTITY}"
echo "    Method   : ${EXPORT_METHOD}"

# 让工程 Bundle ID 与描述文件一致（Capacitor 默认 com.nodepulse.client）
if [ -n "${APP_ID:-}" ] && [ "${APP_ID}" != "com.nodepulse.client" ]; then
  PBXPROJ="ios/App/App.xcodeproj/project.pbxproj"
  sed -i "" "s/PRODUCT_BUNDLE_IDENTIFIER = com\.nodepulse\.client;/PRODUCT_BUNDLE_IDENTIFIER = ${APP_ID};/g" "${PBXPROJ}"
fi

echo "==> [5/6] Archive"
# 确保存在共享 scheme，避免 xcodebuild -scheme App 找不到
SCHEME_DIR="ios/App/App.xcodeproj/xcshareddata/xcschemes"
mkdir -p "${SCHEME_DIR}"
# 动态提取 App target 的 Blueprint ID（不同 Capacitor 版本会变）
# 取 isa = PBXNativeTarget 那一条（其它同名行是 Product / Group 引用）
APP_ID_REF=$(grep -A1 -E '/\* App \*/ = \{' ios/App/App.xcodeproj/project.pbxproj | grep -B1 'PBXNativeTarget' | head -1 | sed -E 's/^[[:space:]]*([0-9A-F]+).*/\1/')
echo "    App target ref: ${APP_ID_REF}"
# 确保允许局域网 HTTP 访问自建 NAS 服务（ATS 例外，幂等）
INFO_PLIST="ios/App/App/Info.plist"
if ! /usr/libexec/PlistBuddy -c "Print :NSAppTransportSecurity:NSAllowsArbitraryLoads" "${INFO_PLIST}" >/dev/null 2>&1; then
  /usr/libexec/PlistBuddy -c "Add :NSAppTransportSecurity dict" "${INFO_PLIST}" >/dev/null 2>&1 || true
  /usr/libexec/PlistBuddy -c "Add :NSAppTransportSecurity:NSAllowsArbitraryLoads bool true" "${INFO_PLIST}" >/dev/null 2>&1 || true
fi

if [ ! -f "${SCHEME_DIR}/App.xcscheme" ]; then
cat > "${SCHEME_DIR}/App.xcscheme" <<XCSCHEME
<?xml version="1.0" encoding="UTF-8"?>
<Scheme LastUpgradeVersion="1500" version="1.7">
  <BuildAction parallelizeBuildables="YES" buildImplicitDependencies="YES">
    <BuildActionEntries>
      <BuildActionEntry buildForTesting="YES" buildForRunning="YES" buildForProfiling="YES" buildForArchiving="YES" buildForAnalyzing="YES">
        <BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="${APP_ID_REF}" BuildableName="App.app" BlueprintName="App" ReferencedContainer="container:App.xcodeproj"/>
      </BuildActionEntry>
    </BuildActionEntries>
  </BuildAction>
  <TestAction buildConfiguration="Debug" selectedDebuggerIdentifier="Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier="Xcode.DebuggerFoundation.Launcher.LLDB" shouldUseLaunchSchemeArgsEnv="YES">
    <Testables/>
  </TestAction>
  <LaunchAction buildConfiguration="Debug" selectedDebuggerIdentifier="Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier="Xcode.DebuggerFoundation.Launcher.LLDB" launchStyle="0" useCustomWorkingDirectory="NO" ignoresPersistentStateOnLaunch="NO" debugDocumentVersioning="YES" debugServiceExtension="internal" allowLocationSimulation="YES">
    <BuildableProductRunnable runnableDebuggingMode="0">
      <BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="${APP_ID_REF}" BuildableName="App.app" BlueprintName="App" ReferencedContainer="container:App.xcodeproj"/>
    </BuildableProductRunnable>
  </LaunchAction>
  <ProfileAction buildConfiguration="Release" shouldUseLaunchSchemeArgsEnv="YES" savedToolIdentifier="" useCustomWorkingDirectory="NO" debugDocumentVersioning="YES">
    <BuildableProductRunnable runnableDebuggingMode="0">
      <BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="${APP_ID_REF}" BuildableName="App.app" BlueprintName="App" ReferencedContainer="container:App.xcodeproj"/>
    </BuildableProductRunnable>
  </ProfileAction>
  <AnalyzeAction buildConfiguration="Debug"/>
  <ArchiveAction buildConfiguration="Release" revealArchiveInOrganizer="YES"/>
</Scheme>
XCSCHEME
fi
cd ios/App
pod install --repo-update
cd - >/dev/null

xcodebuild \
  -workspace ios/App/App.xcworkspace \
  -scheme App \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath "${ARCHIVE}" \
  CODE_SIGN_STYLE=Manual \
  CODE_SIGN_IDENTITY="${IDENTITY}" \
  PROVISIONING_PROFILE_SPECIFIER="${PROFILE_NAME}" \
  DEVELOPMENT_TEAM="${TEAM_ID}" \
  clean archive

cat > "${EXPORT_PLIST}" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key><string>${EXPORT_METHOD}</string>
  <key>teamID</key><string>${TEAM_ID}</string>
  <key>signingStyle</key><string>manual</string>
  <key>provisioningProfiles</key>
  <dict><key>${APP_ID}</key><string>${PROFILE_NAME}</string></dict>
  <key>compileBitcode</key><false/>
  <key>stripSwiftSymbols</key><true/>
  <key>thinning</key><string>&lt;none&gt;</string>
</dict>
</plist>
EOF

echo "==> [6/6] Export IPA"
xcodebuild -exportArchive \
  -archivePath "${ARCHIVE}" \
  -exportOptionsPlist "${EXPORT_PLIST}" \
  -exportPath build/export \
  CODE_SIGNING_ALLOWED=YES

ls -lh build/export/*.ipa
echo "BUILD_DONE"
