@echo off
rem SSH launcher for git.
rem
rem Why this exists: git for Windows runs core.sshCommand / GIT_SSH_COMMAND
rem through MSYS2's sh.exe, and sh.exe cannot start inside the DSH sandbox
rem ("couldn't create signal pipe, Win32 error 5" - that pipe is a named
rem pipe, which the sandbox denies). Setting GIT_SSH to this launcher makes
rem git exec it directly, with no shell in between.
rem
rem %~dp0 keeps this file free of any non-ASCII literal: it expands to the
rem directory holding this script at runtime.
rem
rem The system OpenSSH is used rather than MinGit's, because the MSYS build
rem of ssh would hit the same runtime failure.

"%SystemRoot%\System32\OpenSSH\ssh.exe" -F "%~dp0github-identity\ssh_config" %*
