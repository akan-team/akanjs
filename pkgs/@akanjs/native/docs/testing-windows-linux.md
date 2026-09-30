# Windows·Linux 빌드와 테스트

데스크톱 앱은 그 OS에서만 빌드한다(`packages/cli/src/platforms/desktop.ts` `requireHost`). WebView2와 WebKitGTK SDK, MSVC와 GTK 툴체인이 그 OS에 있기 때문이다. Mac에서는 이렇게 한다.

| OS | 어디서 | 누가 준비 | 창을 볼 수 있나 |
|---|---|---|---|
| Linux | 이 Mac의 Docker 컨테이너 (Ubuntu 24.04 ARM64, Xvfb) | 자동 (`scripts/vm/linux.ts`가 처음에 이미지를 만든다) | 아니요. 가상 화면(Xvfb)에서 돈다 |
| Windows | UTM·Parallels의 Windows 11 ARM VM, SSH | 사람이 한 번 (아래) | 예. VM 화면에 뜬다 |
| 실제 PC (x64) | 그 PC | 사람 | 예 |

## Linux: Docker 컨테이너

```sh
bun scripts/vm/linux.ts bun run akan-native test linux --app examples/sample
bun scripts/vm/linux.ts bash -c 'cd native/desktop && cargo check'
bun scripts/vm/linux.ts --shell        # 컨테이너 안의 셸
```

- 이미지: `scripts/vm/linux.Dockerfile`에 정의한다.
  - WebKitGTK 4.1, GTK 3, libsoup 3
  - Xvfb, D-Bus, gnome-keyring(Secret Service), dunst(알림 서버. 처음 쓸 때 D-Bus가 띄운다)
  - rustup(툴체인 없이 설치하고, `rust-toolchain.toml`이 고정한다), Bun
- 저장소 복사: 저장소는 읽기 전용으로 마운트하고, 볼륨(`akan-native-linux-work`)에 rsync로 복사한다.
  - 복사하지 않는 것: `node_modules`, `target`, `.akan`, `dist`. 이것들은 컨테이너가 따로 가진다. 그래서 Mac 쪽 트리에 Linux 빌드 결과가 섞이지 않는다.
  - 여러 작업을 동시에 돌릴 때는 `AKAN_NATIVE_LINUX_WORK=<이름>`으로 복사본을 나눈다(볼륨 `akan-native-linux-work-<이름>`).
  - `AKAN_NATIVE_LINUX_SRC=<폴더>`는 이 패키지 대신 다른 트리(akanjs 모노레포 등)를 복사한다. 이때는 `AKAN_NATIVE_LINUX_WORK`도 줘야 한다. 없으면 멈춘다. rsync `--delete`가 이 패키지의 복사본을 지우기 때문이다.
- 캐시: cargo registry, rustup, `~/.akan/native`도 볼륨이라 두 번째 실행부터 증분 빌드다.
- 세션: 명령마다 데스크톱 세션과 비슷한 환경을 만든다.
  - `DISPLAY=:99`에 Xvfb
  - `dbus-launch`로 세션 버스
  - 빈 비밀번호로 잠금을 푼 gnome-keyring. 로그인 키링이 "default" 컬렉션이 된다.
    - 비밀번호는 한 줄(개행 포함)로 넘긴다. 개행이 없으면 로그인 키링이 생기지 않고, 비밀을 저장하면 오지 않을 비밀번호 창을 기다린다.
- 가상 화면 조작: 이미지에 `xdotool`(클릭·키)과 ImageMagick `import`(화면 캡처)가 있다. 예: `xdotool mousemove 900 400 click 3; import -window root /tmp/shot.png`. 창 관리자가 없으므로 창 위치는 `xdotool windowmove`로 정한다.
- 이미지는 Dockerfile의 해시를 라벨로 가진다. Dockerfile이 바뀌면 `linux.ts`가 다시 빌드한다.
- 화면을 직접 보고 싶으면: UTM에 Ubuntu 24.04 데스크톱 VM을 만들어 같은 명령을 실행하면 된다. 그 VM에 필요한 패키지는 Dockerfile의 apt 목록과 같다.

## Windows: VM

### 한 번만: VM 준비 (사람이 할 일)

1. UTM(무료)을 설치한다: https://mac.getutm.app. Parallels도 된다.
2. Windows 11 ARM64 ISO를 받는다: https://www.microsoft.com/software-download/windows11arm64
3. UTM에서 **Virtualize → Windows**를 고른다.
   - ISO를 선택하고 "Install drivers and SPICE tools"를 체크한다.
   - 메모리 8GB 이상, CPU 4코어 이상, 디스크 80GB.
4. Windows를 설치한다. 사용자 이름은 영문으로 한다.
5. Mac에서 `bun scripts/vm/serve-setup.ts`를 실행한다. 출력된 한 줄을 VM의 **관리자 PowerShell**에서 실행한다. 한 줄은 스크립트를 파일로 받아 `-File`로 실행한다. `irm … | iex`로 직접 실행하면 스크립트 안의 `Select-Object -First`가 바깥 파이프라인을 멈춰 스크립트가 말없이 끝났다. 로그는 VM의 `C:\ProgramData\akan-native-setup.log`에 남는다.
   ```
   irm http://192.168.64.1:8799/<token> | iex
   ```
   `scripts/vm/windows-setup.ps1`이 하는 일:
   - 설치 목록을 보여 주고 라이선스 동의를 받는다.
   - OpenSSH 서버를 켠다. 기본 셸은 PowerShell이다. `~/.akan/native/vm/id_ed25519.pub` 키만 관리자 키로 등록한다.
   - 전원 설정에서 절전과 화면 끄기를 없앤다.
   - Visual Studio 2022 Build Tools(C++, ARM64·x64, Windows SDK), rustup, Bun을 설치한다.
   - 결과를 Mac에 보낸다. `~/.akan/native/vm/windows.json`에 주소와 사용자 이름이 저장된다.
6. VM은 로그인한 상태로 켜 둔다.

### 사용

```sh
bun scripts/vm/windows.ts sync                          # 저장소를 C:\akan-native-work\akan-native로 (빌드 결과는 유지)
bun scripts/vm/windows.ts ssh 'cd native/desktop; cargo check'
bun scripts/vm/windows.ts test                          # sync 후 akan-native test windows
bun scripts/vm/windows.ts desktop 'bun run akan-native run windows --app examples/sample'
bun scripts/vm/windows.ts screenshot shot.png           # VM 화면을 Mac으로 가져온다
```

- 복사본은 `C:\akan-native-work\<이름>`이다. 이름은 `AKAN_NATIVE_VM_WORK_NAME`(기본 `akan-native`)이다.
  - `AKAN_NATIVE_VM_SRC=<폴더>`는 이 패키지 대신 다른 트리(akanjs 모노레포, 앱을 빌드하는 e2e)를 복사한다. 이때는 `AKAN_NATIVE_VM_WORK_NAME`도 줘야 한다. 없으면 멈춘다. `robocopy /MIR`이 이 패키지의 복사본을 지우기 때문이다.
  - 예: `AKAN_NATIVE_VM_SRC=$PWD AKAN_NATIVE_VM_WORK_NAME=desktop-server bun pkgs/@akanjs/native/scripts/vm/windows.ts sync`(모노레포 루트에서)
  - 모노레포 복사본에서는 명령이 모노레포 루트에서 돈다. 이 패키지의 스크립트는 `Set-Location pkgs\@akanjs\native; bun scripts/vm/installer-check.ts`처럼 부른다.
- `ssh` 세션에는 데스크톱이 없다. 여기서 연 창은 보이지 않고, WebView2도 그리지 않는다.
- 그래서 창을 띄우는 명령(`desktop`, `test`, `screenshot`)은 로그인한 사용자 세션에서만 도는 예약 작업(`schtasks /IT`)으로 실행한다.
  - 출력은 로그 파일에 쓴다. 스크립트는 그 파일을 따라가며 보여 주고, 끝나면 종료 코드를 돌려준다.
  - 작업은 콘솔 창 없이(`conhost --headless`), 관리자 권한 없이(`/RL LIMITED`) 돈다. 콘솔 창이 앱을 가리지 않고, 사용자가 앱을 여는 것과 같은 권한이 된다.
  - 단, UAC가 꺼진 VM(`EnableLUA=0`)에서는 모든 프로세스가 관리자 권한(High)으로 돈다. 확인한 VM이 그랬다.
- `ssh` 명령은 SSH 셸(PowerShell)이 직접 실행한다. `powershell -EncodedCommand`를 한 번 더 거치면 오류가 CLIXML로 나오고 종료 코드가 1로 바뀐다.
- 페이지 안에서 코드 실행하기(개발 빌드): 앱을 `AKAN_NATIVE_WEBVIEW2_DEBUG_PORT=9222`로 띄우면 WebView2가 그 포트에 Chrome DevTools Protocol을 연다.
  - `http://127.0.0.1:9222/json`의 `webSocketDebuggerUrl`에 `Runtime.evaluate`를 보내면 된다.
  - 브리지는 `window.__AKAN_NATIVE__.__runtime.transport.send({ v: 1, id, plugin, method, args })`로 부른다.
  - `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS`는 듣지 않는다. wry가 자기 브라우저 인자를 넘기기 때문이다.

## 업데이트(UP-1) 확인

```sh
bun scripts/vm/linux.ts bun scripts/vm/update-check.ts linux
bun scripts/vm/windows.ts desktop 'bun scripts/vm/update-check.ts windows'
```

1. 샘플을 debug로 빌드해(`--debug`, 페이지 로그와 `PUBLIC_UPDATE_PROBE`가 필요하다) 임시 "설치" 폴더에 복사한다. 릴리스도 `--debug`로 게시한다. 경로는 `<os>-<arch>/`다.
2. 릴리스 A를 게시하고 앱을 `PUBLIC_UPDATE_PROBE=apply`로 실행한다. check → download(전체) → apply → trial → 확정까지 간다. 앱은 탐색기에서 연 것처럼 자기 폴더를 작업 폴더로 띄운다. Windows는 작업 폴더인 폴더의 이름을 바꾸지 못하므로, 그 경우에도 교체되는지 본다.
3. 릴리스 B(A에서의 delta)를 `no-ready`로 실행한다. B는 확정하지 않으므로 A로 롤백되고, B를 다시 받지 않아야 한다.
4. 앱 옆에 남은 폴더가 없는지 본다.

`--server`(예: `bun scripts/vm/update-check.ts linux --server`)는 샘플에 서버를 싣고(`desktop.server`, IPC로 ready를 보내는 대역)
같은 흐름을 서버를 싣는 앱으로 본다.

1. A는 서버가 ready 뒤 자리를 잡은 뒤(`SERVER_SETTLE`)에야 확정된다.
2. 릴리스 B의 서버는 시작할 때마다 끝난다. launcher가 포기하면 B는 곧바로 롤백되고, `failed`가 아니라 `strikes` 1로 받아 둔 채
   남는다(state.json을 읽어 확인한다).
3. 서버 없는 빌드를 같은 채널에 게시하면 빌드 전에 거부된다.
4. 채널을 새로 시작해(매니페스트와 서명을 지움) 그 빌드를 게시하면, 설치된 앱이 매니페스트만 보고 거부한다.

샘플은 `--debug`로 빌드하므로 업데이트 상태는 `akan-native-updates-debug`, 서버 데이터는 `server-debug`에 있다.

서명에는 일회용 키를 쓴다. 그 공개 키를 샘플 설정 사본에 넣으므로 실제 업데이트 키는 필요 없다.

확인 결과(2026-09-25): Windows 11 ARM VM과 Linux 컨테이너 모두 통과했다(A 전체 → 확정, B delta → 롤백, 남은 폴더 없음). 2026-09-26 검토 반영 뒤에도 macOS·Linux·Windows 모두 통과했다. 2026-10-01: Linux·Windows에서 기본과 `--server` 모두 통과했다(macOS는 화면이 잠겨 돌리지 못함).

주의: 확인이 도중에 실패하면 임시 폴더에 설치한 앱이 남아 있을 수 있다. 그러면 다음 실행의 앱이 single-instance로 넘기고 바로 끝나서 확인이 멈춘다. Windows에서는 `bun scripts/vm/windows.ts ssh 'Get-Process | Where-Object { $_.Path -like "*akan-native-update-check*" } | Stop-Process -Force'`로 먼저 끝낸다.

## ARM64 Windows에서 x64 앱 빌드

데스크톱 빌드는 실행 중인 Bun의 CPU를 따른다. Rust 타깃을 Bun의 `process.arch`로 고르고(`platforms/desktop.ts` `libraryTarget`), `bun build --compile`도 그 Bun을 앱에 넣는다. 그래서 ARM64 VM에서 x64 Bun으로 CLI를 돌리면 코드 변경 없이 x64 앱이 나온다.

```powershell
rustup target add x86_64-pc-windows-msvc          # native\desktop 폴더에서 (고정한 툴체인에)
C:\bun-x64\bun.exe packages/cli/src/index.ts build windows --app examples/sample
C:\bun-x64\bun.exe run akan build-desktop <app> --installer   # akanjs 앱: <file>-<version>-x64-setup.exe
```

- x64 Bun은 `bun-windows-x64-baseline`을 쓴다. 앱에 그대로 들어가므로 AVX2가 없는 오래된 x64 CPU에서도 돈다. windows-setup.ps1이 ARM64 VM에 `C:\bun-x64\bun.exe`로 설치한다.
- Visual Studio Build Tools의 ARM64 호스트용 x64 도구(`Hostarm64\x64\link.exe`)와 x64 라이브러리를 쓴다. windows-setup.ps1이 설치하는 구성에 들어 있다.
- Windows 11 ARM은 x64 프로그램을 에뮬레이션(Prism)으로 돌리므로 확인도 같은 VM에서 한다. 확인 결과(2026-09-30): 샘플의 x64 빌드(exe·DLL 모두 PE machine 0x8664)가 자체 테스트 73/73. 현장 투입 전에는 실제 x64 PC에서 한 번 더 본다.

## 설치 프로그램과 무인 운영 확인

```sh
bun scripts/vm/windows.ts desktop 'bun scripts/vm/installer-check.ts'   # NSIS가 필요하다(windows-setup.ps1이 설치)
bun scripts/vm/windows.ts desktop 'bun scripts/vm/kiosk-check.ts'
```

- installer-check: 샘플을 `--installer`로(일회용 업데이트 키, 127.0.0.1의 릴리스 서버) 빌드하고 다음 패치 버전의 릴리스 A를 게시한 뒤 차례로 본다.
  1. `/S /RUN`으로 설치: 폴더, 폴더 옆 제거 프로그램, 시작 메뉴, 제거 항목, 앱 실행.
  2. 설치 프로그램이 띄운 앱이 A를 받아 확정: 제거 프로그램이 남고 제거 항목 버전이 A.
  3. 실행 중인 앱 위로 다시 설치: 설치 폴더에서 도는 앱을 먼저 멈춘다. 설치 폴더 안의 정션은 옛 폴더와 함께 사라지고, 가리키던 파일은 남는다.
  4. 시작하지 못하는 설치: 다른 프로세스가 설치 뮤텍스(`Local\akan-native-setup-<id>`)를 잡고 있으면 설치와 제거 모두 2로 끝난다. `<폴더>.setup-new` 자리에 파일이 있으면 설치가 2로 끝나고 그 파일은 그대로다. 어느 쪽이든 도는 앱은 멈추지 않고 빌드도 그대로다.
  5. 폴더를 바꾸지 못하는 `/S /RUN` 설치(다른 프로그램이 설치 폴더를 작업 폴더로 쓴다): 2로 끝나고, 설치된 빌드가 그대로이고, 옆에 `.setup-new`·`.setup-old`·`.setup-uninstall.exe`가 남지 않고, 자리에 있는 앱을 다시 띄운다.
  6. `/S` 제거: 폴더, 옆에 남긴 `.previous`·`.update-*`·`.failed-*`·`.setup-*`, 제거 프로그램, 바로가기, 항목, 자동 시작, 셸의 업데이트 상태(debug 빌드의 것도)와 RunOnce 복구 명령, 앱이 등록한 딥 링크 스킴, 알림 AUMID 키와 아이콘이 지워지고, 서버 데이터와 정션이 가리키던 파일은 남는다.
  7. `/D=`로 다른 폴더에 설치한 뒤 `/D=` 없이 다시 설치: 두 번째 설치가 그 폴더의 앱을 바꾸고 기본 폴더에 사본을 만들지 않는다. 그 뒤의 제거는 다른 프로그램이 가져간 스킴을 남긴다.
  - NSIS 설치 프로그램은 32비트라 그 PowerShell도 32비트다. 32비트 프로세스는 64비트 프로세스의 경로를 읽지 못해(`Get-Process`의 Path가 빈다) 앱을 WMI(`Win32_Process.ExecutablePath`)로 찾는다.
- kiosk-check: `desktop.recovery: "reload"`, `desktop.window { fullscreen, skipTaskbar }`, `desktop.screenCapture: "auto"`로 빌드해 DevTools 포트로 확인한다. 첫 화면부터 전체화면, 페이지를 연달아 죽이면(`Page.crash`) 즉시·1초·2초 뒤 다시 불러오기, `app.relaunch()`, WebView2 브라우저 프로세스를 끝내면 앱 재실행, `getDisplayMedia()`가 선택 창 없이 `displaySurface: "monitor"` 트랙으로 답하기.
- 확인 결과(2026-09-30): Windows 11 ARM VM에서 둘 다 통과. `skipTaskbar`는 전체화면이 작업 표시줄을 가리므로 따로 스크린샷으로 비교했다.
  - installer-check의 3·4·6·7단계에 2026-10-01 더한 확인은 아직 installer-check로 돌리지 않았다. 같은 동작(뮤텍스, 정션, 제거 범위, 등록된 위치로의 재설치, 공간 부족, 풀던 중 디스크가 참)은 가짜 앱으로 만든 설치 프로그램으로 VM에서 확인했다.
- macOS에서 update-check는 화면이 잠겨 있으면 멈춘다. 샘플이 `requestAnimationFrame` 안에서 업데이트 확인을 시작하는데, 잠긴 화면에서는 프레임이 오지 않는다.

## 공통 벡터 (architecture.md §5)

`packages/core/vectors/`에 있는 파일들이다: scope, routes, ranges, ids, bridge, navigation, acl. 모든 구현이 통과해야 한다.
- TS 기준 구현은 `bun test`, Rust는 `cargo test`(`vectors.rs`)가 돌린다.
- `bun scripts/native-vectors.ts`는 Swift 커널(`AkanNativeKernel.swift`, `AkanNativeAcl.swift`, swiftc)과 Kotlin 커널(`AkanNativeKernel.kt`, `AkanNativeAcl.kt`, akan-native가 쓰는 kotlinc의 JVM, 벡터는 생성한 리터럴)을 Mac에서 돌린다. http 플러그인의 URL 정규화 사례(`plugins/http/test/vectors/canonical.json`)도 함께 돌린다.
- 기기에서도 같은 러너가 돈다. dev 빌드의 셀프 테스트 "shared vectors on this device"가 `$host.vectors`로 부른다(iOS 시뮬레이터, Android 에뮬레이터).
- 표와 상수는 `packages/core/contract.json`에서 `bun scripts/contract.ts`로 생성한다. 손으로 고치지 않는다.

## 실제 PC에서

- Windows: `akan-native build windows` 결과 폴더(`<앱 이름>\`)를 통째로 복사해 `.exe`를 실행한다.
  - WebView2 Runtime이 필요하다. Windows 11에는 기본으로 들어 있다.
  - 서명하지 않은 exe라서 SmartScreen 경고가 뜰 수 있다(배포 서명은 CLI-9).
- Linux: 결과 폴더(`<앱>/`)를 복사해 실행한다.
  - 필요한 시스템 라이브러리: `libwebkit2gtk-4.1-0`, `libgtk-3-0`. Ubuntu 22.04 이상 데스크톱에는 기본으로 들어 있다.
