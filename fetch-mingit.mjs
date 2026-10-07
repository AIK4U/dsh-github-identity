// Download MinGit (portable git for Windows) trying several mirrors.
//
// The direct GitHub release CDN reset the connection on this host
// (ECONNRESET) even though api.github.com is reachable over Node's TLS,
// so each candidate is attempted in order until one yields a real zip.
//
// Node's TLS stack is used because Windows Schannel is broken here.
// ASCII only by project rule.

import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const VER = 'v2.56.0.windows.2';
const FILE = 'MinGit-2.56.0.2-64-bit.zip';
const GH = `https://github.com/git-for-windows/git/releases/download/${VER}/${FILE}`;

const CANDIDATES = [
  `https://registry.npmmirror.com/-/binary/git-for-windows/${VER}/${FILE}`,
  `https://ghfast.top/${GH}`,
  `https://gh-proxy.com/${GH}`,
  `https://ghproxy.net/${GH}`,
  GH,
];

const outDir = process.argv[2];
if (!outDir) {
  console.log('USAGE: node fetch-mingit.mjs <outDir>');
  process.exit(2);
}

const MIN_BYTES = 20 * 1024 * 1024;

async function tryUrl(url) {
  console.log('TRY', url);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: { 'User-Agent': 'dsh-fetch' },
    });
    if (!res.ok) {
      console.log('  http', res.status);
      return null;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    console.log('  bytes', buf.length);
    if (buf.length < MIN_BYTES) {
      console.log('  too small, rejecting');
      return null;
    }
    // A zip must start with the local-file-header magic PK\x03\x04.
    if (buf[0] !== 0x50 || buf[1] !== 0x4b) {
      console.log('  not a zip, rejecting');
      return null;
    }
    return buf;
  } catch (e) {
    console.log('  error', e.message, e.cause && e.cause.message);
    return null;
  }
}

async function main() {
  await mkdir(outDir, { recursive: true });
  for (const url of CANDIDATES) {
    const buf = await tryUrl(url);
    if (!buf) continue;
    const out = path.join(outDir, FILE);
    await writeFile(out, buf);
    console.log('OK_SOURCE', url);
    console.log('WROTE', out, buf.length);
    console.log('SHA256', createHash('sha256').update(buf).digest('hex'));
    return;
  }
  console.log('ALL_MIRRORS_FAILED');
  process.exit(1);
}

main().catch((e) => {
  console.log('FATAL', e.message);
  process.exit(1);
});
