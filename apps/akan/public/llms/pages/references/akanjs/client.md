# akanjs/client

- Source: /references/akanjs/client
- Mirror: /llms/pages/references/akanjs/client.md
- Section: references
- Category: AkanJS Reference
- Priority: P0

## Headings

- akanjs/client (#akanjs-client)
- router (#router)
- cn (#cn)
- ModelProps / ModelsProps (#ModelProps / ModelsProps)
- page / layout / rootLayout (#page / layout / rootLayout)
- layout / rootLayout Stages (#layout / rootLayout stages)
- PageConfig (#PageConfig)
- prompt (#prompt)
- resolveRouteModule / isRouteDefinition (#resolveRouteModule / isRouteDefinition)
- Font / createFont (#Font / createFont)
- usePage / msg / Err (#usePage / msg / Err)
- fetch / sig (#fetch / sig)
- getCookie / setCookie / getAccount / getAuthToken (#getCookie / setCookie / getAccount / getAuthToken)
- setAuth / initAuth / resetAuth (#setAuth / initAuth / resetAuth)
- Device (#device)

## Content

akanjs/client

`akanjs/client` is what route files and client code import from the framework: the route chain, navigation, class merging, auth helpers, device access and font declarations.

Export

- page, layout, rootLayout: The route chain: the one default export of every route file.

- PageConfig: What `.config()` takes: transition, safe area, cache and SSR mode.

- router: Moves between routes and adds the locale and basePath for you.

- cn: Joins class names and resolves Tailwind conflicts.

- ModelProps, ModelsProps: Prop types for components that draw one record or a list.

- usePage, msg, Err, fetch, sig: Runtime proxies without your app's types. Import the typed ones from `@apps/<app>/client`.

- getCookie, getAccount, getAuthToken: Read cookies, the auth token and the signed-in account.

- setAuth, initAuth, resetAuth: Save or clear the auth token in fetch, the cookie and storage at once.

- resolveServerUrl: Puts a stored `/api/…` URL on the server's origin when a CSR page is served elsewhere, such as in a desktop app.

- Device: Platform, safe area, keyboard, haptics and scroll of the device.

- Font: The type of one font entry in `rootLayout().fonts([...])`.

- resolveRouteModule, isRouteDefinition: Used by route loaders. App code never calls them.

**Most of it runs on the server too.** `page()`, `cn`, `getCookie` and `getAccount` work in server components; `router.back()`, `setCookie` and `Device` need the browser.

**Typed helpers come from your app.** `usePage`, `fetch`, `msg`, `Err` and `sig` here do not know your app's types. Import them from `@apps/<app>/client` to get your own dictionary keys and endpoints.

router

`router` moves between routes from stores, event handlers and utilities. Give it the app path: it adds the locale and basePath itself.

Method

- push(href, { scrollToTop }): Goes to a route and adds a history entry. Browser only; on the server, use `redirect()`.

- replace(href): Goes to a route in place of the current history entry. Browser only; on the server, use `redirect()`.

- back(): Goes back one entry. Browser only.

- backOrFallback(href?): Goes back, or replaces with `href` when there is no history. Defaults to the index path.

- refresh(): Renders the current route again. Browser only.

- redirect(href, { method, status }): On the server, answers with a redirect (307 by default). In the browser, navigates.

- notFound(): Shows the 404 page.

- setLang(lang): Switches the locale and stays on the same route. Browser only.

- getPath(): The current route without the locale and basePath. Browser only.

- getPrefixedPath(path): Adds the locale and basePath to a path when the app has a basePath.

- navigation(): The last push or replace as a promise. It rejects when the route refused to move.

A store action that opens the record it just created:

**Paths are app-internal.** Write `/profile`, not `/en/profile`. A path that already starts with the locale is accepted too.

**Redirect from a page.** In a page's render, `router.redirect("/signin")` answers the request with a 307 redirect.

cn

`cn` is the only class-combining function. It joins class strings and resolves Tailwind conflicts, Akan's semantic tokens included.

A component that adds one conditional class and takes the caller's className last:

**Only for a condition or a merge.** A fixed class string stays a plain string. Reach for `cn` when a part is conditional or the caller passes `className`.

**The caller goes last.** The last class wins a conflict, so the incoming `className` can override the defaults.

**Tokens resolve too.** `cn("bg-primary", "bg-open")` keeps only `bg-open`, because the semantic color and radius tokens are registered.

**No object syntax.** Write `cond && "x"`, not `{ x: cond }`. `clsx` and a raw `twMerge` are not used.

ModelProps / ModelsProps

`ModelProps` types a Unit that draws one record: `ModelProps<"user", cnst.LightUser>` puts the record under `user`. `ModelsProps` types a component that draws a list.

- user (cnst.LightUser): The record, under the key named by the first type argument.

  - required

- className (string): Classes from the caller.

- href (string): Where the card links to.

- onClick ((model) => unknown): Called with the record when it is clicked.

- slice (SliceMeta): The slice the record came from.

- actions (DataAction[]): `"edit"`, `"view"`, `"remove"` or an element, shown as row actions.

- columns (DataColumn[]): Columns to show when the record is drawn as a table row.

- init (FetchInitForm): How to load the list: `page`, `limit`, `sort`, `insight` and so on.

- query (QuerySetting): Which filter to list with, as `{ queryKey, args }`.

- slice (SliceMeta): The slice the list came from.

- onClickItem ((model) => unknown): Called with the clicked record.

A Unit card that links to the record:

**Units and Views take the model.** They are server components, so a `cnst` model prop never has to cross to the browser.

**Utils and Zones take an id.** They are client components: take `userId: string` and read the model from the store. A current Zone types its `init` prop with `ClientInit` from `akanjs/fetch`.

page / layout / rootLayout

Every route file has exactly one export: a chain that starts with `page()`, `layout()` or `rootLayout()` and ends with `.render()`. Each route setting is one stage of that chain.

`page()` goes in a page file: `<name>.tsx` or `_index.tsx`.

`layout()` goes in a `_layout.tsx`.

`rootLayout()` goes in the root `_layout.tsx` of the app or of a basePath.

Stages by chain

Stage

page

layout

rootLayout

- Every chain

  - .param(name, Type): One `[name]` segment of the path. A page declares every segment in its path.

  - .search(name, Type): One query key. Written as `[Type]`, it is a list.

  - .config(options): A `PageConfig`: transition, safe area, cache and SSR mode.

  - .head(node | fn): The `<title>`, `<meta>` and `<link>` tags, written as JSX.

  - .loading(fn): Shown while render awaits. It gets path values but no search values.

  - .render(fn): The last stage. Draws the route from the typed arguments.

- Page only

  - .prompt(name, desc): Publishes the screen as an MCP prompt.

- Layouts only

  - .notFound(fn): What the subtree shows when a page is not found.

  - .error(fn): What the subtree shows when rendering throws.

- Root layout only

  - .fonts(Font[]): Fonts the build subsets and preloads.

  - .theme(name): The theme the page opens with.

  - .manifest(obj): The web app manifest.

  - .layoutStyle(…): Full-width web layout, or a centered phone column.

  - .reconnect(on?): The connection-lost overlay.

  - .wsConnect(on?): Opens the websocket when the page loads.

Available

Not available

What render receives

Each declared argument arrives already typed:

Declared as

Arrives as

Note

- ID · String — string

- Int · Float — number

- Boolean — boolean

- Date — Dayjs — A day.js date.

- cnst.TicketStatus — "open" | … — An `enumOf` class arrives as its value union.

- [String] — string[] — Search only. Repeat the key: `?tags=a&tags=b`.

A page that reads one path segment and two query keys:

**Every search value is optional.** A missing or unreadable one arrives as `undefined`. A path value that fails its type answers not-found.

**lang is always there.** Every route sits under the locale segment, so every stage receives `lang` as a string. Never declare it with `.param()`.

**Render is not a React component.** Call `usePage()`, `getSelf()` and `fetch.*` inside it, and make it `async` only when it awaits.

**Names are string literals.** A `[projectId]` folder needs `.param("projectId", ID)` with that literal name; the same goes for `.prompt("name", …)`.

**A route file exports only its chain.** A named export beside the chain, or `page()` in a `_layout.tsx`, breaks the build.

layout / rootLayout Stages

`layout()` takes every `page()` stage except `.prompt()`, and its render also receives `children`. It may declare only the `[x]` segments it reads.

layout() adds

- .notFound(fn) (({ pathname, params, searchParams }) => node): What the subtree shows when a page is not found. Replaces the legacy `NotFound` export.

- .error(fn) (({ error, digest, pathname }) => node): What the subtree shows when rendering throws. Replaces the legacy `Error` export.

rootLayout() adds

These are app-wide settings, so only the root `_layout.tsx` of an app or a basePath sets them.

- .fonts(fonts) (Font[]): Fonts to subset and preload. Write the list inline; see `Font / createFont` below.

- .theme(theme) ("system" | "css" | string): `system` follows the OS, `css` sets no `data-theme`, and any other name is set as is.

- .manifest(manifest) (WebAppManifest): The PWA manifest, emitted as a data URL.

- .layoutStyle(style) ("web" | "mobile", default "web"): `mobile` centers the app in a column at most 600px wide, and fills a narrower screen.

- .reconnect(on = true) (boolean, default operationMode === "local"): Shows an overlay while the websocket is disconnected.

- .wsConnect(on = true) (boolean, default true): Connects the websocket on load. With `false`, call `fetch.instance.connect()` before subscribing.

An app's root layout. `import "./styles.css";` stays its first line:

A nested layout that reads one segment and draws a not-found screen for its subtree:

**A theme cookie wins.** Once the user picks a theme, the `theme` cookie overrides `.theme()` on the next load.

**No argument means on.** `.reconnect()` and `.wsConnect()` with no argument are `true`.

PageConfig

`PageConfig` is the object `.config()` takes. It sets how a route enters, how much room it keeps for the device edges, and how the server sends it.

- transition ("none" | "fade" | "bottomUp" | "stack" | "scaleOut", default by platform): Enter animation. Nested routes use `stack` on iOS, `scaleOut` on Android, `none` elsewhere.

- safeArea (boolean | "top" | "bottom" | { top, bottom, android }, default on in the app, off on the web): Pads the page for the notch and the home bar.

- topInset (number | boolean, default 0): Space kept for a fixed top bar, in px. `true` means 48.

- bottomInset (number | boolean, default 0): Space kept for a fixed bottom bar, in px. `true` means 48.

- gesture (boolean, default on for nested routes on iOS): Allows swipe-back.

- cache (boolean, default true for top-level routes): In the app shell, keeps the page's last render to show again on return.

- ssr ("stream" | "block", default "stream"): `stream` sends the shell first; `block` waits for every section before the first byte.

- topSafeAreaColor (string, default background color): Color painted behind the top safe area.

- bottomSafeAreaColor (string, default background color): Color painted behind the bottom safe area.

- devOnly (boolean, default false): Keeps the route out of `akan build`. It still serves under `akan start`.

A playground page that slides up, pads for the notch, and never ships to production:

**Configs merge down the tree.** A layout's config applies to every route under it, and the page's own value wins.

**devOnly is a literal.** Write `true` or `false` directly. On a `_layout.tsx` it drops every route under that folder.

**block trades speed for a clean error page.** With `ssr: "block"` the Loading fallback never reaches the browser. Use it only where SEO and first paint do not matter.

prompt

`.prompt(name, description)` publishes a page as an MCP prompt, so an agent can open the same screen a person sees. The description is the whole instruction the model gets, in English.

Declaration

- .prompt(name, …): The prompt name: letters, digits, `_` and `-`, up to 64 characters.

- .prompt(…, description): The whole instruction the model receives. English, and never empty.

- .param(name, Type, { desc }): A required prompt argument. Give it a `desc`.

- .search(name, Type, { desc }): An optional prompt argument. A list is typed comma-separated.

A ticket board published as a prompt:

What an agent gets back

`prompts/get` runs the page body under the caller's token and renders nothing. What it answers depends on how the body went:

When

prompts/get answers

- The page renders — The description, one resource per `fetch.*` query, and a `Tools for this screen: …` line.

- A required argument is missing — One message per argument, pointing at the `<model>List…` tool that finds the id.

- Redirect or guard refusal, no token — A 401 challenge, so the client signs in first.

- Redirect or guard refusal, with a token — `This screen is not available to the signed-in account.`

- The page answers not-found — `No screen exists for these arguments.`

**Data is masked.** Each resource is masked by its endpoint's return model and addressed by an `akan://` uri. One document travels once, however many queries read it.

**Only lists are cut.** They are trimmed to `promptBudget` characters, 60,000 by default. Change it with `option.setMcp({ promptBudget })` or `AKAN_MCP_PROMPT_BUDGET`.

**Tools are the screen's own.** The last line names the published tools of the modules the page fetched from, limited to what this caller may see.

**A prompt is always a page.** `endpoint()` has no `prompt()` kind, and `Msg` is not public.

resolveRouteModule / isRouteDefinition

Every route loader reads route files through these two functions. App code never calls them; you need them only when you write a tool that loads route files itself.

Function

- resolveRouteModule(mod, key, { kind, pattern }): Unfolds a chain's default export into the named-export shape. A legacy module passes through.

- isRouteDefinition(value): True when the value is a `page()`, `layout()` or `rootLayout()` chain.

A script that loads one route file the way the server does:

**It returns both shapes.** `module` is what loaders read; `definition` is set only for a chain module.

**It checks the file.** A named export beside the chain is always rejected. `kind` also rejects a chain in the wrong kind of file, and `pattern` rejects a `.param()` that does not match the path.

Font / createFont

`Font` is the type of one entry in `rootLayout().fonts([...])`. The build subsets each font, serves it from `/_akan/fonts`, and preloads it.

- name (string): Family name. It also names the `--font-<name>` variable and the `font-<name>` class.

- paths ({ src, weight, style? }[]): One file per weight and style. `src` starts with `/` and is read from `public/`.

- default (boolean): Applies this font to the whole app. One font per root layout at most.

- subsets (string[], default ["latin"]): Character sets to keep, such as `latin` or `ks-x-1001` for Korean.

- subset (false): Skips subsetting. The file is only converted to woff2.

- optimize (boolean, default true): `false` serves the file from `src` as is, with no build step and no preload.

- preload (boolean, default true): Adds a preload link for each optimized file.

- display ("auto" | "block" | "swap" | "fallback" | "optional", default "swap"): The CSS `font-display` value.

- variable (string, default --font-<name>): The CSS variable that holds the font family.

- className (string, default font-<name>): The class a `default` font puts on the app.

A Korean font in two weights, applied to the whole app:

**Paths are public URLs.** `/fonts/NotoSansKR-Regular.woff2` is read from `apps/myapp/public/fonts/`. A relative path such as `./font.woff2` is not found.

**createFont is a shim.** `createFont` and the named factories `Noto_Sans_KR`, `Inter`, `Roboto` and `Nanum_Gothic_Coding` return `null`. They keep old font-factory imports loading; they declare nothing.

**Write the font list inline.** The build reads `.fonts([...])` from the source without running it. A list kept in a variable is not subset, and every `/_akan/fonts` request for it returns 404.

usePage / msg / Err

Translation, toast messages and the error class. Import them from your app's `@apps/<app>/client`, where the keys are typed by your dictionary.

Call

- usePage(): Returns `{ l, lang, path }`. Works in server components too.

- l(key, params?): Translates a dictionary key such as `project.name`.

- l.trans({ en, ko }): Picks the text for the current locale, falling back to the default locale.

- l.rich(key): Renders a translation that contains HTML tags.

- l._(key): Same as `l`, without type-checking the key.

- msg.success(key, { key, duration, data }): A toast from a dictionary key, 3 seconds by default. `info`, `warning`, `error`, `loading` too.

- new Err(key, data?): The translated error class. Keys look like `<module>.error.<key>`; the status is 400.

- Err.BadRequest, Err.Unauthorized, Err.Forbidden, Err.NotFound, Err.Conflict: Subclasses with their own status: 400, 401, 403, 404 and 409.

`usePage()` works in a server View, so translated text never needs a client component:

In a store, `msg` reports a failed check and confirms success:

**Validation reports, never throws.** On the client, call `msg.error(key)` and return early.

**A store action does not catch.** A failed `fetch.*` rejects with the server's `Err`, and the framework shows it as a toast.

**One toast per key.** `option.key` replaces an earlier toast with the same key, and `data` fills the translation's parameters.

fetch / sig

`fetch` calls the server's endpoints and slices; `sig` describes each model's signal so a store can be built from it. Import both from your app: `@apps/<app>/client` in UI, `../useClient` inside `lib/`.

Member

- fetch.<endpoint>(...args): Calls one generated or custom endpoint, such as `fetch.user(id)`.

- fetch.init<Model><Suffix>(...args): Loads a slice's list and insight in a route, for a Zone's `init` prop.

- fetch.view<Model>(id), fetch.edit<Model>(id): Loads one record as `{ project, projectView }` or `{ project, projectEdit }`.

- fetch.instance: The client itself, with `setTimeout(ms)` and `connect()`.

- sig.<model>: The model's slices and endpoints. `store(sig.project, …)` is built from it.

A store built from `sig.project` that archives a project and updates its list:

**Typed only in your app.** The `akanjs/client` exports forward to the runtime your app client registered, without its types.

**Load in the route.** A client component reads `st.use.*` and writes `st.do.*`; the route loads data and passes it down as `init` or `view`.

**Every call carries the token.** After `setAuth`, each call sends the JWT.

getCookie / setCookie / getAccount / getAuthToken

Read cookies and the signed-in account from any component, server or browser. The auth token sits in a cookie named per app.

- getCookie(key): Reads a cookie, on the server and in the browser.

- setCookie(key, value, options?): Writes a cookie in the browser (`path=/`, `SameSite=None`, `Secure`). Does nothing on the server.

- removeCookie(key): Deletes a cookie in the browser.

- getHeader(key): Reads a request header on the server. Empty in the browser.

- getAuthToken(): The app's JWT from the cookie jar.

- getStoredAuthToken(): The JWT from client storage: localStorage on the web, the native runtime's secure storage (iOS Keychain, Android Keystore) in the app.

- authTokenKey(): The cookie name: `jwt:<appName>`.

- getAccount<T>(): Decodes the JWT into the account. Another app's or environment's token reads as signed out.

`libs/shared` builds `getSelf()` on top of `getAccount()`. Trimmed, it reads:

**Why the key is per app.** Cookies carry no port, so two apps on one host would share a single `jwt` cookie. Read it with `getAuthToken()`, never by name.

**getAccount reads what the server honors.** It decodes the app's cookie or an `Authorization: Bearer` header, the same two credentials the server accepts.

setAuth / initAuth / resetAuth

These three keep `fetch`, the cookie and client storage holding the same token. Call `setAuth` after sign-in; the framework already calls `initAuth` at startup.

- setAuth({ jwt }): Gives `fetch` the token and saves it to the cookie and client storage.

- initAuth({ jwt? }): Restores the token from `?jwt=` or the cookie at startup. Ignores another app's token.

- resetAuth(): Clears the token from `fetch`, the cookie and client storage, for a session you drop entirely.

Refreshing the token in `libs/shared` is one call to the server and one `setAuth`:

**Sign-out swaps the token too.** The `libs/shared` stores call `setAuth` after sign-in, and after sign-out with the token `fetch.signoutUser()` returns.

**A foreign token is dropped.** `initAuth` ignores a token minted for another app or environment, and clears it when it came from the cookie.

Device

`Device` wraps what the native runtime exposes on a phone: platform, safe area, keyboard, haptics and scroll. The framework loads it once in the browser; read it with `Device.getDevice()`.

- Device.getDevice(): Returns the loaded device. Throws before the framework has loaded it.

- info.platform: `"ios"`, `"android"` or `"web"`.

- lang: The locale the app opened with.

- topSafeArea, bottomSafeArea: Notch and home-bar insets in px. 0 on the web.

- isMobile: True on a touch device or a mobile browser. `isMobileDevice()` is the same check.

- vibrate(type?): Haptic feedback: `"light"`, `"medium"` (default), `"heavy"`, or a duration in ms.

- showKeyboard(), hideKeyboard(): Opens or closes the native keyboard.

- listenKeyboardChanged(fn), unlistenKeyboardChanged(): Reports the keyboard height as it opens and closes.

- getScrollTop(), setScrollTop(y): Reads or sets the page's scroll position.

A button that vibrates lightly before it acts:

**Browser only.** On the server and before boot, `Device.getDevice()` throws. Call it from an event handler or an effect.

**The web is a safe no-op.** On the web, keyboard and haptics do nothing and the insets are 0, so no platform check is needed.

## Code Examples

### apps/myapp/lib/project/project.store.ts

```ts
import { router } from "akanjs/client";
import { store } from "akanjs/store";

import { fetch, sig } from "../useClient";

export class ProjectStore extends store(sig.project, () => ({
  // state
})) {
  async duplicateProject(projectId: string) {
    const project = await fetch.duplicateProject(projectId);
    router.push(`/project/${project.id}`); // → /en/project/<id>
  }
}
```

### apps/myapp/ui/Chip.tsx

```tsx
import { cn } from "akanjs/client";
import type { ReactNode } from "react";

interface ChipProps {
  className?: string;
  isActive?: boolean;
  children: ReactNode;
}
export const Chip = ({ className, isActive = false, children }: ChipProps) => {
  return (
    <span
      className={cn(
        "rounded-field px-3 py-1",
        isActive && "bg-primary text-primary-foreground",
        className,
      )}
    >
      {children}
    </span>
  );
};
```

### apps/myapp/lib/user/User.Unit.tsx

```tsx
import type { cnst } from "@apps/myapp/client";
import type { ModelProps } from "akanjs/client";
import { Link } from "akanjs/ui";

export const Card = ({ user, href }: ModelProps<"user", cnst.LightUser>) => {
  return (
    <Link href={href ?? `/user/${user.id}`}>
      {user.nickname}
    </Link>
  );
};
```

### apps/myapp/page/project/[projectId]/_index.tsx

```tsx
import { fetch, Project } from "@apps/myapp/client";
import { ID } from "akanjs/base";
import { page } from "akanjs/client";
import { Loading } from "akanjs/ui";

export default page()
  .param("projectId", ID)
  .search("tab", String)
  .search("tags", [String])
  .config({ transition: "stack" })
  .head(({ projectId }) => <title>{projectId}</title>)
  .loading(() => <Loading.Skeleton active />)
  .render(async ({ projectId, tab, tags }) => {
    const { projectView } = await fetch.viewProject(projectId);
    return (
      <Project.Zone.View view={projectView} tab={tab} tags={tags ?? []} />
    );
  });
```

### apps/myapp/page/_layout.tsx

```tsx
import "./styles.css";
import { rootLayout } from "akanjs/client";

export default rootLayout()
  .fonts([
    {
      name: "notosans",
      default: true,
      paths: [{ src: "/fonts/NotoSansKR.woff2", weight: 400 }],
    },
  ])
  .theme("dark")
  .layoutStyle("web")
  .head(<link rel="icon" href="/favicon.ico" />)
  .render(({ children }) => children);
```

### apps/myapp/page/org/[orgId]/_layout.tsx

```tsx
import { Org } from "@apps/myapp/client";
import { ID } from "akanjs/base";
import { layout } from "akanjs/client";

export default layout()
  .param("orgId", ID)
  .notFound(({ pathname }) => <p>{pathname}</p>)
  .render(({ orgId, children }) => (
    <Org.Zone.Shell orgId={orgId}>{children}</Org.Zone.Shell>
  ));
```

### apps/myapp/page/playground.tsx

```tsx
import { Playground } from "@apps/myapp/ui";
import { page } from "akanjs/client";

export default page()
  .config({ transition: "bottomUp", safeArea: true, devOnly: true })
  .render(() => <Playground />);
```

### apps/myapp/page/project/[projectId]/board.tsx

```tsx
import { cnst, fetch, Ticket } from "@apps/myapp/client";
import { ID } from "akanjs/base";
import { page } from "akanjs/client";

export default page()
  .param("projectId", ID, { desc: "The project to brief." })
  .search("status", cnst.TicketStatus, { desc: "Only this status." })
  .prompt("briefProjectTickets", "Brief the ticket board of one project.")
  .render(async ({ projectId, status }) => {
    const { ticketInitInProject } = await fetch.initTicketInProject(
      projectId,
      status,
    );
    return <Ticket.Zone.Board init={ticketInitInProject} />;
  });
```

### apps/myapp/script/inspectRoute.ts

```ts
import { isRouteDefinition, resolveRouteModule } from "akanjs/client";

const key = "project/[projectId]/_index.tsx";
const mod = await import(`../page/${key}`);
const { module, definition } = resolveRouteModule(mod, key, {
  kind: "page",
  pattern: "/:lang/project/:projectId",
});
isRouteDefinition(mod.default); // true: this file exports a chain
module.default; // the render every loader reads
```

### apps/myapp/page/_layout.tsx

```tsx
import "./styles.css";
import { rootLayout } from "akanjs/client";

export default rootLayout()
  .fonts([
    {
      name: "notosans",
      default: true,
      paths: [
        { src: "/fonts/NotoSansKR-Regular.woff2", weight: 400 },
        { src: "/fonts/NotoSansKR-Bold.woff2", weight: 700 },
      ],
      subsets: ["latin", "ks-x-1001"],
    },
  ])
  .render(({ children }) => children);
```

### apps/myapp/lib/project/Project.View.tsx

```tsx
import { type cnst, usePage } from "@apps/myapp/client";

interface GeneralProps {
  project: cnst.Project;
}
export const General = ({ project }: GeneralProps) => {
  const { l } = usePage();
  return (
    <section>
      <h3>{l("project.name")}</h3>
      <p>{project.name}</p>
      <p>{l.trans({ en: "Read only", ko: "읽기 전용" })}</p>
    </section>
  );
};
```

### apps/myapp/lib/project/project.store.ts

```ts
import { store } from "akanjs/store";

import { fetch, msg, sig } from "../useClient";

export class ProjectStore extends store(sig.project, () => ({
  // state
})) {
  async inviteMember(projectId: string, email: string) {
    if (!email.includes("@")) {
      msg.error("project.error.invalidEmail");
      return;
    }
    await fetch.inviteMember(projectId, email);
    msg.success("project.inviteMemberSuccess", { duration: 5 });
  }
}
```

### apps/myapp/lib/project/project.store.ts

```ts
import { store } from "akanjs/store";

import { fetch, sig } from "../useClient";

export class ProjectStore extends store(sig.project, () => ({
  // state
})) {
  async archiveProject(projectId: string) {
    const project = await fetch.archiveProject(projectId);
    const { projectList } = this.get();
    this.set({ projectList: projectList.set(project).save() });
  }
}
```

### libs/shared/webkit/cookie.ts

```ts
import type { Self } from "@libs/shared/common";
import { getAccount, router } from "akanjs/client";

export const getSelf = (option?: { unauthorize: string }) => {
  // undefined when signed out, or when the token belongs to another app
  const self = getAccount<{ self?: Self }>().self;
  if (!self && option) router.redirect(option.unauthorize);
  return self;
};
```

### libs/shared/ui/Auth/tokenRefresh.util.ts

```ts
import { fetch } from "@libs/shared/client";
import { setAuth } from "akanjs/client";

export const refreshToken = async () => {
  const accessToken = await fetch.refreshJwt(null);
  setAuth({ jwt: accessToken.jwt });
};
```

### apps/myapp/ui/HapticButton.tsx

```tsx
"use client";
import { Device } from "akanjs/client";
import type { ReactNode } from "react";

interface HapticButtonProps {
  onClick: () => void;
  children: ReactNode;
}
export const HapticButton = ({ onClick, children }: HapticButtonProps) => {
  return (
    <button
      type="button"
      onClick={() => {
        void Device.getDevice().vibrate("light");
        onClick();
      }}
    >
      {children}
    </button>
  );
};
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Respect server/client subpath boundaries when importing Akan APIs.

