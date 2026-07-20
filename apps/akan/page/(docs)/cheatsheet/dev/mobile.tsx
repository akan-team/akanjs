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
      className="ml-1 inline-flex size-5 -translate-y-px items-center justify-center rounded-full bg-base-content/50 align-baseline text-white transition-colors hover:bg-base-content/70"
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
              <div key={title} className="rounded-xl border border-base-300 bg-base-100 px-4 py-3">
                <div className="font-mono font-semibold text-primary">{title}</div>
                <div className="mt-1 text-base-content/70 text-sm">{desc}</div>
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
              <div key={title} className="rounded-xl border border-base-300 bg-base-100 px-4 py-0">
                <span className="font-mono font-semibold text-primary">{title}: </span>
                <span className="text-base-content/70 text-sm">{desc}</span>
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
              <div key={title} className="rounded-xl border border-base-300 bg-base-100 px-4 py-0">
                <span className="font-mono font-semibold text-primary">{title}: </span>
                <span className="text-base-content/70 text-sm">{desc}</span>
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
          <div className="rounded-xl border border-base-300 bg-base-100 p-4">
            <div className="font-bold text-base-content">{l.trans({ en: "Prerequisites", ko: "준비물" })}</div>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-base-content/70 text-sm">
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
              <div key={title} className="rounded-xl border border-base-300 bg-base-100 px-4 py-0">
                <span className="font-mono font-semibold text-primary">{title}: </span>
                <span className="text-base-content/70 text-sm">{desc}</span>
              </div>
            ))}
          </div>
          <div className="rounded-xl border border-base-300 bg-base-100 p-4">
            <div className="font-bold text-base-content">{l.trans({ en: "Success check", ko: "성공 확인" })}</div>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-base-content/70 text-sm">
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
          <div className="rounded-xl border border-base-300 bg-base-100 p-4">
            <div className="font-bold text-base-content">{l.trans({ en: "Prerequisites", ko: "준비물" })}</div>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-base-content/70 text-sm">
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
          <div className="rounded-xl border border-base-300 bg-base-100 p-4">
            <div className="font-bold text-base-content">{l.trans({ en: "Xcode checks", ko: "Xcode 확인" })}</div>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-base-content/70">
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

      <Scroll.Slide id="push-setup" title={l.trans({ en: "Push Setup", ko: "Push Setup" })}>
        <Docs.Title>{l.trans({ en: "Push Setup", ko: "Push Setup" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Push setup has three separate surfaces: web push, Android push, and iOS push. Akan gives one client API, usePushNotification(), but the platform setup is still different.",
              ko: "Push 설정은 web push, Android push, iOS push 세 영역으로 나뉩니다. Akan은 usePushNotification() 하나의 client API를 제공하지만, 플랫폼 설정은 여전히 다릅니다.",
            })}
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-base-300 bg-base-100 p-4">
              <div className="font-bold text-base-content">
                {l.trans({ en: "Akan automates", ko: "Akan이 자동 처리" })}
              </div>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-base-content/70 text-sm">
                <li>
                  {l.trans({
                    en: "Serving /firebase-messaging-sw.js for web push.",
                    ko: "web push용 /firebase-messaging-sw.js 서빙.",
                  })}
                </li>
                <li>
                  {l.trans({
                    en: "Android POST_NOTIFICATIONS permission when target.permissions includes push.",
                    ko: "target.permissions에 push가 있을 때 Android POST_NOTIFICATIONS 권한 추가.",
                  })}
                </li>
                <li>
                  {l.trans({
                    en: "iOS aps-environment, remote-notification background mode, and Capacitor AppDelegate bridge.",
                    ko: "iOS aps-environment, remote-notification background mode, Capacitor AppDelegate bridge 생성.",
                  })}
                </li>
              </ul>
            </div>
            <div className="rounded-xl border border-base-300 bg-base-100 p-4">
              <div className="font-bold text-base-content">{l.trans({ en: "You provide", ko: "사용자가 준비" })}</div>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-base-content/70 text-sm">
                <li>
                  {l.trans({
                    en: "App package dependencies for Capacitor push and FCM.",
                    ko: "Capacitor push와 FCM용 app package dependency.",
                  })}
                </li>
                <li>
                  {l.trans({
                    en: "Firebase web config, google-services.json, and GoogleService-Info.plist.",
                    ko: "Firebase web config, google-services.json, GoogleService-Info.plist.",
                  })}
                </li>
                <li>
                  {l.trans({
                    en: "Firebase Console app registration and APNs credentials.",
                    ko: "Firebase Console 앱 등록과 APNs credential.",
                  })}
                </li>
              </ul>
            </div>
          </div>
          <div className="rounded-xl border border-base-300 bg-base-100 p-4">
            <div className="font-bold text-base-content">{l.trans({ en: "Web push", ko: "Web push" })}</div>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-base-content/70">
              <li>
                {l.trans({
                  en: "Create or open a Firebase web app in Firebase Console.",
                  ko: "Firebase Console에서 web 앱을 만들거나 기존 web 앱을 엽니다.",
                })}
                <ExternalLink href="https://console.firebase.google.com/" label="Open Firebase Console" />
              </li>
              <li>
                {l.trans({
                  en: "Copy the public Firebase web config into env.client.*.",
                  ko: "공개 가능한 Firebase web config를 env.client.*에 넣습니다.",
                })}
                <ExternalLink
                  href="https://firebase.google.com/docs/web/setup#config-object"
                  label="Open Firebase web config docs"
                />
              </li>
              <li>
                {l.trans({
                  en: "Create a Web Push certificate key pair and put the VAPID public key in vapidKey.",
                  ko: "Web Push certificate key pair를 만들고 VAPID public key를 vapidKey에 넣습니다.",
                })}
                <ExternalLink
                  href="https://firebase.google.com/docs/cloud-messaging/js/client#configure_web_credentials_in_your_app"
                  label="Open Firebase web push credentials docs"
                />
              </li>
              <li>
                {l.trans({
                  en: "Akan serves /firebase-messaging-sw.js automatically from the client Firebase config.",
                  ko: "Akan은 client Firebase config를 사용해 /firebase-messaging-sw.js를 자동으로 서빙합니다.",
                })}
                <ExternalLink
                  href="https://firebase.google.com/docs/cloud-messaging/js/receive"
                  label="Open Firebase web receive docs"
                />
              </li>
            </ol>
          </div>
          <Code.Snippet
            title="apps/myapp/env/env.client.local.ts"
            code={`export const env = {
  firebase: {
    apiKey: "...",
    authDomain: "...",
    projectId: "...",
    storageBucket: "...",
    messagingSenderId: "...",
    appId: "...",
    vapidKey: "...",
  },
};`}
          />
          <div className="rounded-xl border border-base-300 bg-base-100 p-4">
            <div className="font-bold text-base-content">{l.trans({ en: "Android push", ko: "Android push" })}</div>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-base-content/70">
              <li>
                {l.trans({
                  en: "Open Firebase Console and select the project.",
                  ko: "Firebase Console에서 프로젝트를 엽니다.",
                })}
                <ExternalLink href="https://console.firebase.google.com/" label="Open Firebase Console" />
              </li>
              <li>
                {l.trans({ en: "Add an Android app.", ko: "Android 앱을 추가합니다." })}
                <ExternalLink
                  href="https://firebase.google.com/docs/android/setup"
                  label="Open Firebase Android setup docs"
                />
              </li>
              <li>
                {l.trans({
                  en: "Enter the same package name as mobile.appId.",
                  ko: "mobile.appId와 같은 package name을 입력합니다.",
                })}
              </li>
              <li>
                {l.trans({ en: "Download google-services.json.", ko: "google-services.json을 다운로드합니다." })}
                <ExternalLink
                  href="https://firebase.google.com/docs/android/setup#add-config-file"
                  label="Open google-services.json docs"
                />
              </li>
              <li>
                {l.trans({
                  en: "Place it at apps/myapp/public/google-services.json.",
                  ko: "apps/myapp/public/google-services.json에 둡니다.",
                })}
              </li>
            </ol>
          </div>
          <Code.Snippet
            title="Android push file copy"
            code={`const config: AppConfig = {
  mobile: {
    targets: {
      default: {
        permissions: ["push"],
        files: {
          android: {
            "app/google-services.json": "public/google-services.json",
          },
        },
      },
    },
  },
};`}
          />
          <Docs.Alert type="warning">
            {l.trans({
              en: "google-services.json is a client/native Firebase config file. It is not the Firebase Admin service account JSON. Server credentials belong in env.server.*.",
              ko: "google-services.json은 client/native Firebase 설정 파일입니다. Firebase Admin service account JSON이 아닙니다. 서버 credential은 env.server.*에 둡니다.",
            })}
          </Docs.Alert>
          <div className="rounded-xl border border-base-300 bg-base-100 p-4">
            <div className="font-bold text-base-content">
              {l.trans({ en: "Android notification details", ko: "Android notification details" })}
            </div>
            <div className="mt-2 text-base-content/70">
              {l.trans({
                en: "Android can require extra notification behavior outside token registration. Create channels when you need stable categories such as order updates or chat messages, set the default icon/color in the native project if the launcher icon is not appropriate, and decide foreground presentation behavior in app code.",
                ko: "Android는 token 등록과 별개로 알림 표시 설정이 더 필요할 수 있습니다. 주문 업데이트나 채팅처럼 고정 카테고리가 필요하면 channel을 만들고, 런처 아이콘이 알림 아이콘으로 맞지 않으면 네이티브 프로젝트에서 기본 icon/color를 설정하고, 앱 실행 중 foreground 표시 방식도 앱 코드에서 결정하세요.",
              })}
              <ExternalLink
                href="https://capacitorjs.com/docs/apis/push-notifications#push-notification-channel"
                label="Open Capacitor push notification channel docs"
              />
            </div>
          </div>
          <div className="rounded-xl border border-base-300 bg-base-100 p-4">
            <div className="font-bold text-base-content">{l.trans({ en: "iOS push", ko: "iOS push" })}</div>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-base-content/70">
              <li>
                {l.trans({
                  en: "Register an iOS app in Firebase using the same bundle id as mobile.appId.",
                  ko: "Firebase에서 mobile.appId와 같은 bundle id로 iOS 앱을 등록합니다.",
                })}
                <ExternalLink href="https://firebase.google.com/docs/ios/setup" label="Open Firebase iOS setup docs" />
              </li>
              <li>
                {l.trans({
                  en: "Download GoogleService-Info.plist.",
                  ko: "GoogleService-Info.plist를 다운로드합니다.",
                })}
                <ExternalLink
                  href="https://firebase.google.com/docs/ios/setup#add-config-file"
                  label="Open GoogleService-Info.plist docs"
                />
              </li>
              <li>
                {l.trans({
                  en: "Copy it into the generated App target and confirm target membership in Xcode.",
                  ko: "생성된 App target에 복사하고 Xcode에서 target membership을 확인합니다.",
                })}
              </li>
              <li>
                {l.trans({
                  en: 'Add permissions: ["push"] to the mobile target. Akan writes the iOS push entitlement, remote-notification background mode, and the AppDelegate bridge needed by Capacitor.',
                  ko: 'mobile target에 permissions: ["push"]를 추가합니다. Akan이 iOS push entitlement, remote-notification background mode, Capacitor에 필요한 AppDelegate bridge를 생성합니다.',
                })}
                <ExternalLink
                  href="https://developer.apple.com/documentation/usernotifications/registering-your-app-with-apns"
                  label="Open Apple push notification registration docs"
                />
              </li>
              <li>
                {l.trans({
                  en: "Akan sets aps-environment automatically: local, simulator, and debug runs use development; release builds use production.",
                  ko: "Akan은 aps-environment를 자동 설정합니다. local, simulator, debug 실행은 development를 쓰고 release 빌드는 production을 씁니다.",
                })}
              </li>
              <li>
                {l.trans({
                  en: "In Apple Developer, prefer creating an APNs auth key from Keys and upload the .p8 key in Firebase Console > Cloud Messaging. If you are in Certificates and only see Apple Push Notification service SSL, that is the certificate-based APNs setup instead.",
                  ko: "Apple Developer의 Keys에서 APNs auth key를 만들고 Firebase Console > Cloud Messaging에 .p8 key를 업로드하는 방식을 우선 권장합니다. Certificates에서 Apple Push Notification service SSL만 보인다면 그건 certificate 기반 APNs 설정입니다.",
                })}
                <ExternalLink
                  href="https://firebase.google.com/docs/cloud-messaging/ios/certs"
                  label="Open Firebase APNs certificate docs"
                />
              </li>
              <li>
                {l.trans({
                  en: "Upload APNs credentials for both development and production in Firebase. Development is required for simulator/debug delivery; production is required for TestFlight and App Store delivery.",
                  ko: "Firebase에는 development와 production APNs credential을 모두 등록하세요. 시뮬레이터/debug 수신에는 development가, TestFlight/App Store 수신에는 production이 필요합니다.",
                })}
              </li>
            </ol>
          </div>
          <Code.Snippet
            title="iOS push file copy"
            code={`const config: AppConfig = {
  mobile: {
    targets: {
      default: {
        permissions: ["push"],
        files: {
          ios: {
            "App/GoogleService-Info.plist": "public/GoogleService-Info.plist",
          },
        },
      },
    },
  },
};`}
          />
          <Docs.Alert type="info">
            {l.trans({
              en: "Keep GoogleService-Info.plist in the app folder, then copy it into the generated iOS project with mobile.files. If Firebase Console sends to a token but nothing arrives while simctl push works, check the APNs development/production credential that matches the built aps-environment.",
              ko: "GoogleService-Info.plist는 앱 폴더에 두고, mobile.files로 생성된 iOS 프로젝트에 복사하세요. simctl push는 오는데 Firebase Console 토큰 발송이 안 오면 빌드된 aps-environment와 맞는 APNs development/production credential을 확인하세요.",
            })}
          </Docs.Alert>
          <div className="rounded-xl border border-base-300 bg-base-100 p-4">
            <div className="font-bold text-base-content">
              {l.trans({ en: "APNs environment mapping", ko: "APNs environment 매핑" })}
            </div>
            <div className="mt-2 grid gap-2 text-sm md:grid-cols-3">
              {[
                {
                  command: "start-ios",
                  value: "development",
                  desc: l.trans({
                    en: "Local simulator/device runs use the APNs sandbox path.",
                    ko: "로컬 시뮬레이터/기기 실행은 APNs sandbox 경로를 사용합니다.",
                  }),
                },
                {
                  command: "build-ios",
                  value: "production",
                  desc: l.trans({
                    en: "Release build generation uses the production APNs environment.",
                    ko: "릴리즈 빌드 생성은 production APNs environment를 사용합니다.",
                  }),
                },
                {
                  command: "release-ios",
                  value: "production",
                  desc: l.trans({
                    en: "Store/TestFlight release uses the production APNs environment.",
                    ko: "스토어/TestFlight 릴리즈는 production APNs environment를 사용합니다.",
                  }),
                },
              ].map(({ command, value, desc }) => (
                <div key={command} className="rounded-xl bg-base-200 p-3">
                  <div className="font-mono font-semibold text-primary">{command}</div>
                  <div className="font-mono text-base-content">{value}</div>
                  <div className="mt-1 text-base-content/70">{desc}</div>
                </div>
              ))}
            </div>
          </div>
          <Docs.Alert type="warning">
            {l.trans({
              en: "Do not add firebase-ios-sdk directly in Xcode when using @capacitor-community/fcm. Direct Firebase Swift Package products can conflict with the plugin's Firebase dependency version.",
              ko: "@capacitor-community/fcm을 사용할 때 Xcode에 firebase-ios-sdk를 직접 추가하지 마세요. 직접 추가한 Firebase Swift Package product는 플러그인이 요구하는 Firebase 의존성 버전과 충돌할 수 있습니다.",
            })}
          </Docs.Alert>
          <div className="rounded-xl border border-base-300 bg-base-100 p-4">
            <div className="font-bold text-base-content">
              {l.trans({ en: "Why two Capacitor plugins?", ko: "왜 Capacitor 플러그인을 두 개 쓰나요?" })}
            </div>
            <div className="mt-2 text-base-content/70">
              {l.trans({
                en: "@capacitor/push-notifications handles the OS push bridge: permission, native registration, notification click events, and Android channels. @capacitor-community/fcm handles Firebase-specific token access such as FCM.getToken(). Akan uses FCM as the provider, so native apps need both.",
                ko: "@capacitor/push-notifications는 권한, 네이티브 등록, 알림 클릭 이벤트, Android channel 같은 OS push bridge를 담당합니다. @capacitor-community/fcm은 FCM.getToken() 같은 Firebase 전용 token 접근을 담당합니다. Akan은 FCM을 provider로 사용하므로 네이티브 앱에서는 둘 다 필요합니다.",
              })}
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {[
              {
                title: "@capacitor/push-notifications",
                desc: l.trans({
                  en: "Use for notification permission, native registration, notification action/click listener, delivered notifications, and Android notification channels.",
                  ko: "알림 권한, 네이티브 등록, 알림 액션/클릭 리스너, 표시된 알림, Android notification channel에 사용합니다.",
                }),
              },
              {
                title: "@capacitor-community/fcm",
                desc: l.trans({
                  en: "Use for Firebase Messaging token access. This keeps Android and iOS server delivery on the same Firebase Admin send({ token }) contract.",
                  ko: "Firebase Messaging token 접근에 사용합니다. Android와 iOS 서버 발송을 같은 Firebase Admin send({ token }) 계약으로 맞춥니다.",
                }),
              },
            ].map(({ title, desc }) => (
              <div key={title} className="rounded-xl border border-base-300 bg-base-100 px-4 py-3">
                <div className="font-mono font-semibold text-primary">{title}</div>
                <div className="mt-1 text-base-content/70">{desc}</div>
              </div>
            ))}
          </div>
          <div className="rounded-xl border border-base-300 bg-base-100 p-4">
            <div className="font-bold text-base-content">
              {l.trans({ en: "Client registration", ko: "Client registration" })}
            </div>
            <div className="mt-2 text-base-content/70">
              {l.trans({
                en: "Call register() from a user-facing action such as a settings toggle or an enable-notifications button. It may ask for permission. After it returns a PushToken, immediately pass that token to your app's storage API.",
                ko: "register()는 설정 토글이나 알림 켜기 버튼처럼 사용자가 이해할 수 있는 액션에서 호출하세요. 이 호출은 권한을 요청할 수 있습니다. PushToken이 반환되면 즉시 앱의 저장 API로 넘깁니다.",
              })}
            </div>
          </div>
          <Code.Snippet
            title="Client registration"
            code={`import { fetch } from "@apps/myapp/client";
import { usePushNotification } from "akanjs/webkit";

export function EnablePushButton() {
  const push = usePushNotification();

  const handleClick = async () => {
    const pushToken = await push.register();
    if (!pushToken) return;
    await fetch.registerPushToken(pushToken);
  };

  return <button onClick={handleClick}>Enable push</button>;
}`}
          />
          <Docs.Alert type="info">
            {l.trans({
              en: "registerPushToken is not an Akan built-in API. It is the app-level API shown below. Name it and shape it to match your user/device domain.",
              ko: "registerPushToken은 Akan 내장 API가 아닙니다. 아래에서 만드는 앱 레벨 API 예시입니다. 실제 앱의 user/device 도메인에 맞게 이름과 구조를 정하세요.",
            })}
          </Docs.Alert>
          <div className="space-y-1">
            {[
              {
                title: "register()",
                desc: l.trans({
                  en: "Requests permission when needed and returns a PushToken containing token, platform, provider, and optional deviceId.",
                  ko: "필요하면 권한을 요청하고 token, platform, provider, deviceId?가 들어있는 PushToken을 반환합니다.",
                }),
              },
              {
                title: "App storage",
                desc: l.trans({
                  en: "Store the returned PushToken through an app-level user/device API. Akan does not decide where your user domain keeps device credentials.",
                  ko: "반환된 PushToken은 앱 레벨의 user/device API로 저장하세요. Akan은 user 도메인이 디바이스 credential을 어디에 저장할지 대신 결정하지 않습니다.",
                }),
              },
              {
                title: "Click routing",
                desc: l.trans({
                  en: "Send a url field from the server. Akan normalizes it into data.url so notification clicks can enter the CSR router.",
                  ko: "서버에서 url 필드를 보내면 Akan이 data.url로 정규화합니다. 알림 클릭은 이 값을 통해 CSR router로 들어갑니다.",
                }),
              },
            ].map(({ title, desc }) => (
              <div key={title} className="rounded-xl border border-base-300 bg-base-100 px-4 py-0">
                <span className="font-mono font-semibold text-primary">{title}: </span>
                <span className="text-base-content/70">{desc}</span>
              </div>
            ))}
          </div>
          <div className="rounded-xl border border-base-300 bg-base-100 p-4">
            <div className="font-bold text-base-content">
              {l.trans({ en: "Manage push tokens in the app DB", ko: "앱 DB에서 push token 관리하기" })}
            </div>
            <div className="mt-2 text-base-content/70">
              {l.trans({
                en: "Each device's token is managed at the app level, not by Akan. This section explains how to store and manage tokens in a database and how to send notifications using active tokens.",
                ko: "각 기기별 token은 Akan에서 저장하는 것이 아닌 앱 레벨에서 관리해야 합니다. 이 섹션은 token을 Database에 저장하고 관리하는 방법과 active token으로 알림을 보내는 방법을 설명합니다.",
              })}
              <Docs.Alert type="info">
                {l.trans({
                  en: "The methods described in this section are examples. Manage tokens in a way that matches your app's structure.",
                  ko: "해당 섹션에서 설명하는 방법은 예시입니다. 앱의 구조에 맞는 방법으로 token을 관리하세요.",
                })}
              </Docs.Alert>
            </div>
          </div>

          <Docs.Mermaid
            title="Push token lifecycle"
            className="[&_svg]:max-h-[260px] [&_svg]:w-full"
            chart={`flowchart TD
  c1["Client: register()"] --> s1["Server: registerPushToken"]
  s1 --> db[("DB: UserDeviceToken")]
  db --> s2["Server: load active tokens"]
  s2 --> s3["Server: send(token)"]
  s3 --> fcm["FCM"]
  fcm --> device["User device"]
  s3 --> invalid{"Invalid?"}
  invalid -->|yes| cleanup["Server: disable/delete token"]
  cleanup --> db`}
          />
          <Code.Snippet
            title="apps/myapp/lib/userDevice/userDevice.constant.ts"
            code={`export class PushProvider extends enumOf("pushProvider", ["fcm"] as const) {}
export class PushPlatform extends enumOf("pushPlatform", ["web", "android", "ios"] as const) {}

export class UserDeviceToken extends via((field) => ({
  userId: field(String),
  token: field(String),
  platform: field(PushPlatform),
  provider: field(PushProvider),
  deviceId: field(String).optional(),
  disabledAt: field(Date).optional(),
})) {}`}
          />

          <Code.Snippet
            title="apps/myapp/lib/userDevice/userDevice.signal.ts"
            code={`export class UserDeviceEndpoint extends endpoint(srv.userDevice, ({ mutation }) => ({
  registerPushToken: mutation(Boolean, { guards: [User] })
    .body("pushToken", cnst.UserDeviceToken)
    .with(Self)
    .exec(async function (pushToken, self) {
      await this.userDeviceService.registerPushToken(self.id, pushToken);
      return true;
    }),
  invalidatePushToken: mutation(Boolean, { guards: [Admin] })
    .body("token", String)
    .exec(async function (token) {
      await this.userDeviceService.invalidatePushToken(token);
      return true;
    }),
})) {}`}
          />
          <Code.Snippet
            title="apps/myapp/ui/PushTokenRegister.tsx"
            code={`import { fetch } from "@apps/myapp/client";
import { usePushNotification } from "akanjs/webkit";

const push = usePushNotification();
const pushToken = await push.register();

if (pushToken) {
  await fetch.registerPushToken({
    token: pushToken.token,
    platform: pushToken.platform,
    provider: pushToken.provider,
    deviceId: pushToken.deviceId,
  });
}`}
          />
          <Code.Snippet
            title="Server send"
            code={`await pushNotificationServer.send({
  token,
  title: "Order update",
  body: "Your order is ready",
  url: "/orders/detail",
});`}
          />
          <Code.Snippet
            title="Cleanup after failed send"
            code={`try {
  await pushNotificationServer.send({ token, title, body, url });
} catch (error) {
  if (isInvalidPushTokenError(error)) {
    await fetch.invalidatePushToken(token);
  }
}`}
          />
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="deep-link-setup" title={l.trans({ en: "Deep Link Setup", ko: "Deep Link Setup" })}>
        <Docs.Title>{l.trans({ en: "Deep Link Setup", ko: "Deep Link Setup" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Deep links open a CSR route from outside the app. Use schemes for app-only URLs and domains for verified HTTPS links. Push notification clicks use the same routing path through data.url.",
              ko: "Deep link는 앱 바깥에서 CSR route를 여는 기능입니다. 앱 전용 URL은 schemes를 쓰고, 검증된 HTTPS 링크는 domains를 씁니다. Push notification 클릭도 data.url을 통해 같은 라우팅 경로를 사용합니다.",
            })}
          </div>
          <Docs.Alert type="info">
            {l.trans({
              en: "Think of deep link as the feature, and schemes/domains as the two common ways to implement it. Scheme links such as shop://orders/1 are easy to test and app-only. Domain links such as https://shop.example.com/orders/1 require iOS/Android verification, but they behave like normal web links and are better for sharing, emails, and push notification URLs.",
              ko: "Deep link는 기능 이름이고, scheme과 domain은 그 기능을 구현하는 대표적인 두 방식입니다. shop://orders/1 같은 scheme link는 테스트가 쉽고 앱 전용입니다. https://shop.example.com/orders/1 같은 domain link는 iOS/Android 검증 설정이 필요하지만 일반 웹 링크처럼 동작하므로 공유, 이메일, push notification URL에 더 적합합니다.",
            })}
          </Docs.Alert>
          <Code.Snippet
            title="apps/myapp/akan.config.ts"
            code={`const config: AppConfig = {
  mobile: {
    targets: {
      default: {
        deepLinks: {
          schemes: ["shop"],
          domains: ["shop.example.com"],
          ios: {
            teamId: "TEAMID",
          },
          android: {
            sha256CertFingerprints: [
              "AA:BB:CC:DD:...",
            ],
          },
        },
      },
    },
  },
};`}
          />
          <div className="space-y-1">
            {[
              {
                title: "schemes",
                desc: l.trans({
                  en: "Custom app-only URLs such as shop://orders/1. Easy to test, but not domain-verified.",
                  ko: "shop://orders/1 같은 앱 전용 URL입니다. 테스트하기 쉽지만 도메인 검증 링크는 아닙니다.",
                }),
              },
              {
                title: "domains",
                desc: l.trans({
                  en: "Verified HTTPS links such as https://shop.example.com/orders/1. iOS uses apple-app-site-association; Android uses assetlinks.json.",
                  ko: "https://shop.example.com/orders/1 같은 검증된 HTTPS 링크입니다. iOS는 apple-app-site-association, Android는 assetlinks.json을 사용합니다.",
                }),
                links: [
                  {
                    href: "https://developer.apple.com/documentation/xcode/supporting-universal-links-in-your-app",
                    label: "Open Apple Universal Links docs",
                  },
                  {
                    href: "https://developer.android.com/training/app-links",
                    label: "Open Android App Links docs",
                  },
                ],
              },
              {
                title: "ios.teamId",
                desc: l.trans({
                  en: "Apple Developer Team ID used for universal link association files.",
                  ko: "universal link association file에 사용하는 Apple Developer Team ID입니다.",
                }),
              },
              {
                title: "android.sha256CertFingerprints",
                desc: l.trans({
                  en: "Signing certificate fingerprints used by Android app links. Debug builds and release builds usually have different fingerprints.",
                  ko: "Android app link 검증에 사용하는 서명 인증서 fingerprint입니다. Debug build와 release build는 보통 fingerprint가 다릅니다.",
                }),
              },
            ].map(({ title, desc, links }) => (
              <div key={title} className="rounded-xl border border-base-300 bg-base-100 px-4 py-0">
                <span className="font-mono font-semibold text-primary">{title}: </span>
                <span className="text-base-content/70 text-sm">{desc}</span>
                {links?.map((link) => (
                  <ExternalLink key={link.href} href={link.href} label={link.label} />
                ))}
              </div>
            ))}
          </div>
          <Code.Snippet
            title="Android debug SHA-256"
            language="bash"
            code={`keytool -list -v \\
  -keystore ~/.android/debug.keystore \\
  -alias androiddebugkey \\
  -storepass android \\
  -keypass android`}
          />
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
              <div key={title} className="rounded-xl border border-base-300 bg-base-100 px-4 py-0">
                <span className="font-mono font-semibold text-primary">{title}: </span>
                <span className="text-base-content/70 text-sm">{desc}</span>
              </div>
            ))}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <Scroll.TitleNavigator className="fixed top-32 right-0 hidden w-[250px] flex-col gap-2 lg:flex" />
    </Scroll>
  );
}
