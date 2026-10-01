import { usePage } from "@apps/akan/client";
import { Code, cardGridRecipe, Divider, Docs, DocsToc, ExternalLink, panelRecipe } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { page } from "akanjs/client";
import { Link } from "akanjs/ui";

export default page().render(() => {
  const { l } = usePage();
  const bulletList = "my-4 list-disc space-y-2 pl-5";
  const stepList = "my-4 list-decimal space-y-2 pl-5";

  const termRows = [
    {
      name: "FCM",
      desc: l.trans({
        en: "Firebase Cloud Messaging. Akan sends to Android apps and browsers through it.",
        ko: "Firebase Cloud Messaging입니다. Akan은 Android 앱과 브라우저에 이것으로 보냅니다.",
      }),
    },
    {
      name: "APNs",
      desc: l.trans({
        en: "Apple's push service. The server sends to iOS apps through it directly; Firebase is not involved.",
        ko: "Apple의 푸시 서비스입니다. 서버가 iOS 앱에 이것으로 직접 보내며, Firebase는 거치지 않습니다.",
      }),
    },
    {
      name: l.trans({ en: "push token", ko: "푸시 토큰" }),
      desc: l.trans({
        en: "The address of one app install. `register()` returns it with the `provider` that delivers to it.",
        ko: "앱 설치 하나의 주소입니다. `register()`가 이 주소로 배달하는 `provider`와 함께 돌려줍니다.",
      }),
    },
    {
      name: "provider",
      desc: l.trans({
        en: "`apns` on iOS, `fcm` on Android and the web. The server picks the sender by it.",
        ko: "iOS는 `apns`, Android와 웹은 `fcm`입니다. 서버는 이 값으로 발송기를 고릅니다.",
      }),
    },
    {
      name: "deviceId",
      desc: l.trans({
        en: "A random id the app keeps in its own storage, so a rotated token replaces the old one.",
        ko: "앱이 자기 저장소에 두는 임의의 설치 id입니다. 토큰이 바뀌면 이전 토큰을 대신합니다.",
      }),
    },
    {
      name: l.trans({ en: "VAPID key", ko: "VAPID 키" }),
      desc: l.trans({
        en: "The web push key pair. Its public half goes in the client env as `vapidKey`.",
        ko: "웹 푸시용 키 쌍입니다. 공개 키를 client env의 `vapidKey`에 넣습니다.",
      }),
    },
    {
      name: l.trans({ en: "service account", ko: "서비스 계정" }),
      desc: l.trans({
        en: "The Firebase Admin credential the server sends to FCM with. It never reaches the client.",
        ko: "서버가 FCM에 발송할 때 쓰는 Firebase Admin 인증 정보입니다. 클라이언트로 가지 않습니다.",
      }),
    },
    {
      name: l.trans({ en: "APNs auth key", ko: "APNs 인증 키" }),
      desc: l.trans({
        en: "The `.p8` key the server signs its APNs requests with. One key serves both APNs environments.",
        ko: "서버가 APNs 요청에 서명하는 `.p8` 키입니다. 키 하나로 두 APNs 환경을 모두 씁니다.",
      }),
    },
    {
      name: "aps-environment",
      desc: l.trans({
        en: "The iOS entitlement that says whether the app's tokens belong to APNs development or production.",
        ko: "앱의 토큰이 APNs development와 production 중 어느 쪽 것인지 정하는 iOS entitlement입니다.",
      }),
    },
  ];

  const platformColumns = [
    { key: "web", label: l.trans({ en: "Web", ko: "웹" }) },
    { key: "android", label: "Android" },
    { key: "ios", label: "iOS" },
  ];

  const prepareGroups = [
    {
      label: l.trans({ en: "In the consoles", ko: "콘솔에서" }),
      rows: [
        {
          name: <span className="font-sans">{l.trans({ en: "Firebase app", ko: "Firebase 앱" })}</span>,
          desc: l.trans({
            en: "One Firebase project, with the web app and the Android app registered in it.",
            ko: "Firebase 프로젝트 하나에 웹 앱과 Android 앱을 등록합니다.",
          }),
          marks: { web: true, android: true },
        },
        {
          name: <span className="font-sans">{l.trans({ en: "VAPID key", ko: "VAPID 키" })}</span>,
          desc: l.trans({
            en: "A Web Push certificate key pair, generated in Firebase's Cloud Messaging settings.",
            ko: "Firebase의 Cloud Messaging 설정에서 만드는 Web Push 인증서 키 쌍입니다.",
          }),
          marks: { web: true },
        },
        {
          name: <span className="font-sans">{l.trans({ en: "Push capability", ko: "Push 기능" })}</span>,
          desc: l.trans({
            en: "Push Notifications turned on for the App ID in Apple Developer, so its profiles carry the entitlement.",
            ko: "Apple Developer의 App ID에서 Push Notifications를 켭니다. 그래야 프로파일에 entitlement가 들어갑니다.",
          }),
          marks: { ios: true },
        },
        {
          name: <span className="font-sans">{l.trans({ en: "APNs auth key (.p8)", ko: "APNs 인증 키 (.p8)" })}</span>,
          desc: l.trans({
            en: "Created under Keys in Apple Developer, with its Key ID and your Team ID. It goes to your server.",
            ko: "Apple Developer의 Keys에서 만들고, Key ID와 Team ID를 함께 적어 둡니다. 서버에 넣습니다.",
          }),
          marks: { ios: true },
        },
      ],
    },
    {
      label: l.trans({ en: "In the app folder", ko: "앱 폴더에" }),
      rows: [
        {
          name: "env.client.*",
          desc: l.trans({
            en: "The public Firebase web config and `vapidKey`, under `firebase`.",
            ko: "`firebase` 아래에 공개 Firebase 웹 설정과 `vapidKey`를 넣습니다.",
          }),
          marks: { web: true },
        },
        {
          name: "google-services.json",
          desc: l.trans({
            en: "The Android Firebase config, named by `native.android.googleServices` in `akan.config.ts`.",
            ko: "Android용 Firebase 설정 파일이며, `akan.config.ts`의 `native.android.googleServices`로 지정합니다.",
          }),
          marks: { android: true },
        },
        {
          name: 'permissions: ["push"]',
          desc: l.trans({
            en: "Adds the native push plugin; it goes in `native` in `akan.config.ts`.",
            ko: "네이티브 푸시 플러그인을 넣습니다. `akan.config.ts`의 `native`에 적습니다.",
          }),
          marks: { android: true, ios: true },
        },
      ],
    },
    {
      label: l.trans({ en: "On the server", ko: "서버에" }),
      rows: [
        {
          name: "pushNoti.firebase",
          desc: l.trans({
            en: "In `env.server.*`: the service account the server sends to FCM with.",
            ko: "`env.server.*`에 둡니다. 서버가 FCM에 발송할 때 쓰는 서비스 계정입니다.",
          }),
          marks: { web: true, android: true },
        },
        {
          name: "pushNoti.apns",
          desc: l.trans({
            en: "In `env.server.*`: the APNs key, its Key ID, your Team ID and the app's bundle id.",
            ko: "`env.server.*`에 둡니다. APNs 키와 Key ID, Team ID, 앱의 bundle id입니다.",
          }),
          marks: { ios: true },
        },
      ],
    },
  ];

  const pluginCards = [
    {
      title: "iOS · APNs",
      chip: 'push.register() → { provider: "apns" }',
      desc: l.trans({
        en: "Registers with APNs directly, with no Firebase SDK. A tap, and a message that arrives in front, come through the shell's notification router.",
        ko: "Firebase SDK 없이 APNs에 직접 등록합니다. 알림 탭과 앱이 앞에 있을 때 온 메시지는 셸의 알림 라우터로 들어옵니다.",
      }),
    },
    {
      title: "Android · FCM",
      chip: 'push.register() → { provider: "fcm" }',
      desc: l.trans({
        en: "An FCM module pinned with the runtime. The build reads `google-services.json` itself, so no Gradle plugin is involved.",
        ko: "런타임과 함께 고정된 FCM 모듈입니다. 빌드가 `google-services.json`을 직접 읽으므로 Gradle 플러그인이 필요 없습니다.",
      }),
    },
  ];

  const webNotes = [
    l.trans({
      en: (
        <>
          <strong>Only public values go here.</strong> <code>env.client.*</code> ships to the browser; the server's
          service account belongs in <code>env.server.*</code>.
        </>
      ),
      ko: (
        <>
          <strong>공개해도 되는 값만 넣습니다.</strong> <code>env.client.*</code>는 브라우저로 전달됩니다. 서버의 서비스
          계정은 <code>env.server.*</code>에 둡니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>Four fields are required.</strong> Without <code>apiKey</code>, <code>projectId</code>,{" "}
          <code>messagingSenderId</code> or <code>appId</code>, <code>register()</code> returns <code>undefined</code>{" "}
          on the web.
        </>
      ),
      ko: (
        <>
          <strong>필수 필드는 네 개입니다.</strong> <code>apiKey</code>, <code>projectId</code>,{" "}
          <code>messagingSenderId</code>, <code>appId</code> 중 하나라도 없으면 웹에서 <code>register()</code>가{" "}
          <code>undefined</code>를 돌려줍니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>One file per environment.</strong> <code>env.client.ts</code> picks{" "}
          <code>{"env.client.<env>.ts"}</code> by <code>AKAN_PUBLIC_ENV</code>, so fill in every environment you deploy.
        </>
      ),
      ko: (
        <>
          <strong>환경마다 파일이 하나씩 있습니다.</strong> <code>env.client.ts</code>가 <code>AKAN_PUBLIC_ENV</code>에
          따라 <code>{"env.client.<env>.ts"}</code>를 고르므로, 배포하는 모든 환경에 채워 둡니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>The service worker is generated.</strong> With <code>firebase</code> in the client env,{" "}
          <code>akan sync</code> writes <code>public/firebase-messaging-sw.js</code> for each environment.
        </>
      ),
      ko: (
        <>
          <strong>서비스 워커는 생성됩니다.</strong> client env에 <code>firebase</code>가 있으면 <code>akan sync</code>
          가 환경마다 <code>public/firebase-messaging-sw.js</code>를 써 줍니다.
        </>
      ),
    }),
  ];

  const androidFileNotes = [
    l.trans({
      en: (
        <>
          <strong>The build converts the file itself.</strong> It picks the client whose package name is the
          target&apos;s <code>appId</code> (a debug build falls back to it too), and a file without that app fails the
          build with the names it has.
        </>
      ),
      ko: (
        <>
          <strong>빌드가 파일을 직접 변환합니다.</strong> 패키지 이름이 타깃의 <code>appId</code>인 client를
          고르고(디버그 빌드도 그것을 씁니다), 그 앱이 없는 파일이면 들어 있는 이름을 알려 주며 빌드를 멈춥니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>
            <code>secrets/</code>, not <code>public/</code>.
          </strong>{" "}
          Everything in <code>public/</code> is served to every visitor. <code>secrets</code> keeps the file out of git
          and carries it with <code>akan upload-env</code> and <code>akan download-env</code>.
        </>
      ),
      ko: (
        <>
          <strong>
            <code>public/</code>이 아니라 <code>secrets/</code>에 둡니다.
          </strong>{" "}
          <code>public/</code>의 파일은 모든 방문자에게 그대로 제공됩니다. <code>secrets</code>에 등록한 파일은 git에서
          빠지고, <code>akan upload-env</code>와 <code>akan download-env</code>로 함께 옮겨집니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>
            <code>permissions: ["push"]</code>
          </strong>{" "}
          adds the push plugin and <code>POST_NOTIFICATIONS</code> to the app.
        </>
      ),
      ko: (
        <>
          <strong>
            <code>permissions: ["push"]</code>
          </strong>
          가 앱에 푸시 플러그인과 <code>POST_NOTIFICATIONS</code> 권한을 넣습니다.
        </>
      ),
    }),
  ];

  const androidDisplayNotes = [
    l.trans({
      en: (
        <>
          <strong>Foreground.</strong> The framework asks the plugin to show a push that arrives while the app is open
          (banner, list, sound, badge), so it can be tapped like any other.
        </>
      ),
      ko: (
        <>
          <strong>포그라운드.</strong> 앱이 열려 있을 때 온 푸시도 보이도록 프레임워크가 플러그인에 요청합니다(배너,
          목록, 소리, 배지). 그래서 다른 알림처럼 누를 수 있습니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>Background.</strong> FCM draws the notification itself while the app is not in front. A tap opens the
          app and routes the push&apos;s <code>url</code>.
        </>
      ),
      ko: (
        <>
          <strong>백그라운드.</strong> 앱이 앞에 없으면 FCM이 알림을 직접 그립니다. 누르면 앱이 열리고 푸시의{" "}
          <code>url</code>로 이동합니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>Channel, icon and color.</strong> Firebase posts into its default channel with the launcher icon,
          which the status bar draws as a gray square. <code>native.android.push</code> names a <code>channel</code> (
          <code>{"{ id, name, importance? }"}</code>), a <code>smallIcon</code> (a white-on-transparent PNG in the app
          folder) and an accent <code>color</code> instead.
        </>
      ),
      ko: (
        <>
          <strong>채널, 아이콘, 색.</strong> Firebase는 기본 채널에 런처 아이콘으로 올리고, 상태 표시줄은 그 아이콘을
          회색 사각형으로 그립니다. <code>native.android.push</code>로 <code>channel</code>(
          <code>{"{ id, name, importance? }"}</code>), <code>smallIcon</code>(앱 폴더 안의 흰색·투명 PNG), 강조{" "}
          <code>color</code>를 대신 정합니다.
        </>
      ),
    }),
  ];

  const iosNotes = [
    l.trans({
      en: (
        <>
          <strong>
            No <code>GoogleService-Info.plist</code>, no firebase-ios-sdk.
          </strong>{" "}
          The push plugin adds <code>UIBackgroundModes</code> and <code>aps-environment</code> to the app itself.
        </>
      ),
      ko: (
        <>
          <strong>
            <code>GoogleService-Info.plist</code>도, firebase-ios-sdk도 필요 없습니다.
          </strong>{" "}
          <code>UIBackgroundModes</code>와 <code>aps-environment</code>는 푸시 플러그인이 앱에 직접 넣습니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>An iOS token is an APNs device token</strong>, with <code>provider: "apns"</code>. FCM does not accept
          it, so the server sends it to APNs itself.
        </>
      ),
      ko: (
        <>
          <strong>iOS 토큰은 APNs 기기 토큰입니다.</strong> <code>provider: "apns"</code>로 오며, FCM은 이 토큰을 받지
          않으므로 서버가 직접 APNs로 보냅니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>
            <code>xcrun simctl push</code> needs no server.
          </strong>{" "}
          It hands a payload to a simulator, which tests the tap and the routing. Put <code>url</code> at the top level,
          beside <code>aps</code>, as the server does.
        </>
      ),
      ko: (
        <>
          <strong>
            <code>xcrun simctl push</code>에는 서버가 필요 없습니다.
          </strong>{" "}
          시뮬레이터에 payload를 바로 넘겨 탭과 라우팅을 시험합니다. 서버처럼 <code>url</code>은 <code>aps</code> 옆,
          최상위에 둡니다.
        </>
      ),
    }),
  ];

  const apnsNotes = [
    l.trans({
      en: (
        <>
          <strong>The server tries both.</strong> With <code>environment</code> unset, a send goes to production first
          and, when APNs answers <code>BadDeviceToken</code> (a development build&apos;s token), to the sandbox. Set{" "}
          <code>environment</code> to pin one.
        </>
      ),
      ko: (
        <>
          <strong>서버가 두 곳을 모두 시도합니다.</strong> <code>environment</code>를 비워 두면 production에 먼저
          보내고, APNs가 <code>BadDeviceToken</code>으로 답하면(development 빌드의 토큰) 샌드박스로 보냅니다. 하나로
          고정하려면 <code>environment</code>를 적습니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>One key serves both.</strong> An APNs auth key is not tied to an environment, so a development run and
          a TestFlight build need nothing different on the server.
        </>
      ),
      ko: (
        <>
          <strong>키 하나로 둘 다 됩니다.</strong> APNs 인증 키는 환경에 묶이지 않으므로, development 실행과 TestFlight
          빌드에 서버 설정을 따로 둘 필요가 없습니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>A token no environment knows is dropped.</strong> A <code>410</code>, or <code>BadDeviceToken</code>{" "}
          from the last environment tried, removes the token from its owner.
        </>
      ),
      ko: (
        <>
          <strong>어느 환경도 모르는 토큰은 지웁니다.</strong> <code>410</code>이나, 마지막으로 시도한 환경의{" "}
          <code>BadDeviceToken</code>이면 그 토큰을 주인에게서 지웁니다.
        </>
      ),
    }),
  ];

  const hookRows = [
    {
      name: "register()",
      desc: l.trans({
        en: "Asks for permission, then returns a `PushToken`, or `undefined` when refused or unsupported.",
        ko: "권한을 요청한 뒤 `PushToken`을 돌려줍니다. 거부되거나 지원하지 않으면 `undefined`입니다.",
      }),
    },
    {
      name: "getToken()",
      desc: l.trans({
        en: "Returns the token without asking. Registering shows no prompt, so check `getPermission()` first.",
        ko: "묻지 않고 토큰을 돌려줍니다. 등록 자체는 창을 띄우지 않으므로 먼저 `getPermission()`을 확인합니다.",
      }),
    },
    {
      name: "getPermission()",
      desc: l.trans({
        en: "Reads the current permission state.",
        ko: "현재 권한 상태를 읽습니다.",
      }),
    },
    {
      name: "requestPermission()",
      desc: l.trans({
        en: "Shows the permission prompt and returns the answer.",
        ko: "권한 요청 창을 띄우고 결과를 돌려줍니다.",
      }),
    },
    {
      name: "isSupported()",
      desc: l.trans({
        en: "Whether push can work here: the native plugin in a shell, the Firebase web config in a browser.",
        ko: "지금 푸시를 쓸 수 있는지 알려 줍니다. 셸에서는 네이티브 플러그인, 브라우저에서는 Firebase 웹 설정을 봅니다.",
      }),
    },
    {
      name: "onTokenChange(listener)",
      desc: l.trans({
        en: "A native token rotates on its own; the listener gets each new `PushToken`. Returns the unsubscribe.",
        ko: "네이티브 토큰은 저절로 바뀝니다. 바뀔 때마다 새 `PushToken`을 리스너에 넘기고, 해제 함수를 돌려줍니다.",
      }),
    },
    {
      name: "initClickBridge()",
      desc: l.trans({
        en: "Routes the browser's notification clicks. The hook runs it on mount; a native shell needs nothing.",
        ko: "브라우저의 알림 클릭을 라우팅합니다. 훅이 마운트될 때 실행하며, 네이티브 셸에서는 할 일이 없습니다.",
      }),
    },
  ];

  const registerNotes = [
    l.trans({
      en: (
        <>
          <strong>PushToken</strong> holds <code>token</code>, <code>platform</code> (<code>web</code> |{" "}
          <code>android</code> | <code>ios</code>), <code>provider</code> (<code>apns</code> | <code>fcm</code>) and{" "}
          <code>deviceId</code>, the installation id <code>getPushDeviceId()</code> keeps in the app&apos;s storage.
        </>
      ),
      ko: (
        <>
          <strong>PushToken</strong>에는 <code>token</code>, <code>platform</code>(<code>web</code> |{" "}
          <code>android</code> | <code>ios</code>), <code>provider</code>(<code>apns</code> | <code>fcm</code>), 그리고{" "}
          <code>getPushDeviceId()</code>가 앱 저장소에 두는 설치 id인 <code>deviceId</code>가 들어 있습니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>Built-in storage.</strong> With <code>libs/shared</code>,{" "}
          <code>st.do.registerPushToken(pushToken)</code> stores it on the signed-in user. The next section shows where.
        </>
      ),
      ko: (
        <>
          <strong>저장은 내장입니다.</strong> <code>libs/shared</code>를 쓰면{" "}
          <code>st.do.registerPushToken(pushToken)</code>이 로그인한 사용자에게 저장합니다. 어디에 두는지는 다음
          섹션에서 봅니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>Click routing.</strong> Send a <code>url</code> and a tap opens it through the CSR router. In a native
          shell the framework routes it from boot, the tap that launched the app included; in a browser the service
          worker hands it to the open tab. Only a path inside the app is followed.
        </>
      ),
      ko: (
        <>
          <strong>클릭 라우팅.</strong> <code>url</code>을 보내면 탭했을 때 CSR router로 그 경로를 엽니다. 네이티브
          셸에서는 앱을 띄운 탭까지 포함해 프레임워크가 부팅 때부터 라우팅하고, 브라우저에서는 서비스 워커가 열린 탭에
          넘깁니다. 앱 안의 경로만 따라갑니다.
        </>
      ),
    }),
  ];

  const constantNotes = [
    l.trans({
      en: (
        <>
          <strong>One entry per installation.</strong> Registering again with the same <code>token</code> or the same{" "}
          <code>deviceId</code> replaces that entry, so a rotated token does not pile up.
        </>
      ),
      ko: (
        <>
          <strong>설치 하나에 항목 하나입니다.</strong> 같은 <code>token</code>이나 같은 <code>deviceId</code>로 다시
          등록하면 그 항목을 바꾸므로, 바뀐 토큰이 쌓이지 않습니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>
            <code>updatedAt</code> is the server&apos;s.
          </strong>{" "}
          It is written when the token is registered; the value a client sends is not used.
        </>
      ),
      ko: (
        <>
          <strong>
            <code>updatedAt</code>은 서버가 씁니다.
          </strong>{" "}
          토큰을 등록할 때 기록하며, 클라이언트가 보낸 값은 쓰지 않습니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>Signing out drops this device.</strong> <code>signoutUser</code> sends the installation&apos;s{" "}
          <code>deviceId</code>, so a handed-down phone does not get the previous person&apos;s notifications.
        </>
      ),
      ko: (
        <>
          <strong>로그아웃하면 이 기기를 지웁니다.</strong> <code>signoutUser</code>가 설치의 <code>deviceId</code>를
          보내므로, 물려받은 폰이 앞 사람의 알림을 받지 않습니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>Older tokens are skipped.</strong> A token stored as a plain string before this shape is not read;{" "}
          <code>Notification.Zone.Initialize</code> registers the device again on its next visit.
        </>
      ),
      ko: (
        <>
          <strong>예전 토큰은 건너뜁니다.</strong> 이 모양 이전에 문자열로 저장된 토큰은 읽지 않으며,{" "}
          <code>Notification.Zone.Initialize</code>가 다음 방문 때 기기를 다시 등록합니다.
        </>
      ),
    }),
  ];

  const endpointRows = [
    {
      name: "addNotiDeviceTokenOfSelf(deviceToken)",
      desc: l.trans({
        en: "Stores this device's `DeviceToken` on the caller, replacing its earlier entry.",
        ko: "이 기기의 `DeviceToken`을 호출한 사용자에게 저장하고, 이전 항목을 바꿉니다.",
      }),
    },
    {
      name: "subNotiDeviceTokenOfSelf(token)",
      desc: l.trans({
        en: "Removes one token from the caller: the push switch turned off.",
        ko: "호출한 사용자에게서 토큰 하나를 지웁니다. 푸시 스위치를 끈 경우입니다.",
      }),
    },
    {
      name: "hasNotiDeviceTokenOfSelf(token)",
      desc: l.trans({
        en: "Whether this device is registered, which is what the switch shows.",
        ko: "이 기기가 등록되어 있는지 알려 줍니다. 스위치가 보여 주는 상태입니다.",
      }),
    },
  ];

  const signalNotes = [
    l.trans({
      en: (
        <>
          <strong>
            <code>Self</code> supplies the owner,
          </strong>{" "}
          so a client cannot register a token under someone else&apos;s account.
        </>
      ),
      ko: (
        <>
          <strong>
            소유자는 <code>Self</code>가 넘겨줍니다.
          </strong>{" "}
          그래서 클라이언트가 다른 사람 계정으로 토큰을 등록할 수 없습니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>Kept off MCP.</strong> An agent has no device, so the token endpoints are <code>mcp: false</code>.
        </>
      ),
      ko: (
        <>
          <strong>MCP에는 올리지 않습니다.</strong> 에이전트에게는 기기가 없으므로 토큰 엔드포인트는{" "}
          <code>mcp: false</code>입니다.
        </>
      ),
    }),
  ];

  const credentialNotes = [
    l.trans({
      en: (
        <>
          <strong>
            <code>firebase</code> is the service account
          </strong>{" "}
          from Firebase Console, under Project settings, then Service accounts. Copy the five fields above from the
          downloaded JSON. Android and the web need it.
        </>
      ),
      ko: (
        <>
          <strong>
            <code>firebase</code>는 서비스 계정입니다.
          </strong>{" "}
          Firebase Console의 프로젝트 설정 → 서비스 계정에서 받고, 내려받은 JSON에서 위 다섯 필드를 옮겨 적습니다.
          Android와 웹에 필요합니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>
            <code>apns</code> is the <code>.p8</code> key.
          </strong>{" "}
          <code>privateKey</code> is the file&apos;s text (<code>\n</code> escapes are fine), <code>keyId</code> and{" "}
          <code>teamId</code> come from Apple Developer, and <code>bundleId</code> is the app&apos;s{" "}
          <code>native.appId</code>. iOS needs it.
        </>
      ),
      ko: (
        <>
          <strong>
            <code>apns</code>는 <code>.p8</code> 키입니다.
          </strong>{" "}
          <code>privateKey</code>는 파일의 텍스트이고(<code>\n</code> 이스케이프도 됩니다), <code>keyId</code>와{" "}
          <code>teamId</code>는 Apple Developer에서, <code>bundleId</code>는 앱의 <code>native.appId</code>입니다. iOS에
          필요합니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>
            Neither is <code>google-services.json</code>.
          </strong>{" "}
          That file is the Android app&apos;s config; these sign every send.
        </>
      ),
      ko: (
        <>
          <strong>
            어느 것도 <code>google-services.json</code>이 아닙니다.
          </strong>{" "}
          그 파일은 Android 앱 설정이고, 이것들은 모든 발송에 서명합니다.
        </>
      ),
    }),
  ];

  const serviceNotes = [
    l.trans({
      en: (
        <>
          <strong>The settings gate is one function.</strong> <code>NotificationService.accepts</code>:{" "}
          <code>block</code> and <code>disagree</code> stop everything, <code>fewer</code> lets only{" "}
          <code>actionRequired</code> and <code>essential</code> through, a future <code>pauseUntil</code> stops
          everything, and a user without tokens is skipped.
        </>
      ),
      ko: (
        <>
          <strong>수신 설정은 함수 하나가 판정합니다.</strong> <code>NotificationService.accepts</code>입니다.{" "}
          <code>block</code>과 <code>disagree</code>는 전부 막고, <code>fewer</code>는 <code>actionRequired</code>와{" "}
          <code>essential</code>만 통과시키며, <code>pauseUntil</code>이 미래면 전부 막고, 토큰이 없는 사용자는
          건너뜁니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>Dead tokens go at once.</strong> APNs <code>410</code> or <code>BadDeviceToken</code>, and FCM{" "}
          <code>messaging/registration-token-not-registered</code>, remove the token from its owner in the same call.
        </>
      ),
      ko: (
        <>
          <strong>죽은 토큰은 바로 지웁니다.</strong> APNs의 <code>410</code>이나 <code>BadDeviceToken</code>, FCM의{" "}
          <code>messaging/registration-token-not-registered</code>를 받으면 같은 호출 안에서 주인에게서 지웁니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>It never throws.</strong> A push is best effort: <code>push()</code> answers what it reached (
          <code>targetUserIds</code>, <code>tokenNum</code>, <code>successCount</code>, <code>prunedTokens</code>), and
          a failed send never fails the caller&apos;s own work.
        </>
      ),
      ko: (
        <>
          <strong>오류를 던지지 않습니다.</strong> 푸시는 최선을 다할 뿐입니다. <code>push()</code>는 닿은 범위(
          <code>targetUserIds</code>, <code>tokenNum</code>, <code>successCount</code>, <code>prunedTokens</code>)를
          돌려주고, 발송 실패가 호출한 쪽의 일을 실패시키지 않습니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>A megaphone takes the same gate.</strong> An admin notification of <code>type: "all"</code> goes to
          every active user, 500 at a time, through <code>accepts</code> like any other push.
        </>
      ),
      ko: (
        <>
          <strong>전체 발송도 같은 판정을 거칩니다.</strong> 관리자가 쓴 <code>type: "all"</code> 알림은 모든 활성
          사용자에게 500명씩 나가며, 다른 푸시처럼 <code>accepts</code>를 거칩니다.
        </>
      ),
    }),
  ];

  const payloadRows = [
    {
      key: "title",
      type: "string",
      tags: [l.trans({ en: "required", ko: "필수" })],
      desc: l.trans({ en: "The notification title.", ko: "알림 제목입니다." }),
    },
    {
      key: "level",
      type: "cnst.NotiLevel",
      tags: [l.trans({ en: "required", ko: "필수" })],
      desc: l.trans({
        en: "`actionRequired`, `notice`, `essential`, `suggestion` or `advertise`. The settings gate reads it.",
        ko: "`actionRequired`, `notice`, `essential`, `suggestion`, `advertise` 중 하나입니다. 수신 설정 판정이 읽습니다.",
      }),
    },
    {
      key: "content",
      type: "string",
      desc: l.trans({ en: "The notification body.", ko: "알림 본문입니다." }),
    },
    {
      key: "contentKey",
      type: "string",
      desc: l.trans({
        en: "A dictionary key for the body instead, resolved in the app's default locale.",
        ko: "본문 대신 쓰는 사전 키입니다. 앱의 기본 로케일로 풀어 씁니다.",
      }),
    },
    {
      key: "url",
      type: "string",
      desc: l.trans({
        en: "Where a tap lands: a path inside the app.",
        ko: "알림을 눌렀을 때 열 경로입니다. 앱 안의 경로를 씁니다.",
      }),
    },
    {
      key: "tag",
      type: "string",
      desc: l.trans({
        en: "A collapse key: a second push with the same tag replaces the first.",
        ko: "합치기 키입니다. 같은 tag의 두 번째 푸시가 첫 번째를 대신합니다.",
      }),
    },
    {
      key: "imageUrl",
      type: "string",
      desc: l.trans({ en: "An image shown in the notification.", ko: "알림에 보여 줄 이미지입니다." }),
    },
    {
      key: "badge",
      type: "number",
      desc: l.trans({ en: "The app icon's badge count.", ko: "앱 아이콘의 배지 숫자입니다." }),
    },
  ];

  return (
    <Scroll>
      <Scroll.Slide id="push-setup" title={l.trans({ en: "Push Setup", ko: "푸시 설정" })}>
        <Docs.Title>{l.trans({ en: "Push Setup", ko: "푸시 설정" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "The prompt appears, a token comes back, and the server logs a send. Nothing arrives on the phone.",
              ko: "권한 창이 뜨고, 토큰이 돌아오고, 서버 로그에는 발송이 찍힙니다. 그런데 폰에는 아무것도 오지 않습니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: (
                <span>
                  Push is one client API, <code>usePushNotification()</code>, and two senders on the server: APNs for
                  iOS, FCM for Android and the web. A token sent without its sender&apos;s credential is skipped with
                  one log line, so prepare every row that applies to you.
                </span>
              ),
              ko: (
                <span>
                  푸시는 클라이언트 API <code>usePushNotification()</code> 하나와 서버의 발송기 둘로 이루어집니다. iOS는
                  APNs, Android와 웹은 FCM입니다. 발송기 인증 정보가 없는 토큰은 로그 한 줄만 남기고 건너뛰니, 아래
                  표에서 해당하는 줄을 빠짐없이 준비하세요.
                </span>
              ),
            })}
          </div>
          <Docs.SubSubTitle>{l.trans({ en: "Words used on this page", ko: "이 페이지에서 쓰는 말" })}</Docs.SubSubTitle>
          <Docs.IntroTable type={l.trans({ en: "Term", ko: "용어" })} items={termRows} />
          <Docs.SubSubTitle>{l.trans({ en: "What you prepare", ko: "준비할 것" })}</Docs.SubSubTitle>
          <Docs.Matrix
            type={l.trans({ en: "Item", ko: "항목" })}
            columns={platformColumns}
            groups={prepareGroups}
            markLabel={l.trans({ en: "Needed", ko: "필요" })}
            emptyLabel={l.trans({ en: "Not needed", ko: "필요 없음" })}
          />
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="push-plugins" title={l.trans({ en: "One Native Plugin", ko: "네이티브 플러그인 하나" })}>
        <Docs.Title>{l.trans({ en: "One Native Plugin", ko: "네이티브 플러그인 하나" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  A native app gets push from the runtime&apos;s <code>push</code> plugin, and{" "}
                  <code>permissions: ["push"]</code> in <code>native</code> is all that adds it. There is no package to
                  install. The plugin speaks each platform&apos;s own service:
                </span>
              ),
              ko: (
                <span>
                  네이티브 앱의 푸시는 런타임의 <code>push</code> 플러그인이 맡고, <code>native</code>의{" "}
                  <code>permissions: ["push"]</code>만으로 들어갑니다. 설치할 패키지는 없습니다. 플러그인은 플랫폼마다
                  그 플랫폼의 서비스를 씁니다:
                </span>
              ),
            })}
          </div>
          <div className={cardGridRecipe({ cols: "mdTwo" }, "my-4")}>
            {pluginCards.map(({ title, chip, desc }) => (
              <div key={title} className={panelRecipe({ radius: "lg", padding: "sm" }, "min-w-0")}>
                <div className="wrap-anywhere mb-1 font-mono font-semibold text-primary">{title}</div>
                <div className="text-foreground/70 text-sm">{desc}</div>
                <code className="mt-2 block overflow-x-auto whitespace-nowrap rounded-md bg-muted/60 px-2.5 py-1.5 font-mono text-xs">
                  {chip}
                </code>
              </div>
            ))}
          </div>
          <div>
            {l.trans({
              en: (
                <span>
                  <code>usePushNotification()</code> hides which is which: it calls the plugin in a native shell and
                  Firebase in a browser, and hands back one <code>PushToken</code> shape either way. Which permission
                  adds which plugin is on{" "}
                  <Link href="/cheatsheet/mobile/setup#native-plugins" className="text-primary">
                    Setup
                  </Link>
                  .
                </span>
              ),
              ko: (
                <span>
                  <code>usePushNotification()</code>이 그 차이를 감춥니다. 네이티브 셸에서는 플러그인을, 브라우저에서는
                  Firebase를 부르고, 어느 쪽이든 같은 모양의 <code>PushToken</code>을 돌려줍니다. 어떤 권한이 어떤
                  플러그인을 넣는지는{" "}
                  <Link href="/cheatsheet/mobile/setup#native-plugins" className="text-primary">
                    설정
                  </Link>{" "}
                  문서에서 다룹니다.
                </span>
              ),
            })}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="web-push" title={l.trans({ en: "Web Push", ko: "웹 푸시" })}>
        <Docs.Title>{l.trans({ en: "Web Push", ko: "웹 푸시" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Web push needs no native project at all. Register a Firebase web app and copy its public config into the client env.",
              ko: "웹 푸시에는 네이티브 프로젝트가 전혀 필요 없습니다. Firebase 웹 앱을 등록하고, 공개 설정값을 client env에 옮기면 됩니다.",
            })}
          </div>
          <ol className={stepList}>
            <li>
              {l.trans({
                en: "Create or open a web app in Firebase Console.",
                ko: "Firebase Console에서 웹 앱을 만들거나 기존 웹 앱을 엽니다.",
              })}
              <ExternalLink
                href="https://console.firebase.google.com/"
                label={l.trans({ en: "Open Firebase Console", ko: "Firebase Console 열기" })}
              />
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    Copy its public config into <code>env.client.*</code>, under <code>firebase</code>.
                  </span>
                ),
                ko: (
                  <span>
                    공개 설정값을 <code>env.client.*</code>의 <code>firebase</code> 아래에 넣습니다.
                  </span>
                ),
              })}
              <ExternalLink
                href="https://firebase.google.com/docs/web/setup#config-object"
                label={l.trans({ en: "Open Firebase web config docs", ko: "Firebase 웹 설정 문서 열기" })}
              />
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    Generate a Web Push certificate key pair and put its public key in <code>vapidKey</code>.
                  </span>
                ),
                ko: (
                  <span>
                    Web Push 인증서 키 쌍을 만들고, 공개 키를 <code>vapidKey</code>에 넣습니다.
                  </span>
                ),
              })}
              <ExternalLink
                href="https://firebase.google.com/docs/cloud-messaging/js/client#configure_web_credentials_in_your_app"
                label={l.trans({
                  en: "Open Firebase web push credentials docs",
                  ko: "Firebase 웹 푸시 인증 정보 문서 열기",
                })}
              />
            </li>
          </ol>
          <div>
            {l.trans({
              en: "The client env file then looks like this:",
              ko: "그러면 client env 파일은 이렇게 됩니다:",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
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
        <Docs.Description>
          <ul className={bulletList}>
            {webNotes.map((note, idx) => (
              <li key={idx}>{note}</li>
            ))}
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="android-push" title={l.trans({ en: "Android Push", ko: "Android 푸시" })}>
        <Docs.Title>{l.trans({ en: "Android Push", ko: "Android 푸시" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  Android push is a Firebase Android app whose package name matches <code>native.appId</code> exactly,
                  plus one config file <code>native.android.googleServices</code> names.
                </span>
              ),
              ko: (
                <span>
                  Android 푸시는 패키지 이름이 <code>native.appId</code>와 정확히 같은 Firebase Android 앱 등록, 그리고{" "}
                  <code>native.android.googleServices</code>가 지정하는 설정 파일 하나로 끝납니다.
                </span>
              ),
            })}
          </div>
          <ol className={stepList}>
            <li>
              {l.trans({
                en: "Open Firebase Console and select the project.",
                ko: "Firebase Console에서 프로젝트를 엽니다.",
              })}
              <ExternalLink
                href="https://console.firebase.google.com/"
                label={l.trans({ en: "Open Firebase Console", ko: "Firebase Console 열기" })}
              />
            </li>
            <li>
              {l.trans({ en: "Add an Android app.", ko: "Android 앱을 추가합니다." })}
              <ExternalLink
                href="https://firebase.google.com/docs/android/setup"
                label={l.trans({ en: "Open Firebase Android setup docs", ko: "Firebase Android 설정 문서 열기" })}
              />
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    Enter the same package name as <code>native.appId</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <code>native.appId</code>와 같은 패키지 이름을 입력합니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    Download <code>google-services.json</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <code>google-services.json</code>을 내려받습니다.
                  </span>
                ),
              })}
              <ExternalLink
                href="https://firebase.google.com/docs/android/setup#add-config-file"
                label={l.trans({ en: "Open google-services.json docs", ko: "google-services.json 문서 열기" })}
              />
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    Place it at <code>apps/myapp/secrets/google-services.json</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <code>apps/myapp/secrets/google-services.json</code>에 둡니다.
                  </span>
                ),
              })}
            </li>
          </ol>
          <div>
            {l.trans({
              en: (
                <span>
                  Then name it in <code>native.android</code> in <code>akan.config.ts</code>:
                </span>
              ),
              ko: (
                <span>
                  그리고 <code>akan.config.ts</code>의 <code>native.android</code>에서 지정합니다:
                </span>
              ),
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/myapp/akan.config.ts"
          code={`import type { AppConfig } from "akanjs";

const config: AppConfig = {
  secrets: ["secrets/**"],
  native: {
    appId: "com.myapp.app",
    permissions: ["push"],
    android: { googleServices: "secrets/google-services.json" },
  },
};

export default config;`}
        />
        <Docs.Description>
          <ul className={bulletList}>
            {androidFileNotes.map((note, idx) => (
              <li key={idx}>{note}</li>
            ))}
          </ul>
          <Docs.Alert type="warning">
            {l.trans({
              en: (
                <span>
                  <strong>
                    <code>google-services.json</code> is not the server credential.
                  </strong>{" "}
                  It is the Android app&apos;s Firebase config, not the Firebase Admin service account JSON. The server
                  credential goes in <code>env.server.*</code>, as the last section shows.
                </span>
              ),
              ko: (
                <span>
                  <strong>
                    <code>google-services.json</code>은 서버 인증 정보가 아닙니다.
                  </strong>{" "}
                  Android 앱용 Firebase 설정 파일이지, Firebase Admin 서비스 계정 JSON이 아닙니다. 서버 인증 정보는
                  마지막 섹션처럼 <code>env.server.*</code>에 둡니다.
                </span>
              ),
            })}
          </Docs.Alert>
          <Docs.SubSubTitle>
            {l.trans({ en: "Android Notification Details", ko: "Android 알림 표시 설정" })}
          </Docs.SubSubTitle>
          <div>
            {l.trans({
              en: "How a notification shows depends on whether the app is in front:",
              ko: "알림이 어떻게 보이는지는 앱이 앞에 있는지에 따라 다릅니다:",
            })}
            <ExternalLink
              href="https://developer.android.com/develop/ui/views/notifications/channels"
              label={l.trans({
                en: "Open Android notification channel docs",
                ko: "Android 알림 채널 문서 열기",
              })}
            />
          </div>
          <ul className={bulletList}>
            {androidDisplayNotes.map((note, idx) => (
              <li key={idx}>{note}</li>
            ))}
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="ios-push" title={l.trans({ en: "iOS Push", ko: "iOS 푸시" })}>
        <Docs.Title>{l.trans({ en: "iOS Push", ko: "iOS 푸시" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "iOS push needs no Firebase at all: the app registers with APNs, and the server sends to APNs itself. What you own is the capability on the App ID and the key the server signs with.",
              ko: "iOS 푸시에는 Firebase가 전혀 필요 없습니다. 앱은 APNs에 등록하고, 서버도 APNs로 직접 보냅니다. 직접 챙길 것은 App ID의 기능 설정과 서버가 서명할 키입니다.",
            })}
          </div>
          <ol className={stepList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    In Apple Developer, open Identifiers, pick the App ID that matches <code>native.appId</code>, and
                    turn on Push Notifications.
                  </span>
                ),
                ko: (
                  <span>
                    Apple Developer의 Identifiers에서 <code>native.appId</code>와 같은 App ID를 골라 Push
                    Notifications를 켭니다.
                  </span>
                ),
              })}
              <ExternalLink
                href="https://developer.apple.com/documentation/usernotifications/registering-your-app-with-apns"
                label={l.trans({
                  en: "Open Apple push notification registration docs",
                  ko: "Apple 푸시 알림 등록 문서 열기",
                })}
              />
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    Under Keys, create a key with Apple Push Notifications service enabled and download its{" "}
                    <code>.p8</code>. Apple lets you download it once; note its Key ID and your Team ID.
                  </span>
                ),
                ko: (
                  <span>
                    Keys에서 Apple Push Notifications service를 켠 키를 만들고 <code>.p8</code>을 내려받습니다. 한 번만
                    받을 수 있으니, Key ID와 Team ID도 함께 적어 둡니다.
                  </span>
                ),
              })}
              <ExternalLink
                href="https://developer.apple.com/documentation/usernotifications/establishing-a-token-based-connection-to-apns"
                label={l.trans({ en: "Open APNs token-based connection docs", ko: "APNs 토큰 기반 연결 문서 열기" })}
              />
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    Put the three into <code>pushNoti.apns</code> on the server, as the last section shows.
                  </span>
                ),
                ko: (
                  <span>
                    셋을 서버의 <code>pushNoti.apns</code>에 넣습니다. 마지막 섹션에서 봅니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    Add <code>permissions: ["push"]</code> to <code>native</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <code>native</code>에 <code>permissions: ["push"]</code>를 추가합니다.
                  </span>
                ),
              })}
            </li>
          </ol>
          <div>
            {l.trans({
              en: "Nothing else goes in the config:",
              ko: "설정에는 그 밖에 더 넣을 것이 없습니다:",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/myapp/akan.config.ts"
          code={`import type { AppConfig } from "akanjs";

const config: AppConfig = {
  native: {
    appId: "com.myapp.app",
    permissions: ["push"],
  },
};

export default config;`}
        />
        <Docs.Description>
          <ul className={bulletList}>
            {iosNotes.map((note, idx) => (
              <li key={idx}>{note}</li>
            ))}
          </ul>
          <Docs.Alert type="warning">
            {l.trans({
              en: (
                <span>
                  <strong>
                    Keep the <code>.p8</code> on the server.
                  </strong>{" "}
                  It signs pushes to every app of your team. It belongs in <code>env.server.*</code>, never in{" "}
                  <code>env.client.*</code> or <code>public/</code>.
                </span>
              ),
              ko: (
                <span>
                  <strong>
                    <code>.p8</code>은 서버에만 둡니다.
                  </strong>{" "}
                  이 키는 팀의 모든 앱에 푸시를 서명합니다. <code>env.server.*</code>에 두고, <code>env.client.*</code>
                  나 <code>public/</code>에는 절대 두지 않습니다.
                </span>
              ),
            })}
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide
        id="apns-environment"
        title={l.trans({ en: "Which APNs Environment You Built", ko: "빌드한 APNs 환경 확인하기" })}
      >
        <Docs.Title>{l.trans({ en: "Which APNs Environment You Built", ko: "빌드한 APNs 환경 확인하기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  You never write <code>aps-environment</code>: the push plugin declares <code>development</code>, and a
                  build signed with a provisioning profile takes the profile&apos;s value. It decides which APNs
                  environment the device&apos;s token belongs to.
                </span>
              ),
              ko: (
                <span>
                  <code>aps-environment</code>는 직접 쓰지 않습니다. 푸시 플러그인이 <code>development</code>를
                  선언하고, 프로비저닝 프로파일로 서명한 빌드는 프로파일의 값을 씁니다. 이 값이 기기 토큰이 어느 APNs
                  환경의 것인지를 정합니다.
                </span>
              ),
            })}
          </div>
          <Docs.Table
            columns={[
              { key: "command", label: l.trans({ en: "Command", ko: "명령" }), code: true },
              { key: "env", label: "aps-environment", code: true },
              { key: "desc", label: l.trans({ en: "Used for", ko: "용도" }) },
            ]}
            rows={[
              {
                command: "akan start-ios",
                env: "development",
                desc: l.trans({
                  en: "Simulator and development-signed iPhone runs, through the APNs sandbox.",
                  ko: "시뮬레이터와 development로 서명한 iPhone 실행이며, APNs 샌드박스를 씁니다.",
                }),
              },
              {
                command: "akan build-ios",
                env: "development",
                desc: l.trans({ en: "A simulator build.", ko: "시뮬레이터 빌드입니다." }),
              },
              {
                command: "akan release-ios",
                env: "production",
                desc: l.trans({
                  en: "The App Store profile: TestFlight and the App Store.",
                  ko: "App Store 프로파일입니다. TestFlight와 App Store에 씁니다.",
                }),
              },
              {
                command: "akan release-ios --adHoc",
                env: "production",
                desc: l.trans({ en: "An ad hoc profile.", ko: "ad hoc 프로파일입니다." }),
              },
            ]}
          />
          <ul className={bulletList}>
            {apnsNotes.map((note, idx) => (
              <li key={idx}>{note}</li>
            ))}
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="client-registration" title={l.trans({ en: "Client Registration", ko: "클라이언트 등록" })}>
        <Docs.Title>{l.trans({ en: "Client Registration", ko: "클라이언트 등록" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  An app that mounts <code>libs/shared</code> needs no code of its own. Mount{" "}
                  <code>Notification.Zone.Initialize</code> once in a signed-in layout: it registers the device again on
                  every visit and on every token a native shell rotates, and never asks for permission.
                </span>
              ),
              ko: (
                <span>
                  <code>libs/shared</code>를 쓰는 앱은 직접 짤 코드가 없습니다. 로그인한 사용자의 레이아웃에{" "}
                  <code>Notification.Zone.Initialize</code>를 한 번 둡니다. 방문할 때마다, 그리고 네이티브 셸이 토큰을
                  바꿀 때마다 기기를 다시 등록하며, 권한은 묻지 않습니다.
                </span>
              ),
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/myapp/page/(user)/_layout.tsx"
          code={`import { Notification } from "@libs/shared/client";
import { layout } from "akanjs/client";

export default layout().render(({ children }) => (
  <>
    <Notification.Zone.Initialize />
    {children}
  </>
));`}
        />
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  The permission prompt belongs to a user action, because Chrome ignores a request with no gesture
                  behind it and iOS refuses one. <code>Notification.Util.PushSetting</code> is that switch. A button of
                  your own calls <code>register()</code> and hands the <code>PushToken</code> to the store:
                </span>
              ),
              ko: (
                <span>
                  권한 요청은 사용자 동작에서 해야 합니다. 동작 없이 요청하면 Chrome은 무시하고 iOS는 거절합니다.{" "}
                  <code>Notification.Util.PushSetting</code>이 그 스위치입니다. 직접 만든 버튼이라면{" "}
                  <code>register()</code>를 부르고 받은 <code>PushToken</code>을 스토어에 넘깁니다:
                </span>
              ),
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/myapp/ui/EnablePush.tsx"
          code={`"use client";
import { st } from "@apps/myapp/client";
import { usePushNotification } from "@libs/util/webkit";
import { buttonRecipe } from "akanjs/ui";
import type { ReactNode } from "react";

interface EnablePushProps {
  className?: string;
  children: ReactNode;
}
export const EnablePush = ({ className, children }: EnablePushProps) => {
  const push = usePushNotification();
  return (
    <button
      className={buttonRecipe({ variant: "primary" }, className)}
      onClick={async () => {
        const pushToken = await push.register();
        if (pushToken) await st.do.registerPushToken(pushToken);
      }}
      type="button"
    >
      {children}
    </button>
  );
};`}
        />
        <Docs.Description>
          <Docs.Alert type="info">
            {l.trans({
              en: (
                <span>
                  <strong>
                    <code>registerPushToken</code> comes with <code>libs/shared</code>.
                  </strong>{" "}
                  Without it, hand the <code>PushToken</code> to an endpoint of your own; its fields map one to one onto
                  the <code>DeviceToken</code> shown next.
                </span>
              ),
              ko: (
                <span>
                  <strong>
                    <code>registerPushToken</code>은 <code>libs/shared</code>에 들어 있습니다.
                  </strong>{" "}
                  쓰지 않는다면 <code>PushToken</code>을 직접 만든 엔드포인트에 넘기면 됩니다. 필드는 다음 섹션의{" "}
                  <code>DeviceToken</code>과 하나씩 맞습니다.
                </span>
              ),
            })}
          </Docs.Alert>
          <Docs.SubSubTitle>
            {l.trans({ en: "What usePushNotification() returns", ko: "usePushNotification()이 돌려주는 것" })}
          </Docs.SubSubTitle>
          <div>
            {l.trans({
              en: (
                <span>
                  Import it from <code>@libs/util/webkit</code>. Most screens need only <code>register()</code>.
                </span>
              ),
              ko: (
                <span>
                  <code>@libs/util/webkit</code>에서 가져옵니다. 대부분의 화면은 <code>register()</code>만 있으면
                  됩니다.
                </span>
              ),
            })}
          </div>
          <Docs.IntroTable type={l.trans({ en: "Method", ko: "메서드" })} items={hookRows} />
          <ul className={bulletList}>
            {registerNotes.map((note, idx) => (
              <li key={idx}>{note}</li>
            ))}
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="token-store" title={l.trans({ en: "Where Tokens Live", ko: "토큰이 저장되는 곳" })}>
        <Docs.Title>{l.trans({ en: "Where Tokens Live", ko: "토큰이 저장되는 곳" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  <code>libs/shared</code> keeps every device&apos;s token on its owner:{" "}
                  <code>user.notiInfo.deviceTokens</code>, one <code>DeviceToken</code> per installation. The field is
                  secret, so it never leaves the server.
                </span>
              ),
              ko: (
                <span>
                  <code>libs/shared</code>는 기기마다의 토큰을 그 주인에게 둡니다.{" "}
                  <code>user.notiInfo.deviceTokens</code>에 설치 하나당 <code>DeviceToken</code> 하나씩입니다. secret
                  필드라 서버 밖으로 나가지 않습니다.
                </span>
              ),
            })}
          </div>
          <Docs.Flow
            title={l.trans({ en: "Push token lifecycle", ko: "푸시 토큰 생명주기" })}
            direction="TB"
            nodes={{
              register: { label: l.trans({ en: "Client: register()", ko: "클라이언트: register()" }) },
              add: { label: l.trans({ en: "Server: addNotiDeviceTokenOfSelf", ko: "서버: addNotiDeviceTokenOfSelf" }) },
              db: { label: "user.notiInfo.deviceTokens", tone: "muted" },
              push: { label: l.trans({ en: "Server: push(userIds)", ko: "서버: push(userIds)" }) },
              gate: { label: l.trans({ en: "Settings accept it?", ko: "수신 설정이 받는가?" }), tone: "info" },
              send: { label: l.trans({ en: "sendEach by provider", ko: "provider별 sendEach" }) },
              apns: { label: "APNs" },
              fcm: { label: "FCM" },
              device: { label: l.trans({ en: "User device", ko: "사용자 기기" }) },
              gone: { label: l.trans({ en: "Gone?", ko: "사라진 토큰인가?" }), tone: "info" },
              prune: {
                label: l.trans({ en: "Server: drop the token", ko: "서버: 토큰 삭제" }),
                tone: "muted",
              },
            }}
            edges={[
              ["register", "add"],
              ["add", "db"],
              ["db", "push"],
              ["push", "gate"],
              ["gate", "send", { label: l.trans({ en: "yes", ko: "예" }) }],
              ["send", "apns"],
              ["send", "fcm"],
              ["apns", "device"],
              ["fcm", "device"],
              ["send", "gone"],
              ["gone", "prune", { label: l.trans({ en: "yes", ko: "예" }) }],
              ["prune", "db", { dashed: true }],
            ]}
          />
          <Docs.SubSubTitle>deviceToken.constant.ts</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: (
                <span>
                  The scalar holds what <code>register()</code> returned, plus when the server stored it:
                </span>
              ),
              ko: (
                <span>
                  스칼라에는 <code>register()</code>가 돌려준 값과, 서버가 저장한 시각을 담습니다:
                </span>
              ),
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="libs/shared/lib/__scalar/deviceToken/deviceToken.constant.ts"
          code={`import { dayjs, enumOf } from "akanjs/base";
import { via } from "akanjs/constant";

export class PushProvider extends enumOf("pushProvider", ["apns", "fcm"] as const) {}

export class DevicePlatform extends enumOf("devicePlatform", ["ios", "android", "web"] as const) {}

export class DeviceToken extends via((field) => ({
  token: field(String),
  provider: field(PushProvider, { default: "fcm" }),
  platform: field(DevicePlatform, { default: "web" }),
  deviceId: field(String).optional(),
  updatedAt: field(Date, { default: () => dayjs() }),
})) {}`}
        />
        <Docs.Description>
          <ul className={bulletList}>
            {constantNotes.map((note, idx) => (
              <li key={idx}>{note}</li>
            ))}
          </ul>
          <Docs.SubSubTitle>{l.trans({ en: "The endpoints", ko: "엔드포인트" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: (
                <span>
                  All three are <code>User</code>-guarded mutations and queries on the <code>user</code> signal, called
                  through the notification store&apos;s <code>registerPushToken</code>, <code>unregisterPushToken</code>{" "}
                  and <code>loadPushState</code>:
                </span>
              ),
              ko: (
                <span>
                  셋 모두 <code>user</code> 시그널에 있는 <code>User</code> 가드 엔드포인트이며, notification 스토어의{" "}
                  <code>registerPushToken</code>, <code>unregisterPushToken</code>, <code>loadPushState</code>가
                  부릅니다:
                </span>
              ),
            })}
          </div>
          <Docs.IntroTable type={l.trans({ en: "Endpoint", ko: "엔드포인트" })} items={endpointRows} />
          <ul className={bulletList}>
            {signalNotes.map((note, idx) => (
              <li key={idx}>{note}</li>
            ))}
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide
        id="token-lifecycle"
        title={l.trans({ en: "Send And Retire Dead Tokens", ko: "발송과 죽은 토큰 정리" })}
      >
        <Docs.Title>{l.trans({ en: "Send And Retire Dead Tokens", ko: "발송과 죽은 토큰 정리" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  <code>notificationService.push(userIds, payload)</code> is the one call a domain service makes. It
                  reads each recipient&apos;s settings, sends every accepted device through its own provider, and drops
                  the tokens APNs or FCM call gone.
                </span>
              ),
              ko: (
                <span>
                  도메인 서비스가 부르는 것은 <code>notificationService.push(userIds, payload)</code> 하나입니다. 받는
                  사람마다 수신 설정을 읽고, 받아 준 기기마다 그 기기의 provider로 보내며, APNs나 FCM이 사라졌다고 답한
                  토큰을 지웁니다.
                </span>
              ),
            })}
          </div>
          <Docs.SubSubTitle>{l.trans({ en: "Server credentials", ko: "서버 인증 정보" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: (
                <span>
                  Put both senders&apos; credentials under <code>pushNoti</code> in each server env file:
                </span>
              ),
              ko: (
                <span>
                  두 발송기의 인증 정보를 각 서버 env 파일의 <code>pushNoti</code> 아래에 넣습니다:
                </span>
              ),
            })}
            <ExternalLink
              href="https://firebase.google.com/docs/admin/setup"
              label={l.trans({ en: "Open Firebase Admin setup docs", ko: "Firebase Admin 설정 문서 열기" })}
            />
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/myapp/env/env.server.local.ts"
          code={`import type { ModulesOptions } from "../lib/option";
import { libEnv } from "./env.server.type";

export const env: ModulesOptions = {
  ...libEnv,
  pushNoti: {
    firebase: {
      type: "service_account",
      project_id: "...",
      private_key_id: "...",
      private_key: "...",
      client_email: "...",
    },
    apns: {
      teamId: "...",
      keyId: "...",
      privateKey: "-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----",
      bundleId: "com.myapp.app",
    },
  },
};`}
        />
        <Docs.Description>
          <ul className={bulletList}>
            {credentialNotes.map((note, idx) => (
              <li key={idx}>{note}</li>
            ))}
          </ul>
          <Docs.Alert type="warning">
            {l.trans({
              en: (
                <span>
                  <strong>A sender without credentials sends nothing and throws nothing.</strong> Its tokens are skipped
                  with one <code>warn</code> line, such as <code>pushNoti.apns is not configured</code>, and counted as
                  failures.
                </span>
              ),
              ko: (
                <span>
                  <strong>인증 정보가 없는 발송기는 아무것도 보내지 않고, 오류도 던지지 않습니다.</strong>{" "}
                  <code>pushNoti.apns is not configured</code> 같은 <code>warn</code> 로그 한 줄만 남기고 그 토큰들을
                  건너뛰며, 실패로 셉니다.
                </span>
              ),
            })}
          </Docs.Alert>
          <Docs.SubSubTitle>{l.trans({ en: "Sending from a service", ko: "서비스에서 보내기" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: "Load, save, then notify, with the push fire-and-forget:",
              ko: "불러오고, 저장한 뒤 알립니다. 푸시는 기다리지 않고 보냅니다:",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/myapp/lib/order/order.service.ts"
          code={`import { serve } from "akanjs/service";
import * as db from "../db";
import type * as srv from "../srv";

export class OrderService extends serve(db.order, ({ service }) => ({
  notificationService: service<srv.NotificationService>(),
})) {
  async shipOrder(orderId: string) {
    const order = await this.orderModel.pickById(orderId);
    await order.ship().save();
    void this.notificationService.push([order.buyerId], {
      title: order.title,
      contentKey: "order.pushShipped",
      level: "notice",
      url: \`/order/\${order.id}\`,
      tag: \`order-\${order.id}\`,
    });
    return order;
  }
}`}
        />
        <Docs.Description>
          <ul className={bulletList}>
            {serviceNotes.map((note, idx) => (
              <li key={idx}>{note}</li>
            ))}
          </ul>
          <Docs.SubSubTitle>{l.trans({ en: "What push() takes", ko: "push()가 받는 값" })}</Docs.SubSubTitle>
          <Docs.OptionTable items={payloadRows} />
          <div>
            {l.trans({
              en: (
                <span>
                  <strong>No topics.</strong> A topic cannot hold an APNs token, cannot ask a person&apos;s settings and
                  never reports a dead token, so every send goes to stored tokens. Without <code>libs/shared</code>,
                  call <code>PushNotificationServer.sendEach(targets, message)</code> from{" "}
                  <code>@libs/util/srvkit</code> with <code>{"{ token, provider }"}</code> targets, and stop storing the{" "}
                  <code>invalidTokens</code> it returns.
                </span>
              ),
              ko: (
                <span>
                  <strong>토픽은 쓰지 않습니다.</strong> 토픽은 APNs 토큰을 담지 못하고, 사람마다의 수신 설정을 물을 수
                  없으며, 죽은 토큰도 알려 주지 않습니다. 그래서 모든 발송은 저장된 토큰으로 나갑니다.{" "}
                  <code>libs/shared</code> 없이 쓴다면 <code>@libs/util/srvkit</code>의{" "}
                  <code>PushNotificationServer.sendEach(targets, message)</code>를 <code>{"{ token, provider }"}</code>{" "}
                  목록으로 부르고, 돌려받은 <code>invalidTokens</code>는 더 이상 저장하지 않습니다.
                </span>
              ),
            })}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <DocsToc />
    </Scroll>
  );
});
