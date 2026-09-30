# Format & Lint

- Source: /conventions/workspace/lint
- Mirror: /llms/pages/conventions/workspace/lint.md
- Section: conventions
- Category: Workspace
- Priority: P1

## Headings

- Lint Is Not About Style (#silent-failures)
- Six You Will Meet First (#fix-errors)
- Every Rule That Breaks The Build (#every-rule)
- Suppressing A Rule (#suppression)
- Commands And Configuration (#commands)

## Content

Format & Lint

Why:

Fix:

Rule

Scope:

Level:

module files, `page/**`, barrels

`apps/**` `libs/**`, except tests, `*.constant.ts`, `common/**`, `env/**`

A thrown `Error`. Throw `new Err("<module>.error.<key>")` and register the key.

`logger.log()` reads like its own level but emits at `info`. Write `.info()`.

`ui/` `webkit/` `common/` `page/`, `*.constant.ts` `*.store.ts`, module components

A `//!` or `/*!` comment survives minification and ships. Use `// FIXME:` instead.

`apps/**` `libs/**`, except tests

An `app://` page on iOS, macOS and Linux keeps no cookies, so `document.cookie` reads empty in the app. Use `getCookie` / `setCookie` / `removeCookie` from `akanjs/client`.

`localStorage` / `sessionStorage` bypass the store akanjs picks per platform and throw during SSR. Use `storage` from `akanjs/client`, or `secretStorage` for credentials.

`apps/**` `libs/**` outside `webkit/`, except tests — a warning

`navigator.share`, `navigator.serviceWorker`, `Notification.*`, `navigator.geolocation` and `navigator.vibrate` are missing in some app WebViews. Keep them in a `webkit/` hook that branches on `isNativeApp()`.

`st.do.<action>()` is typed `void`. Write the value into state with `this.set({ ... })`.

every `.tsx` in `apps/` `libs/`

An arrow that only forwards to a form setter. Pass `st.do.setXOnY` by reference.

`"use client"` files and `*.store.ts`

`fetch.init<Model><Suffix>` or `fetch.get<Model>Init<Suffix>` on the client. Load it in the route.

A `cnst` model as a prop type of an always-client file. Take an id instead.

An endpoint that reuses a generated CRUD name, such as `create<Model>` or `view<Model>`.

A `#private` method. Use a TypeScript `private _method()` instead.

A React hook or `st` imported into a server component. Move the interaction out.

`"use client"` on a file that is always a server component. Split the interaction out.

A function passed as a prop from a server component. Only `loader`, `render` and `of` take one.

An async `ui/` component breaks under a client parent. Await in the page instead.

An `@apps`/`@libs` path past `<name>/<entry>`, `../../` in a module file, or `../` in its `.tsx`.

A third-party package. Re-export it through a lib's `common/`, `webkit/` or `ui/` first.

`ui/` `webkit/` `page/` `common/`, `*.store.ts` `*.constant.ts`, every `.tsx`

Imports a `*.document`/`*.dictionary`/`*.service`/`*.signal` file, `srvkit/` or a server entry.

Imports a `*.store`, a module component, `ui/`, `webkit/`, a client entry or a client barrel.

Lint Is Not About Style

Most rules here catch code that compiles, runs and looks right, yet quietly does nothing. Only the linter notices.

Say you write `bg-blue-500` on a badge. The page renders and the class is in the DOM, but the badge has no colour, and neither the build nor the browser complains.

- A Class With No CSS — `className="bg-blue-500"` — The raw palette is stripped from the stylesheet, so the badge renders with no colour.

- A Field No Agent Can Reach — `onChange={(v) => st.do.setTitleOnTicket(v)}` — An arrow around the setter hides it, so the field publishes no agent tool.

- A Return Value Nobody Gets — `return ticket;` — Store actions are dispatched as `void`, so the caller never sees the value.

- A Note Every Visitor Downloads — `//! remove before launch` — A bang comment survives minification and ships in the browser bundle.

Words used on this page

Term

- Biome: The formatter and linter this workspace uses. `akan lint` runs it for you.

- grit plugin: A lint rule written in GritQL for Akan and run by Biome. There are 25.

- diagnostic: One finding Biome prints: the file, the line, the rule name and a message.

- safe fix: A fix Biome applies by itself, such as sorting classes or dropping an unused import.

- colour vocabulary: The closed set of semantic colour tokens. The raw Tailwind palette is not in it.

- scope: The paths a rule looks at. A file outside a rule's scope never trips it.

**`akan lint` rewrites files.** `--fix` is on by default, so run it only on the app or lib you touched (`akan lint myapp`). A repo-wide run in a dirty tree edits work nobody asked it to; use `bunx biome check "<path>"` when you only want a report.

Six You Will Meet First

Each diagnostic prints the name of the rule that fired. Find that name below; the fix is mechanical once you know it.

- raw-palette — no-raw-palette-class — A Colour Outside The Vocabulary — The raw Tailwind palette is stripped from the compiled stylesheet, so `bg-blue-500` has no CSS behind it. The badge renders unstyled while the DOM still shows the class. — Use a semantic token such as `bg-primary`. The hex colour in `style` goes too (`no-inline-color`).

  - apps/myapp/ui/StatusBadge.tsx

- throw-raw-error — no-throw-raw-error — A Raw Error — A bare `Error` reaches the caller as `Internal Server Error`, with no message and no translation. — Throw an `Err` that names a key, and register that key in the module dictionary as an `[en, ko]` pair.

  - apps/myapp/lib/ticket/ticket.service.ts

  - Then register the key in the same module's dictionary: — apps/myapp/lib/ticket/ticket.dictionary.ts

- form-setter — no-unpublished-form-setter — A Setter Wrapped In An Arrow — Both lines run the same code, but the arrow is an anonymous closure. The control then emits no `data-akan-action` and publishes no agent tool for the field. — Pass the setter by reference. Normalize a value with the control's `transform` prop; do several writes in a `_postSet<Field>` store method.

  - apps/myapp/lib/ticket/Ticket.Template.tsx

- store-return — no-return-in-store-action — A Value Returned From A Store Action — Every store method is dispatched through `st.do.<action>()`, which is typed `void`. The returned value reaches no call site. — Write the value into state with `this.set({ ... })`. A bare `return;` guard stays legal.

  - apps/myapp/lib/ticket/ticket.store.ts

- init-fetch — no-init-fetch-in-client — A Hydration Call Made From The Client — `fetch.init<Model><Suffix>` builds the snapshot `Load.Units` seeds the store from. Called after hydration, it costs two extra round trips for a shell the browser already painted. — Start it in the route, where it resolves before the first byte, and hand the promise to the Zone as `init`. To reload from the client, call `st.do.init<Model><Suffix>()`.

  - Before, the Zone loads the list on mount: — apps/myapp/lib/ticket/Ticket.Zone.tsx

  - After, the route starts the load and hands the promise down: — apps/myapp/page/project/[projectId]/_index.tsx

  - The Zone only renders what it is handed: — apps/myapp/lib/ticket/Ticket.Zone.tsx

- private-methods — no-js-private-class-method — #private In One Of Four Suffixes — The framework merges `constant`, `document`, `service` and `store` classes by copying methods onto another class. A copied method that calls a `#` member throws. — Use a TypeScript `private` method with an underscore prefix. Everywhere else, `srvkit/` included, `#private` stays the house style.

Every Rule That Breaks The Build

Twenty-two are grit plugins written for Akan, and every one of them is an error. The rest are Biome's own. Each plugin looks only at its scope, so a plain package under `pkgs/` never trips the module rules.

Colour vocabulary

All five look at every `.ts` and `.tsx` file in `apps/` and `libs/`, except tests.

- no-raw-palette-class: Raw palette classes such as `bg-blue-500` compile to no CSS. Use a token such as `bg-primary`.

- no-arbitrary-color: Colour values such as `bg-[#3b82f6]` ignore `data-theme`. A `var()` reference is fine.

- no-daisyui-legacy-class: Removed daisyUI classes such as `btn-primary`, `card-body` and `bg-base-100` render unstyled.

- no-inline-color: A colour literal in `style={{ ... }}` or a `<style>` body skips tokens and theme switching.

- no-interpolated-arbitrary-class: A runtime-built arbitrary value like `min-h-[${n}px]` has no CSS. Use `style` or literal classes.

daisyUI's dropped colour slots map onto tokens like this. `black` and `white` stay in the vocabulary.

daisyUI slot

Token to use

- base-100: `background`

- base-200: `muted`

- base-300: `border`

- base-content: `foreground`

- <colour>-content: `<colour>-foreground`

- error: `destructive`

Errors, logs and comments

**`//!` stays legal on the server.** Server files, `srvkit/` and CLI code never reach a browser.

**`no-bang-comment-in-client` always points at line 1.** It is a file-level diagnostic, so search the file for the marker.

Stores, forms and module files

**Generated CRUD names are taken.** `<model>`, `light<Model>`, `create<Model>`, `update<Model>`, `remove<Model>`, `view<Model>`, `edit<Model>` and `merge<Model>` already exist, so give a custom endpoint another name.

Server components

Pages, `Unit` and `View` are always server components. These rules keep client code out of them.

Imports

**`import type` is always allowed.** It is erased before bundling. A mixed value-and-type import is not exempt.

**`common/` and `*.constant.ts` obey both directions,** so shared code reaches neither side.

**Barrels count too.** A client file may not import `db`, `srv`, `sig`, `dict`, `option` or `useServer`; a server file may not import `st`, `store` or `useClient`.

**Akan's own packages pass.** Relative paths, `akanjs`, `@akanjs/*`, `@apps/*`, `@libs/*`, `@pkgs/*`, `react*`, `@playwright/*` and `bun:test` are not third-party imports.

**Cross-module constants are the exception.** A `.ts` module file may import `../map/map.constant`.

Biome's own rules

These apply to every file. The two that are off are off on purpose.

- nursery/useSortedClasses — `error`, safe fix — Sorts Tailwind classes, `cn()` string arguments too. Never hand-order or undo its output.

- suspicious/noConsole — `error` — `console.log` and `console.debug`. Only `assert`, `error`, `info` and `warn` are allowed.

- correctness/noUnusedImports — `error`, safe fix — `akan lint` deletes the unused import on its fix pass instead of reporting it.

- suspicious/noArrayIndexKey — `off` — Off on purpose: `key={idx}` for an embedded scalar with no id of its own is intended.

- correctness/useExhaustiveDependencies — `off` — Off on purpose: the short dependency arrays in this workspace are deliberate.

Suppressing A Rule

Sometimes a fixed colour is right: an OS-chrome mockup, a data-visualization scale, a vendor's brand. Suppress that one spot, and always write the reason.

Form

- // biome-ignore lint/plugin: <reason>: Turns plugin rules off for the next line or statement.

- {/* biome-ignore lint/plugin: <reason> */}: The same inside JSX, placed above one element.

- // biome-ignore-all lint/plugin: <reason>: At the top of a file, turns plugin rules off for the whole file.

- // biome-ignore lint/suspicious/noConsole: <reason>: Biome's own rules are named by their group and rule name instead.

The JSX form looks like this in a real component:

**Every suppression carries a reason.** There is no bare disable block anywhere in this workspace.

**Keep the scope small.** Use the file-level form only when every hit in the file has the same reason, like a data-viz palette file.

**Write `lint/plugin`, not `plugin`.** The bare `// biome-ignore plugin:` form that Biome's category name suggests is accepted and looks right, but it does **nothing**: the rule still fires.

Commands And Configuration

`akan lint` formats and fixes one app, lib or package. `bunx biome check` only reports:

akan lint myapp # format and fix one target akan lint myapp --fix false # report, apply no fixes akan lint myapp --max-diagnostics 0 # print every diagnostic akan lint-all # every app, lib, and package bunx biome check apps/myapp/lib/order # Biome only, writes nothing

**Up to 200 diagnostics are printed.** Biome's own default is 20 with no count, which reads as progress when only the mix of findings changed.

**`--fix false` still runs every `akan lint` check.** It skips only Biome's fixes, so the checks below still run; `bunx biome check` runs Biome alone.

What akan lint checks after Biome

File

- page/styles.css: Each theme's text and background token pair must meet WCAG contrast.

- ui/Recipe/*: A recipe with no variant to choose fails. Make it a component or a class constant.

- AGENTS.md: A stale `## Recipes In Scope` block fails. Run `akan sync <name>` to regenerate it.

Where the configuration lives

- biome.json: Sits at the workspace root and extends `@akanjs/devkit/biome.base.json`.

- @akanjs/devkit/biome.base.json: Sets every rule's level and scopes each grit plugin to the paths it applies to.

- @akanjs/devkit/lint/*.grit: The plugin sources, one file per rule. Most open with a comment on what breaks without it.

**`biome.json` is strict JSON, and one comment breaks it.** `akan lint` reports the parse error on its line, but a bare `biome check` silently falls back to other configs and names a file you did not edit, or runs without your rules. Rename it to `biome.jsonc` to document a disabled rule.

## Code Examples

### Code

```ts
export const StatusBadge = ({ label }: StatusBadgeProps) => {
  return (
    <span
      className="rounded bg-blue-500 px-2 text-white" // [!code --]
      style={{ borderColor: "#e5e7eb" }} // [!code --]
      className="rounded border border-border bg-primary px-2 text-primary-foreground" // [!code ++]
    >
      {label}
    </span>
  );
};
```

### Code

```ts
import { Err } from "../dict"; // [!code ++]

async openTicket(ticketId: string) {
  const ticket = await this.getTicket(ticketId);
  if (ticket.status !== "active") throw new Error("ticket is not active"); // [!code --]
  if (ticket.status !== "active") throw new Err("ticket.error.notActive"); // [!code ++]
  return await ticket.open().save();
}
```

### Code

```ts
.error({
    notActive: ["The ticket is not active", "티켓이 활성 상태가 아니다."], // [!code ++]
  })
```

### Code

```ts
<Field.Text
  label={l("ticket.title")}
  value={ticketForm.title}
  onChange={(v) => st.do.setTitleOnTicket(v)} // [!code --]
  onChange={st.do.setTitleOnTicket} // [!code ++]
/>
```

### Code

```ts
async openTicket(ticketId: string) {
  const ticket = await fetch.openTicket(ticketId);
  return ticket; // [!code --]
  this.set({ ticket }); // [!code ++]
}
```

### Code

```ts
"use client";

export const Card = ({ projectId }: CardProps) => {
  const [init, setInit] = useState<ClientInit<"ticket", cnst.LightTicket>>();
  useEffect(() => {
    void fetch.initTicketInProject(projectId).then(setInit); // [!code highlight]
  }, []);
  return init ? (
    <Load.Units
      init={init}
      renderItem={(ticket) => <Ticket.Unit.Card ticket={ticket} />}
    />
  ) : null;
};
```

### Code

```ts
export default page()
  .param("projectId", ID)
  .render(({ projectId }) => {
    const { ticketInitInProject } = fetch.initTicketInProject(projectId);
    return <Ticket.Zone.Card init={ticketInitInProject} />;
  });
```

### Code

```ts
"use client";

export const Card = ({ init }: CardProps) => {
  return (
    <Load.Units
      init={init}
      renderItem={(ticket) => <Ticket.Unit.Card ticket={ticket} />}
    />
  );
};
```

### Code

```ts
async #syncStock() { // [!code --]
private async _syncStock() { // [!code ++]
  return await this.ticketModel.syncStock();
}
async refreshStock() {
  return await this.#syncStock(); // [!code --]
  return await this._syncStock(); // [!code ++]
}
```

### apps/myapp/ui/BrowserChrome.tsx

```ts
export const TrafficLights = () => {
  return (
    <div className="flex gap-2">
      {/* biome-ignore lint/plugin: macOS traffic-light colour, not a theme token */}
      <div className="size-3 rounded-full bg-[#ff5f57]" />
    </div>
  );
};
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Treat convention and generated-file rules as stronger than local style guesses.

