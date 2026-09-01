import { usePage } from "@apps/akan/client";
import { Code, Docs } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { Link } from "akanjs/ui";
import { FaLink } from "react-icons/fa";

export default function Page() {
  const { l } = usePage();
  const ExternalLink = ({ href, label }: { href: string; label: string }) => (
    <Link
      href={href}
      target="_blank"
      rel="noreferrer"
      className="ml-1 inline-flex size-5 -translate-y-px items-center justify-center rounded-full bg-foreground/50 align-baseline text-white transition-colors hover:bg-foreground/70"
      aria-label={label}
      title={label}
    >
      <FaLink className="size-2.5" />
    </Link>
  );

  return (
    <Scroll>
      <Scroll.Slide id="overview" title={l.trans({ en: "Mobile Setup Flow", ko: "모바일 설정 흐름" })}>
        <Docs.Title>{l.trans({ en: "Mobile Setup Flow", ko: "모바일 설정 흐름" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Akan mobile apps reuse the CSR web app inside a Capacitor Android/iOS shell. The web app owns pages and business logic. The native shell owns package identity, device permissions, plugin linking, native files, signing, and store builds.",
              ko: "Akan 모바일 앱은 CSR 웹 앱을 Capacitor Android/iOS shell 안에서 실행합니다. 웹 앱은 페이지와 비즈니스 로직을 담당하고, 네이티브 shell은 패키지 식별자, 디바이스 권한, 플러그인 링크, 네이티브 파일, signing, 스토어 빌드를 담당합니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "Start with the mobile identity, declare only the Capacitor plugins the app actually uses, then prepare Android and iOS builds. Push notifications and deep links are optional features; configure them only when the app needs them.",
              ko: "먼저 모바일 식별자를 정하고, 앱에서 실제로 쓰는 Capacitor 플러그인만 선언한 뒤, Android와 iOS 빌드를 준비합니다. Push notification과 deep link는 선택 기능이므로 앱에 필요할 때만 설정하세요.",
            })}
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {[
              {
                title: "1. mobile config",
                desc: l.trans({
                  en: "App name, package id, version, target basePath, permissions, native files.",
                  ko: "앱 이름, package id, 버전, target basePath, 권한, 네이티브 파일을 정합니다.",
                }),
              },
              {
                title: "2. Capacitor plugins",
                desc: l.trans({
                  en: "List the native plugins used by this app in apps/myapp/package.json.",
                  ko: "이 앱에서 쓰는 네이티브 플러그인을 apps/myapp/package.json에 선언합니다.",
                }),
              },
              {
                title: "3. Android / iOS",
                desc: l.trans({
                  en: "Prepare platform toolchains, app IDs, signing, and sync/build commands.",
                  ko: "플랫폼 도구, app ID, signing, sync/build 명령을 준비합니다.",
                }),
              },
            ].map(({ title, desc }) => (
              <div key={title} className="rounded-xl border border-background/30 bg-background px-4 py-3">
                <div className="font-mono font-semibold text-primary">{title}</div>
                <div className="mt-1 text-foreground/70 text-sm">{desc}</div>
              </div>
            ))}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="mobile-config" title={l.trans({ en: "Mobile Config", ko: "Mobile Config" })}>
        <Docs.Title>{l.trans({ en: "Mobile Config", ko: "Mobile Config" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "The mobile block in akan.config.ts describes the native package. These values become Android application metadata, iOS bundle metadata, target entry paths, native permission hints, and native file copy rules.",
              ko: "akan.config.ts의 mobile 블록은 네이티브 패키지를 설명합니다. 이 값은 Android application metadata, iOS bundle metadata, target 진입 경로, 네이티브 권한 힌트, 네이티브 파일 복사 규칙으로 반영됩니다.",
            })}
          </div>
          <Code.Snippet
            title="apps/myapp/akan.config.ts"
            code={`import type { AppConfig } from "akanjs";

const config: AppConfig = {
  mobile: {
    appName: "Shop",
    appId: "com.example.shop",
    version: "1.0.0",
    buildNum: 1,
    targets: {
      default: {
        basePath: "shop",
        permissions: ["camera"],
      },
    },
  },
};

export default config;`}
          />
          <div className="space-y-1">
            {[
              {
                title: "appName",
                desc: l.trans({
                  en: "Native display name. Users see it on the launcher/home screen unless the platform or store overrides it.",
                  ko: "네이티브 표시 이름입니다. 플랫폼이나 스토어가 덮어쓰지 않는 한 런처/홈 화면에서 보입니다.",
                }),
              },
              {
                title: "appId",
                desc: l.trans({
                  en: "Stable native package identity. Android uses it as applicationId/package name; iOS uses it as bundle id. Any platform console registration must match it exactly.",
                  ko: "고정 네이티브 패키지 식별자입니다. Android는 applicationId/package name으로, iOS는 bundle id로 사용합니다. 플랫폼 콘솔에 앱을 등록할 때도 정확히 같은 값을 써야 합니다.",
                }),
              },
              {
                title: "version / buildNum",
                desc: l.trans({
                  en: "version is the user-facing version. buildNum is the store build number and must increase for every native store submission.",
                  ko: "version은 사용자에게 보이는 버전이고, buildNum은 스토어 제출용 빌드 번호입니다. 네이티브 스토어 제출마다 buildNum을 올려야 합니다.",
                }),
              },
              {
                title: "targets.default.basePath",
                desc: l.trans({
                  en: "The Akan client route opened by the native app. Use separate targets when one app repo ships separate customer/admin/partner apps.",
                  ko: "네이티브 앱이 여는 Akan client route입니다. 하나의 앱 repo에서 고객/관리자/파트너 앱을 따로 배포할 때 target을 나눕니다.",
                }),
              },
              {
                title: "permissions",
                desc: l.trans({
                  en: 'Native capability hints such as "camera", "contacts", "location", and "push". They prepare Akan-side native metadata, but plugin-specific setup can still be required.',
                  ko: '"camera", "contacts", "location", "push" 같은 네이티브 기능 힌트입니다. Akan 쪽 네이티브 metadata를 준비하지만, 플러그인별 세부 설정은 여전히 필요할 수 있습니다.',
                }),
              },
              {
                title: "files",
                desc: l.trans({
                  en: "Copies app-owned files into generated native project paths. Use it for native config files that must live inside Android or iOS projects.",
                  ko: "앱 폴더의 파일을 생성된 네이티브 프로젝트 경로로 복사합니다. Android/iOS 프로젝트 안에 들어가야 하는 네이티브 설정 파일에 사용합니다.",
                }),
              },
            ].map(({ title, desc }) => (
              <div key={title} className="rounded-xl border border-background/30 bg-background px-4 py-0">
                <span className="font-mono font-semibold text-primary">{title}: </span>
                <span className="text-foreground/70 text-sm">{desc}</span>
              </div>
            ))}
          </div>
          <Docs.Alert type="warning">
            {l.trans({
              en: "Do not change appId casually after release. Android and iOS treat a different appId as a different app.",
              ko: "릴리즈 후 appId는 가볍게 바꾸면 안 됩니다. Android와 iOS는 다른 appId를 완전히 다른 앱으로 봅니다.",
            })}
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="capacitor-plugins" title={l.trans({ en: "Capacitor Plugins", ko: "Capacitor Plugins" })}>
        <Docs.Title>{l.trans({ en: "Capacitor Plugins", ko: "Capacitor Plugins" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Capacitor links native plugins from the app package. A workspace-level dependency is not enough if the app package does not declare the plugin. Add only the plugins your app actually calls.",
              ko: "Capacitor는 앱 package에 선언된 네이티브 플러그인을 링크합니다. workspace 전체에 dependency가 있어도 앱 package에 선언되어 있지 않으면 부족합니다. 앱에서 실제로 호출하는 플러그인만 넣으세요.",
            })}
          </div>
          <Code.Snippet
            title="Base mobile shell dependencies"
            code={`{
  "dependencies": {
    "@capacitor/app": "*",
    "@capacitor/core": "*",
    "@capacitor/device": "*",
    "@capacitor/keyboard": "*",
    "@capacitor/preferences": "*",
    "capacitor-plugin-safe-area": "*"
  }
}`}
          />
          <Code.Snippet
            title="Push notification add-on dependencies"
            code={`{
  "dependencies": {
    "@capacitor/push-notifications": "*",
    "@capacitor-community/fcm": "*"
  }
}`}
          />
          <div>
            {l.trans({
              en: "Use * because the app package declares usage, not the resolved version. The workspace lockfile and root package control the actual installed version.",
              ko: "*를 쓰는 이유는 앱 package가 resolved version이 아니라 사용 여부만 선언하기 때문입니다. 실제 설치 버전은 workspace lockfile과 root package가 관리합니다.",
            })}
          </div>
          <Docs.Alert type="warning">
            {l.trans({
              en: "start-ios/start-android run Capacitor add/sync/run commands, but they do not add dependencies to apps/myapp/package.json. Declare the app dependencies first, then rerun the mobile command.",
              ko: "start-ios/start-android는 Capacitor add/sync/run 명령을 실행하지만 apps/myapp/package.json에 dependency를 추가하지는 않습니다. 먼저 app dependency를 선언한 뒤 mobile 명령을 다시 실행하세요.",
            })}
          </Docs.Alert>
          <div className="space-y-1">
            {[
              {
                title: "Usually package-only",
                desc: l.trans({
                  en: "Small bridge plugins such as haptics or device often work after package declaration and sync.",
                  ko: "haptics, device 같은 작은 bridge 플러그인은 package 선언 후 sync만으로 동작하는 경우가 많습니다.",
                }),
              },
              {
                title: "Package + native settings",
                desc: l.trans({
                  en: "Camera, geolocation, push, background work, file access, and auth plugins often require Info.plist, AndroidManifest, Xcode capabilities, Gradle settings, or console credentials.",
                  ko: "camera, geolocation, push, background 작업, file access, auth 플러그인은 Info.plist, AndroidManifest, Xcode capability, Gradle 설정, 콘솔 credential이 필요한 경우가 많습니다.",
                }),
              },
              {
                title: "After changing plugins",
                desc: l.trans({
                  en: "Run start-ios/start-android or a build command again. That regenerates native plugin files.",
                  ko: "플러그인을 추가/제거한 뒤에는 start-ios/start-android 또는 build 명령을 다시 실행하세요. 이때 네이티브 플러그인 파일이 갱신됩니다.",
                }),
              },
            ].map(({ title, desc }) => (
              <div key={title} className="rounded-xl border border-background/30 bg-background px-4 py-0">
                <span className="font-mono font-semibold text-primary">{title}: </span>
                <span className="text-foreground/70 text-sm">{desc}</span>
              </div>
            ))}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="android-setup" title={l.trans({ en: "Android Setup", ko: "Android Setup" })}>
        <Docs.Title>{l.trans({ en: "Android Setup", ko: "Android Setup" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Android setup prepares a generated Android project that can build and run on an emulator or physical device. The important path is package name consistency: mobile.appId and the generated Android applicationId must match.",
              ko: "Android 설정은 에뮬레이터나 실기기에서 빌드/실행 가능한 Android 프로젝트를 준비하는 과정입니다. 핵심은 package name 일치입니다. mobile.appId와 생성된 Android applicationId가 같아야 합니다.",
            })}
          </div>
          <div className="rounded-xl border border-background/30 bg-background p-4">
            <div className="font-bold text-foreground">{l.trans({ en: "Prerequisites", ko: "준비물" })}</div>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-foreground/70 text-sm">
              <li>
                {l.trans({
                  en: "Android Studio with Android SDK installed.",
                  ko: "Android SDK가 설치된 Android Studio.",
                })}
                <ExternalLink href="https://developer.android.com/studio" label="Open Android Studio download" />
              </li>
              <li>
                {l.trans({ en: "JDK 21 available from your shell.", ko: "터미널에서 사용할 수 있는 JDK 21." })}
                <ExternalLink href="https://formulae.brew.sh/formula/openjdk@21" label="Open Homebrew openjdk@21" />
              </li>
              <li>
                {l.trans({
                  en: "A stable mobile.appId such as com.example.shop.",
                  ko: "com.example.shop 같은 고정 mobile.appId.",
                })}
                <ExternalLink
                  href="https://developer.android.com/build/configure-app-module#set-application-id"
                  label="Open Android application ID docs"
                />
              </li>
            </ul>
          </div>
          <Code.Snippet
            title="1. Configure local toolchain"
            language="bash"
            code={`brew install openjdk@21
export JAVA_HOME="$(/usr/libexec/java_home -v 21)"
export PATH="$JAVA_HOME/bin:$PATH"
export ANDROID_HOME="$HOME/Library/Android/sdk"`}
          />
          <Code.Snippet
            title="2. Set Android package identity"
            code={`const config: AppConfig = {
  mobile: {
    appName: "Shop",
    appId: "com.example.shop",
    version: "1.0.0",
    buildNum: 1,
    targets: {
      default: {
        basePath: "shop",
      },
    },
  },
};`}
          />
          <Code.Snippet
            title="3. Sync and build"
            language="bash"
            code={`akan start-android myapp --target default
akan build-android myapp --target default
akan release-android myapp --target default --env main --assembleType aab`}
          />
          <div className="space-y-1">
            {[
              {
                title: "start-android",
                desc: l.trans({
                  en: "Use during development. It prepares native files and runs the app on an emulator or connected device.",
                  ko: "개발 중 사용합니다. 네이티브 파일을 준비하고 에뮬레이터나 연결된 기기에서 앱을 실행합니다.",
                }),
              },
              {
                title: "build-android",
                desc: l.trans({
                  en: "Use to verify the Android project builds without starting an interactive device run.",
                  ko: "기기 실행 없이 Android 프로젝트가 빌드되는지 확인할 때 사용합니다.",
                }),
              },
              {
                title: "release-android",
                desc: l.trans({
                  en: "Use for store artifacts such as AAB. Release signing and Play Store settings matter here.",
                  ko: "AAB 같은 스토어 산출물을 만들 때 사용합니다. 이 단계에서는 release signing과 Play Store 설정이 중요합니다.",
                }),
              },
            ].map(({ title, desc }) => (
              <div key={title} className="rounded-xl border border-background/30 bg-background px-4 py-0">
                <span className="font-mono font-semibold text-primary">{title}: </span>
                <span className="text-foreground/70 text-sm">{desc}</span>
              </div>
            ))}
          </div>
          <div className="rounded-xl border border-background/30 bg-background p-4">
            <div className="font-bold text-foreground">{l.trans({ en: "Success check", ko: "성공 확인" })}</div>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-foreground/70 text-sm">
              <li>
                {l.trans({
                  en: "Generated applicationId matches mobile.appId.",
                  ko: "생성된 applicationId가 mobile.appId와 같습니다.",
                })}
              </li>
              <li>
                {l.trans({
                  en: "The app runs on an emulator or physical device.",
                  ko: "앱이 에뮬레이터나 실기기에서 실행됩니다.",
                })}
              </li>
            </ul>
          </div>
          <Docs.Alert type="info">
            {l.trans({
              en: "Push notifications are covered in Push Setup. Keep Android Setup focused on the native project and package identity first.",
              ko: "Push 알림은 Push Setup에서 다룹니다. Android Setup에서는 먼저 네이티브 프로젝트와 package identity만 확인하세요.",
            })}
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="ios-setup" title={l.trans({ en: "iOS Setup", ko: "iOS Setup" })}>
        <Docs.Title>{l.trans({ en: "iOS Setup", ko: "iOS Setup" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "iOS setup prepares the Xcode project, bundle identity, signing, simulator runs, and store-oriented builds. Push notifications are covered in Push Setup.",
              ko: "iOS 설정은 Xcode 프로젝트, bundle identity, signing, 시뮬레이터 실행, 스토어 빌드를 준비하는 과정입니다. Push 알림은 Push Setup에서 다룹니다.",
            })}
          </div>
          <div className="rounded-xl border border-background/30 bg-background p-4">
            <div className="font-bold text-foreground">{l.trans({ en: "Prerequisites", ko: "준비물" })}</div>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-foreground/70 text-sm">
              <li>
                {l.trans({ en: "Xcode installed.", ko: "설치된 Xcode." })}
                <ExternalLink href="https://developer.apple.com/xcode/" label="Open Xcode download" />
              </li>
              <li>
                {l.trans({
                  en: "A stable mobile.appId used as the iOS bundle id.",
                  ko: "iOS bundle id로 사용할 고정 mobile.appId.",
                })}
                <ExternalLink
                  href="https://developer.apple.com/help/account/identifiers/register-an-app-id"
                  label="Open Apple bundle ID docs"
                />
              </li>
              <li>
                {l.trans({
                  en: "Apple signing setup when running on a physical device or releasing.",
                  ko: "실기기 실행이나 릴리즈를 위한 Apple signing 설정.",
                })}
                <ExternalLink
                  href="https://developer.apple.com/help/account/certificates/create-a-certificate-signing-request"
                  label="Open Apple signing docs"
                />
              </li>
            </ul>
          </div>
          <div className="rounded-xl border border-background/30 bg-background p-4">
            <div className="font-bold text-foreground">{l.trans({ en: "Xcode checks", ko: "Xcode 확인" })}</div>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-foreground/70">
              <li>
                {l.trans({
                  en: "Open the generated iOS project after sync.",
                  ko: "sync 후 생성된 iOS 프로젝트를 엽니다.",
                })}
              </li>
              <li>
                {l.trans({
                  en: "Check that bundle identifier matches mobile.appId.",
                  ko: "bundle identifier가 mobile.appId와 같은지 확인합니다.",
                })}
              </li>
              <li>
                {l.trans({
                  en: "Check signing team and provisioning when running on a physical device.",
                  ko: "실기기에서 실행한다면 signing team과 provisioning을 확인합니다.",
                })}
              </li>
              <li>
                {l.trans({
                  en: "Run the app in a simulator first, then move to a physical device for device-only features.",
                  ko: "먼저 시뮬레이터에서 실행하고, 기기 전용 기능은 실기기에서 확인합니다.",
                })}
              </li>
            </ol>
          </div>
          <Code.Snippet
            title="1. Sync and build"
            language="bash"
            code={`akan start-ios myapp --target default
akan build-ios myapp --target default
akan release-ios myapp --target default --env main`}
          />
          <Docs.Alert type="info">
            {l.trans({
              en: "Push notifications are covered in Push Setup.",
              ko: "Push 알림은 Push Setup에서 다룹니다.",
            })}
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />
      <Scroll.Slide id="verify" title={l.trans({ en: "Verify Setup", ko: "Verify Setup" })}>
        <Docs.Title>{l.trans({ en: "Verify Setup", ko: "Verify Setup" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Do not stop at a successful build. Verify the actual feature surface: plugin availability, native file placement, permission prompt, push token creation, server send, and click routing.",
              ko: "빌드 성공에서 멈추지 마세요. 플러그인 사용 가능 여부, 네이티브 파일 위치, 권한 prompt, push token 생성, 서버 발송, 클릭 라우팅까지 실제 기능 표면을 확인해야 합니다.",
            })}
          </div>
          <div className="space-y-1">
            {[
              {
                title: "Plugin available",
                desc: l.trans({
                  en: "If the console says plugin is not implemented, the JS package exists but the native plugin was not linked. Check app package.json and rerun sync/build.",
                  ko: "콘솔에 plugin is not implemented가 나오면 JS package는 있지만 네이티브 플러그인이 링크되지 않은 상태입니다. app package.json을 확인하고 sync/build를 다시 실행하세요.",
                }),
              },
              {
                title: "Android push",
                desc: l.trans({
                  en: "Check package name, app/google-services.json, Google Services Gradle setup, notification permission, and Firebase project match.",
                  ko: "package name, app/google-services.json, Google Services Gradle 설정, 알림 권한, Firebase 프로젝트 일치를 확인하세요.",
                }),
              },
              {
                title: "iOS push",
                desc: l.trans({
                  en: "Check real device testing, aps-environment entitlement, APNs key upload, provisioning profile, and GoogleService-Info.plist target membership.",
                  ko: "실기기 테스트, aps-environment entitlement, APNs key 업로드, provisioning profile, GoogleService-Info.plist target membership을 확인하세요.",
                }),
              },
              {
                title: "Click routing",
                desc: l.trans({
                  en: "Send a notification with url: /some/path and confirm tapping it opens the expected CSR route.",
                  ko: "url: /some/path가 포함된 알림을 보내고, 클릭했을 때 기대한 CSR route가 열리는지 확인하세요.",
                }),
              },
            ].map(({ title, desc }) => (
              <div key={title} className="rounded-xl border border-background/30 bg-background px-4 py-0">
                <span className="font-mono font-semibold text-primary">{title}: </span>
                <span className="text-foreground/70 text-sm">{desc}</span>
              </div>
            ))}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <Scroll.TitleNavigator className="fixed top-32 right-0 hidden w-[250px] flex-col gap-2 lg:flex" />
    </Scroll>
  );
}
