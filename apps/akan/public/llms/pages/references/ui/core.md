# Core

- Source: /references/ui/core
- Mirror: /llms/pages/references/ui/core.md
- Section: references
- Category: UI Reference
- Priority: P1

## Headings

- Core UI (#core-ui)
- Link (#Link)
- Image (#Image)
- Layout (#Layout)
- Load (#Load)
- Model (#Model)

## Content

Core

Core UI

The five `akanjs/ui` components almost every screen uses. Each section below lists the props and ends with one working example.

Component

- Link: Moves between internal routes. Every internal link is a `Link`.

- Image: Draws an uploaded file or a URL, resized by Akan's image optimizer.

- Layout: The page frame: content containers, top and bottom chrome, a header and drawers.

- Load: Turns a fetch result into a list, a detail, a form, or any awaited value.

- Model: Create, edit, view and remove shells wired to a model's generated store.

Words used on this page

Term

- slice: A named list query of a model, such as `productInShop`. Components take it as `fetch.slice.<name>`.

- init, view, edit: What `fetch.init*`, `fetch.view*` and `fetch.edit*` return: the data plus what the store needs.

- hydrate: Write server data into the client store, so generated actions such as paging work on it.

- Suspense boundary: A fallback that covers one section while its data loads, without holding the rest of the page.

- chrome: Bars fixed above or below the scrolling body, such as a navbar or a bottom tab bar.

- trigger: The element a user clicks to open a modal or a confirmation.

- draft: A form's unsaved input, kept on the device and offered back when the form reopens.

Link

Navigates between internal routes. Use it for every internal link, and keep a bare `<a>` for `mailto:` and external addresses only.

- href (string | null): Destination route. When empty, Link renders its children inside a plain `div`.

- disabled (boolean, default false): Blocks navigation and renders the same `div`, so the layout does not move.

- activeClassName (string): Class added while the current path starts with `href`.

- activeExact (boolean): Adds `activeClassName` only on the exact path, not on its sub-paths.

- scrollToTop (boolean): Scrolls to the top after client-side navigation.

- replace (boolean): Replaces the current history entry instead of adding one.

- noCache (boolean): Deprecated: it has no effect, so leave it out.

- target / rel / aria-* (AnchorHTMLAttributes): Pass through to `<a>` on server-rendered pages. The CSR bundle drops them.

- Link.Back ({ className?, children? }): Calls `router.back()` on click. It is a plain `div`, so it wraps any mark you give it.

- Link.Close ({ className?, children? }): Calls `window.close()` on click, for a route opened in its own tab such as an OAuth popup.

- Link.Lang ({ lang: "ko" | "en" | string, className?, children? }): Calls `router.setLang(lang)` on click, swapping only the locale segment of the current route.

Example

A product card that links to its page and stays highlighted while that page is open:

**Active is a prefix match.** `/product/1/edit` also counts as the card's page; add `activeExact` to stop that.

**No client boundary needed.** `Link` works in a server component, so this Unit carries no `"use client"`.

Image

Draws an uploaded file or a URL. On server-rendered pages the request goes through Akan's image optimizer at `/_akan/image`, which returns a copy resized to fit.

- src (string): Direct image URL. It wins over `file.url`.

- file (ProtoLightFile | { url, imageSize, abstractData? } | null): A `File` model value, or any object with `url` and `imageSize`.

- width / height (number, default file.imageSize): Rendered size. A missing value comes from `file.imageSize`.

- alt (string, default "image"): Alternative text. Pass a real description; the default is just the word image.

- abstractData (string | null): Low-quality preview data. It overrides `file.abstractData`.

- quality (number, default 75): Quality the optimizer encodes at.

- priority / preload (boolean): Loads eagerly at high priority, and preloads the image on server-rendered pages.

- unoptimized (boolean): Skips the optimizer and serves the original URL.

A 48px avatar from the image the user uploaded:

**1x and 2x copies.** With a `width` and no `sizes`, the optimizer serves both, so this avatar gets a 48px and a 96px file.

**Never optimized:** SVG files and `data:` / `blob:` URLs are served as they are.

**The CSR bundle** (the mobile app) renders the original URL, because the optimizer runs on the server.

Layout

The page frame. Pick a member by where it goes: inside a module file, above or below the scrolling body, or over the page.

Content containers

- Layout.Template ({ className?, children? }): Vertical form container with the spacing a module `Template` expects.

- Layout.Unit ({ className?, children, href? }): List or card item. With `href`, the whole unit becomes one `Link`.

- Layout.View ({ className?, children }): Detail page container, capped at `max-w-5xl`.

- Layout.Zone ({ className?, children }): Section container for zones and page blocks, with the same width cap.

Top and bottom chrome

Navbar, TopInset, BottomInset and BottomTab register their height with the route, so the scrolling body is never hidden behind them.

- Layout.Navbar ({ className?, children?, height?, back? }, default height 48): Portals `children` into the top inset. `back` is `true` for the default chevron, or your node.

- Layout.TopInset ({ className?, children, estimatedHeight? }, default estimatedHeight 48): Top chrome that is not a navbar. `estimatedHeight` is the space reserved for it.

- Layout.TopLeftAction ({ className?, children }): The inset's top-left corner, where the navbar's `back` lands. Other corner controls go here.

- Layout.BottomInset ({ className?, children, keyboardSticky?, role?, estimatedHeight? }, default estimatedHeight 60): Bottom chrome. `keyboardSticky` rides above the keyboard; `role` is chrome or keyboard accessory.

- Layout.BottomTab ({ className?, tabs, height?, renderTab? }, default height 64): The app's bottom tab bar. Each tab is `{ name, icon, activeIcon?, notiCount?, href }`.

Header and drawers

These four draw over the page and register no height.

- Layout.Header ({ className?, children?, type?: "hide" | "static" }, default "hide"): Fixed web header. `hide` slides it away on scroll down from `md` width up; `static` keeps it.

- Layout.Sider ({ className?, bgClassName?, trigger?, header?, close?, children? }): Drawer that owns its open state and closes on route change; `trigger`, `header`, `close` swap parts.

- Layout.LeftSider ({ open, onCancel, children, width?, close?, className? }): Controlled left drawer. `close={false}` draws no close control.

- Layout.RightSider ({ open, onCancel, children, title?, width?, close?, className? }): Controlled right drawer, with a `title` slot the left one lacks.

**Close glyph.** With `back`, the navbar draws ✕ instead of the chevron when the route's transition is `bottomUp`, `scaleOut` or `fade`.

**`renderTab` draws the whole tab body,** badge included. The framework keeps only the link and the active match, so draw `notiCount` yourself.

**Layout.Navbar ignores title, left and right.** They are in its prop type, but only `children` and `back` reach the screen. Build the title and the trailing controls inside `children`.

A detail page with a back button and an edit link in the navbar:

**Anywhere in the tree.** The navbar portals its content into the top inset, so the page renders it right beside the body.

**The page stays on the server.** `children` and `back` are plain props, so the page needs no `"use client"`.

A list row that opens the order when tapped:

**Without `href`** the unit is a plain container and nothing is clickable.

Load

Turns a `fetch.*` result into markup. Every member accepts the awaited value or the promise; a pending promise waits behind its own Suspense boundary, so one slow section never holds the page.

Members

- Load.Units ({ init, renderItem | renderList, … }): Renders a slice's list and hydrates the store, so generated paging and refresh keep working.

- Load.View ({ view, renderView, loading?, empty?, noDiv?, className? }): Hydrates one full model and draws it with `renderView`; `noDiv` drops the wrapper element.

- Load.Edit ({ edit, slice, type?, modal?, loading?, draft?, onSubmit?, onCancel?, submitText?, renderSubmit?, … }, default type "modal"): `edit` takes an edit payload, its promise, or a new-record seed. `type`: `modal`, `form`, `empty`.

- Load.Pagination ({ init, className?, scrollToTop? }): A standalone pager on a list's `init`. It draws nothing while every row fits on one page.

- Load.Stream ({ of, fallback?, children }): Awaits one promise behind its own Suspense boundary and hands the value to `children`.

- Load.Page ({ of, loader, render, loading?, noCache? }): Route-level loader for SSR and CSR: `of` is the component CSR mounts, `loader` the shared fetch.

Load.Units options

- renderItem / renderList ((item, idx) => ReactNode / (list) => ReactNode): One of the two is required: draw each row, or the whole list at once.

- empty / renderEmpty (ReactNode / () => ReactNode): Shown when the list has no rows. `empty` wins when both are given.

- loading (ReactNode): Fallback while `init` is pending and while a refetch runs.

- pagination (boolean, default true): A pager on desktop, infinite scroll on mobile. Turn it off to place `Load.Pagination` yourself.

- staleTime (number (ms)): How old seeded data may be before a mount refetches; `0` always refetches.

- from / to (number): Slice the rows `renderItem` draws, without refetching.

- filter / sort / reverse ((item, idx) => boolean / (a, b) => number / boolean): Filter, sort and reverse the rows already loaded, on the client.

Where each member goes

A function cannot cross from a server page into a client component. So the members that take a render function live in a `Zone`, and the page hands that Zone its promise.

Member

Page — server

Zone — "use client"

- Takes a render function

  - Load.Units: `renderItem` and `renderList` are functions, so a server page cannot pass them.

  - Load.View: `renderView` is a function too.

- Takes only data

  - Load.Edit: `edit`, `slice`, strings and `children` all cross the boundary.

  - Load.Pagination: Takes `init` and one flag.

  - Load.Stream: Carries no "use client", so its `children` function runs wherever it is rendered.

- Route-level

  - Load.Page: `of`, `loader` and `render` are the function props a page may pass.

Works here

Not here

Example: a page and its Zone

The page starts every query and hands out the promises:

**Hand the promise, not the awaited value.** `fetch.initProductInShop(shopId)` puts both queries in flight, and each section renders when its own data lands.

**List data stays on the server.** `productListInShop` and `productInsightInShop` hold hydrated model instances, which React refuses as client props. Read them in a server component, as `Load.Stream` does here, never as a `Zone` prop.

The Zone holds the two members that take a render function:

**`pagination={false}`** because `Load.Pagination` draws the pager below. With the default, the list would draw a second one.

**The Zone draws no markup of its own.** Rows go to `Product.Unit.Card` and the detail to `Product.View.General`.

Form drafts

`Load.Edit`, `Model.EditModal`, `Model.New` and `Model.Edit` save the form as the user types and offer it back the next time it opens.

- draft (boolean | string, default true): `false` turns recovery off; a string names the scope yourself.

**Scope.** The record id for an edit, and the seed plus the route for a new form, always per signed-in user.

**Never saved:** `field.secret` and `field.hidden` values.

**Do not persist form values yourself.** The old per-field `cache` / `cacheKey` props are gone: they covered five control types, keyed on the translated label, and restored over server data.

Model

Create, edit, view and remove shells wired to a model's generated store. Use them in a module's `Util`, `View` or `Zone`, where the store actions are already in scope.

A trigger and its modal in one line

- Model.New ({ slice, children, trigger?, partial?, renderTitle?, modal?, namespace?, draft? }): `children` is the form body, `partial` seeds it, `trigger` replaces the default New button.

- Model.Edit ({ slice, modelId, children, trigger?, renderTitle?, modal?, draft? }): The same pair for one record; `trigger` defaults to the framework's Edit button.

Wrappers: your element becomes the trigger

- Model.NewWrapper ({ slice, children, partial?, setDefault?, modal?, resets?, namespace?, draft?, className? }): Opens the create form on click. `resets` lists models whose `reset<Model>()` runs on open.

- Model.EditWrapper ({ slice, modelId, children, modal?, disabled?, resets?, draft?, className? }): Opens one record in the edit form.

- Model.ViewWrapper ({ slice, modelId, children, modal?, resets?, className? }): Opens one record in the detail view.

- Model.RemoveWrapper ({ slice, modelId, name, children, modal?, className? }): Asks in a small confirm popover, then removes the record.

Modals and bodies with no trigger

- Model.EditModal ({ slice, children, edit?, type?, id?, renderTitle?, submitText?, renderSubmit?, onSubmit?, onCancel?, draft?, draftBarClassName?, … }): The edit shell with no trigger. `onSubmit` / `onCancel`: `"back"`, `"reset"`, a path, or a callback.

- Model.ViewModal ({ id, slice, renderView, renderTitle?, renderAction?, modal?, modalClassName?, viewClassName? }): The detail view in a modal, with title and action slots.

- Model.ViewEditModal ({ slice, renderView, renderTemplate, renderTitle?, menu?, editLabel?, saveLabel? }): One modal that flips between view and form; `menu={false}` drops the kebab and its remove entry.

- Model.View ({ model, render, modelLoading?, loading?, empty?, loadingWrapper?, className? }, default modelLoading true): The store-side `Load.View`: loaded, loading or empty from one model. Pass the store's loading flag.

- Model.AdminPanel ({ slice, components, columns?, actions?, tools?, summaryColumns?, insightColumns?, queryMap? }): A whole admin screen built from the generated `Unit`, `Template` and `View` namespaces.

- Model.LoadInit / Model.LoadView ({ init } / { view }): Seed the client store from a fetch result and render nothing.

Removal

Both take `redirect`: `"back"`, or a path to open after the removal.

- Model.Remove ({ slice, modelId, children, name?, title?, description?, action?, modal?, redirect? }): `children` opens a confirmation modal. A custom `action` must do the removal itself.

- Model.SureToRemove ({ slice, modelId, name, trigger?, title?, description?, confirmLabel?, typeNameToRemove?, redirect? }): Heavier removal: `typeNameToRemove` keeps the button locked until the user retypes `name`.

Edit and remove buttons for one product, and a create button with its own label:

**Only `trigger` replaces the opener.** `Model.New` and `Model.Edit` spend `children` on the form body and take no `className`; `Model.SureToRemove` takes no children at all.

**A second create button for the same slice needs `namespace`.** It suffixes the tool name the button publishes to the in-page agent.

**`AdminPanel` uses each role's `General` export,** falling back to the first export (`Card` first for `Unit`). A role with no export is skipped.

**Each export has its own Suspense boundary,** because these mount on interaction, long after the page is painted.

## Code Examples

### apps/shop/lib/product/Product.Unit.tsx

```ts
import type { cnst } from "@apps/shop/client";
import type { ModelProps } from "akanjs/client";
import { Link } from "akanjs/ui";

export const Card = ({ product }: ModelProps<"product", cnst.LightProduct>) => {
  return (
    <Link
      href={`/product/${product.id}`}
      className="block rounded-xl border p-4"
      activeClassName="border-primary"
    >
      {product.name}
    </Link>
  );
};
```

### apps/shop/lib/user/User.Unit.tsx

```ts
import type { cnst } from "@apps/shop/client";
import type { ModelProps } from "akanjs/client";
import { Image } from "akanjs/ui";

export const Avatar = ({ user }: ModelProps<"user", cnst.LightUser>) => {
  return (
    <Image file={user.image} alt={user.nickname} width={48} height={48} className="rounded-full" />
  );
};
```

### apps/shop/page/order/[orderId]/_index.tsx

```ts
import { fetch, Order, usePage } from "@apps/shop/client";
import { ID } from "akanjs/base";
import { page } from "akanjs/client";
import { Layout, Link } from "akanjs/ui";

export default page()
  .param("orderId", ID)
  .render(async ({ orderId }) => {
    const { l } = usePage();
    const [{ order, orderView }] = await Promise.all([
      fetch.viewOrder(orderId),
    ]);
    return (
      <>
        <Layout.Navbar back>
          <div className="flex w-full items-center justify-between">
            <div className="font-bold">{order.name}</div>
            <Link href={`/order/${orderId}/edit`}>{l("base.edit")}</Link>
          </div>
        </Layout.Navbar>
        <Order.Zone.View view={orderView} />
      </>
    );
  });
```

### apps/shop/lib/order/Order.Unit.tsx

```ts
import type { cnst } from "@apps/shop/client";
import type { ModelProps } from "akanjs/client";
import { Layout } from "akanjs/ui";

export const Card = ({ order }: ModelProps<"order", cnst.LightOrder>) => {
  return (
    <Layout.Unit href={`/order/${order.id}`}>
      <div className="font-bold">{order.name}</div>
    </Layout.Unit>
  );
};
```

### apps/shop/page/shop/[shopId]/product/[productId]/_index.tsx

```ts
import { fetch, Product } from "@apps/shop/client";
import { ID } from "akanjs/base";
import { page } from "akanjs/client";
import { Load, Loading } from "akanjs/ui";

export default page()
  .param("shopId", ID)
  .param("productId", ID)
  .render(({ shopId, productId }) => {
    const { productView } = fetch.viewProduct(productId);
    const { productInitInShop, productListInShop } =
      fetch.initProductInShop(shopId);
    return (
      <>
        <Product.Zone.View view={productView} />
        <Product.Zone.Card init={productInitInShop} />
        <Load.Stream
          of={productListInShop}
          fallback={<Loading.Skeleton active />}
        >
          {(productList) => <Product.Unit.Total count={productList.length} />}
        </Load.Stream>
      </>
    );
  });
```

### apps/shop/lib/product/Product.Zone.tsx

```ts
"use client";
import { type cnst, Product } from "@apps/shop/client";
import type { ClientInit, ClientView } from "akanjs/fetch";
import { Load } from "akanjs/ui";

interface CardProps {
  className?: string;
  init: ClientInit<"product", cnst.LightProduct>;
}
export const Card = ({ className, init }: CardProps) => {
  return (
    <>
      <Load.Units
        className={className}
        init={init}
        pagination={false}
        renderItem={(product) => (
          <Product.Unit.Card key={product.id} product={product} />
        )}
      />
      <Load.Pagination init={init} scrollToTop />
    </>
  );
};

interface ViewProps {
  className?: string;
  view: ClientView<"product", cnst.Product>;
}
export const View = ({ className, view }: ViewProps) => {
  return (
    <Load.View
      className={className}
      view={view}
      renderView={(product) => <Product.View.General product={product} />}
    />
  );
};
```

### apps/shop/lib/product/Product.Util.tsx

```ts
"use client";
import { fetch, Product, usePage } from "@apps/shop/client";
import { cn } from "akanjs/client";
import { buttonRecipe, Model } from "akanjs/ui";

interface ManageProps {
  className?: string;
  productId: string;
  name: string;
}
export const Manage = ({ className, productId, name }: ManageProps) => {
  return (
    <div className={cn("flex gap-2", className)}>
      <Model.Edit slice={fetch.slice.product} modelId={productId}>
        <Product.Template.General />
      </Model.Edit>
      <Model.SureToRemove
        slice={fetch.slice.product}
        modelId={productId}
        name={name}
        typeNameToRemove
      />
    </div>
  );
};

export const Create = () => {
  const { l } = usePage();
  return (
    <Model.New
      slice={fetch.slice.product}
      partial={{ status: "draft" }}
      trigger={
        <button className={buttonRecipe({ variant: "outline" })}>
          {l.trans({ en: "Add product", ko: "상품 추가" })}
        </button>
      }
    >
      <Product.Template.General />
    </Model.New>
  );
};
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.

