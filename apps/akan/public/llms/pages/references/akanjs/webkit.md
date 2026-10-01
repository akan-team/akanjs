# akanjs/webkit

- Source: /references/akanjs/webkit
- Mirror: /llms/pages/references/akanjs/webkit.md
- Section: references
- Category: AkanJS Reference
- Priority: P0

## Headings

- akanjs/webkit (#akanjs-webkit)
- lazy (#lazy)
- useDebounce (#useDebounce)
- useInterval (#useInterval)
- useThrottle (#useThrottle)
- useFetch / useFetchFn (#useFetch / useFetchFn)
- useCamera (#useCamera)
- useGeoLocation (#useGeoLocation)
- usePushNotification (#usePushNotification)
- usePurchase (#usePurchase)
- useLocation / useHistory (#useLocation / useHistory)
- LoginForm (#LoginForm)

## Content

akanjs/webkit

required

Export

Returns

`akanjs/webkit` holds React hooks and helpers that run only in the browser or in the native app. Timers, lazy loading, promise state, device features and the CSR router state live here.

On This Page

- lazy: Loads a component's code on demand. `ssr: false` skips server rendering.

- useDebounce: Runs a callback once, after the calls stop for a while.

- useInterval: Runs a callback on a fixed interval and stops on unmount.

- useThrottle: Runs a callback at once, then ignores calls for a while.

- useFetch, useFetchFn: Tells a client component whether a promise has resolved, and its value.

- useCamera, useGeoLocation: Camera and location through the native runtime's plugins, with a browser fallback and the permission prompts.

- usePushNotification: Not in this module: the push hook lives in `@libs/util/webkit`.

- usePurchase: In-app purchase on the native iap plugin, verified by your server. Imported from `akanjs/webkit/usePurchase`.

- useLocation, useHistory: The CSR router's location parser and history stack.

- LoginForm: The argument of the shared store's `login` action.

Other Exports

- useBodyScrollLock(active): Locks `document.body` scrolling while `active`. Overlays share one count.

- useEscapeKey(active, onEscape): Calls `onEscape` on Escape while `active`. Only the topmost open surface gets the key.

- usePageFocusEffect(effect, deps): Runs `effect` while the user is on this page and cleans it up when they leave. A page kept under the current one for a swipe back stays mounted, so a plain effect there keeps running.

- usePageLocation(): `{ pathname, params, searchParams }` of this page. `st.use.searchParams()` follows the page on screen, so a page being prepared or kept under the current one reads its own here.

- usePageActivity(): `"current" | "prev" | "pending" | "hidden"` — where this page stands in the CSR stack; always `current` outside one.

- usePageTool, useScreenScope: Show a pager and on-screen items to the in-page agent. `Load.Units` and `Load.View` call them.

- createRobotPage, createSitemapPage: Build robots rules (`disallow: "/admin/"` by default) and a list of sitemap entries.

- bootCsr, replacePages, useCsrValues: Start the CSR (mobile) bundle, swap its route modules in place during dev, and hold its router state. The generated entry calls them.

- LoginAuth, ScreenScopeItem: Types: `"user" | "admin" | "public"`, and one on-screen item `{ id, label? }`.

**Call the hooks from a client file.** They are React hooks, so they need a file with `"use client"`. Put `lazy()` in the `ui/<Folder>/index_.tsx` boundary file.

**Push and speech come from the util library.** `usePushNotification` and `useSpeech` are imported from `@libs/util/webkit`, not from here.

Writing Your Own Hook

Where an app or lib puts its own browser-only hooks.

Lazy Loading

Which libraries and components to defer, with worked examples.

lazy

`lazy` is React's `lazy` with Akan's server switch. With `ssr: false` it skips server rendering, which is what a map, chart or 3D library that touches `window` on import needs.

- ssr (boolean, default true): `false` skips server rendering: the server sends `loading`, and the chunk loads after mount.

- suspense (boolean, default false): Wraps the component in its own Suspense boundary, so only this spot waits for the chunk.

- loading (() => ReactNode): The placeholder. It shows only with `ssr: false` or `suspense: true`.

What Each Call Renders

Call

Server HTML

While the chunk loads

- No option — The component itself. — The nearest boundary, usually the whole route, shows its fallback.

- `suspense: true` — The component, sent after the shell in stream mode. — Only this spot shows `loading`.

- `ssr: false` — Only `loading`, or nothing. — `loading` until the component mounts and its chunk arrives.

A globe that needs the browser, behind its lazy boundary file:

**Keep the file pair.** `"use client"` and `lazy()` go in `index_.tsx`; the `index.tsx` beside it stays safe to import on the server. Merging the two breaks server rendering.

**The loaded file exports the component as default.** A loader may also return the component itself, such as a package's default export.

**Use `suspense: true` only for what opens later.** A modal body, a dropdown or an editor. On a page body it moves markup out of the shell that SEO snapshots and prerendering read.

useDebounce

`useDebounce` returns a callback that runs only after the calls stop. A search box that queries once the user stops typing is the usual case; an image editor or a costly field update uses it while the user drags or types.

- callback ((...args) => unknown): Runs once, with the arguments of the last call.

  - required

- states (unknown[], default []): The dependency list of the inner `useCallback`: every prop and state the callback reads.

- wait (number, default 100): Milliseconds to wait after the last call.

A search box that reloads a slice 300 ms after the last keystroke:

**List what the callback reads in `states`.** With `[]`, the callback from the first render keeps running and sees a stale `shopId`.

**The argument order differs from `useThrottle`.** Here the dependencies come second and the wait third.

useInterval

`useInterval` runs a callback every `delay` ms and clears the timer on unmount. Use it to poll a dashboard, a game state or a build log.

- callback (() => void | Promise<void>): Runs on every tick. The callback from the latest render is the one that runs.

- delay (number): Milliseconds between ticks. Changing it restarts the timer.

A Zone that refreshes its order list every 3 seconds:

**A new callback each render is fine.** The timer keeps running and picks up the latest callback; only a new `delay` restarts it.

**Ticks do not wait for each other.** An async callback that takes longer than `delay` overlaps with the next tick.

**For changes as they happen, declare a `.live()` slice.** Polling only reloads on a timer; a live slice sends each change to its subscribers.

useThrottle

`useThrottle` returns a callback that runs at once, then drops calls until `delay` ms pass. Use it for scroll, pointer, resize and drag handlers that fire too often.

- func ((...args) => unknown): Runs at once on the first call of each window.

- delay (number, default 200): Milliseconds during which later calls are dropped.

- deps (unknown[], default []): Extra dependencies. `func` and `delay` are already included.

Compared With useDebounce

When it runs

- useDebounce(callback, states = [], wait = 100) — Once, after the calls stop for `wait` ms.

- useThrottle(func, delay = 200, deps = []) — At once, then drops calls for `delay` ms.

A drag pad that updates its dot at most every 100 ms:

**The first call always runs.** Calls inside the window are dropped, not queued, so the last position of a fast drag may be skipped.

**Need the final value? Use `useDebounce`.** It runs once with the arguments of the last call.

useFetch / useFetchFn

These hooks turn a promise into `{ fulfilled, value }` inside a client component. Use them for a value that exists only in the browser, or when client code needs the value itself, not just to draw it.

- useFetch(promiseOrValue, { onError }): Follows the promise handed on each render; a plain value comes back at once, `fulfilled: true`.

- useFetchFn(factory, deps = [], { onError }): Calls `factory` inside `useMemo`, so a new request starts only when `deps` change.

Result And Option

- fulfilled (boolean): `true` once the current promise resolves; a rejected or newly handed one reads `false`.

- value (T | null): The current promise's resolved value, `null` until it resolves.

- onError ((err: string) => void): Option. Called with `"Error: <message>"` when the promise rejects.

The storage quota exists only in the browser, so this component is loaded through `lazy(…, { ssr: false })`:

**To draw a promise, reach for `<Load.Stream of={promise}>` first.** It streams real markup from the server, while `useFetch` waits in an effect and ships only the fallback in the first HTML.

**Do not call `fetch.*` on mount.** Load server data in the route and hand it down as a prop or an unawaited promise.

**The factory runs during render, on the server too.** A client component still renders once on the server, where `navigator.storage` is missing, so a browser-only call needs the `ssr: false` boundary shown above.

**It follows the promise handed on each render.** A new promise, or new `deps` on `useFetchFn`, resets the result to `fulfilled: false` until it resolves, and a result from an older promise is dropped.

**Never create the promise inline in render.** `useFetch(navigator.storage.estimate())` makes a new promise on every render, and each result renders again, so the request repeats in a loop. Pass a stable promise, such as a prop or a ref, or use `useFetchFn(factory, deps)`, which recreates it only when `deps` change.

useCamera

`useCamera` takes a photo or picks one from the library through the native runtime's camera plugin. In the native app it asks for the camera first and opens the app settings when the user has denied it; in a browser it picks from files.

- getPhoto(src = "prompt"): Takes or picks one photo as `{ dataUrl }`, an upright JPEG. `"prompt"` shows a camera-or-library sheet in the native app; cancel returns `undefined`.

- pickImage({ limit }): Picks several images from the library, each as `{ dataUrl }`.

- permissions: `{ camera }`. Read on mount in the native app, `"prompt"` until then.

- checkPermission(): Asks for the camera, and opens the app settings when it is denied.

Option

- promptLabels ({ header?, photo?, picture?, cancel? }, default {}): Text of the native picker sheet. A missing one comes from the `base` dictionary.

A button that takes a photo and previews it:

**Declare the permission.** `"camera"` in `native.permissions` adds the camera plugin and its usage texts. There is no package to install.

**The browser picks from files.** Outside the native app every source becomes the library, so the same call works on the web without a check of your own.

**The photo is read once.** The runtime hands over a file reference, and the hook turns it into a data URL and releases it, so there is nothing to clean up.

Native Plugins

Native permissions, and the plugins they add.

useGeoLocation

`useGeoLocation` reads the current position through the native runtime's geolocation plugin, and through `navigator.geolocation` in a browser. It sends the user to the app settings when the permission is denied.

- getPosition({ enableHighAccuracy }): Returns a `Position`. When the permission is denied, opens the settings and returns `undefined`.

- checkPermission(): Requests permission and returns `{ location, precise }`.

An app hook that finds where to center a map:

**Check for `undefined`.** It means the permission was denied and the settings screen is already open.

**The position is flat.** `latitude`, `longitude`, `accuracy`, `altitude`, `heading`, `speed` and `timestamp` sit on the value itself, not under `coords`.

**`precise` says whether the fix is exact.** `false` means the user granted approximate location only; the web answers `null`.

**Declare the permission.** `"location"` in `native.permissions` adds the geolocation plugin and its usage texts.

usePushNotification

Push lives in `@libs/util/webkit`, not `akanjs/webkit`. In a native shell the hook calls the runtime's push plugin (APNs on iOS, FCM on Android); in a browser it calls Firebase. Either way it hands back one `PushToken` shape.

- register(): Asks for permission, then returns a `PushToken`, or `undefined` when refused or unsupported.

- getToken(): Returns the token without asking. Registering shows no prompt, so check the permission first.

- getPermission(), requestPermission(): Read the permission state, or show the prompt and return the answer.

- isSupported(): Tells whether push can work in this runtime.

- onTokenChange(listener): Hands each token a native shell rotates to the listener. Returns the unsubscribe.

- initClickBridge(): Routes the browser's notification clicks. The hook runs it on mount; native taps need nothing.

Registering from a button, because `register()` may show a permission prompt:

**A `PushToken` is the address of one install.** It holds `token`, `platform` (`web` | `ios` | `android`), `provider` (`apns` | `fcm`) and `deviceId`, the installation id kept in the app's storage.

**A tap opens the push's `url`.** In a native shell the framework routes it from boot, the launching tap included; only a path inside the app is followed.

**`registerPushToken` comes with `libs/shared`.** Its notification store keeps the token on the signed-in user; `Notification.Zone.Initialize` keeps it current.

Client Registration

The full register flow, and where the token is stored.

Web Push

The Firebase settings `register()` needs in the browser.

usePurchase

`usePurchase` sells in-app products through the native runtime's iap plugin: StoreKit 2 on iOS, Play Billing on Android. Your server verifies every transaction before the app credits it, and a browser sells nothing.

Options

- platform ("ios" | "android" | "all"): The stores the app sells in. A native shell on another platform shows no products.

- productInfo ({ id, type: "consumable" | "nonConsumable" | "subscription" }[]): The store product ids and what each one is. A product not listed is finished without being consumed.

- url (string): The verification server's origin. It answers `POST <url>/billing/verifyBilling`.

- onPay ((transaction, verified) => void | Promise<void>): Credits a consumable or non-consumable. `verified` is the server's JSON answer.

- onSubscribe ((transaction, verified) => void | Promise<void>): The same, for a subscription.

- products: The store's `IapProduct`s for `productInfo`: title, `displayPrice`, price, currency and offers.

- isLoading: `true` until the products and the unfinished transactions are loaded.

- purchaseProduct(product, offerToken?): Opens the store sheet and answers `"purchased"`, `"pending"`, `"cancelled"` or `"unverified"`.

- restorePurchases(): Returns what the person owns now, finishing an Android purchase still unacknowledged on the way.

A buy button that credits coins once the server has accepted the purchase:

**Add the plugin to the native app.** The iap plugin is not a permission: name it with `native: { plugins: ["iap"] }` in `akan.config.ts`.

**The server gets one body: `{ data }`.** `data` is `{ platform, packageName, productId, receipt, transactionId }`. On iOS `receipt` is the transaction's signed JWS (no app receipt, no account id), on Android the purchase token with its package name. Any 2xx accepts it, and its JSON reaches `onPay` or `onSubscribe` as `verified`.

**Finished only once it is credited.** A transaction is finished after the server accepted it and your callback resolved. A refusal or a throw leaves it unfinished, and the store hands it over again: iOS at the next launch, while Google refunds an unacknowledged purchase after three days.

**Leftovers settle at mount.** The hook loads the unfinished transactions and listens for later ones (Ask to Buy, a pending payment), and one transaction is credited once even when it arrives twice.

useLocation / useHistory

The CSR router runs on these two hooks: one turns an href into route state, the other remembers where the user has been. They drive cached page transitions, scroll restoration and back/forward detection.

- useLocation({ rootRouteGuide }): Returns `getLocation(href)`, which matches an href against the route tree.

- getLocation(href): Gives `pathname`, `search`, `hash`, `params`, `searchParams` and the matched `pathRoute`.

- useHistory(locations): Keeps visited locations, the current index and each page's scroll position in a ref.

- setHistoryForward, setHistoryBack: Record a push, replace or pop, saving the scroll of the page being left.

- getPrevLocation, getCurrentLocation, getNextLocation: Read the entries around the current one. Back and forward are told apart with them.

- getScrollTop(location): The scroll position to restore: the saved one, or the `#hash` element's top.

The router sets them up once, starting from the page it opened on:

**App code navigates with `router`.** `router.push` and `router.back` from `akanjs/client` go through these hooks for you.

**A page with `cache` in its config is kept.** The history remembers its location, so going back shows it without rebuilding it.

Moving between routes from stores and event handlers.

LoginForm

`LoginForm` is what the shared store's `login` action takes. It says which account to load after sign-in, and where to send the user on success or failure.

- auth ("user" | "admin" | "public"): `"admin"` loads the admin account. Any other value loads the user with `getSelf`.

- redirect (string): Where `router.push` goes after the account loads.

- unauthorize (string): Where to go when loading the account fails.

- jwt (string | null): A token saved with `setAuth` before anything loads, for example right after sign-in.

A button that loads the signed-in user, then lands on the home page or goes back to sign-in:

**Pass `jwt` right after a sign-in call.** The admin store does this: it signs in, then calls `login` with `{ auth: "admin", jwt, redirect }`.

**`"public"` loads the same way as `"user"` today.** Only `"admin"` takes a different path.

## Code Examples

### apps/myapp/ui/Globe/index_.tsx

```tsx
"use client";
import { Loading } from "akanjs/ui";
import { lazy } from "akanjs/webkit";

export const Globe = lazy(() => import("./Globe"), {
  ssr: false,
  loading: () => <Loading.Skeleton className="h-96" />,
});
```

### apps/myapp/lib/product/Product.Util.tsx

```tsx
"use client";
import { st } from "@apps/myapp/client";
import { Input } from "akanjs/ui";
import { useDebounce } from "akanjs/webkit";
import { useState } from "react";

interface SearchProps {
  className?: string;
  shopId: string;
}
export const Search = ({ className, shopId }: SearchProps) => {
  const [text, setText] = useState("");
  const search = useDebounce(
    (query: string) => {
      void st.do.setQueryArgsOfProductInShop(shopId, query);
    },
    [shopId],
    300,
  );
  return (
    <Input
      className={className}
      value={text}
      onChange={(value) => {
        setText(value);
        search(value);
      }}
    />
  );
};
```

### apps/myapp/lib/order/Order.Zone.tsx

```tsx
"use client";
import { cnst, Order, st } from "@apps/myapp/client";
import type { ClientInit } from "akanjs/fetch";
import { Load } from "akanjs/ui";
import { useInterval } from "akanjs/webkit";

interface BoardProps {
  className?: string;
  init: ClientInit<"order", cnst.LightOrder>;
}
export const Board = ({ className, init }: BoardProps) => {
  useInterval(() => {
    void st.do.refreshOrderInShop();
  }, 3000);
  return (
    <Load.Units
      className={className}
      init={init}
      renderItem={(order: cnst.LightOrder) => (
        <Order.Unit.Card key={order.id} order={order} />
      )}
    />
  );
};
```

### apps/myapp/ui/DragPad.tsx

```tsx
"use client";
import { cn } from "akanjs/client";
import { useThrottle } from "akanjs/webkit";
import { useState } from "react";

interface DragPadProps {
  className?: string;
}
export const DragPad = ({ className }: DragPadProps) => {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const onMove = useThrottle((x: number, y: number) => {
    setPosition({ x, y });
  }, 100);
  return (
    <div
      className={cn("relative h-64", className)}
      onPointerMove={(e) => onMove(e.nativeEvent.offsetX, e.nativeEvent.offsetY)}
    >
      <span
        className="absolute size-3 rounded-full bg-primary"
        style={{ left: position.x, top: position.y }}
      />
    </div>
  );
};
```

### apps/myapp/ui/StorageUsage/StorageUsage.tsx

```tsx
"use client";
import { Loading } from "akanjs/ui";
import { useFetchFn } from "akanjs/webkit";

interface StorageUsageProps {
  className?: string;
}
const StorageUsage = ({ className }: StorageUsageProps) => {
  const { fulfilled, value } = useFetchFn(() => navigator.storage.estimate());
  return fulfilled ? (
    <progress className={className} max={value?.quota} value={value?.usage} />
  ) : (
    <Loading.Spin />
  );
};

export default StorageUsage;
```

### apps/myapp/ui/TakePhoto.tsx

```tsx
"use client";
import { usePage } from "@apps/myapp/client";
import { buttonRecipe } from "akanjs/ui";
import { useCamera } from "akanjs/webkit";
import { useState } from "react";

interface TakePhotoProps {
  className?: string;
}
export const TakePhoto = ({ className }: TakePhotoProps) => {
  const { l } = usePage();
  const { getPhoto } = useCamera();
  const [preview, setPreview] = useState<string | null>(null);
  return (
    <div className={className}>
      <button
        className={buttonRecipe()}
        onClick={async () => {
          const photo = await getPhoto("camera");
          setPreview(photo?.dataUrl ?? null);
        }}
        type="button"
      >
        {l("base.cameraPromptPicture")}
      </button>
      {preview ? <img src={preview} alt="" /> : null}
    </div>
  );
};
```

### apps/myapp/webkit/useMapCenter.tsx

```tsx
"use client";
import { useGeoLocation } from "akanjs/webkit";

export const useMapCenter = () => {
  const { getPosition } = useGeoLocation();
  const getCenter = async () => {
    const position = await getPosition();
    if (!position) return null;
    return { lat: position.latitude, lng: position.longitude };
  };
  return { getCenter };
};
```

### apps/myapp/ui/EnablePush.tsx

```tsx
"use client";
import { st } from "@apps/myapp/client";
import { type PushToken, usePushNotification } from "@libs/util/webkit";
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
        const pushToken: PushToken | undefined = await push.register();
        if (pushToken) await st.do.registerPushToken(pushToken);
      }}
      type="button"
    >
      {children}
    </button>
  );
};
```

### apps/myapp/ui/BuyCoins.tsx

```tsx
"use client";
import { st } from "@apps/myapp/client";
import { buttonRecipe } from "akanjs/ui";
import { usePurchase } from "akanjs/webkit/usePurchase";

interface BuyCoinsProps {
  className?: string;
}
export const BuyCoins = ({ className }: BuyCoinsProps) => {
  const { products, purchaseProduct } = usePurchase({
    platform: "all",
    productInfo: [{ id: "coins_100", type: "consumable" }],
    url: "https://billing.myapp.com",
    onPay: async () => {
      await st.do.refreshWallet();
    },
  });
  const [coins] = products;
  if (!coins) return null;
  return (
    <button
      className={buttonRecipe({ variant: "primary" }, className)}
      onClick={() => void purchaseProduct(coins)}
      type="button"
    >
      {coins.title} · {coins.displayPrice}
    </button>
  );
};
```

### pkgs/akanjs/webkit/useCsrValues.ts

```ts
const { getLocation } = useLocation({ rootRouteGuide });
const {
  history,
  setHistoryForward,
  setHistoryBack,
  getNextLocation,
  getCurrentLocation,
  getPrevLocation,
  getScrollTop,
} = useHistory([getLocation(window.location.href.replace(window.location.origin, ""))]);
```

### apps/myapp/ui/Continue.tsx

```tsx
"use client";
import { st, usePage } from "@apps/myapp/client";
import { buttonRecipe } from "akanjs/ui";
import type { LoginForm } from "akanjs/webkit";

const homeLogin: LoginForm = {
  auth: "user",
  redirect: "/",
  unauthorize: "/signin",
};

interface ContinueProps {
  className?: string;
}
export const Continue = ({ className }: ContinueProps) => {
  const { l } = usePage();
  return (
    <button
      className={buttonRecipe({}, className)}
      onClick={() => void st.do.login(homeLogin)}
      type="button"
    >
      {l.trans({ en: "Continue", ko: "계속하기" })}
    </button>
  );
};
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Respect server/client subpath boundaries when importing Akan APIs.

