import { usePage } from "@apps/akan/client";
import { Code, Docs, DocsToc } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { page } from "akanjs/client";

const ciRecipe = `name: desktop-release

on:
  push:
    tags: ["v*"]
  workflow_dispatch:

jobs:
  desktop:
    strategy:
      fail-fast: false
      matrix:
        include:
          - { os: macos-15, arch: arm64 }
          - { os: windows-2025, arch: x64 }
          - { os: ubuntu-24.04, arch: x64 }
          - { os: ubuntu-24.04-arm, arch: arm64 }
    runs-on: \${{ matrix.os }}
    steps:
      - uses: actions/checkout@v5
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1.4.2
      - name: Install dependencies and the matching akan CLI
        shell: bash
        run: |
          bun install --frozen-lockfile
          bun add -g "@akanjs/cli@$(bun -e 'console.info(require("./package.json").dependencies.akanjs)')"

      - name: Linux packages (WebKitGTK, squashfs-tools)
        if: runner.os == 'Linux'
        run: |
          sudo apt-get update
          sudo apt-get install -y libwebkit2gtk-4.1-dev libgtk-3-dev squashfs-tools

      - name: macOS certificate and notary key
        if: runner.os == 'macOS'
        shell: bash
        env:
          CERTIFICATE_P12: \${{ secrets.MACOS_CERTIFICATE_P12_BASE64 }}
          NOTARY_KEY_P8: \${{ secrets.MACOS_NOTARY_KEY_P8_BASE64 }}
        run: |
          echo "$CERTIFICATE_P12" | base64 --decode > "$RUNNER_TEMP/certificate.p12"
          echo "$NOTARY_KEY_P8" | base64 --decode > "$RUNNER_TEMP/AuthKey.p8"
          echo "AKAN_NATIVE_MACOS_CERTIFICATE=$RUNNER_TEMP/certificate.p12" >> "$GITHUB_ENV"
          echo "AKAN_NATIVE_MACOS_NOTARY_KEY=$RUNNER_TEMP/AuthKey.p8" >> "$GITHUB_ENV"
      - name: Windows certificate
        if: runner.os == 'Windows'
        shell: pwsh
        env:
          CERTIFICATE_PFX: \${{ secrets.WINDOWS_CERTIFICATE_PFX_BASE64 }}
        run: |
          [IO.File]::WriteAllBytes("$env:RUNNER_TEMP\\certificate.pfx", [Convert]::FromBase64String($env:CERTIFICATE_PFX))
          "AKAN_NATIVE_WINDOWS_CERTIFICATE=$env:RUNNER_TEMP\\certificate.pfx" >> $env:GITHUB_ENV

      - name: Build, sign and pack
        shell: bash
        env:
          AKAN_NATIVE_MACOS_CERTIFICATE_PASSWORD: \${{ secrets.MACOS_CERTIFICATE_PASSWORD }}
          AKAN_NATIVE_MACOS_NOTARY_KEY_ID: \${{ secrets.MACOS_NOTARY_KEY_ID }}
          AKAN_NATIVE_MACOS_NOTARY_ISSUER: \${{ secrets.MACOS_NOTARY_ISSUER }}
          AKAN_NATIVE_WINDOWS_CERTIFICATE_PASSWORD: \${{ secrets.WINDOWS_CERTIFICATE_PASSWORD }}
        run: akan build-desktop myapp --env main --installer true --arch \${{ matrix.arch }}

      - uses: actions/upload-artifact@v4
        with:
          name: myapp-\${{ runner.os }}-\${{ matrix.arch }}
          path: |
            apps/myapp/.akan/native/*/build/*/*.dmg
            apps/myapp/.akan/native/*/build/*/*-setup.exe
            apps/myapp/.akan/native/*/build/*/*.AppImage
          if-no-files-found: error`;

export default page().render(() => {
  const { l } = usePage();

  const macosEnv = [
    {
      key: "AKAN_NATIVE_MACOS_IDENTITY",
      desc: l.trans({
        en: "A keychain identity by name (“Developer ID Application: Name (TEAMID)”) or SHA-1. A Mac that already holds the certificate needs only this.",
        ko: "키체인의 인증서 이름(“Developer ID Application: Name (TEAMID)”) 또는 SHA-1입니다. 인증서가 이미 있는 Mac은 이것만 적습니다.",
      }),
    },
    {
      key: "AKAN_NATIVE_MACOS_CERTIFICATE + _PASSWORD",
      desc: l.trans({
        en: "A .p12 file and its password. The build imports it into a keychain of its own and deletes it afterwards: the CI way.",
        ko: ".p12 파일과 비밀번호입니다. 빌드가 자기 키체인에 넣었다가 끝나면 지웁니다. CI에서 쓰는 방식입니다.",
      }),
    },
    {
      key: "AKAN_NATIVE_MACOS_NOTARY_KEY + _KEY_ID + _ISSUER",
      desc: l.trans({
        en: "An App Store Connect API key (the AuthKey_XXXX.p8 file, its key id, the issuer id). Turns on notarization and stapling.",
        ko: "App Store Connect API 키(AuthKey_XXXX.p8 파일, 키 ID, 발급자 ID)입니다. 공증과 staple을 켭니다.",
      }),
    },
    {
      key: "AKAN_NATIVE_MACOS_NOTARY_PROFILE",
      desc: l.trans({
        en: "Instead of the key: a profile `xcrun notarytool store-credentials` saved in the keychain.",
        ko: "키 대신 `xcrun notarytool store-credentials`가 키체인에 저장한 프로필입니다.",
      }),
    },
  ];

  const windowsEnv = [
    {
      key: "AKAN_NATIVE_WINDOWS_CERTIFICATE + _PASSWORD",
      desc: l.trans({ en: "A .pfx file and its password.", ko: ".pfx 파일과 비밀번호입니다." }),
    },
    {
      key: "AKAN_NATIVE_WINDOWS_THUMBPRINT",
      desc: l.trans({
        en: "A certificate in the Windows store by its SHA-1 thumbprint: a USB token's or an HSM's.",
        ko: "Windows 인증서 저장소의 인증서를 SHA-1 지문으로 고릅니다. USB 토큰이나 HSM의 인증서입니다.",
      }),
    },
    {
      key: "AKAN_NATIVE_WINDOWS_SIGN_COMMAND",
      desc: l.trans({
        en: 'Any other signer as a JSON array, run once per file with {file} replaced, e.g. signtool with Azure Trusted Signing: ["signtool","sign","/fd","SHA256","/tr","http://timestamp.acs.microsoft.com","/td","SHA256","/dlib","Azure.CodeSigning.Dlib.dll","/dmdf","metadata.json","{file}"].',
        ko: '다른 서명 도구를 JSON 배열로 적습니다. 파일마다 {file}을 바꿔 한 번씩 실행합니다. 예: Azure Trusted Signing을 쓰는 signtool ["signtool","sign","/fd","SHA256","/tr","http://timestamp.acs.microsoft.com","/td","SHA256","/dlib","Azure.CodeSigning.Dlib.dll","/dmdf","metadata.json","{file}"].',
      }),
    },
    {
      key: "AKAN_NATIVE_WINDOWS_TIMESTAMP_URL",
      desc: l.trans({
        en: "The RFC 3161 timestamp server. Default http://timestamp.digicert.com.",
        ko: "RFC 3161 타임스탬프 서버입니다. 기본은 http://timestamp.digicert.com입니다.",
      }),
    },
  ];

  const installers = [
    {
      os: "macOS",
      file: "<fileName>-<version>-<arch>.dmg",
      desc: l.trans({
        en: "The app beside an Applications link. Signed, notarized and stapled like the app.",
        ko: "앱과 Applications 바로가기가 든 디스크 이미지입니다. 앱처럼 서명·공증·staple합니다.",
      }),
    },
    {
      os: "Windows",
      file: "<fileName>-<version>-<arch>-setup.exe",
      desc: l.trans({
        en: "A per-user NSIS setup (`/S` installs silently). The setup and the uninstaller it writes are signed too.",
        ko: "사용자 단위 NSIS 설치 프로그램입니다(`/S`면 조용히 설치). 설치 프로그램과 그것이 쓰는 제거 프로그램도 서명합니다.",
      }),
    },
    {
      os: "Linux",
      file: "<fileName>-<version>-<arch>.AppImage",
      desc: l.trans({
        en: "One executable file for any distribution with WebKitGTK 4.1 and GTK 3. The build needs `mksquashfs` (squashfs-tools). An AppImage cannot update itself.",
        ko: "WebKitGTK 4.1과 GTK 3이 있는 어느 배포판에서나 도는 실행 파일 하나입니다. 빌드에는 `mksquashfs`(squashfs-tools)가 필요합니다. AppImage는 스스로 업데이트하지 못합니다.",
      }),
    },
  ];

  const envList = (items: { key: string; desc: string }[]) => (
    <ul className="list-disc space-y-1 pl-5">
      {items.map((item) => (
        <li key={item.key}>
          <code>{item.key}</code> — {item.desc}
        </li>
      ))}
    </ul>
  );

  return (
    <Scroll>
      <Scroll.Slide id="desktop-release" title={l.trans({ en: "Desktop Release", ko: "데스크톱 배포" })}>
        <Docs.Title>{l.trans({ en: "Desktop Release", ko: "데스크톱 배포" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "A desktop app people download from the internet has to be signed so the OS opens it: Gatekeeper refuses an unsigned or un-notarized macOS app, and SmartScreen warns on an unsigned Windows program. `akan build-desktop` signs from the environment, packs the file people download with `--installer true`, and picks a Windows or Linux app's CPU with `--arch`; a macOS app is Apple silicon only.",
              ko: "인터넷에서 내려받는 데스크톱 앱은 OS가 열어 주도록 서명해야 합니다. Gatekeeper는 서명·공증하지 않은 macOS 앱을 막고, SmartScreen은 서명하지 않은 Windows 프로그램에 경고합니다. `akan build-desktop`은 환경 변수로 서명하고, `--installer true`로 내려받을 파일을 만들고, `--arch`로 Windows·Linux 앱의 CPU를 고릅니다. macOS 앱은 Apple silicon만 만듭니다.",
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="Terminal"
            language="bash"
            code="akan build-desktop myapp --env main --installer true"
          />
          <Docs.Alert type="info">
            {l.trans({
              en: "A desktop app is built on its own OS: a Mac builds the macOS app, a Windows PC the Windows one. The CI recipe below runs one job per OS instead of cross-compiling.",
              ko: "데스크톱 앱은 그 OS에서 빌드합니다. Mac은 macOS 앱을, Windows PC는 Windows 앱을 만듭니다. 아래 CI 레시피는 교차 빌드 대신 OS마다 작업을 하나씩 돌립니다.",
            })}
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>

      <Scroll.Slide id="signing" title={l.trans({ en: "Signing", ko: "서명" })}>
        <Docs.SubTitle>{l.trans({ en: "Signing", ko: "서명" })}</Docs.SubTitle>
        <Docs.Description>
          <Docs.SubSubTitle>macOS</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: "A Developer ID Application certificate signs every Mach-O file inside out — the server's native addons and `bin` included — with the hardened runtime and a secure timestamp. The executable gets Bun's JIT entitlements, and the camera's or microphone's when a usage text asks for them; `native.desktop.entitlements` adds the app's own. Notarization then submits the app, staples the ticket and checks it with `spctl`.",
              ko: "Developer ID Application 인증서로 모든 Mach-O 파일을 안쪽부터 서명합니다. 서버의 네이티브 애드온과 `bin`도 포함하고, hardened runtime과 보안 타임스탬프를 붙입니다. 실행 파일은 Bun JIT용 entitlements와, 사용 설명이 요구하면 카메라·마이크 entitlements를 받습니다. `native.desktop.entitlements`로 앱의 것을 더합니다. 이어서 공증에 내고 ticket을 staple한 뒤 `spctl`로 확인합니다.",
            })}
          </div>
          {envList(macosEnv)}
          <Docs.SubSubTitle>Windows</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: "Authenticode signs every PE file of the app — the executable, its DLL, the server's addons and `bin` — SHA-256 with an RFC 3161 timestamp, and verifies them. signtool comes from the Windows SDK (`AKAN_NATIVE_SIGNTOOL` names another).",
              ko: "Authenticode로 앱의 모든 PE 파일(실행 파일, DLL, 서버의 애드온과 `bin`)을 SHA-256과 RFC 3161 타임스탬프로 서명하고 확인합니다. signtool은 Windows SDK의 것을 씁니다(`AKAN_NATIVE_SIGNTOOL`로 다른 것을 고릅니다).",
            })}
          </div>
          {envList(windowsEnv)}
          <Docs.Alert type="warning">
            {l.trans({
              en: "`akan publish-update` signs with the same settings: the updater checks the installed app's signature, so a release signed differently is refused.",
              ko: "`akan publish-update`도 같은 설정으로 서명합니다. 업데이터가 설치된 앱의 서명을 확인하므로 다르게 서명한 릴리스는 거부됩니다.",
            })}
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>

      <Scroll.Slide id="installers" title={l.trans({ en: "Installers And CPU", ko: "설치 파일과 CPU" })}>
        <Docs.SubTitle>{l.trans({ en: "Installers And CPU", ko: "설치 파일과 CPU" })}</Docs.SubTitle>
        <Docs.Description>
          <ul className="list-disc space-y-1 pl-5">
            {installers.map((item) => (
              <li key={item.os}>
                <strong>{item.os}</strong> · <code>{item.file}</code> — {item.desc}
              </li>
            ))}
          </ul>
          <div>
            {l.trans({
              en: "`--arch arm64` or `--arch x64` builds a Windows or Linux app for that CPU of the OS: the Rust library, Bun's executable, the server's `bun install --cpu` and each `bin` file follow it. A macOS app is Apple silicon (arm64) only; Intel Macs are not a target.",
              ko: "`--arch arm64` 또는 `--arch x64`는 Windows·Linux 앱을 그 OS의 해당 CPU용으로 빌드합니다. Rust 라이브러리, Bun 실행 파일, 서버의 `bun install --cpu`, `bin` 파일이 모두 따릅니다. macOS 앱은 Apple silicon(arm64)만 만들며, Intel Mac은 대상이 아닙니다.",
            })}
          </div>
        </Docs.Description>
      </Scroll.Slide>

      <Scroll.Slide id="native-addons" title={l.trans({ en: "Native Addons", ko: "네이티브 애드온" })}>
        <Docs.SubTitle>{l.trans({ en: "Native Addons", ko: "네이티브 애드온" })}</Docs.SubTitle>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Before it copies the server, the build reads every `.node` file by package and stops, with the list, on what would fail at the first require on a user's computer: no binary for the target OS and CPU, a link or rpath to a library outside the system (a ROS install under /opt, Homebrew), or a `binding.gyp` its install never compiled — Bun runs no install script of an untrusted package, so add it to `trustedDependencies`. An addon compiled on the build machine only warns.",
              ko: "서버를 복사하기 전에 `.node` 파일을 패키지별로 읽고, 사용자 컴퓨터에서 처음 require할 때 실패할 것이 있으면 목록과 함께 빌드를 멈춥니다. 대상 OS·CPU용 바이너리가 없는 패키지, 시스템 밖의 라이브러리를 링크하거나 그런 rpath를 가진 바이너리(/opt의 ROS, Homebrew), 설치 때 컴파일되지 않은 `binding.gyp`입니다. Bun은 신뢰하지 않은 패키지의 설치 스크립트를 돌리지 않으므로 `trustedDependencies`에 더합니다. 빌드 머신에서 컴파일된 애드온은 경고만 합니다.",
            })}
          </div>
        </Docs.Description>
      </Scroll.Slide>

      <Scroll.Slide id="ci-recipe" title={l.trans({ en: "CI Recipe", ko: "CI 레시피" })}>
        <Docs.SubTitle>{l.trans({ en: "CI Recipe", ko: "CI 레시피" })}</Docs.SubTitle>
        <Docs.Description>
          <div>
            {l.trans({
              en: "One job per OS on GitHub Actions: install, build, sign, pack and upload. Store the certificate and the notary key base64-encoded in repository secrets; each is written to the runner's temp folder and named by its variable, and no password reaches a file.",
              ko: "GitHub Actions에서 OS마다 작업 하나로 설치·빌드·서명·포장·업로드합니다. 인증서와 공증 키는 base64로 저장소 secret에 넣습니다. 각각 러너의 임시 폴더에 파일로 쓰고 변수로 넘기며, 비밀번호는 어떤 파일에도 남지 않습니다.",
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title=".github/workflows/desktop-release.yml"
            language="yaml"
            code={ciRecipe}
          />
          <Docs.Alert type="info">
            {l.trans({
              en: "Replace myapp with the app's name and give the env its server configuration as the image's deployment does. macOS runners carry codesign and notarytool, Windows runners the Windows SDK's signtool and NSIS.",
              ko: "myapp을 앱 이름으로 바꾸고, 이미지 배포처럼 서버 설정 env를 준비합니다. macOS 러너에는 codesign·notarytool이, Windows 러너에는 Windows SDK의 signtool과 NSIS가 있습니다.",
            })}
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <DocsToc />
    </Scroll>
  );
});
