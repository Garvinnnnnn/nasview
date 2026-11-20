#!/usr/bin/env bash
# NodePulse · 构建「未签名 IPA」（不依赖任何证书 / Secrets）
# 用途：在云 Mac 上验证整个工程能否编译通过，产出可交给第三方签名平台代签的 IPA。
# 注意：未签名 IPA 无法直接安装到未越狱的 iPhone，只能用于验证编译或送去代签。
set -euo pipefail

WORK="${RUNNER_TEMP:-/tmp}/nodepulse-unsigned-build"
ARCHIVE="${WORK}/NodePulse.xcarchive"

mkdir -p "${WORK}" build/export

echo "==> [1/6] 生成图标"
node scripts/gen-icons.js

echo "==> [2/6] 准备 iOS 平台"
if [ ! -d ios/App/App.xcodeproj ]; then
  npx cap add ios
fi
npx cap sync ios

echo "==> [3/6] 写入 App 图标 / 启动图"
ICONSET="ios/App/App/Assets.xcassets/AppIcon.appiconset"
mkdir -p "${ICONSET}"
cp www/assets/icons/icon-1024.png "${ICONSET}/AppIcon-512@2x.png"
for s in 20 29 40 60 76 83.5; do
  for m in 1x 2x 3x; do
    [ -f "${ICONSET}/AppIcon-${s}@${m}.png" ] && cp www/assets/icons/icon-1024.png "${ICONSET}/AppIcon-${s}@${m}.png" || true
  done
done
for f in ios/App/App/Assets.xcassets/Splash.imageset/splash-*.png; do
  [ -f "$f" ] && cp www/assets/icons/icon-180.png "$f" || true
done

echo "==> [4/6] 准备 ATS 例外与共享 scheme"
# 允许局域网 HTTP 访问自建 NAS 服务（幂等）
INFO_PLIST="ios/App/App/Info.plist"
if ! /usr/libexec/PlistBuddy -c "Print :NSAppTransportSecurity:NSAllowsArbitraryLoads" "${INFO_PLIST}" >/dev/null 2>&1; then
  /usr/libexec/PlistBuddy -c "Add :NSAppTransportSecurity dict" "${INFO_PLIST}" >/dev/null 2>&1 || true
  /usr/libexec/PlistBuddy -c "Add :NSAppTransportSecurity:NSAllowsArbitraryLoads bool true" "${INFO_PLIST}" >/dev/null 2>&1 || true
fi

SCHEME_DIR="ios/App/App.xcodeproj/xcshareddata/xcschemes"
mkdir -p "${SCHEME_DIR}"
# 动态提取 App target 的 Blueprint ID
APP_ID_REF=$(grep -A1 -E '/\* App \*/ = \{' ios/App/App.xcodeproj/project.pbxproj | grep -B1 'PBXNativeTarget' | head -1 | sed -E 's/^[[:space:]]*([0-9A-F]+).*/\1/')
echo "    App target ref: ${APP_ID_REF}"
if [ -z "${APP_ID_REF}" ]; then
  echo "ERROR: 无法提取 App target 的 Blueprint ID" >&2
  exit 1
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

echo "==> [5/6] Archive（跳过代码签名）"
cd ios/App
pod install --repo-update
cd - >/dev/null

xcodebuild \
  -workspace ios/App/App.xcworkspace \
  -scheme App \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath "${ARCHIVE}" \
  CODE_SIGNING_ALLOWED=NO \
  CODE_SIGNING_REQUIRED=NO \
  CODE_SIGN_IDENTITY="" \
  clean archive

echo "==> [6/6] 手动打包为 IPA"
APP_APP="${ARCHIVE}/Products/Applications/App.app"
if [ ! -d "${APP_APP}" ]; then
  echo "ERROR: archive 中找不到 ${APP_APP}" >&2
  exit 1
fi
rm -rf build/export/Payload
mkdir -p build/export/Payload
cp -R "${APP_APP}" build/export/Payload/
(
  cd build/export
  zip -qry NodePulse-unsigned.ipa Payload
)
rm -rf build/export/Payload

ls -lh build/export/*.ipa
echo "BUILD_DONE"
