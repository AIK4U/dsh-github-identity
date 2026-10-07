// Inspect a GitHub account through the REST API.
//
// Why this exists: on this host every HTTPS request that goes through
// Windows Schannel fails (curl.exe -> SEC_E_NO_CREDENTIALS,
// Invoke-WebRequest -> connection closed), while Node's own TLS stack works
// fine. So the only way to read GitHub from here is through fetch().
//
// Usage:  node gh-account.mjs <username>
// ASCII only by project rule.

const user = process.argv[2];
if (!user) {
  console.log('USAGE: node gh-account.mjs <username>');
  process.exit(2);
}

const HEADERS = { 'User-Agent': 'dsh-gh-check', Accept: 'application/vnd.github+json' };

async function getJson(url) {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

async function main() {
  const me = await getJson(`https://api.github.com/users/${encodeURIComponent(user)}`);
  console.log('login        :', me.login);
  console.log('name         :', me.name);
  console.log('created_at   :', me.created_at);
  console.log('public_repos :', me.public_repos);
  console.log('followers    :', me.followers);

  const repos = await getJson(`https://api.github.com/users/${encodeURIComponent(user)}/repos?per_page=100`);
  if (!Array.isArray(repos)) throw new Error('unexpected repos payload');
  console.log('REPOS', repos.length);
  for (const r of repos) {
    console.log(' -', r.full_name, '|', r.default_branch, '| private:', r.private);
  }
}

main().catch((e) => {
  console.log('ERROR', e.message);
  process.exit(1);
});
