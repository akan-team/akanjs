import { usePage } from "@apps/akan/client";
import { Docs, type UiComponentReference, UiComponentSlide } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();
  const components: UiComponentReference[] = [
    {
      name: "Data",
      desc: l.trans({
        en: "Namespace for generated model list and dashboard displays. `Data.ListContainer` is the main high-level component; lower-level helpers include `TableList`, `CardList`, `Pagination`, `Dashboard`, and `Insight`.",
        ko: "generated model list와 dashboard display를 위한 namespace입니다. `Data.ListContainer`가 주요 high-level component이며, lower-level helper로 `TableList`, `CardList`, `Pagination`, `Dashboard`, `Insight`를 제공합니다.",
      }),
      props: [
        {
          name: "Data.ListContainer",
          type: "{ slice, type?, columns?, actions?, tools? }",
          desc: l.trans({
            en: "Feature-rich generated model list container.",
            ko: "기능이 많은 generated model list container입니다.",
          }),
        },
        {
          name: "Data.TableList",
          type: "{ slice, columns, actions?, renderView? }",
          desc: l.trans({
            en: "Table-style list wired to generated store state.",
            ko: "generated store state와 연결된 table-style list입니다.",
          }),
        },
        {
          name: "Data.Pagination",
          type: "{ slice, className? }",
          desc: l.trans({
            en: "Pagination control bound to generated slice page state.",
            ko: "generated slice page state에 묶인 pagination control입니다.",
          }),
        },
      ],
      code: `import { Data } from "akanjs/ui";

export const ProductZone = ({ slice }) => (
  <Data.ListContainer
    slice={slice}
    type="list"
    columns={["name", "createdAt", "updatedAt"]}
    actions={["view", "edit", "remove"]}
  />
);`,
    },
    {
      name: "RecentTime",
      desc: l.trans({
        en: "Localized relative-time label with a tooltip containing the absolute date. It switches from relative labels to formatted dates after the configured break unit.",
        ko: "절대 시간을 tooltip으로 제공하는 localized relative-time label입니다. 설정한 break unit 이후에는 relative label 대신 formatted date로 전환됩니다.",
      }),
      props: [
        {
          name: "date",
          type: "Date | Dayjs | null",
          desc: l.trans({
            en: "Date value to render. Null renders nothing.",
            ko: "렌더링할 date 값입니다. null이면 아무것도 렌더링하지 않습니다.",
          }),
        },
        {
          name: "breakUnit",
          type: "Intl.RelativeTimeFormatUnit",
          desc: l.trans({
            en: "Unit where relative display stops and date formatting begins.",
            ko: "relative display를 멈추고 date formatting을 시작할 기준 unit입니다.",
          }),
        },
        {
          name: "format",
          type: '"auto" | "full"',
          desc: l.trans({
            en: "Automatic compact format or full date-time format.",
            ko: "자동 compact format 또는 전체 date-time format입니다.",
          }),
        },
      ],
      code: `import { RecentTime } from "akanjs/ui";

export const StoryMeta = ({ story }) => (
  <div className="text-sm text-base-content/60">
    <RecentTime date={story.createdAt} breakUnit="second" format="full" />
  </div>
);`,
    },
    {
      name: "Loading",
      desc: l.trans({
        en: "Namespace of loading indicators for async UI: full-area overlays, buttons, inputs, progress bars, skeletons, and spinners.",
        ko: "async UI를 위한 loading indicator namespace입니다. full-area overlay, button, input, progress bar, skeleton, spinner를 포함합니다.",
      }),
      props: [
        {
          name: "Loading.Area",
          type: "component",
          desc: l.trans({
            en: "Absolute overlay for blocking a local area.",
            ko: "local area를 막는 absolute overlay입니다.",
          }),
        },
        {
          name: "Loading.Skeleton",
          type: "{ active?, className?, style? }",
          desc: l.trans({
            en: "Skeleton placeholder for pending content.",
            ko: "pending content를 위한 skeleton placeholder입니다.",
          }),
        },
        {
          name: "Loading.Button",
          type: "component",
          desc: l.trans({
            en: "Button-friendly loading indicator.",
            ko: "button에 넣기 좋은 loading indicator입니다.",
          }),
        },
        {
          name: "Loading.Spin",
          type: "component",
          desc: l.trans({ en: "Simple spinner.", ko: "단순 spinner입니다." }),
        },
      ],
      code: `import { Loading } from "akanjs/ui";

export const SummaryPanel = ({ loading, children }) => (
  <div className="relative min-h-40">
    {children}
    {loading ? <Loading.Area /> : null}
  </div>
);`,
    },
    {
      name: "Empty",
      desc: l.trans({
        en: "Standard no-data state with a localized default description and optional content below the empty body.",
        ko: "localized default description과 optional child content를 제공하는 표준 no-data state입니다.",
      }),
      props: [
        {
          name: "description",
          type: "ReactNode",
          desc: l.trans({
            en: "Custom empty-state text. Defaults to localized `base.noData`.",
            ko: "custom empty-state text입니다. 기본값은 localized `base.noData`입니다.",
          }),
        },
        {
          name: "minHeight",
          type: "number",
          desc: l.trans({ en: "Minimum empty body height in pixels.", ko: "empty body의 최소 높이(px)입니다." }),
        },
        {
          name: "children",
          type: "ReactNode",
          desc: l.trans({
            en: "Optional follow-up action or explanation rendered below the empty state.",
            ko: "empty state 아래에 렌더링되는 optional follow-up action 또는 설명입니다.",
          }),
        },
      ],
      code: `import { Empty, Link } from "akanjs/ui";

export const EmptyProducts = () => (
  <Empty description="No products yet">
    <Link href="/products/new" className="btn btn-primary">Create product</Link>
  </Empty>
);`,
    },
    {
      name: "Table",
      desc: l.trans({
        en: "Responsive table wrapper used by data-heavy screens. It supports column renderers, row click handlers, loading state, empty state, and optional `Pagination`.",
        ko: "data-heavy screen에서 사용하는 responsive table wrapper입니다. column renderer, row click handler, loading state, empty state, optional `Pagination`을 지원합니다.",
      }),
      props: [
        {
          name: "columns",
          type: "Column[]",
          desc: l.trans({
            en: "Header/cell definitions with optional responsive visibility.",
            ko: "optional responsive visibility를 포함하는 header/cell 정의입니다.",
          }),
        },
        {
          name: "dataSource",
          type: "unknown[]",
          desc: l.trans({ en: "Rows rendered by the table.", ko: "table에 렌더링되는 row 목록입니다." }),
        },
        {
          name: "pagination",
          type: "PaginationProps | false",
          desc: l.trans({
            en: "Pagination config or false to disable.",
            ko: "pagination 설정이거나 비활성화를 위한 false입니다.",
          }),
        },
        {
          name: "onRow",
          type: "(record, index) => handlers",
          desc: l.trans({
            en: "Factory for row events such as click navigation.",
            ko: "click navigation 같은 row event를 만드는 factory입니다.",
          }),
        },
      ],
      code: `import { Table } from "akanjs/ui";

<Table
  columns={[{ title: "Name", dataIndex: "name" }]}
  dataSource={products}
  loading={loading}
  pagination={{ currentPage, total, itemsPerPage: 20, onPageSelect: setPage }}
/>;`,
    },
    {
      name: "Pagination",
      desc: l.trans({
        en: "Standalone page-number control. Use it when pagination state is local; use `Data.Pagination` when the state is generated from a model slice.",
        ko: "standalone page-number control입니다. pagination state가 local이면 이 컴포넌트를 사용하고, model slice에서 생성된 state라면 `Data.Pagination`을 사용합니다.",
      }),
      props: [
        {
          name: "currentPage",
          type: "number",
          desc: l.trans({ en: "Current 1-based page number.", ko: "현재 1-based page number입니다." }),
        },
        {
          name: "total",
          type: "number",
          desc: l.trans({ en: "Total item count.", ko: "전체 item 수입니다." }),
        },
        {
          name: "itemsPerPage",
          type: "number",
          desc: l.trans({ en: "Number of items per page.", ko: "page당 item 수입니다." }),
        },
        {
          name: "onPageSelect",
          type: "(page: number) => void",
          desc: l.trans({
            en: "Called with the selected 1-based page number.",
            ko: "선택한 1-based page number와 함께 호출됩니다.",
          }),
        },
      ],
      code: `import { Pagination } from "akanjs/ui";

<Pagination
  currentPage={page}
  total={total}
  itemsPerPage={20}
  onPageSelect={setPage}
/>;`,
    },
  ];

  return (
    <Scroll>
      <Scroll.Slide id="display-ui" title={l.trans({ en: "Display UI", ko: "Display UI" })}>
        <Docs.Title>{l.trans({ en: "Display UI", ko: "Display UI" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Display components render model lists, timestamps, loading feedback, empty states, and table/pagination surfaces. Prefer `Data` for generated model lists and standalone helpers for local UI state.",
              ko: "Display component는 model list, timestamp, loading feedback, empty state, table/pagination surface를 렌더링합니다. generated model list에는 `Data`, local UI state에는 standalone helper를 우선 사용합니다.",
            })}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />
      {components.map((component) => (
        <UiComponentSlide key={component.name} component={component} />
      ))}
      <Scroll.TitleNavigator className="fixed top-32 right-0 hidden w-[250px] flex-col gap-2 lg:flex" />
    </Scroll>
  );
}
