import { usePage } from "@apps/akan/client";
import { Code, Docs } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();
  const symbols = [
    {
      name: "lazy",
      desc: l.trans({
        en: "React lazy wrapper that supports `ssr: false`. It returns a fallback stub on the server and gates client rendering until mounted, which is useful for browser-only libraries such as maps, charts, and 3D scenes.",
        ko: "`ssr: false`를 지원하는 React lazy wrapper입니다. server에서는 fallback stub을 반환하고 mount될 때까지 client rendering을 막아 map, chart, 3D scene 같은 browser-only library에 유용합니다.",
      }),
      code: `import { lazy } from "akanjs/webkit";

const Globe = lazy(() => import("./Globe"), {
  ssr: false,
  loading: () => <div>Loading globe...</div>,
});`,
    },
    {
      name: "useDebounce",
      desc: l.trans({
        en: "Returns a debounced callback that delays execution until input quiets down. Search boxes, image editors, and expensive field updates use it to avoid repeated work while users type or drag.",
        ko: "input이 잠잠해질 때까지 실행을 지연하는 debounced callback을 반환합니다. search box, image editor, expensive field update에서 사용자가 입력하거나 drag하는 동안 반복 작업을 피할 때 사용합니다.",
      }),
      code: `import { useDebounce } from "akanjs/webkit";

const onSearch = useDebounce((query: string) => {
  void fetch.search(query);
}, [], 300);`,
    },
    {
      name: "useInterval",
      desc: l.trans({
        en: "Runs the latest callback on a fixed interval and clears the timer on unmount. Zone components use it for polling metrics, game state, build logs, and realtime-like dashboards.",
        ko: "latest callback을 fixed interval로 실행하고 unmount 시 timer를 정리합니다. Zone component는 metric, game state, build log, realtime-like dashboard polling에 사용합니다.",
      }),
      code: `import { useInterval } from "akanjs/webkit";

useInterval(async () => {
  await st.do.refresh();
}, 3000);`,
    },
    {
      name: "useThrottle",
      desc: l.trans({
        en: "Returns a throttled callback that runs immediately, then ignores calls until the delay passes. Use it for scroll, pointer, resize, or drag handlers that can fire too frequently.",
        ko: "즉시 실행된 뒤 delay가 지날 때까지 호출을 무시하는 throttled callback을 반환합니다. 너무 자주 실행될 수 있는 scroll, pointer, resize, drag handler에 사용합니다.",
      }),
      code: `import { useThrottle } from "akanjs/webkit";

const onMove = useThrottle((x: number, y: number) => {
  setPosition({ x, y });
}, 100);`,
    },
    {
      name: "useFetch / useFetchFn",
      desc: l.trans({
        en: "Client hook for promise-backed values. `useFetch` accepts a promise or immediate value, while `useFetchFn` memoizes a factory so re-renders do not duplicate network requests.",
        ko: "promise-backed value를 위한 client hook입니다. `useFetch`는 promise 또는 immediate value를 받고, `useFetchFn`은 re-render가 network request를 중복하지 않도록 factory를 memoize합니다.",
      }),
      code: `import { useFetchFn } from "akanjs/webkit";

const { fulfilled, value } = useFetchFn(() => fetch.user(userId), [userId]);`,
    },
    {
      name: "useCamera",
      desc: l.trans({
        en: "Capacitor camera/photos hook. It checks permissions, opens app settings on denial, and exposes `getPhoto`, `pickImage`, and permission state for upload UIs.",
        ko: "Capacitor camera/photos hook입니다. permission을 확인하고 거부 시 app settings를 열며 upload UI를 위한 `getPhoto`, `pickImage`, permission state를 제공합니다.",
      }),
      code: `import { useCamera } from "akanjs/webkit";

const { getPhoto, pickImage, permissions } = useCamera();
const photo = await getPhoto("photos");`,
    },
    {
      name: "useContact",
      desc: l.trans({
        en: "Capacitor contacts hook for mobile signup/social flows. It requests contact permission and returns phone/name contact data when native contacts are available.",
        ko: "mobile signup/social flow를 위한 Capacitor contacts hook입니다. contact permission을 요청하고 native contact를 사용할 수 있으면 phone/name contact data를 반환합니다.",
      }),
      code: `import { useContact } from "akanjs/webkit";

const { getContacts } = useContact();
const contacts = await getContacts();`,
    },
    {
      name: "useGeoLocation",
      desc: l.trans({
        en: "Capacitor geolocation hook. It requests location permissions, redirects to app settings when denied, and returns current coordinates for map or location flows.",
        ko: "Capacitor geolocation hook입니다. location permission을 요청하고 거부되면 app settings로 이동시키며 map/location flow를 위한 현재 coordinate를 반환합니다.",
      }),
      code: `import { useGeoLocation } from "akanjs/webkit";

const { getPosition } = useGeoLocation();
const position = await getPosition();`,
    },
    {
      name: "usePushNotification",
      desc: l.trans({
        en: "Unified push notification client hook for web and native apps. It requests permission, registers the runtime, returns a PushToken, and bridges notification clicks through `data.url` when supported.",
        ko: "web/native 앱을 위한 통합 push notification client hook입니다. permission 요청, runtime 등록, PushToken 반환을 처리하고 지원되는 경우 notification click을 `data.url` deep link로 연결합니다.",
      }),
      code: `import { usePushNotification } from "akanjs/webkit";

const push = usePushNotification();
const pushToken = await push.register();

if (pushToken) {
  await appApi.registerPushToken(pushToken);
}`,
    },
    {
      name: "useLocation / useHistory",
      desc: l.trans({
        en: "CSR router hooks for translating hrefs into route state and tracking navigation history. They power cached page transitions, scroll restoration, and back/forward detection.",
        ko: "href를 route state로 변환하고 navigation history를 추적하는 CSR router hook입니다. cached page transition, scroll restoration, back/forward detection을 구동합니다.",
      }),
      code: `import { useHistory, useLocation } from "akanjs/webkit";

const { getLocation } = useLocation({ rootRouteGuide });
const history = useHistory([getLocation(location.href)]);`,
    },
    {
      name: "LoginForm",
      desc: l.trans({
        en: "Shared login form type used by auth stores and bridge UI. It describes target auth mode, redirect behavior, unauthorized path, and optional JWT handoff.",
        ko: "auth store와 bridge UI에서 사용하는 shared login form type입니다. target auth mode, redirect behavior, unauthorized path, optional JWT handoff를 설명합니다.",
      }),
      code: `import type { LoginForm } from "akanjs/webkit";

const form: LoginForm = {
  auth: "user",
  redirect: "/",
};`,
    },
  ];

  return (
    <Scroll>
      <Scroll.Slide id="akanjs-webkit" title="akanjs/webkit">
        <Docs.Title>akanjs/webkit</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "`akanjs/webkit` contains browser-only React helpers and native-capability hooks. Import it for lazy browser components, debounce/throttle/interval hooks, promise state, CSR navigation state, and Capacitor camera/contact/location/push flows.",
              ko: "`akanjs/webkit`은 browser-only React helper와 native-capability hook을 제공합니다. lazy browser component, debounce/throttle/interval hook, promise state, CSR navigation state, Capacitor camera/contact/location/push flow에 사용합니다.",
            })}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />
      {symbols.map((symbol) => (
        <Scroll.Slide key={symbol.name} id={symbol.name} title={symbol.name}>
          <Docs.Title>{symbol.name}</Docs.Title>
          <Docs.Description>
            <div>{symbol.desc}</div>
          </Docs.Description>
          <Code.Snippet title={l.trans({ en: "Usage", ko: "사용 예시" })} language="typescript" code={symbol.code} />
        </Scroll.Slide>
      ))}
      <Scroll.TitleNavigator className="fixed top-32 right-0 hidden w-[250px] flex-col gap-2 lg:flex" />
    </Scroll>
  );
}
