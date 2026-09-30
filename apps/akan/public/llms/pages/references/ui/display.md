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

The admin listing screen and its parts, bound to one model's slice.

A time shown as "3 minutes ago", with the exact date in a tooltip.

Six waiting indicators: spinner, skeleton, progress bar and three placeholders.

A status pill: a `<span>` styled by `badgeRecipe`.

The "no data" placeholder, with room for a follow-up action below it.

Rows you already hold, drawn as a table with an optional pager.

A page-number control driven entirely by props.

Metadata naming one model list and the store keys it fills. Get it from `fetch.slice.<model>`.

The client state generated per model. `st.use` reads it and `st.do` changes it.

Aggregates a slice returns beside its rows, such as `count`.

A component name a route's `_overrides.tsx` can swap for the app's own version.

Store

Props

Pager

Reads a slice's page, limit and count from the store.

Takes `currentPage`, `total` and `itemsPerPage` as props.

Table

A listing wired to a model: rows, pager and modals all come from the slice.

Rows you already hold, passed in as `dataSource`.

How a product screen lists and shows data.

Override slots

Recipe slots

The whole admin listing: toolbar, dashboard, rows or cards, and the CRUD modals.

The listing as rows, with its own edit and view modals. `queryArgs` makes it load on mount.

The listing as cards. Each `renderItem` result sits in a `Data.Item` with the row actions.

One card: `children` (or `title`) on top, then the listed columns and the action buttons.

The pager. It reads page state from the slice's store, not from props.

Summary tiles above the list. A tile that knows its filter narrows the list on click.

Tiles for the slice's insight values. The total count is already in the header.

Picks a declared filter and fills its args. `onApply` defaults to the slice's store.

Picks a row of another model for a filter arg whose `ref` names it, such as an owner id.

The model's root slice, `fetch.slice.<model>`.

The first rendering. The toolbar toggle switches between cards and rows.

Fixes the filter. The query maker and the dashboard are then not drawn.

The filter per summary column. `?filter=<column>` opens the list on that filter.

The first fetch: page, limit, sort, and the defaults a new model starts from.

Fields shown in each row and card, and written by the CSV export.

Row buttons. A function decides them per row.

Extra entries in the toolbar's more menu, beside CSV and JSON export.

Shows the New button, as long as `renderTemplate` is given.

The heading. Defaults to the model's name from its dictionary.

The initial sort. The toolbar offers the model's other sort keys.

Classes for the whole container.

Classes for the card grid.

The card body in card mode. It gets `{ [model]: item, slice, actions, columns, idx }`.

The form inside the edit and new modals. Without it there is no New button.

The body of the view modal. Without it the view button opens nothing.

The modal title. Defaults to the model name and the id.

The area above the list, usually a `Data.Dashboard`. It needs the app's `summary` state.

The insight area above the list, usually a `Data.Insight`.

Replaces the filter-argument form under the toolbar.

One placeholder card, repeated while the cards load.

A field name. The header label comes from the model's dictionary.

Date fields with these and a few similar names are drawn as `RecentTime`.

A name containing `status` or `role` is drawn as a coloured badge.

Your own label and cell. `value` is what the CSV export writes instead of `render`.

Shows the column from `md` up and hides it on smaller screens.

Icon buttons wired to the store. `remove` asks for confirmation first.

Your own element. Rows put it in an Actions column, cards in the more menu.

Decides the buttons per row, for example by status.

A `tools` entry. A `tools` function receives the loaded list.

The time to show. `null` renders nothing.

Where relative labels stop. Unset, they never switch to a date. See the table below.

How a date past the break is printed. See the table below.

The wording of the relative label. See the table below.

Classes for the label itself.

Past the break, same day

Past the break, same year

Past the break, another year

Past the break, with `format="full"`

Tooltip

Tooltip, with `breakUnit="second"`

Epoch placeholder (`0` or `-1`)

Not set

Always relative, never a date

Never relative, always a date

Under 60 seconds

Under 60 minutes

Under 24 hours

Under 7 days

Under 4 weeks

Under 12 months

a day ago

dayjs locale strings. The default.

1 day ago

`Intl.RelativeTimeFormat`, always as a number.

yesterday

`Intl.RelativeTimeFormat`, with words like yesterday where the language has them.

Your own wording from `{ unit, count, date, now, defaultLabel }`.

Content will appear in this spot

A control or a small area is working

The work has a known end, such as an upload

A whole panel is busy

A button or field is not rendered yet

The spinner. `size` is a step or pixels; `tone` is `"primary"`, `"current"` or `"muted"`.

Four grey text lines, pulsing while `active`. A good `fallback` for `Load.Stream`.

A determinate bar that animates to `value / max`. Use it when both numbers are real.

A button-shaped placeholder for a control not there yet. Not a spinner inside a button.

The same placeholder, shaped like an input field.

A blurred `absolute inset-0` cover with a spinner and a message (default: processing).

The colour. Map a model enum to it through a module-scope `as const` table.

Height and text size.

Draws the variant's colour as an outline. `variant="outline"` is the plain, uncoloured one.

Everything a `<span>` takes. `className` is merged last and wins over the variant.

The empty-state text. The default is the translated no-data label.

The mark above the text. Defaults to an inbox icon.

Minimum height of the empty body, in pixels.

Classes for the empty body. `children` sit outside it.

Content under the empty body, such as a create button.

One header and cell per column. `responsive` lists the breakpoints where it shows.

The rows to draw, all of them. Slice it to the current page yourself.

The React key per row. Defaults to the row index.

Dims the rows and draws `loadingIndicator` over them.

The mark shown over the rows while `loading`. Defaults to a spinner.

Draws a `Pagination` under the table. Unset or `false` draws none.

Row events such as click-to-open. Rows then show a pointer cursor.

Classes for every row, or per row.

`"small"` tightens the cell padding.

Draws a rounded border around the table.

Hides the header, or shows it only at the listed breakpoints.

Content drawn above the table.

Content drawn below the table, under the pager.

The placeholder for a table with no rows.

The current page, counted from 1.

The total item count. At 0 the pager renders `empty`, or nothing.

Items per page. The page count is `total / itemsPerPage`, rounded up.

Called with the chosen page, counted from 1.

The mark inside the previous-page button. The button itself stays the framework's.

The mark inside the next-page button.

The mark standing in for the pages a long pager skips.

The placeholder for a pager with no pages. Replaces the deprecated `renderEmpty`.

Classes for the wrapper, the current page button and the other page buttons.

Display UI

Component

Words used on this page

Term

Store-bound or prop-bound

Where its values come from

Not used

Related pages

Data

Members

Data.ListContainer props

Render slots

Columns

You pass

Actions and tools

Filters and dashboard tiles

Example

An admin product list that opens as rows and wires every row action to a modal:

RecentTime

Where relative labels stop

Relative label while

What it prints

Case

Shows

Relative wording

Output for one day ago

Wording from

A story byline that says "yesterday" rather than "a day ago", and a date after a week:

Loading

Six indicators, one per shape of thing that is waiting. Pick by what the reader is looking at:

What is waiting

Use

An upload row with a spinner and a progress bar:

Badge

A job status badge. The enum maps to a variant through a module-scope table:

Empty

The standard "no data" state: an icon, a translated message, and room for a follow-up action below.

An invoice table that pages locally and hides the amount on small screens:

Pagination

A photo grid that shows twelve items a page:

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

