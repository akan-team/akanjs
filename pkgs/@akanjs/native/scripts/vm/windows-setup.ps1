# akan-native: prepares a Windows 11 VM so the Mac can build and test akan-native apps in it over SSH
# (docs/testing-windows-linux.md). Run once in an administrator PowerShell inside the VM. The Mac
# serves this file with its key and report address filled in (scripts/vm/serve-setup.ts):
#
#   irm http://192.168.64.1:8799/<token> | iex
#
# That line only downloads this file and runs it with -File: run through `| iex` itself, a
# `Select-Object -First` in it stopped the outer pipeline and ended the script without a word
# (Windows PowerShell 5.1, seen on the first VM). The whole run is logged to
# %ProgramData%\akan-native-setup.log.
#
#   1. OpenSSH server on (PowerShell as its shell), the Mac's akan-native VM key trusted
#   2. No sleep and no display timeout: tests open real windows in the logged-in session
#   3. Visual Studio 2022 Build Tools (C++ for ARM64 and x64, Windows SDK), rustup (no toolchain:
#      akan-native pins one per project), Bun, NSIS (build windows --installer), and on an ARM64 machine an
#      x64 Bun in C:\bun-x64 (x64 apps build with it, docs/testing-windows-linux.md)
#   4. Reports this machine's addresses and user name back to the Mac
#
# Safe to run again: finished steps are skipped.

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue" # Invoke-WebRequest is very slow with its progress bar
$PublicKey = "__AKAN_NATIVE_PUBLIC_KEY__"
$ReportUrl = "__AKAN_NATIVE_REPORT_URL__"
$BunVersion = "__AKAN_NATIVE_BUN_VERSION__"

function Step($text) { Write-Host "`n==> $text" -ForegroundColor Cyan }

Start-Transcript -Path "$env:ProgramData\akan-native-setup.log" -Append | Out-Null

function Report($status, $detail) {
  $ips = @(Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" } | ForEach-Object { $_.IPAddress })
  $body = @{
    status = $status; detail = "$detail"; user = $env:USERNAME; computer = $env:COMPUTERNAME
    arch = $env:PROCESSOR_ARCHITECTURE; ips = $ips; os = (Get-CimInstance Win32_OperatingSystem).Version
  } | ConvertTo-Json -Compress
  try {
    Invoke-WebRequest -Method Post -Uri $ReportUrl -Body ([Text.Encoding]::UTF8.GetBytes($body)) -ContentType "application/json" -UseBasicParsing | Out-Null
  } catch {
    Write-Host "Could not reach the Mac ($ReportUrl): $_" -ForegroundColor Yellow
  }
}

$principal = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw "Run this in an administrator PowerShell (Start > Terminal, right-click > Run as administrator)."
}

Write-Host @"

akan-native VM setup will install and configure:
  - OpenSSH Server (a Windows feature), key login for the Mac's akan-native VM key only
  - Visual Studio 2022 Build Tools with the C++ tools and a Windows SDK (Microsoft license terms)
  - rustup, the Rust installer (MIT / Apache-2.0)
  - Bun $BunVersion (MIT)
  - NSIS, the installer builder, through winget (zlib/libpng license)
  - on ARM64, the x64 (baseline) build of Bun $BunVersion in C:\bun-x64 (MIT)
It also turns off sleep and the display timeout while plugged in.
"@
$answer = Read-Host "Accept these tools' licenses and continue? (y/N)"
if ($answer -notmatch "^[yY]") { Write-Host "Nothing was changed."; return }

try {
  Step "OpenSSH server"
  # Recent Windows 11 builds have it installed already, with the service stopped.
  $capability = @(Get-WindowsCapability -Online -Name "OpenSSH.Server*")[0]
  if (-not $capability) { throw "this Windows has no OpenSSH Server feature" }
  if ($capability.State -ne "Installed") { Add-WindowsCapability -Online -Name $capability.Name | Out-Null }
  Write-Host "installed"
  Set-Service -Name sshd -StartupType Automatic
  Start-Service sshd
  # The VM's NAT network is often classified Public, where the sshd firewall rule does not apply.
  Get-NetConnectionProfile | Where-Object { $_.NetworkCategory -ne "DomainAuthenticated" } | Set-NetConnectionProfile -NetworkCategory Private
  if (-not (Get-NetFirewallRule -Name "OpenSSH-Server-In-TCP" -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -Name "OpenSSH-Server-In-TCP" -DisplayName "OpenSSH Server (sshd)" -Enabled True -Direction Inbound -Protocol TCP -Action Allow -LocalPort 22 | Out-Null
  }
  New-ItemProperty -Path "HKLM:\SOFTWARE\OpenSSH" -Name DefaultShell -Value "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -PropertyType String -Force | Out-Null
  # Administrators' keys live in one file that only Administrators and SYSTEM may access (sshd
  # ignores it otherwise). SIDs, not names: group names are localized.
  $keys = "$env:ProgramData\ssh\administrators_authorized_keys"
  if (-not ((Test-Path $keys) -and (Select-String -Path $keys -SimpleMatch $PublicKey -Quiet))) {
    Add-Content -Path $keys -Value $PublicKey -Encoding ascii
  }
  icacls.exe $keys /inheritance:r /grant "*S-1-5-32-544:F" /grant "*S-1-5-18:F" | Out-Null

  Step "Power settings"
  powercfg /change standby-timeout-ac 0
  powercfg /change monitor-timeout-ac 0
  powercfg /change hibernate-timeout-ac 0

  Step "Visual Studio 2022 Build Tools (10-30 minutes)"
  $vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
  $haveVs = (Test-Path $vswhere) -and (& $vswhere -products * -requires Microsoft.VisualStudio.Component.VC.Tools.ARM64 Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath)
  if (-not $haveVs) {
    $installer = "$env:TEMP\vs_BuildTools.exe"
    Invoke-WebRequest "https://aka.ms/vs/17/release/vs_BuildTools.exe" -OutFile $installer -UseBasicParsing
    $vsArgs = @("--quiet", "--wait", "--norestart", "--nocache",
      "--add", "Microsoft.VisualStudio.Workload.VCTools",
      "--add", "Microsoft.VisualStudio.Component.VC.Tools.ARM64",
      "--add", "Microsoft.VisualStudio.Component.VC.Tools.x86.x64",
      "--add", "Microsoft.VisualStudio.Component.Windows11SDK.26100")
    $process = Start-Process -FilePath $installer -ArgumentList $vsArgs -Wait -PassThru
    if ($process.ExitCode -notin 0, 3010) { throw "the Build Tools installer failed with exit code $($process.ExitCode)" }
  } else { Write-Host "already installed" }

  Step "rustup"
  if (-not (Test-Path "$env:USERPROFILE\.cargo\bin\rustup.exe")) {
    $triple = if ($env:PROCESSOR_ARCHITECTURE -eq "ARM64") { "aarch64-pc-windows-msvc" } else { "x86_64-pc-windows-msvc" }
    $rustupInit = "$env:TEMP\rustup-init.exe"
    Invoke-WebRequest "https://static.rust-lang.org/rustup/dist/$triple/rustup-init.exe" -OutFile $rustupInit -UseBasicParsing
    & $rustupInit -y --default-toolchain none --profile minimal
    if ($LASTEXITCODE -ne 0) { throw "rustup-init failed with exit code $LASTEXITCODE" }
  } else { Write-Host "already installed" }

  Step "Bun $BunVersion"
  $bun = "$env:USERPROFILE\.bun\bin\bun.exe"
  if (-not ((Test-Path $bun) -and ((& $bun --version) -eq $BunVersion))) {
    & ([scriptblock]::Create((Invoke-RestMethod "https://bun.sh/install.ps1"))) -Version $BunVersion
  } else { Write-Host "already installed" }

  if ($env:PROCESSOR_ARCHITECTURE -eq "ARM64") {
    Step "x64 Bun $BunVersion"
    $bunX64 = "C:\bun-x64\bun.exe"
    if (-not ((Test-Path $bunX64) -and ((& $bunX64 --version) -eq $BunVersion))) {
      $zip = "$env:TEMP\bun-windows-x64-baseline.zip"
      Invoke-WebRequest "https://github.com/oven-sh/bun/releases/download/bun-v$BunVersion/bun-windows-x64-baseline.zip" -OutFile $zip -UseBasicParsing
      Expand-Archive $zip -DestinationPath "$env:TEMP\bun-x64" -Force
      New-Item -ItemType Directory -Force (Split-Path $bunX64) | Out-Null
      Copy-Item (Get-ChildItem "$env:TEMP\bun-x64" -Recurse -Filter bun.exe | Select-Object -First 1).FullName $bunX64 -Force
    } else { Write-Host "already installed" }
  }

  Step "NSIS"
  if (-not (Test-Path "${env:ProgramFiles(x86)}\NSIS\makensis.exe")) {
    winget install --id NSIS.NSIS -e --silent --accept-package-agreements --accept-source-agreements --source winget
    if ($LASTEXITCODE -ne 0) { throw "winget could not install NSIS (exit code $LASTEXITCODE)" }
  } else { Write-Host "already installed" }

  Report "done" ""
  Write-Host "`nDone. Leave this VM running and signed in; the Mac takes it from here." -ForegroundColor Green
} catch {
  Report "failed" "$_ $($_.InvocationInfo.PositionMessage)"
  Write-Host "`nSetup failed: $_" -ForegroundColor Red
  Write-Host $_.InvocationInfo.PositionMessage
} finally {
  Stop-Transcript | Out-Null
}
