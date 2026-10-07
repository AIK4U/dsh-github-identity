# dsh-github-identity

> A minimal, portable recipe for setting up a **GitHub publishing identity** inside the
> DSH file sandbox (`workspace-write`) on Windows — including every dead end we hit.

在 **DSH 文件沙箱**里，从零给一台 Windows 机器配通 GitHub 发布身份的最小工具集。

不是教程，是**绕行记录**。起因很具体：手里有一个全新的 GitHub 账号，但这台机器上
`git` 没装、`winget` 是坏的、**所有走 Windows TLS 的 HTTPS 请求全部失败**、
`ssh-keygen` 甚至写不出公钥文件。下面每一条都是实测出来的，不是推测。

---

## 30 秒上手

```powershell
# 1. 拿到 git（见下文「拦路虎 3」，走镜像）
node fetch-mingit.mjs .\dl
Expand-Archive .\dl\MinGit-*.zip -DestinationPath .\git

# 2. 生成密钥对（配方见 genkey.mjs 顶部注释，别"简化"它）
$env:KEYDIR  = "$PWD\github-identity"
$env:KEYBASE = 'github_ed25519'
node genkey.mjs

# 3. 把 gitconfig.example / ssh_config.example 复制成 gitconfig / ssh_config，
#    把里面的 <TOOLS_ROOT> 换成本目录的绝对路径

# 4. 激活（它会把 GIT_SSH 指向 ssh-github.cmd —— 这一步别省，见拦路虎 6）
. .\git-env.ps1

# 5. 把 github_ed25519.pub 的内容贴到 GitHub
#    Settings → SSH and GPG keys → New SSH key

# 6. 验证（注意：成功时退出码也是 1，必须看输出）
ssh -T git@github.com
# -> Hi <username>! You've successfully authenticated...
```

---

## 这套东西包含什么

| 文件 | 作用 |
|---|---|
| `git-env.ps1` | **入口**。dot-source 它就能用 git + 身份 |
| `ssh-github.cmd` | ssh 启动器。让 git **不经 shell** 直接 exec ssh（见拦路虎 6） |
| `genkey.mjs` | 生成 ed25519 密钥对（含关键绕法，注释里写清了为什么） |
| `fetch-mingit.mjs` | 下载 MinGit，多镜像自动回退 |
| `rm.mjs` | 删除工具。PowerShell 删不掉的用它 |
| `gitconfig.example` | 提交身份模板（**故意不含 `core.sshCommand`**） |
| `ssh_config.example` | ssh 客户端配置模板 |

设计上有一条硬原则：**所有状态都待在项目目录里**。不写 `C:\Users\<user>\.ssh`，
不写 `.gitconfig`，不装到 `Program Files`。整个目录可以连同便携盘一起搬走。

---

## 六个拦路虎

### 1. 所有走系统 TLS 的 HTTPS 都失败

**症状**

```
curl.exe   -> schannel: AcquireCredentialsHandle failed: SEC_E_NO_CREDENTIALS (0x8009030E)
Invoke-WebRequest -> 基础连接已经关闭: 接收时发生错误
node fetch -> 200 OK
```

**诊断**：TCP 层全部连通（`Test-NetConnection` 到任何主机都返回 `True`），
HTTP 80 端口也正常（`http://example.com` 返回 200）。
**只有 HTTPS，且只有走 Schannel 的失败。** Node 自带 OpenSSL，不受影响。

**绕法**：这台机器上，一切联网下载都用 Node 的 `fetch`。不要用
`Invoke-WebRequest`，不要用 `curl.exe`。

### 2. `winget` 是坏的

```
> winget --version
(零输出)  exit = -1978335231     # 0x8A150001 APPINSTALLER_CLI_ERROR_INTERNAL_ERROR
```

执行别名指向的 AppX 没注册好。**不要指望 winget 装任何东西**，用便携版 / 解压即用。

### 3. GitHub release 的 CDN 被重置

`https://github.com/<owner>/<repo>/releases/download/...` 会 `ECONNRESET`，
但 `api.github.com` 是通的——所以能查到 release 元数据，却下不动文件。

**绕法**：走镜像。`fetch-mingit.mjs` 里排了一条回退链，首选

```
https://registry.npmmirror.com/-/binary/git-for-windows/<tag>/<file>
```

实测字节数与 GitHub API 报的完全一致。

### 4. `ssh-keygen` 写不出 `.pub`（最刁钻的一个）

**症状**

```
Unable to save public key to ...\id_ed25519.pub: Bad file descriptor
```

私钥写得出来（399 字节，正常），公钥写不出来，并且留下一个 **0 字节残骸**。

**走过的错路**：一开始以为是文件名问题——`aaa.pub` / `id_rsa.pub` 用 PowerShell
写都成功，唯独某些名字失败。换了个名字，**照样失败**。
真正的规律不是**叫什么名字**，而是**谁在写**：ssh-keygen 自己新建 `.pub` 必失败。

**绕法**：先用一个普通的空文件把 `<base>.pub` 建好，再让 ssh-keygen 去**覆盖**它。
它走的是「覆盖已存在文件」这条代码路径，一切正常。

```js
writeFileSync(pubPath, '');                       // 先建好
spawnSync('ssh-keygen', ['-t','ed25519','-f',keyPath,'-N','','-C',comment],
          { stdio: 'inherit' });                  // 再覆盖
```

### 5. ssh-keygen 新建的文件**删不掉**

`EPERM`。PowerShell 的 `Remove-Item` 删不掉，Node 的 `fs.unlinkSync` 也删不掉。

而**预先存在、被它覆盖的文件不受影响**——这是第 4 条绕法的意外好处：
这样产出的 `.pub` 是可以删的。

后果：生成过程**必然**留下锁死的残骸。本项目不试图清理它们，
只建议集中放进一个明确命名的目录并写清楚，别让后来的人误以为那些是有效密钥。

### 6. `git push` 根本起不来 —— MSYS2 的 `sh.exe` 在沙箱里必死

**症状**

```
sh.exe: *** fatal error - couldn't create signal pipe, Win32 error 5
fatal: Could not read from remote repository.
```

`git ls-remote` 也一样失败，不只是 push。

**诊断**：git for Windows 会把 `core.sshCommand` 和 `GIT_SSH_COMMAND`
交给 MSYS2 的 `sh.exe` 去执行。而 MSYS2 运行时启动时**必须创建一个 signal
pipe——那是个命名管道**，DSH 沙箱禁止进程打开命名管道。
所以 `sh.exe` 连启动都做不到。

**绕法**：改用 **`GIT_SSH`**。它接受一个**程序路径**，git 会**直接 exec**，
中间不经过 shell。代价是 `GIT_SSH` 不能携带参数，所以把参数装进一个包装器：

```bat
@echo off
"%SystemRoot%\System32\OpenSSH\ssh.exe" -F "%~dp0github-identity\ssh_config" %*
```

两个细节值得留意：

- 用 `%~dp0` 而不是写死路径，脚本本身就能保持**纯 ASCII**——中文路径由 cmd
  在运行时以 UTF-16 展开，不会被读坏。
- 用**系统自带的 OpenSSH**，不要用 MinGit 里的 `usr\bin\ssh.exe`：
  后者是 MSYS 构建，会撞上同一套运行时问题。

**顺带排除的一条错路**：曾想用 `HOME` 环境变量把 ssh 配置挪进项目目录，
**微软版 OpenSSH 不读 `HOME`**，它认 `%USERPROFILE%`。
这类事不要靠猜，`ssh -G` 会把最终生效的配置全部打印出来：

```powershell
ssh -G git@github.com | Select-String 'identityfile|userknownhostsfile|stricthostkeychecking'
```

正是这一条把「config 到底有没有被读到」从猜测变成了事实。

---

## 另外三个小坑（都不难，但会浪费你半小时）

**① 私钥只能由 `ssh-keygen` 生成。**
用 Node 的 `crypto` 生成 PKCS#8 私钥，OpenSSH 会拒绝：

```
WARNING: UNPROTECTED PRIVATE KEY FILE!
Permissions ... are too open.
```

因为 Node 写的文件继承目录的开放 ACL（`Authenticated Users: Modify`）。
而 `icacls` 在沙箱里被拒绝，**事后修不了 ACL**。ssh-keygen 会自己打上紧 ACL
（只有 `SYSTEM` / `Administrators` / 当前用户）。

**② PowerShell 会吞掉空的 native 参数。**
`ssh-keygen -N ''` 里那个空串传不到进程，参数整体错位，报 `Too many arguments`。
同理，`node -e '...'` 里的引号也会被吃掉。
→ 用 Node 的 `spawnSync` 传**参数数组**；`node -e` 一律改成脚本文件。

**③ 沙箱下 Node 不能用管道捕获子进程输出。**
`child_process` 默认的 `stdio: 'pipe'` 会 `EPERM`。→ 用 `stdio: 'inherit'`。

---

## 已知限制

- **SSH 建不了仓库。** 它能 clone / push / pull，但 GitHub 没有通过 SSH 创建仓库的接口。
  第一个仓库需要在网页上建，或者用 token 走 REST API。
- **`ssh -T git@github.com` 成功时退出码是 1**（因为 GitHub 不提供 shell）。
  脚本里判断成败必须看输出，不能看退出码。
- 面向 Windows。Linux / macOS 上这几条都不成立，直接 `ssh-keygen` 就好。

---

## License

MIT
