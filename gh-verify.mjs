// Independently verify what actually landed on GitHub.
//
// Reads the remote through the REST API rather than through git, so a
// successful `git push` exit code is never mistaken for proof. Also refuses
// to stay quiet about key material: a repo that documents SSH setup is
// exactly the kind of place a private key gets committed by accident.
//
// Usage:  node gh-verify.mjs <owner/repo> [expected-path ...]
//
// Two traps this script has already fallen into, and now avoids:
//
//   1. An EMPTY repository is a state, not an error. `/commits/<branch>`
//      answers 409 and `/contents/` answers 404 until the first push lands.
//      Treating those as failures makes a successful creation look like a
//      failed one - and a caller that branches on the exit code then skips
//      the very push it was about to make.
//   2. `/contents/` lists ONE level. Checking an expected path such as
//      "guard/preflight.ps1" against it reports a false MISSING for every
//      nested file. The recursive git-tree endpoint is the correct source.
//
// ASCII only by project rule.

const slug = process.argv[2];
const expected = process.argv.slice(3);

if (!slug || !slug.includes('/')) {
  console.log('USAGE: node gh-verify.mjs <owner/repo> [expected-path ...]');
  process.exit(2);
}

const HEADERS = { 'User-Agent': 'gh-verify', Accept: 'application/vnd.github+json' };

async function getJson(url) {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status} for ${url}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

// Filenames that are key material. Deliberately narrow: an earlier version of
// this list contained the bare word "credential", which flagged
// "verify-credential.mjs" - the checker accused its own sibling. Match shapes,
// not topic words.
const KEY_PATTERNS = [
  /^id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$/i,
  /\.(pem|key|p12|pfx|ppk)$/i,
  /^\.?credentials?\.(ya?ml|json)$/i,
  /^\.env(\.|$)/i,
  /^known_hosts(\.old)?$/i,
  /_ed25519$/i,
  /_rsa$/i,
];

function basename(p) {
  const parts = String(p).split('/');
  return parts[parts.length - 1];
}

async function main() {
  const repo = await getJson(`https://api.github.com/repos/${slug}`);
  console.log('full_name     :', repo.full_name);
  console.log('private       :', repo.private);
  console.log('default_branch:', repo.default_branch);
  console.log('pushed_at     :', repo.pushed_at);
  console.log('html_url      :', repo.html_url);

  let headSha = null;
  console.log('--- latest commit ---');
  try {
    const commit = await getJson(`https://api.github.com/repos/${slug}/commits/${repo.default_branch}`);
    const c = commit.commit || {};
    const a = c.author || {};
    headSha = commit.sha;
    console.log('sha    :', commit.sha);
    console.log('message:', (c.message || '').split('\n')[0]);
    console.log('author :', a.name, '<' + a.email + '>');
    console.log('date   :', a.date);
  } catch (e) {
    if (e.status === 409 || e.status === 404) {
      console.log('(no commits yet - repository is empty)');
    } else {
      throw e;
    }
  }

  // Full recursive listing when there is a commit; otherwise the repository is
  // genuinely empty and there is nothing to list.
  let paths = [];
  if (headSha) {
    const tree = await getJson(`https://api.github.com/repos/${slug}/git/trees/${headSha}?recursive=1`);
    if (!tree || !Array.isArray(tree.tree)) throw new Error('unexpected tree payload');
    paths = tree.tree.filter((e) => e.type === 'blob').map((e) => e.path);
    if (tree.truncated) console.log('(tree listing truncated by the API)');
  }

  console.log('--- tracked files:', paths.length, '---');
  for (const p of paths) console.log(' -', p);

  if (expected.length > 0) {
    const missing = expected.filter((n) => !paths.includes(n));
    console.log('MISSING', missing.length === 0 ? 'none' : missing.join(', '));
  }

  const leaked = paths.map(basename).filter((n) => KEY_PATTERNS.some((re) => re.test(n)));
  console.log('KEY_MATERIAL_LEAKED', leaked.length === 0 ? 'none' : leaked.join(', '));
}

main().catch((e) => {
  console.log('ERROR', e.message);
  process.exit(1);
});
