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

Loads a component's code on demand. `ssr: false` skips server rendering.

Runs a callback once, after the calls stop for a while.

Runs a callback on a fixed interval and stops on unmount.

Runs a callback at once, then ignores calls for a while.

Tells a client component whether a promise has resolved, and its value.

Camera and location through the native runtime's plugins, with a browser fallback and the permission prompts.

Not in this module: the push hook lives in `@libs/util/webkit`.

In-app purchase on the native iap plugin, verified by your server. Imported from `akanjs/webkit/usePurchase`.

The CSR router's location parser and history stack.

The argument of the shared store's `login` action.

Locks `document.body` scrolling while `active`. Overlays share one count.

Calls `onEscape` on Escape while `active`. Only the topmost open surface gets the key.

Runs `effect` while the user is on this page and cleans it up when they leave. A page kept under the current one for a swipe back stays mounted, so a plain effect there keeps running.

`{ pathname, params, searchParams }` of this page. `st.use.searchParams()` follows the page on screen, so a page being prepared or kept under the current one reads its own here.

`"current" | "prev" | "pending" | "hidden"` — where this page stands in the CSR stack; always `current` outside one.

Show a pager and on-screen items to the in-page agent. `Load.Units` and `Load.View` call them.

Build robots rules (`disallow: "/admin/"` by default) and a list of sitemap entries.

Start the CSR (mobile) bundle, swap its route modules in place during dev, and hold its router state. The generated entry calls them.

Types: `"user" | "admin" | "public"`, and one on-screen item `{ id, label? }`.

`false` skips server rendering: the server sends `loading`, and the chunk loads after mount.

Wraps the component in its own Suspense boundary, so only this spot waits for the chunk.

The placeholder. It shows only with `ssr: false` or `suspense: true`.

Call

Server HTML

While the chunk loads

No option

The component itself.

The nearest boundary, usually the whole route, shows its fallback.

The component, sent after the shell in stream mode.

Only this spot shows `loading`.

Only `loading`, or nothing.

`loading` until the component mounts and its chunk arrives.

Runs once, with the arguments of the last call.

The dependency list of the inner `useCallback`: every prop and state the callback reads.

Milliseconds to wait after the last call.

Runs on every tick. The callback from the latest render is the one that runs.

Milliseconds between ticks. Changing it restarts the timer.

Runs at once on the first call of each window.

Milliseconds during which later calls are dropped.

Extra dependencies. `func` and `delay` are already included.

When it runs

Once, after the calls stop for `wait` ms.

At once, then drops calls for `delay` ms.

Follows the promise handed on each render; a plain value comes back at once, `fulfilled: true`.

Calls `factory` inside `useMemo`, so a new request starts only when `deps` change.

`true` once the current promise resolves; a rejected or newly handed one reads `false`.

The current promise's resolved value, `null` until it resolves.

Option. Called with `"Error: <message>"` when the promise rejects.

Takes or picks one photo as `{ dataUrl }`, an upright JPEG. `"prompt"` shows a camera-or-library sheet in the native app; cancel returns `undefined`.

Picks several images from the library, each as `{ dataUrl }`.

`{ camera }`. Read on mount in the native app, `"prompt"` until then.

Asks for the camera, and opens the app settings when it is denied.

Text of the native picker sheet. A missing one comes from the `base` dictionary.

Returns a `Position`. When the permission is denied, opens the settings and returns `undefined`.

Requests permission and returns `{ location, precise }`.

Asks for permission, then returns a `PushToken`, or `undefined` when refused or unsupported.

Returns the token without asking. Registering shows no prompt, so check the permission first.

Read the permission state, or show the prompt and return the answer.

Tells whether push can work in this runtime.

Hands each token a native shell rotates to the listener. Returns the unsubscribe.

Routes the browser's notification clicks. The hook runs it on mount; native taps need nothing.

The stores the app sells in. A native shell on another platform shows no products.

The store product ids and what each one is. A product not listed is finished without being consumed.

The verification server's origin. It answers `POST <url>/billing/verifyBilling`.

Credits a consumable or non-consumable. `verified` is the server's JSON answer.

The same, for a subscription.

The store's `IapProduct`s for `productInfo`: title, `displayPrice`, price, currency and offers.

`true` until the products and the unfinished transactions are loaded.

Opens the store sheet and answers `"purchased"`, `"pending"`, `"cancelled"` or `"unverified"`.

Returns what the person owns now, finishing an Android purchase still unacknowledged on the way.

Returns `getLocation(href)`, which matches an href against the route tree.

Gives `pathname`, `search`, `hash`, `params`, `searchParams` and the matched `pathRoute`.

Keeps visited locations, the current index and each page's scroll position in a ref.

Record a push, replace or pop, saving the scroll of the page being left.

Read the entries around the current one. Back and forward are told apart with them.

The scroll position to restore: the saved one, or the `#hash` element's top.

`"admin"` loads the admin account. Any other value loads the user with `getSelf`.

Where `router.push` goes after the account loads.

Where to go when loading the account fails.

A token saved with `setAuth` before anything loads, for example right after sign-in.

`akanjs/webkit` holds React hooks and helpers that run only in the browser or in the native app. Timers, lazy loading, promise state, device features and the CSR router state live here.

On This Page

Other Exports

Writing Your Own Hook

Where an app or lib puts its own browser-only hooks.

Lazy Loading

Which libraries and components to defer, with worked examples.

lazy

`lazy` is React's `lazy` with Akan's server switch. With `ssr: false` it skips server rendering, which is what a map, chart or 3D library that touches `window` on import needs.

What Each Call Renders

A globe that needs the browser, behind its lazy boundary file:

useDebounce

`useDebounce` returns a callback that runs only after the calls stop. A search box that queries once the user stops typing is the usual case; an image editor or a costly field update uses it while the user drags or types.

A search box that reloads a slice 300 ms after the last keystroke:

useInterval

`useInterval` runs a callback every `delay` ms and clears the timer on unmount. Use it to poll a dashboard, a game state or a build log.

A Zone that refreshes its order list every 3 seconds:

useThrottle

`useThrottle` returns a callback that runs at once, then drops calls until `delay` ms pass. Use it for scroll, pointer, resize and drag handlers that fire too often.

Compared With useDebounce

A drag pad that updates its dot at most every 100 ms:

useFetch / useFetchFn

These hooks turn a promise into `{ fulfilled, value }` inside a client component. Use them for a value that exists only in the browser, or when client code needs the value itself, not just to draw it.

Result And Option

useCamera

`useCamera` takes a photo or picks one from the library through the native runtime's camera plugin. In the native app it asks for the camera first and opens the app settings when the user has denied it; in a browser it picks from files.

Option

A button that takes a photo and previews it:

Native Plugins

The mobile target, its permissions, and the plugins they add.

useGeoLocation

`useGeoLocation` reads the current position through the native runtime's geolocation plugin, and through `navigator.geolocation` in a browser. It sends the user to the app settings when the permission is denied.

An app hook that finds where to center a map:

usePushNotification

Push lives in `@libs/util/webkit`, not `akanjs/webkit`. In a native shell the hook calls the runtime's push plugin (APNs on iOS, FCM on Android); in a browser it calls Firebase. Either way it hands back one `PushToken` shape.

Registering from a button, because `register()` may show a permission prompt:

Client Registration

The full register flow, and where the token is stored.

Web Push

The Firebase settings `register()` needs in the browser.

usePurchase

`usePurchase` sells in-app products through the native runtime's iap plugin: StoreKit 2 on iOS, Play Billing on Android. Your server verifies every transaction before the app credits it, and a browser sells nothing.

Options

A buy button that credits coins once the server has accepted the purchase:

useLocation / useHistory

The CSR router runs on these two hooks: one turns an href into route state, the other remembers where the user has been. They drive cached page transitions, scroll restoration and back/forward detection.

The router sets them up once, starting from the page it opened on:

Moving between routes from stores and event handlers.

LoginForm

`LoginForm` is what the shared store's `login` action takes. It says which account to load after sign-in, and where to send the user on success or failure.

A button that loads the signed-in user, then lands on the home page or goes back to sign-in:

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

