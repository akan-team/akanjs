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

The route chain: the one default export of every route file.

What `.config()` takes: transition, safe area, cache and SSR mode.

Moves between routes and adds the locale and basePath for you.

Joins class names and resolves Tailwind conflicts.

Prop types for components that draw one record or a list.

Runtime proxies without your app's types. Import the typed ones from `@apps/<app>/client`.

Read cookies, the auth token and the signed-in account.

Save or clear the auth token in fetch, the cookie and storage at once.

Platform, safe area, keyboard, haptics and scroll of the device.

The type of one font entry in `rootLayout().fonts([...])`.

Used by route loaders. App code never calls them.

Goes to a route and adds a history entry.

Goes to a route in place of the current history entry.

Goes back one entry. Browser only.

Goes back, or replaces with `href` when there is no history. Defaults to the index path.

Renders the current route again. Browser only.

On the server, answers with a redirect (307 by default). In the browser, navigates.

Shows the 404 page.

Switches the locale and stays on the same route. Browser only.

The current route without the locale and basePath. Browser only.

Adds the locale and basePath to a path when the app has a basePath.

The last push or replace as a promise. It rejects when the route refused to move.

required

The record, under the key named by the first type argument.

Classes from the caller.

Where the card links to.

Called with the record when it is clicked.

The slice the record came from.

`"edit"`, `"view"`, `"remove"` or an element, shown as row actions.

Columns to show when the record is drawn as a table row.

How to load the list: `page`, `limit`, `sort`, `insight` and so on.

Which filter to list with, as `{ queryKey, args }`.

The slice the list came from.

Called with the clicked record.

Every chain

One `[name]` segment of the path. A page declares every segment in its path.

One query key. Written as `[Type]`, it is a list.

A `PageConfig`: transition, safe area, cache and SSR mode.

The `<title>`, `<meta>` and `<link>` tags, written as JSX.

Shown while render awaits. It gets path values but no search values.

The last stage. Draws the route from the typed arguments.

Page only

Publishes the screen as an MCP prompt.

Layouts only

What the subtree shows when a page is not found.

What the subtree shows when rendering throws.

Root layout only

Fonts the build subsets and preloads.

The theme the page opens with.

The web app manifest.

Full-width web layout, or a centered phone column.

The connection-lost overlay.

Opens the websocket when the page loads.

Declared as

Arrives as

Note

A day.js date.

An `enumOf` class arrives as its value union.

Search only. Repeat the key: `?tags=a&tags=b`.

What the subtree shows when a page is not found. Replaces the legacy `NotFound` export.

What the subtree shows when rendering throws. Replaces the legacy `Error` export.

Fonts to subset and preload. Write the list inline; see `Font / createFont` below.

`system` follows the OS, `css` sets no `data-theme`, and any other name is set as is.

The PWA manifest, emitted as a data URL.

`mobile` centers the app in a column at most 600px wide, and fills a narrower screen.

Shows an overlay while the websocket is disconnected.

Connects the websocket on load. With `false`, call `fetch.instance.connect()` before subscribing.

by platform

Enter animation. Nested routes use `stack` on iOS, `scaleOut` on Android, `none` elsewhere.

on in the app, off on the web

Pads the page for the notch and the home bar.

Space kept for a fixed top bar, in px. `true` means 48.

Space kept for a fixed bottom bar, in px. `true` means 48.

on for nested routes on iOS

Allows swipe-back.

true for top-level routes

In the app shell, keeps the page's last render to show again on return.

`stream` sends the shell first; `block` waits for every section before the first byte.

background color

Color painted behind the top safe area.

Color painted behind the bottom safe area.

Keeps the route out of `akan build`. It still serves under `akan start`.

The prompt name: letters, digits, `_` and `-`, up to 64 characters.

The whole instruction the model receives. English, and never empty.

A required prompt argument. Give it a `desc`.

An optional prompt argument. A list is typed comma-separated.

When

prompts/get answers

The page renders

The description, one resource per `fetch.*` query, and a `Tools for this screen: …` line.

A required argument is missing

One message per argument, pointing at the `<model>List…` tool that finds the id.

Redirect or guard refusal, no token

A 401 challenge, so the client signs in first.

Redirect or guard refusal, with a token

The page answers not-found

Family name. It also names the `--font-<name>` variable and the `font-<name>` class.

One file per weight and style. `src` starts with `/` and is read from `public/`.

Applies this font to the whole app. One font per root layout at most.

Character sets to keep, such as `latin` or `ks-x-1001` for Korean.

Skips subsetting. The file is only converted to woff2.

`false` serves the file from `src` as is, with no build step and no preload.

Adds a preload link for each optimized file.

The CSS `font-display` value.

The CSS variable that holds the font family.

The class a `default` font puts on the app.

Returns `{ l, lang, path }`. Works in server components too.

Translates a dictionary key such as `project.name`.

Picks the text for the current locale, falling back to the default locale.

Renders a translation that contains HTML tags.

Same as `l`, without type-checking the key.

A toast from a dictionary key, 3 seconds by default. `info`, `warning`, `error`, `loading` too.

The translated error class. Keys look like `<module>.error.<key>`; the status is 400.

Subclasses with their own status: 400, 401, 403, 404 and 409.

Calls one generated or custom endpoint, such as `fetch.user(id)`.

Loads a slice's list and insight in a route, for a Zone's `init` prop.

Loads one record as `{ project, projectView }` or `{ project, projectEdit }`.

The client itself, with `setTimeout(ms)` and `connect()`.

The model's slices and endpoints. `store(sig.project, …)` is built from it.

Reads a cookie, on the server and in the browser.

Writes a cookie in the browser (`path=/`, `SameSite=None`, `Secure`). Does nothing on the server.

Deletes a cookie in the browser.

Reads a request header on the server. Empty in the browser.

The app's JWT from the cookie jar.

The JWT from client storage: localStorage on the web, Capacitor Preferences in the app.

The cookie name: `jwt:<appName>`.

Decodes the JWT into the account. Another app's or environment's token reads as signed out.

Gives `fetch` the token and saves it to the cookie and client storage.

Restores the token from `?jwt=` or the cookie at startup. Ignores another app's token.

Clears the token from `fetch`, the cookie and client storage, for a session you drop entirely.

Returns the loaded device. Throws before the framework has loaded it.

`"ios"`, `"android"` or `"web"`.

The locale the app opened with.

Notch and home-bar insets in px. 0 on the web.

True on a touch device or a mobile browser. `isMobileDevice()` is the same check.

Haptic feedback: `"light"`, `"medium"` (default), `"heavy"`, or a duration in ms.

Opens or closes the native keyboard.

Reports the keyboard height as it opens and closes.

Reads or sets the page's scroll position.

`akanjs/client` is what route files and client code import from the framework: the route chain, navigation, class merging, auth helpers, device access and font declarations.

Export

router

`router` moves between routes from stores, event handlers and utilities. Give it the app path: it adds the locale and basePath itself.

Method

A store action that opens the record it just created:

cn

`cn` is the only class-combining function. It joins class strings and resolves Tailwind conflicts, Akan's semantic tokens included.

A component that adds one conditional class and takes the caller's className last:

ModelProps / ModelsProps

`ModelProps` types a Unit that draws one record: `ModelProps<"user", cnst.LightUser>` puts the record under `user`. `ModelsProps` types a component that draws a list.

A Unit card that links to the record:

page / layout / rootLayout

Every route file has exactly one export: a chain that starts with `page()`, `layout()` or `rootLayout()` and ends with `.render()`. Each route setting is one stage of that chain.

`page()` goes in a page file: `<name>.tsx` or `_index.tsx`.

`layout()` goes in a `_layout.tsx`.

`rootLayout()` goes in the root `_layout.tsx` of the app or of a basePath.

Stages by chain

Stage

Available

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

