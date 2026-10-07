// Generate the ed25519 key pair for the GitHub publishing identity.
//
// HARD-WON RECIPE (do not "simplify" this, it will break):
//
//  1. On this host ssh-keygen CANNOT create the ".pub" file itself - it dies
//     with "Bad file descriptor" and leaves a 0-byte file that afterwards
//     cannot be deleted by anything (EPERM), not even Node's unlink.
//  2. If the ".pub" file ALREADY EXISTS as an ordinary writable file, that
//     code path is never taken and ssh-keygen writes both keys correctly.
//     So we pre-create it empty, then run ssh-keygen over it. Verified.
//  3. ssh-keygen must create the PRIVATE key: it is the only thing here that
//     stamps the tight ACL OpenSSH requires. A key written by Node inherits
//     the folder's open ACL and ssh / ssh-keygen refuse to load it
//     ("Permissions ... are too open"), and icacls is denied by the sandbox
//     so the ACL cannot be repaired afterwards either.
//  4. PowerShell DROPS empty-string native arguments, so `-N ''` never
//     reaches ssh-keygen from PowerShell. spawn() with an args array does.
//  5. spawn must use stdio:'inherit'. Capturing a child's output through a
//     pipe hits EPERM in the DSH sandbox.
//
// Paths come from the environment (UTF-16 safe), so the non-ASCII workspace
// path never has to survive PowerShell -> argv.
// ASCII only by project rule.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const keyDir = process.env.KEYDIR || path.join(here, 'github-identity');
const keyBase = process.env.KEYBASE || 'github_ed25519';
const keyPath = path.join(keyDir, keyBase);
const pubPath = keyPath + '.pub';
const comment = process.env.KEYCOMMENT || 'guyan@dsh';

function fail(msg) {
  console.log('FAIL', msg);
  process.exit(1);
}

function main() {
  console.log('KEYDIR ', keyDir);
  console.log('KEYBASE', keyBase);
  mkdirSync(keyDir, { recursive: true });

  if (existsSync(keyPath)) fail('private key already exists, refusing to overwrite: ' + keyPath);

  // Step 2 of the recipe: pre-create the .pub so ssh-keygen takes its
  // "overwrite an existing file" path instead of its broken create path.
  if (!existsSync(pubPath)) {
    writeFileSync(pubPath, '');
  }

  const args = ['-t', 'ed25519', '-f', keyPath, '-N', '', '-C', comment];
  const r = spawnSync('ssh-keygen', args, { stdio: 'inherit', cwd: here });
  if (r.error) fail('spawn: ' + r.error.message);
  if (r.status !== 0) fail('ssh-keygen exit=' + r.status);

  if (!existsSync(keyPath)) fail('private key missing after keygen');
  if (!existsSync(pubPath)) fail('public key missing after keygen');

  const privSize = statSync(keyPath).size;
  if (privSize < 200) fail('private key suspiciously small: ' + privSize);

  const pubLine = readFileSync(pubPath, 'utf8').trim();
  if (!pubLine.startsWith('ssh-ed25519 ')) fail('public key malformed: ' + pubLine);
  if (pubLine.length < 60) fail('public key suspiciously short');

  console.log('PRIVATE_KEY', keyPath, privSize + ' bytes');
  console.log('PUBLIC_KEY ', pubPath);
  console.log('PUBLIC_KEY_BEGIN');
  console.log(pubLine);
  console.log('PUBLIC_KEY_END');
}

main();
