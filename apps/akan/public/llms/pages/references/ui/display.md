# Display

- Source: /references/ui/display
- Mirror: /llms/pages/references/ui/display.md
- Section: references
- Category: UI Reference
- Priority: P1

## Headings

- Display UI (#display-ui)
- Data (#Data)
- RecentTime (#RecentTime)
- Loading (#Loading)
- Badge (#Badge)
- Empty (#Empty)
- Table (#Table)
- Pagination (#Pagination)

## Content

Display

Display UI

Components that show data: model listings, timestamps, loading and empty states, status pills, tables and pagers. All of them come from `akanjs/ui`.

Component

- Data: The admin listing screen and its parts, bound to one model's slice.

- RecentTime: A time shown as "3 minutes ago", with the exact date in a tooltip.

- Loading: Six waiting indicators: spinner, skeleton, progress bar and three placeholders.

- Badge: A status pill: a `<span>` styled by `badgeRecipe`.

- Empty: The "no data" placeholder, with room for a follow-up action below it.

- Table: Rows you already hold, drawn as a table with an optional pager.

- Pagination: A page-number control driven entirely by props.

Words used on this page

Term

- slice: Metadata naming one model list and the store keys it fills. Get it from `fetch.slice.<model>`.

- store: The client state generated per model. `st.use` reads it and `st.do` changes it.

- insight: Aggregates a slice returns beside its rows, such as `count`.

- override slot: A component name a route's `_overrides.tsx` can swap for the app's own version.

Store-bound or prop-bound

The pager and the table each come in two versions, and swapping them is the usual mistake. Use the `Data.*` one for a model slice, and the plain one for values you already hold:

Store — slice

Props

- Pager

  - Data.Pagination: Reads a slice's page, limit and count from the store.

  - Pagination: Takes `currentPage`, `total` and `itemsPerPage` as props.

- Table

  - Data.TableList: A listing wired to a model: rows, pager and modals all come from the slice.

  - Table: Rows you already hold, passed in as `dataSource`.

Where its values come from

Not used

Related pages

- Load.Units · Load.View — How a product screen lists and shows data.

- Model.AdminPanel — Builds a `Data.ListContainer` from a module's own components.

- Override slots — Re-skin `Empty`, `Table`, `Pagination`, `Badge` and each `Loading` member per route.

- Recipe slots — Restyle every badge at once with `recipes: { badge }`.

Data

The admin listing screen, split into parts. `Data.ListContainer` is the whole screen; every other member is one piece of it, exported so a different layout can compose instead of fork.

Every member takes the same `slice`, which tells it the model and the store keys to read.

Members

- Data.ListContainer ({ slice, type?, query?, columns?, actions?, tools?, render…? }): The whole admin listing: toolbar, dashboard, rows or cards, and the CRUD modals.

- Data.TableList ({ slice, columns, init?, queryArgs?, actions?, renderView?, renderTemplate?, renderTitle?, onItemClick? }): The listing as rows, with its own edit and view modals. `queryArgs` makes it load on mount.

- Data.CardList ({ slice, columns, renderItem, init?, actions?, renderView?, renderTemplate?, renderLoading? }): The listing as cards. Each `renderItem` result sits in a `Data.Item` with the row actions.

- Data.Item ({ slice, model, title?, actions?, columns?, onClick?, children? }): One card: `children` (or `title`) on top, then the listed columns and the action buttons.

- Data.Pagination ({ slice, className? }): The pager. It reads page state from the slice's store, not from props.

- Data.Dashboard ({ slice, summary, columns?, presents?, hidePresents?, queryMap?, summaryRefName?, onSelect?, queryKey? }): Summary tiles above the list. A tile that knows its filter narrows the list on click.

- Data.Insight ({ slice, insight, columns? }): Tiles for the slice's insight values. The total count is already in the header.

- Data.QueryMaker ({ slice, query?, onApply? }): Picks a declared filter and fills its args. `onApply` defaults to the slice's store.

- Data.RefPicker ({ refName, value, onChange }): Picks a row of another model for a filter arg whose `ref` names it, such as an owner id.

Data.ListContainer props

- slice (SliceMeta): The model's root slice, `fetch.slice.<model>`.

- type ("card" | "list", default "card"): The first rendering. The toolbar toggle switches between cards and rows.

- query (QuerySetting): Fixes the filter. The query maker and the dashboard are then not drawn.

- queryMap ({ [column]: QuerySetting }): The filter per summary column. `?filter=<column>` opens the list on that filter.

- init (FetchInitForm): The first fetch: page, limit, sort, and the defaults a new model starts from.

- columns (DataColumn[], default ["id", "createdAt", "updatedAt"]): Fields shown in each row and card, and written by the CSV export.

- actions (DataAction[] | (item, idx) => DataAction[], default ["remove", "edit", "view"]): Row buttons. A function decides them per row.

- tools (DataTool[] | (list) => DataTool[], default []): Extra entries in the toolbar's more menu, beside CSV and JSON export.

- create (boolean, default true): Shows the New button, as long as `renderTemplate` is given.

- title (ReactNode): The heading. Defaults to the model's name from its dictionary.

- sort (sort key): The initial sort. The toolbar offers the model's other sort keys.

- className (string): Classes for the whole container.

- cardListClassName (string): Classes for the card grid.

Render slots

- renderItem ((props) => ReactNode): The card body in card mode. It gets `{ [model]: item, slice, actions, columns, idx }`.

- renderTemplate ((props) => ReactNode): The form inside the edit and new modals. Without it there is no New button.

- renderView ((model) => ReactNode): The body of the view modal. Without it the view button opens nothing.

- renderTitle ((model) => ReactNode): The modal title. Defaults to the model name and the id.

- renderDashboard (({ summary, onSelect, queryKey, hidePresents }) => ReactNode): The area above the list, usually a `Data.Dashboard`. It needs the app's `summary` state.

- renderInsight (({ insight }) => ReactNode): The insight area above the list, usually a `Data.Insight`.

- renderQueryMaker (() => ReactNode): Replaces the filter-argument form under the toolbar.

- renderLoading (() => ReactNode): One placeholder card, repeated while the cards load.

Columns

You pass

- "name": A field name. The header label comes from the model's dictionary.

- "createdAt", "updatedAt", "startAt": Date fields with these and a few similar names are drawn as `RecentTime`.

- "status", "role": A name containing `status` or `role` is drawn as a coloured badge.

- { key, title?, render?, value?, responsive? }: Your own label and cell. `value` is what the CSV export writes instead of `render`.

- { key, responsive: true }: Shows the column from `md` up and hides it on smaller screens.

Actions and tools

- "view", "edit", "remove": Icon buttons wired to the store. `remove` asks for confirmation first.

- <YourButton />: Your own element. Rows put it in an Actions column, cards in the more menu.

- (item, idx) => DataAction[]: Decides the buttons per row, for example by status.

- { key, render }: A `tools` entry. A `tools` function receives the loaded list.

Filters and dashboard tiles

**The query maker lists the model's declared filters.** A filter with a model-typed arg is skipped, and an id arg whose `ref` names a model gets `Data.RefPicker`.

**It waits for required args.** Nothing is sent until each required arg has a value, and typing is debounced.

**A tile filters when it knows its query.** `queryMap[column]` wins; otherwise the summary field's `.meta({ refName, queryKey, queryArgs })` is used when it names this model. Without `onSelect` every tile is plain.

**`queryKey` keeps the active tile honest.** It is the filter the list shows, so a tile stops looking active once the toolbar moves off it.

Example

An admin product list that opens as rows and wires every row action to a modal:

**Root slice only.** Pass `fetch.slice.product`; a named slice such as `productInOrg` throws. Narrow the list with `query` instead.

**Give each action its slot.** `renderTemplate` fills the edit modal and brings the New button; `renderView` mounts the view modal.

**`Model.AdminPanel` does this wiring for you.** It takes the module's `Unit`, `Template` and `View` namespaces and fills these slots.

**`Data.*` is for admin screens.** It reads root slices, which are `Admin`-guarded, and ships a toolbar, a query maker and a data export: a lot of client JS for a list a visitor only reads. A product screen composes `Load.Units` with the module's own `Unit` and `Zone` instead.

RecentTime

Shows a time as a relative label such as "3 minutes ago", in the page's language, with the exact date in a tooltip. Past `breakUnit` it prints a date instead.

- date (Date | Dayjs | null): The time to show. `null` renders nothing.

- breakUnit (Intl.RelativeTimeFormatUnit): Where relative labels stop. Unset, they never switch to a date. See the table below.

- format ("auto" | "full", default "auto"): How a date past the break is printed. See the table below.

- relative ("fromNow" | "always" | "auto" | (ctx) => string, default "fromNow"): The wording of the relative label. See the table below.

- className (string): Classes for the label itself.

Where relative labels stop

Relative label while

- Not set — Always relative, never a date

- "second" — Never relative, always a date

- "minute" — Under 60 seconds

- "hour" — Under 60 minutes

- "day" — Under 24 hours

- "week" — Under 7 days

- "month" — Under 4 weeks

- "year" — Under 12 months

What it prints

Case

Shows

- Past the break, same day — HH:mm

- Past the break, same year — MM-DD

- Past the break, another year — YYYY-MM-DD

- Past the break, with `format="full"` — YY-MM-DD HH:mm

- Tooltip — YYYY-MM-DD HH:mm

- Tooltip, with `breakUnit="second"` — YYYY-MM-DD HH:mm:ss

- Epoch placeholder (`0` or `-1`) — --:--

Relative wording

Output for one day ago

Wording from

- "fromNow" — Example: `a day ago` — dayjs locale strings. The default.

- "always" — Example: `1 day ago` — `Intl.RelativeTimeFormat`, always as a number.

- "auto" — Example: `yesterday` — `Intl.RelativeTimeFormat`, with words like yesterday where the language has them.

- (ctx) => string — Example: `…` — Your own wording from `{ unit, count, date, now, defaultLabel }`.

A story byline that says "yesterday" rather than "a day ago", and a date after a week:

**It works in a server component.** The View above carries no `"use client"`.

**`breakUnit` is the first unit printed as a date.** With `"week"`, anything under a week stays relative and anything older prints a date.

Loading

Six indicators, one per shape of thing that is waiting. Pick by what the reader is looking at:

What is waiting

Use

- Content will appear in this spot — Loading.Skeleton

- A control or a small area is working — Loading.Spin

- The work has a known end, such as an upload — Loading.ProgressBar

- A whole panel is busy — Loading.Area

- A button or field is not rendered yet — Loading.Button · Loading.Input

- Loading.Spin ({ className?, indicator?, isCenter?, size?: "sm" | "md" | "lg" | number, tone? }, default size "md", tone "primary"): The spinner. `size` is a step or pixels; `tone` is `"primary"`, `"current"` or `"muted"`.

- Loading.Skeleton ({ className?, active?, style? }, default active true): Four grey text lines, pulsing while `active`. A good `fallback` for `Load.Stream`.

- Loading.ProgressBar ({ className?, value, max }): A determinate bar that animates to `value / max`. Use it when both numbers are real.

- Loading.Button ({ className?, active?, style? }, default active true): A button-shaped placeholder for a control not there yet. Not a spinner inside a button.

- Loading.Input ({ className?, active?, style? }, default active true): The same placeholder, shaped like an input field.

- Loading.Area ({ className?, indicator?, children? }): A blurred `absolute inset-0` cover with a spinner and a message (default: processing).

An upload row with a spinner and a progress bar:

**On a filled surface, use `tone="current"`.** The default `text-primary/70` vanishes on a `bg-info` badge or a primary button. A `text-*` in `className` beats every tone.

**A replacement icon needs no spin class.** An `indicator` keeps its own colour, and the wrapper spins an SVG icon for you, so leave out `animate-spin`.

**Covers need a positioned parent.** `Loading.Area` and `Loading.Spin isCenter` are `absolute inset-0`, so put them inside a `relative` element.

**Each member is its own override slot.** `LoadingSkeleton` can be re-skinned without touching `LoadingSpin`, and likewise for the other four.

Badge

The status pill: a `<span>` with the `badgeRecipe` variants and nothing else. Every other attribute passes through, so `title`, `aria-*` and a click handler all work.

- variant ("default" | "primary" | "secondary" | "accent" | "neutral" | "success" | "warning" | "info" | "error" | "outline", default "default"): The colour. Map a model enum to it through a module-scope `as const` table.

- size ("xs" | "sm" | "md" | "lg", default "md"): Height and text size.

- outline (boolean): Draws the variant's colour as an outline. `variant="outline"` is the plain, uncoloured one.

- ...HTMLAttributes<HTMLSpanElement> (attributes): Everything a `<span>` takes. `className` is merged last and wins over the variant.

A job status badge. The enum maps to a variant through a module-scope table:

**Restyle every badge at once.** Bind `recipes: { badge }` in a route's `_overrides.tsx`; no call site changes.

**Need only the classes? Call `badgeRecipe`.** `badgeRecipe(variants, className)` gives a badge look to an `<a>` or a `<button>`. It is server-safe and takes an array as the second argument, so skip `cn()`.

Empty

The standard "no data" state: an icon, a translated message, and room for a follow-up action below.

- description (ReactNode, default l("base.noData")): The empty-state text. The default is the translated no-data label.

- icon (ReactNode): The mark above the text. Defaults to an inbox icon.

- minHeight (number, default 300): Minimum height of the empty body, in pixels.

- className (string): Classes for the empty body. `children` sit outside it.

- children (ReactNode): Content under the empty body, such as a create button.

A product list whose empty state offers a create button, passed through `Load.Units`:

**You rarely mount it yourself.** `Load.Units` already draws `<Empty />` for a slice with no rows, and `Table` draws one at 160 px. Pass your own only to change it.

**One override restyles them all.** `Empty` is an override slot, so a route's `_overrides.tsx` changes every empty state under it.

Table

A responsive table for rows you already hold. For a model listing wired to the store, use `Data.TableList` instead.

- columns ({ key?, title, dataIndex, render?, responsive? }[]): One header and cell per column. `responsive` lists the breakpoints where it shows.

- dataSource (any[]): The rows to draw, all of them. Slice it to the current page yourself.

- rowKey ((row) => string): The React key per row. Defaults to the row index.

- loading (boolean): Dims the rows and draws `loadingIndicator` over them.

- loadingIndicator (ReactNode): The mark shown over the rows while `loading`. Defaults to a spinner.

- pagination (PaginationProps | false): Draws a `Pagination` under the table. Unset or `false` draws none.

- onRow ((record, index) => { onClick }): Row events such as click-to-open. Rows then show a pointer cursor.

- rowClassName (string | (record, index) => string): Classes for every row, or per row.

- size ("small" | "middle"): `"small"` tightens the cell padding.

- bordered (boolean): Draws a rounded border around the table.

- showHeader (boolean | Responsive[], default true): Hides the header, or shows it only at the listed breakpoints.

- header (ReactNode): Content drawn above the table.

- footer (ReactNode): Content drawn below the table, under the pager.

- empty (ReactNode, default <Empty minHeight={160} />): The placeholder for a table with no rows.

An invoice table that pages locally and hides the amount on small screens:

**`Table` does not slice the rows.** It draws all of `dataSource`, so hand it the current page, as above.

**`pagination` forwards four fields only.** `currentPage`, `total`, `itemsPerPage` and `onPageSelect` reach the pager. For `prev`, `next` or `empty`, set `pagination={false}` and render a `Pagination` in `footer`.

Pagination

A standalone page-number control for page state you hold yourself. When the state belongs to a model slice, use `Data.Pagination`.

- currentPage (number): The current page, counted from 1.

- total (number): The total item count. At 0 the pager renders `empty`, or nothing.

- itemsPerPage (number): Items per page. The page count is `total / itemsPerPage`, rounded up.

- onPageSelect ((page: number) => void): Called with the chosen page, counted from 1.

- prev (ReactNode): The mark inside the previous-page button. The button itself stays the framework's.

- next (ReactNode): The mark inside the next-page button.

- ellipsis (ReactNode): The mark standing in for the pages a long pager skips.

- empty (ReactNode): The placeholder for a pager with no pages. Replaces the deprecated `renderEmpty`.

- classNames ({ className?, activePageNumClassName?, pageNumClassName? }): Classes for the wrapper, the current page button and the other page buttons.

A photo grid that shows twelve items a page:

**Long pagers fold.** Past ten pages it shows the first and last page, five pages around the current one, and `ellipsis` for the rest.

**It follows the button recipe.** The page buttons use the route's `button` recipe slot, and `Pagination` itself is an override slot.

## Code Examples

### apps/koyo/lib/product/Product.Zone.tsx

```ts
"use client";
import { fetch, Product } from "@apps/koyo/client";
import { Data } from "akanjs/ui";

export const Admin = () => {
  return (
    <Data.ListContainer
      slice={fetch.slice.product}
      type="list"
      columns={["name", "status", "createdAt"]}
      actions={["view", "edit", "remove"]}
      renderItem={Product.Unit.Card}
      renderTemplate={Product.Template.General}
      renderView={(product) => <Product.View.General product={product} />}
    />
  );
};
```

### apps/koyo/lib/story/Story.View.tsx

```ts
import type { cnst } from "@apps/koyo/client";
import type { ModelProps } from "akanjs/client";
import { RecentTime } from "akanjs/ui";

export const Meta = ({ story }: ModelProps<"story", cnst.LightStory>) => {
  return (
    <div className="text-foreground/60 text-sm">
      <RecentTime date={story.createdAt} relative="auto" breakUnit="week" />
    </div>
  );
};
```

### apps/koyo/ui/UploadProgress.tsx

```ts
import { cn } from "akanjs/client";
import { Loading } from "akanjs/ui";

interface UploadProgressProps {
  className?: string;
  sent: number;
  total: number;
}
export const UploadProgress = ({ className, sent, total }: UploadProgressProps) => {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <Loading.Spin size="sm" tone="current" />
      <Loading.ProgressBar value={sent} max={total} className="flex-1" />
    </div>
  );
};
```

### apps/koyo/lib/job/Job.Unit.tsx

```ts
import { type cnst, usePage } from "@apps/koyo/client";
import type { ModelProps } from "akanjs/client";
import { Badge, type BadgeVariants } from "akanjs/ui";

const variantOf = {
  ready: "info",
  running: "warning",
  done: "success",
} as const satisfies { [key in cnst.JobStatus["value"]]: BadgeVariants["variant"] };

export const Status = ({ job }: ModelProps<"job", cnst.LightJob>) => {
  const { l } = usePage();
  return <Badge variant={variantOf[job.status]}>{l(`jobStatus.${job.status}`)}</Badge>;
};
```

### apps/koyo/lib/product/Product.Zone.tsx

```ts
"use client";
import { type cnst, Product, usePage } from "@apps/koyo/client";
import type { ClientInit } from "akanjs/fetch";
import { buttonRecipe, Empty, Link, Load } from "akanjs/ui";

interface CardProps {
  className?: string;
  init: ClientInit<"product", cnst.LightProduct>;
}
export const Card = ({ className, init }: CardProps) => {
  const { l } = usePage();
  const empty = (
    <Empty description={l.trans({ en: "No products yet", ko: "상품이 없습니다" })}>
      <Link href="/product/new" className={buttonRecipe({ variant: "primary" })}>
        {l.trans({ en: "Create product", ko: "상품 만들기" })}
      </Link>
    </Empty>
  );
  return (
    <Load.Units
      className={className}
      init={init}
      empty={empty}
      renderItem={(product) => (
        <Product.Unit.Card key={product.id} product={product} />
      )}
    />
  );
};
```

### apps/koyo/ui/InvoiceTable.tsx

```ts
"use client";
import { usePage } from "@apps/koyo/client";
import { Table } from "akanjs/ui";
import { useState } from "react";

interface InvoiceRow {
  id: string;
  name: string;
  amount: number;
}
interface InvoiceTableProps {
  className?: string;
  rows: InvoiceRow[];
}
export const InvoiceTable = ({ className, rows }: InvoiceTableProps) => {
  const { l } = usePage();
  const [page, setPage] = useState(1);
  return (
    <div className={className}>
      <Table
        columns={[
          {
            key: "name",
            title: l.trans({ en: "Name", ko: "이름" }),
            dataIndex: "name",
          },
          {
            key: "amount",
            title: l.trans({ en: "Amount", ko: "금액" }),
            dataIndex: "amount",
            responsive: ["md", "lg", "xl"],
          },
        ]}
        dataSource={rows.slice((page - 1) * 20, page * 20)}
        rowKey={(row: InvoiceRow) => row.id}
        pagination={{
          currentPage: page,
          total: rows.length,
          itemsPerPage: 20,
          onPageSelect: setPage,
        }}
      />
    </div>
  );
};
```

### apps/koyo/ui/PagedGrid.tsx

```ts
"use client";
import { Pagination } from "akanjs/ui";
import { type ReactNode, useState } from "react";

interface PagedGridProps {
  className?: string;
  items: ReactNode[];
}
export const PagedGrid = ({ className, items }: PagedGridProps) => {
  const [page, setPage] = useState(1);
  return (
    <div className={className}>
      <div className="grid grid-cols-3 gap-2">{items.slice((page - 1) * 12, page * 12)}</div>
      <Pagination
        currentPage={page}
        total={items.length}
        itemsPerPage={12}
        onPageSelect={setPage}
      />
    </div>
  );
};
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.

