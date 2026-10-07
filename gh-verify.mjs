// Independently verify what actually landed on GitHub.
//
// Reads the remote through the REST API rather than through git, so a
// successful `git push` exit code is never mistaken for proof. Also refuses
// to stay quiet about key material: a repo that documents SSH setup is
// exactly the kind of place a private key gets committed by accident.
//
// Usage:  node gh-verify.mjs <owner/repo> [expected-file ...]
// ASCII only by project rule.

const slug = process.argv[2];
const expected = process.argv.slice(3);

if (!slug || !slug.includes('/')) {
  console.log('USAGE: node gh-verify.mjs <owner/repo> [expected-file ...]');
  process.exit(2);
}

const HEADERS = { 'User-Agent': 'dsh-gh-check', Accept: 'application/vnd.github+json' };

async function getJson(url) {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

async function main() {
  const repo = await getJson(`https://api.github.com/repos/${slug}`);
  console.log('full_name     :', repo.full_name);
  console.log('private       :', repo.private);
  console.log('default_branch:', repo.default_branch);
  console.log('pushed_at     :', repo.pushed_at);
  console.log('html_url      :', repo.html_url);

  const commit = await getJson(`https://api.github.com/repos/${slug}/commits/${repo.default_branch}`);
  const c = commit.commit || {};
  const a = c.author || {};
  console.log('--- latest commit ---');
  console.log('sha    :', commit.sha);
  console.log('message:', (c.message || '').split('\n')[0]);
  console.log('author :', a.name, '<' + a.email + '>');
  console.log('date   :', a.date);

  const files = await getJson(`https://api.github.com/repos/${slug}/contents/`);
  if (!Array.isArray(files)) throw new Error('unexpected contents payload');
  console.log('--- files at root:', files.length, '---');
  for (const f of files) console.log(' -', f.name, '(' + f.type + ', ' + f.size + ' bytes)');

  if (expected.length > 0) {
    const names = files.map((f) => f.name);
    const missing = expected.filter((n) => !names.includes(n));
    console.log('MISSING', missing.length === 0 ? 'none' : missing.join(', '));
  }

  const leaked = files
    .map((f) => f.name)
    .filter((n) => /ed25519|id_rsa|\.pem$|\.key$|known_hosts|credential|\.env$/i.test(n));
  console.log('KEY_MATERIAL_LEAKED', leaked.length === 0 ? 'none' : leaked.join(', '));
}

main().catch((e) => {
  console.log('ERROR', e.message);
  process.exit(1);
});
