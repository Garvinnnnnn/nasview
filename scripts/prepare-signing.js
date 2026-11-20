/* NodePulse · 本地签名材料 -> GitHub Secrets 值生成器
 * 用途：在你自己的电脑上，把 p12 和 mobileprovision 转成可粘贴到 GitHub Secrets 的 base64。
 * 证书全程留在本机，不会上传、不会发给任何人。
 *
 * 用法（在本工程根目录执行）：
 *   node scripts/prepare-signing.js <证书.p12路径> <描述文件.mobileprovision路径>
 * 例：
 *   node scripts/prepare-signing.js "C:/Users/me/certs/cert.p12" "C:/Users/me/certs/profile.mobileprovision"
 *
 * 生成的文件：signing-secrets.txt（请勿提交 git、请勿发给他人）
 */
const fs = require('fs');
const path = require('path');

const [, , p12Path, ppPath] = process.argv;

if (!p12Path || !ppPath) {
  console.error('用法: node scripts/prepare-signing.js <证书.p12> <描述文件.mobileprovision>');
  process.exit(1);
}

function toBase64(p, label) {
  const abs = path.resolve(p.replace(/^"|"$/g, ''));
  if (!fs.existsSync(abs)) {
    console.error(`找不到${label}文件: ${abs}`);
    process.exit(1);
  }
  return fs.readFileSync(abs).toString('base64').replace(/\s/g, '');
}

const p12b64 = toBase64(p12Path, 'p12 证书');
const ppb64 = toBase64(ppPath, '描述文件');

const out = [
  '============================================================',
  ' NodePulse 云打包 · GitHub Secrets 配置值',
  ' 把下面每个「值」复制到 GitHub 仓库 Settings > Secrets and variables > Actions',
  ' 生成的 New repository secret 中。此文件含敏感信息：不要提交 git，不要发给他人。',
  '============================================================',
  '',
  '[Secret 1] SIGNING_CERTIFICATE_BASE64',
  p12b64,
  '',
  '[Secret 2] PROVISIONING_PROFILE_BASE64',
  ppb64,
  '',
  '[Secret 3] KEYCHAIN_PASSWORD',
  'nodepulse123',
  '',
  '[Secret 4] EXPORT_METHOD',
  'ad-hoc   （付费开发者账号用；个人免费 Apple ID 请改成 development）',
  '',
  '[Secret 5] SIGNING_CERTIFICATE_PASSWORD',
  '（填你导出 p12 时设置的密码；个人团队通常为空，就填一个空字符串）',
  '',
  '============================================================',
  ' 下一步：把代码 push 到 GitHub 后，在 Actions 里触发 Build NodePulse IPA',
  ' 构建完成后在 Artifacts 下载 NodePulse-IPA.zip，解压得到 .ipa',
  '============================================================'
].join('\n');

const outFile = path.join(__dirname, '..', 'signing-secrets.txt');
fs.writeFileSync(outFile, out, 'utf8');
console.log('已生成:', outFile);
console.log('请打开它，把里面的 base64 值复制到 GitHub Secrets。');
