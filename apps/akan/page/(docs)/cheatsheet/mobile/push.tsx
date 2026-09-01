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
            <div className="rounded-xl border border-foreground/10 bg-background p-4">
              <div className="font-bold text-foreground">
                {l.trans({ en: "Akan automates", ko: "Akan이 자동 처리" })}
              </div>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-foreground/70 text-sm">
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
            <div className="rounded-xl border border-background/30 bg-background p-4">
              <div className="font-bold text-foreground">{l.trans({ en: "You provide", ko: "사용자가 준비" })}</div>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-foreground/70 text-sm">
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
          <div className="rounded-xl border border-background/30 bg-background p-4">
            <div className="font-bold text-foreground">{l.trans({ en: "Web push", ko: "Web push" })}</div>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-foreground/70">
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
          <div className="rounded-xl border border-background/30 bg-background p-4">
            <div className="font-bold text-foreground">{l.trans({ en: "Android push", ko: "Android push" })}</div>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-foreground/70">
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
          <div className="rounded-xl border border-background/30 bg-background p-4">
            <div className="font-bold text-foreground">
              {l.trans({ en: "Android notification details", ko: "Android notification details" })}
            </div>
            <div className="mt-2 text-foreground/70">
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
          <div className="rounded-xl border border-background/30 bg-background p-4">
            <div className="font-bold text-foreground">{l.trans({ en: "iOS push", ko: "iOS push" })}</div>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-foreground/70">
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
          <div className="rounded-xl border border-background/30 bg-background p-4">
            <div className="font-bold text-foreground">
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
                <div key={command} className="rounded-xl bg-background p-3">
                  <div className="font-mono font-semibold text-primary">{command}</div>
                  <div className="font-mono text-foreground">{value}</div>
                  <div className="mt-1 text-foreground/70">{desc}</div>
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
          <div className="rounded-xl border border-background/30 bg-background p-4">
            <div className="font-bold text-foreground">
              {l.trans({ en: "Why two Capacitor plugins?", ko: "왜 Capacitor 플러그인을 두 개 쓰나요?" })}
            </div>
            <div className="mt-2 text-foreground/70">
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
              <div key={title} className="rounded-xl border border-background/30 bg-background px-4 py-3">
                <div className="font-mono font-semibold text-primary">{title}</div>
                <div className="mt-1 text-foreground/70">{desc}</div>
              </div>
            ))}
          </div>
          <div className="rounded-xl border border-background/30 bg-background p-4">
            <div className="font-bold text-foreground">
              {l.trans({ en: "Client registration", ko: "Client registration" })}
            </div>
            <div className="mt-2 text-foreground/70">
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
              <div key={title} className="rounded-xl border border-background/30 bg-background px-4 py-0">
                <span className="font-mono font-semibold text-primary">{title}: </span>
                <span className="text-foreground/70">{desc}</span>
              </div>
            ))}
          </div>
          <div className="rounded-xl border border-background/30 bg-background p-4">
            <div className="font-bold text-foreground">
              {l.trans({ en: "Manage push tokens in the app DB", ko: "앱 DB에서 push token 관리하기" })}
            </div>
            <div className="mt-2 text-foreground/70">
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
      <Scroll.TitleNavigator className="fixed top-32 right-0 hidden w-[250px] flex-col gap-2 lg:flex" />
    </Scroll>
  );
}
