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

A Class With No CSS

The raw palette is stripped from the stylesheet, so the badge renders with no colour.

A Field No Agent Can Reach

An arrow around the setter hides it, so the field publishes no agent tool.

A Return Value Nobody Gets

Store actions are dispatched as `void`, so the caller never sees the value.

A Note Every Visitor Downloads

A bang comment survives minification and ships in the browser bundle.

The formatter and linter this workspace uses. `akan lint` runs it for you.

grit plugin

A lint rule written in GritQL for Akan and run by Biome. There are 25.

diagnostic

One finding Biome prints: the file, the line, the rule name and a message.

safe fix

A fix Biome applies by itself, such as sorting classes or dropping an unused import.

colour vocabulary

The closed set of semantic colour tokens. The raw Tailwind palette is not in it.

scope

The paths a rule looks at. A file outside a rule's scope never trips it.

Why:

Fix:

A Colour Outside The Vocabulary

The raw Tailwind palette is stripped from the compiled stylesheet, so `bg-blue-500` has no CSS behind it. The badge renders unstyled while the DOM still shows the class.

Use a semantic token such as `bg-primary`. The hex colour in `style` goes too (`no-inline-color`).

A Raw Error

A bare `Error` reaches the caller as `Internal Server Error`, with no message and no translation.

Throw an `Err` that names a key, and register that key in the module dictionary as an `[en, ko]` pair.

Then register the key in the same module's dictionary:

A Setter Wrapped In An Arrow

Both lines run the same code, but the arrow is an anonymous closure. The control then emits no `data-akan-action` and publishes no agent tool for the field.

Pass the setter by reference. Normalize a value with the control's `transform` prop; do several writes in a `_postSet<Field>` store method.

A Value Returned From A Store Action

Every store method is dispatched through `st.do.<action>()`, which is typed `void`. The returned value reaches no call site.

Write the value into state with `this.set({ ... })`. A bare `return;` guard stays legal.

A Hydration Call Made From The Client

`fetch.init<Model><Suffix>` builds the snapshot `Load.Units` seeds the store from. Called after hydration, it costs two extra round trips for a shell the browser already painted.

Start it in the route, where it resolves before the first byte, and hand the promise to the Zone as `init`. To reload from the client, call `st.do.init<Model><Suffix>()`.

Before, the Zone loads the list on mount:

After, the route starts the load and hands the promise down:

The Zone only renders what it is handed:

#private In One Of Four Suffixes

The framework merges `constant`, `document`, `service` and `store` classes by copying methods onto another class. A copied method that calls a `#` member throws.

Use a TypeScript `private` method with an underscore prefix. Everywhere else, `srvkit/` included, `#private` stays the house style.

Raw palette classes such as `bg-blue-500` compile to no CSS. Use a token such as `bg-primary`.

Colour values such as `bg-[#3b82f6]` ignore `data-theme`. A `var()` reference is fine.

Removed daisyUI classes such as `btn-primary`, `card-body` and `bg-base-100` render unstyled.

A colour literal in `style={{ ... }}` or a `<style>` body skips tokens and theme switching.

A runtime-built arbitrary value like `min-h-[${n}px]` has no CSS. Use `style` or literal classes.

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

`error`, safe fix

Sorts Tailwind classes, `cn()` string arguments too. Never hand-order or undo its output.

`console.log` and `console.debug`. Only `assert`, `error`, `info` and `warn` are allowed.

`akan lint` deletes the unused import on its fix pass instead of reporting it.

Off on purpose: `key={idx}` for an embedded scalar with no id of its own is intended.

Off on purpose: the short dependency arrays in this workspace are deliberate.

Turns plugin rules off for the next line or statement.

The same inside JSX, placed above one element.

At the top of a file, turns plugin rules off for the whole file.

Biome's own rules are named by their group and rule name instead.

Each theme's text and background token pair must meet WCAG contrast.

A recipe with no variant to choose fails. Make it a component or a class constant.

A stale `## Recipes In Scope` block fails. Run `akan sync <name>` to regenerate it.

Sits at the workspace root and extends `@akanjs/devkit/biome.base.json`.

Sets every rule's level and scopes each grit plugin to the paths it applies to.

The plugin sources, one file per rule. Most open with a comment on what breaks without it.

Lint Is Not About Style

Most rules here catch code that compiles, runs and looks right, yet quietly does nothing. Only the linter notices.

Words used on this page

Term

Six You Will Meet First

Each diagnostic prints the name of the rule that fired. Find that name below; the fix is mechanical once you know it.

Every Rule That Breaks The Build

Colour vocabulary

daisyUI slot

Token to use

Errors, logs and comments

Stores, forms and module files

Server components

Imports

Biome's own rules

These apply to every file. The two that are off are off on purpose.

Suppressing A Rule

Sometimes a fixed colour is right: an OS-chrome mockup, a data-visualization scale, a vendor's brand. Suppress that one spot, and always write the reason.

Form

The JSX form looks like this in a real component:

Commands And Configuration

akan lint myapp # format and fix one target akan lint myapp --fix false # report, apply no fixes akan lint myapp --max-diagnostics 0 # print every diagnostic akan lint-all # every app, lib, and package bunx biome check apps/myapp/lib/order # Biome only, writes nothing

What akan lint checks after Biome

File

Where the configuration lives

## Code Examples

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

