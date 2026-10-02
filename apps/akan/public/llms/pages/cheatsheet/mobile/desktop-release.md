# Desktop Release

- Source: /cheatsheet/mobile/desktop-release
- Mirror: /llms/pages/cheatsheet/mobile/desktop-release.md
- Section: cheatsheet
- Category: Mobile
- Priority: P2

## Headings

- Desktop Release (#desktop-release)
- Signing (#signing)
- Installers And CPU (#installers)
- Native Addons (#native-addons)
- CI Recipe (#ci-recipe)

## Content

Desktop Release

- AKAN_NATIVE_MACOS_IDENTITY: A keychain identity by name (“Developer ID Application: Name (TEAMID)”) or SHA-1. A Mac that already holds the certificate needs only this.

- AKAN_NATIVE_MACOS_CERTIFICATE + _PASSWORD: A .p12 file and its password. The build imports it into a keychain of its own and deletes it afterwards: the CI way.

- AKAN_NATIVE_MACOS_NOTARY_KEY + _KEY_ID + _ISSUER: An App Store Connect API key (the AuthKey_XXXX.p8 file, its key id, the issuer id). Turns on notarization and stapling.

- AKAN_NATIVE_MACOS_NOTARY_PROFILE: Instead of the key: a profile `xcrun notarytool store-credentials` saved in the keychain.

- AKAN_NATIVE_WINDOWS_CERTIFICATE + _PASSWORD: A .pfx file and its password.

- AKAN_NATIVE_WINDOWS_THUMBPRINT: A certificate in the Windows store by its SHA-1 thumbprint: a USB token's or an HSM's.

- AKAN_NATIVE_WINDOWS_SIGN_COMMAND: Any other signer as a JSON array, run once per file with {file} replaced, e.g. signtool with Azure Trusted Signing: ["signtool","sign","/fd","SHA256","/tr","http://timestamp.acs.microsoft.com","/td","SHA256","/dlib","Azure.CodeSigning.Dlib.dll","/dmdf","metadata.json","{file}"].

- AKAN_NATIVE_WINDOWS_TIMESTAMP_URL: The RFC 3161 timestamp server. Default http://timestamp.digicert.com.

A desktop app people download from the internet has to be signed so the OS opens it: Gatekeeper refuses an unsigned or un-notarized macOS app, and SmartScreen warns on an unsigned Windows program. `akan build-desktop` signs from the environment, packs the file people download with `--installer true`, and picks a Windows or Linux app's CPU with `--arch`; a macOS app is Apple silicon only.

A desktop app is built on its own OS: a Mac builds the macOS app, a Windows PC the Windows one. The CI recipe below runs one job per OS instead of cross-compiling.

Signing

A Developer ID Application certificate signs every Mach-O file inside out — the server's native addons and `bin` included — with the hardened runtime and a secure timestamp. The executable gets Bun's JIT entitlements, and the camera's or microphone's when a usage text asks for them; `native.desktop.entitlements` adds the app's own. Notarization then submits the app, staples the ticket and checks it with `spctl`.

Authenticode signs every PE file of the app — the executable, its DLL, the server's addons and `bin` — SHA-256 with an RFC 3161 timestamp, and verifies them. signtool comes from the Windows SDK (`AKAN_NATIVE_SIGNTOOL` names another).

`akan publish-update` signs with the same settings: the updater checks the installed app's signature, so a release signed differently is refused.

Installers And CPU

- macOS — <fileName>-<version>-<arch>.dmg — The app beside an Applications link. Signed, notarized and stapled like the app.

- Windows — <fileName>-<version>-<arch>-setup.exe — A per-user NSIS setup (`/S` installs silently). The setup and the uninstaller it writes are signed too.

- Linux — <fileName>-<version>-<arch>.AppImage — One executable file for any distribution with WebKitGTK 4.1 and GTK 3. The build needs `mksquashfs` (squashfs-tools). An AppImage cannot update itself.

`--arch arm64` or `--arch x64` builds a Windows or Linux app for that CPU of the OS: the Rust library, Bun's executable, the server's `bun install --cpu` and each `bin` file follow it. A macOS app is Apple silicon (arm64) only; Intel Macs are not a target.

Native Addons

Before it copies the server, the build reads every `.node` file by package and stops, with the list, on what would fail at the first require on a user's computer: no binary for the target OS and CPU, a link or rpath to a library outside the system (a ROS install under /opt, Homebrew), or a `binding.gyp` its install never compiled — Bun runs no install script of an untrusted package, so add it to `trustedDependencies`. An addon compiled on the build machine only warns.

CI Recipe

One job per OS on GitHub Actions: install, build, sign, pack and upload. Store the certificate and the notary key base64-encoded in repository secrets; each is written to the runner's temp folder and named by its variable, and no password reaches a file.

Replace myapp with the app's name and give the env its server configuration as the image's deployment does. macOS runners carry codesign and notarytool, Windows runners the Windows SDK's signtool and NSIS.

## Code Examples

### Terminal

```bash
akan build-desktop myapp --env main --installer true
```

### .github/workflows/desktop-release.yml

```yaml
name: desktop-release

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
    runs-on: ${{ matrix.os }}
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
          CERTIFICATE_P12: ${{ secrets.MACOS_CERTIFICATE_P12_BASE64 }}
          NOTARY_KEY_P8: ${{ secrets.MACOS_NOTARY_KEY_P8_BASE64 }}
        run: |
          echo "$CERTIFICATE_P12" | base64 --decode > "$RUNNER_TEMP/certificate.p12"
          echo "$NOTARY_KEY_P8" | base64 --decode > "$RUNNER_TEMP/AuthKey.p8"
          echo "AKAN_NATIVE_MACOS_CERTIFICATE=$RUNNER_TEMP/certificate.p12" >> "$GITHUB_ENV"
          echo "AKAN_NATIVE_MACOS_NOTARY_KEY=$RUNNER_TEMP/AuthKey.p8" >> "$GITHUB_ENV"
      - name: Windows certificate
        if: runner.os == 'Windows'
        shell: pwsh
        env:
          CERTIFICATE_PFX: ${{ secrets.WINDOWS_CERTIFICATE_PFX_BASE64 }}
        run: |
          [IO.File]::WriteAllBytes("$env:RUNNER_TEMP\certificate.pfx", [Convert]::FromBase64String($env:CERTIFICATE_PFX))
          "AKAN_NATIVE_WINDOWS_CERTIFICATE=$env:RUNNER_TEMP\certificate.pfx" >> $env:GITHUB_ENV

      - name: Build, sign and pack
        shell: bash
        env:
          AKAN_NATIVE_MACOS_CERTIFICATE_PASSWORD: ${{ secrets.MACOS_CERTIFICATE_PASSWORD }}
          AKAN_NATIVE_MACOS_NOTARY_KEY_ID: ${{ secrets.MACOS_NOTARY_KEY_ID }}
          AKAN_NATIVE_MACOS_NOTARY_ISSUER: ${{ secrets.MACOS_NOTARY_ISSUER }}
          AKAN_NATIVE_WINDOWS_CERTIFICATE_PASSWORD: ${{ secrets.WINDOWS_CERTIFICATE_PASSWORD }}
        run: akan build-desktop myapp --env main --installer true --arch ${{ matrix.arch }}

      - uses: actions/upload-artifact@v4
        with:
          name: myapp-${{ runner.os }}-${{ matrix.arch }}
          path: |
            apps/myapp/.akan/native/*/build/*/*.dmg
            apps/myapp/.akan/native/*/build/*/*-setup.exe
            apps/myapp/.akan/native/*/build/*/*.AppImage
          if-no-files-found: error
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Use this page as a task recipe, then verify with the relevant lint, test, or build command.

