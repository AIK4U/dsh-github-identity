# Activate the portable git toolchain and 顾砚's GitHub publishing identity.
#
# Usage (from any DSH session):
#     . E:\大肥鱼\大肥鱼工位\_tools\git-env.ps1
#
# Pure ASCII on purpose: PowerShell 5.1 / cmd mis-read non-ASCII script
# bodies on this machine. All paths are derived from $PSScriptRoot, so the
# non-ASCII workspace path never appears as a literal here.

# NOTE: deliberately does NOT touch $ErrorActionPreference. A dot-sourced
# script that sets it leaks into the caller's scope and turns ordinary
# native stderr chatter (e.g. ssh's host-key warning) into a terminating
# error. Checks below throw explicitly instead.

$toolsRoot = $PSScriptRoot
if (-not $toolsRoot) { throw 'git-env.ps1 must be dot-sourced, not piped.' }

$gitCmd = Join-Path $toolsRoot 'git\cmd'
$gitExe = Join-Path $gitCmd 'git.exe'
$gitConfig = Join-Path $toolsRoot 'gitconfig'
$sshConfig = Join-Path $toolsRoot 'github-identity\ssh_config'
$privateKey = Join-Path $toolsRoot 'github-identity\github_ed25519'

foreach ($p in @($gitExe, $gitConfig, $sshConfig, $privateKey)) {
    if (-not (Test-Path $p)) { throw "git-env: missing required file: $p" }
}

$env:PATH = $gitCmd + ';' + $env:PATH
$env:GIT_CONFIG_GLOBAL = $gitConfig
$env:GIT_SSH_COMMAND = 'ssh -F "' + ($sshConfig -replace '\\', '/') + '"'

Write-Host "git      : $(& $gitExe --version)"
Write-Host "identity : $(& $gitExe config --get user.name) <$(& $gitExe config --get user.email)>"
Write-Host "ssh key  : $privateKey"
