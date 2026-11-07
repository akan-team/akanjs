import { usePage } from "@apps/akan/client";
import { Code, Divider, Docs, DocsToc } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { page } from "akanjs/client";

export default page()
  .config({ transition: "fade" })
  .head(({ lang }) => {
    const title = lang === "ko" ? "UI 레퍼런스: Display | Akan.js" : "UI Reference: Display | Akan.js";
    const description =
      lang === "ko"
        ? "Data와 RecentTime, Loading, Badge, Empty, Table, Pagination."
        : "Data, RecentTime, Loading, Badge, Empty, Table and Pagination.";
    return (
      <>
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
      </>
    );
  })
  .render(() => {
    const { l } = usePage();

    const chip = "mt-2 block overflow-x-auto whitespace-nowrap rounded-md bg-muted/60 px-2.5 py-1.5 font-mono text-xs";

    const componentRows = [
      {
        name: "Data",
        desc: l.trans({
          en: "The admin listing screen and its parts, bound to one model's slice.",
          ko: "모델 하나의 slice에 묶인 admin 목록 화면과 그 부품들입니다.",
        }),
      },
      {
        name: "RecentTime",
        desc: l.trans({
          en: 'A time shown as "3 minutes ago", with the exact date in a tooltip.',
          ko: '시간을 "3분 전"처럼 보여 주고, 정확한 날짜는 툴팁으로 띄웁니다.',
        }),
      },
      {
        name: "Loading",
        desc: l.trans({
          en: "Six waiting indicators: spinner, skeleton, progress bar and three placeholders.",
          ko: "기다리는 동안 보여 줄 표시 여섯 가지입니다. spinner, skeleton, 진행률 막대 등이 있습니다.",
        }),
      },
      {
        name: "Badge",
        desc: l.trans({
          en: "A status pill: a `<span>` styled by `badgeRecipe`.",
          ko: "상태를 보여 주는 작은 배지입니다. `badgeRecipe`로 꾸민 `<span>`입니다.",
        }),
      },
      {
        name: "Empty",
        desc: l.trans({
          en: 'The "no data" placeholder, with room for a follow-up action below it.',
          ko: '"데이터 없음" 자리 표시입니다. 아래에 다음 행동 버튼을 둘 수 있습니다.',
        }),
      },
      {
        name: "Table",
        desc: l.trans({
          en: "Rows you already hold, drawn as a table with an optional pager.",
          ko: "이미 가진 행 데이터를 표로 그립니다. pager를 붙일 수 있습니다.",
        }),
      },
      {
        name: "Pagination",
        desc: l.trans({
          en: "A page-number control driven entirely by props.",
          ko: "prop만으로 동작하는 페이지 번호 control입니다.",
        }),
      },
    ];

    const termRows = [
      {
        name: "slice",
        desc: l.trans({
          en: "Metadata naming one model list and the store keys it fills. Get it from `fetch.slice.<model>`.",
          ko: "모델 목록 하나와 그 목록이 채우는 store key를 가리키는 메타데이터입니다. `fetch.slice.<model>`로 꺼냅니다.",
        }),
      },
      {
        name: "store",
        desc: l.trans({
          en: "The client state generated per model. `st.use` reads it and `st.do` changes it.",
          ko: "모델마다 생성되는 클라이언트 상태입니다. `st.use`로 읽고 `st.do`로 바꿉니다.",
        }),
      },
      {
        name: "insight",
        desc: l.trans({
          en: "Aggregates a slice returns beside its rows, such as `count`.",
          ko: "slice가 행과 함께 돌려주는 집계 값입니다. `count`가 대표적입니다.",
        }),
      },
      {
        name: "override slot",
        desc: l.trans({
          en: "A component name a route's `_overrides.tsx` can swap for the app's own version.",
          ko: "route의 `_overrides.tsx`가 앱 자체 컴포넌트로 바꿔 끼울 수 있는 이름입니다.",
        }),
      },
    ];

    const pairColumns = [
      { key: "store", label: l.trans({ en: "Store", ko: "store" }), caption: "slice" },
      { key: "props", label: l.trans({ en: "Props", ko: "props" }) },
    ];
    const pairGroups = [
      {
        label: l.trans({ en: "Pager", ko: "페이지 넘기기" }),
        rows: [
          {
            name: "Data.Pagination",
            desc: l.trans({
              en: "Reads a slice's page, limit and count from the store.",
              ko: "slice의 현재 페이지·페이지 크기·전체 개수를 store에서 읽습니다.",
            }),
            marks: { store: true, props: false },
          },
          {
            name: "Pagination",
            desc: l.trans({
              en: "Takes `currentPage`, `total` and `itemsPerPage` as props.",
              ko: "`currentPage`, `total`, `itemsPerPage`를 prop으로 받습니다.",
            }),
            marks: { store: false, props: true },
          },
        ],
      },
      {
        label: l.trans({ en: "Table", ko: "표" }),
        rows: [
          {
            name: "Data.TableList",
            desc: l.trans({
              en: "A listing wired to a model: rows, pager and modals all come from the slice.",
              ko: "모델에 연결된 목록입니다. 행, pager, modal이 모두 slice에서 옵니다.",
            }),
            marks: { store: true, props: false },
          },
          {
            name: "Table",
            desc: l.trans({
              en: "Rows you already hold, passed in as `dataSource`.",
              ko: "이미 가진 행을 `dataSource`로 넘깁니다.",
            }),
            marks: { store: false, props: true },
          },
        ],
      },
    ];

    const relatedLinks = [
      {
        href: "/references/ui/core#Load",
        title: "Load.Units · Load.View",
        desc: l.trans({
          en: "How a product screen lists and shows data.",
          ko: "제품 화면에서 데이터를 목록으로 보여 주는 방법입니다.",
        }),
      },
      {
        href: "/references/ui/core#Model",
        title: "Model.AdminPanel",
        desc: l.trans({
          en: (
            <span>
              Builds a <code>Data.ListContainer</code> from a module's own components.
            </span>
          ),
          ko: (
            <span>
              모듈의 컴포넌트로 <code>Data.ListContainer</code>를 대신 조립해 줍니다.
            </span>
          ),
        }),
      },
      {
        href: "/references/ui/customize#slots",
        title: l.trans({ en: "Override slots", ko: "Override slot" }),
        desc: l.trans({
          en: (
            <span>
              Re-skin <code>Empty</code>, <code>Table</code>, <code>Pagination</code>, <code>Badge</code> and each{" "}
              <code>Loading</code> member per route.
            </span>
          ),
          ko: (
            <span>
              <code>Empty</code>, <code>Table</code>, <code>Pagination</code>, <code>Badge</code>, <code>Loading</code>{" "}
              멤버를 route별로 바꿔 씁니다.
            </span>
          ),
        }),
      },
      {
        href: "/references/ui/customize#recipe-slots",
        title: l.trans({ en: "Recipe slots", ko: "Recipe slot" }),
        desc: l.trans({
          en: (
            <span>
              Restyle every badge at once with <code>{"recipes: { badge }"}</code>.
            </span>
          ),
          ko: (
            <span>
              <code>{"recipes: { badge }"}</code> 하나로 모든 배지의 모양을 바꿉니다.
            </span>
          ),
        }),
      },
    ];

    const dataMembers = [
      {
        key: "Data.ListContainer",
        type: "{ slice, type?, query?, columns?, actions?, tools?, render…? }",
        desc: l.trans({
          en: "The whole admin listing: toolbar, dashboard, rows or cards, and the CRUD modals.",
          ko: "admin 목록 화면 전체입니다. toolbar, dashboard, 표나 카드 목록, CRUD modal을 모두 그립니다.",
        }),
      },
      {
        key: "Data.TableList",
        type: "{ slice, columns, init?, queryArgs?, actions?, renderView?, renderTemplate?, renderTitle?, onItemClick? }",
        desc: l.trans({
          en: "The listing as rows, with its own edit and view modals. `queryArgs` makes it load on mount.",
          ko: "목록을 행으로 그리고 edit·view modal도 직접 띄웁니다. `queryArgs`를 주면 마운트할 때 직접 불러옵니다.",
        }),
      },
      {
        key: "Data.CardList",
        type: "{ slice, columns, renderItem, init?, actions?, renderView?, renderTemplate?, renderLoading? }",
        desc: l.trans({
          en: "The listing as cards. Each `renderItem` result sits in a `Data.Item` with the row actions.",
          ko: "목록을 카드로 그립니다. `renderItem` 결과는 행 action이 달린 `Data.Item` 안에 놓입니다.",
        }),
      },
      {
        key: "Data.Item",
        type: "{ slice, model, title?, actions?, columns?, onClick?, children? }",
        desc: l.trans({
          en: "One card: `children` (or `title`) on top, then the listed columns and the action buttons.",
          ko: "카드 하나입니다. 위에 `children`(없으면 `title`), 아래에 column 값과 action 버튼이 옵니다.",
        }),
      },
      {
        key: "Data.Pagination",
        type: "{ slice, className? }",
        desc: l.trans({
          en: "The pager. It reads page state from the slice's store, not from props.",
          ko: "pager입니다. 페이지 상태를 prop이 아니라 slice의 store에서 읽습니다.",
        }),
      },
      {
        key: "Data.Dashboard",
        type: "{ slice, summary, columns?, presents?, hidePresents?, queryMap?, summaryRefName?, onSelect?, queryKey? }",
        desc: l.trans({
          en: "Summary tiles above the list. A tile that knows its filter narrows the list on click.",
          ko: "목록 위의 요약 타일입니다. 자기 filter를 아는 타일은 누르면 목록을 좁힙니다.",
        }),
      },
      {
        key: "Data.Insight",
        type: "{ slice, insight, columns? }",
        desc: l.trans({
          en: "Tiles for the slice's insight values. The total count is already in the header.",
          ko: "slice의 insight 값을 타일로 보여 줍니다. 전체 개수는 이미 header에 있습니다.",
        }),
      },
      {
        key: "Data.QueryMaker",
        type: "{ slice, query?, onApply? }",
        desc: l.trans({
          en: "Picks a declared filter and fills its args. `onApply` defaults to the slice's store.",
          ko: "선언된 filter를 고르고 인자를 채웁니다. `onApply`의 기본값은 slice의 store입니다.",
        }),
      },
      {
        key: "Data.RefPicker",
        type: "{ refName, value, onChange }",
        desc: l.trans({
          en: "Picks a row of another model for a filter arg whose `ref` names it, such as an owner id.",
          ko: "filter 인자의 `ref`가 가리키는 모델에서 행을 골라 id를 채웁니다. owner id가 대표적입니다.",
        }),
      },
    ];

    const listContainerProps = [
      {
        key: "slice",
        type: "SliceMeta",
        desc: l.trans({
          en: "The model's root slice, `fetch.slice.<model>`.",
          ko: "모델의 root slice인 `fetch.slice.<model>`입니다.",
        }),
      },
      {
        key: "type",
        type: '"card" | "list"',
        default: '"card"',
        desc: l.trans({
          en: "The first rendering. The toolbar toggle switches between cards and rows.",
          ko: "처음 보여 줄 모양입니다. toolbar 토글로 카드와 표를 오갑니다.",
        }),
      },
      {
        key: "query",
        type: "QuerySetting",
        desc: l.trans({
          en: "Fixes the filter. The query maker and the dashboard are then not drawn.",
          ko: "filter를 고정합니다. 이때 query maker와 dashboard는 그리지 않습니다.",
        }),
      },
      {
        key: "queryMap",
        type: "{ [column]: QuerySetting }",
        desc: l.trans({
          en: "The filter per summary column. `?filter=<column>` opens the list on that filter.",
          ko: "요약 column마다 적용할 filter입니다. `?filter=<column>`으로 열면 그 filter로 시작합니다.",
        }),
      },
      {
        key: "init",
        type: "FetchInitForm",
        desc: l.trans({
          en: "The first fetch: page, limit, sort, and the defaults a new model starts from.",
          ko: "첫 조회 설정입니다. page, limit, sort와 새 모델의 기본값을 담습니다.",
        }),
      },
      {
        key: "columns",
        type: "DataColumn[]",
        default: '["id", "createdAt", "updatedAt"]',
        desc: l.trans({
          en: "Fields shown in each row and card, and written by the CSV export.",
          ko: "행과 카드에 보여 줄 field입니다. CSV 내보내기도 이 목록을 씁니다.",
        }),
      },
      {
        key: "actions",
        type: "DataAction[] | (item, idx) => DataAction[]",
        default: '["remove", "edit", "view"]',
        desc: l.trans({
          en: "Row buttons, also in the view modal's bar without view. A function decides them per record.",
          ko: "행마다 붙는 버튼으로, view를 뺀 나머지는 view modal 아래 줄에도 붙습니다. 함수로 주면 record마다 정합니다.",
        }),
      },
      {
        key: "tools",
        type: "DataTool[] | (list) => DataTool[]",
        default: "[]",
        desc: l.trans({
          en: "Extra entries in the toolbar's more menu, beside CSV and JSON export.",
          ko: "toolbar 더보기 메뉴에 CSV·JSON 내보내기와 함께 들어갈 항목입니다.",
        }),
      },
      {
        key: "create",
        type: "boolean",
        default: "true",
        desc: l.trans({
          en: "Shows the New button, as long as `renderTemplate` is given.",
          ko: "새로 만들기 버튼을 보여 줍니다. `renderTemplate`이 있을 때만 나타납니다.",
        }),
      },
      {
        key: "viewInUrl",
        type: "boolean",
        default: "false",
        desc: l.trans({
          en: "Puts the open view in the URL as `?action=view&modelId=<id>`; a link opens it, listed or not. One per page.",
          ko: "열린 view를 URL에 `?action=view&modelId=<id>`로 남기고, 링크는 목록에 없는 record도 엽니다. 한 화면에 하나만.",
        }),
      },
      {
        key: "viewActions",
        type: "boolean",
        default: "true",
        desc: l.trans({
          en: "Draws `actions` but view in the view modal's bar; an edit from there returns to the view. `false` drops it.",
          ko: "view를 뺀 `actions`를 view modal 아래 줄에 그리고, 거기서 연 수정은 닫으면 view로 돌아옵니다. `false`면 뺍니다.",
        }),
      },
      {
        key: "title",
        type: "ReactNode",
        desc: l.trans({
          en: "The heading. Defaults to the model's name from its dictionary.",
          ko: "제목입니다. 기본값은 dictionary에 적힌 모델 이름입니다.",
        }),
      },
      {
        key: "sort",
        type: "sort key",
        desc: l.trans({
          en: "The initial sort. The toolbar offers the model's other sort keys.",
          ko: "처음 정렬 기준입니다. toolbar에서 모델의 다른 정렬 기준으로 바꿀 수 있습니다.",
        }),
      },
      {
        key: "className",
        type: "string",
        desc: l.trans({
          en: "Classes for the whole container.",
          ko: "컨테이너 전체에 붙일 class입니다.",
        }),
      },
      {
        key: "cardListClassName",
        type: "string",
        desc: l.trans({
          en: "Classes for the card grid.",
          ko: "카드 grid에 붙일 class입니다.",
        }),
      },
    ];

    const listContainerSlots = [
      {
        key: "renderItem",
        type: "(props) => ReactNode",
        desc: l.trans({
          en: "The card body in card mode. It gets `{ [model]: item, slice, actions, columns, idx }`.",
          ko: "카드 모드의 카드 본문입니다. `{ [model]: item, slice, actions, columns, idx }`를 받습니다.",
        }),
      },
      {
        key: "renderTemplate",
        type: "(props) => ReactNode",
        desc: l.trans({
          en: "The form inside the edit and new modals. Without it there is no New button.",
          ko: "edit·new modal 안의 form입니다. 없으면 새로 만들기 버튼도 없습니다.",
        }),
      },
      {
        key: "renderView",
        type: "(model) => ReactNode",
        desc: l.trans({
          en: "The body of the view modal. Without it the view button opens nothing.",
          ko: "view modal의 본문입니다. 없으면 view 버튼을 눌러도 아무것도 열리지 않습니다.",
        }),
      },
      {
        key: "renderTitle",
        type: "(model) => ReactNode",
        desc: l.trans({
          en: "The modal title. Defaults to the model name and the id.",
          ko: "modal 제목입니다. 기본값은 모델 이름과 id입니다.",
        }),
      },
      {
        key: "renderViewTitle",
        type: "(model) => ReactNode | false",
        desc: l.trans({
          en: "The view modal's own title, `renderTitle` when left out. `false` drops its title bar.",
          ko: "view modal만의 제목으로, 없으면 `renderTitle`을 씁니다. `false`면 제목 줄을 그리지 않습니다.",
        }),
      },
      {
        key: "renderDashboard",
        type: "({ summary, onSelect, queryKey, hidePresents }) => ReactNode",
        desc: l.trans({
          en: "The area above the list, usually a `Data.Dashboard`. It needs the app's `summary` state.",
          ko: "목록 위 영역으로, 보통 `Data.Dashboard`를 둡니다. 앱의 `summary` 상태가 있어야 그려집니다.",
        }),
      },
      {
        key: "renderInsight",
        type: "({ insight }) => ReactNode",
        desc: l.trans({
          en: "The insight area above the list, usually a `Data.Insight`.",
          ko: "목록 위의 insight 영역으로, 보통 `Data.Insight`를 둡니다.",
        }),
      },
      {
        key: "renderQueryMaker",
        type: "() => ReactNode",
        desc: l.trans({
          en: "Replaces the filter-argument form under the toolbar.",
          ko: "toolbar 아래의 filter 인자 입력란을 바꿔 그립니다.",
        }),
      },
      {
        key: "renderLoading",
        type: "() => ReactNode",
        desc: l.trans({
          en: "One placeholder card, repeated while the cards load.",
          ko: "카드를 불러오는 동안 반복해서 보여 줄 자리 표시 카드 하나입니다.",
        }),
      },
    ];

    const columnShapes = [
      {
        name: '"name"',
        desc: l.trans({
          en: "A field name. The header label comes from the model's dictionary.",
          ko: "field 이름입니다. header 이름은 모델 dictionary에서 가져옵니다.",
        }),
      },
      {
        name: ['"createdAt"', '"updatedAt"', '"startAt"'],
        desc: l.trans({
          en: "Date fields with these and a few similar names are drawn as `RecentTime`.",
          ko: "이런 이름의 날짜 field는 `RecentTime`으로 그립니다.",
        }),
      },
      {
        name: ['"status"', '"role"'],
        desc: l.trans({
          en: "A name containing `status` or `role` is drawn as a coloured badge.",
          ko: "이름에 `status`나 `role`이 들어가면 색 배지로 그립니다.",
        }),
      },
      {
        name: "{ key, title?, render?, value?, responsive? }",
        desc: l.trans({
          en: "Your own label and cell. `value` is what the CSV export writes instead of `render`.",
          ko: "header와 cell을 직접 정합니다. CSV 내보내기는 `render` 대신 `value`의 결과를 씁니다.",
        }),
      },
      {
        name: "{ key, responsive: true }",
        desc: l.trans({
          en: "Shows the column from `md` up and hides it on smaller screens.",
          ko: "`md` 이상 화면에서만 column을 보여 주고, 그보다 작은 화면에서는 숨깁니다.",
        }),
      },
    ];

    const actionShapes = [
      {
        name: ['"view"', '"edit"', '"remove"'],
        desc: l.trans({
          en: "Icon buttons wired to the store. `remove` asks for confirmation first.",
          ko: "store에 연결된 아이콘 버튼입니다. `remove`는 먼저 확인을 받습니다.",
        }),
      },
      {
        name: "<YourButton />",
        desc: l.trans({
          en: "Your own element. Rows put it in an Actions column, cards in the more menu.",
          ko: "직접 만든 element입니다. 표에서는 Actions column에, 카드에서는 더보기 메뉴에 들어갑니다.",
        }),
      },
      {
        name: "(item, idx) => DataAction[]",
        desc: l.trans({
          en: "Decides the buttons per row, for example by status.",
          ko: "행마다 버튼을 정합니다. 예를 들어 상태에 따라 다르게 줄 수 있습니다.",
        }),
      },
      {
        name: "{ key, render }",
        desc: l.trans({
          en: "A `tools` entry. A `tools` function receives the loaded list.",
          ko: "`tools` 항목입니다. `tools`를 함수로 주면 불러온 목록을 받습니다.",
        }),
      },
    ];

    const recentTimeProps = [
      {
        key: "date",
        type: "Date | Dayjs | null",
        desc: l.trans({
          en: "The time to show. `null` renders nothing.",
          ko: "보여 줄 시간입니다. `null`이면 아무것도 그리지 않습니다.",
        }),
      },
      {
        key: "breakUnit",
        type: "Intl.RelativeTimeFormatUnit",
        desc: l.trans({
          en: "Where relative labels stop. Unset, they never switch to a date. See the table below.",
          ko: "상대 표기를 멈출 단위입니다. 주지 않으면 날짜로 바뀌지 않습니다. 아래 표를 보세요.",
        }),
      },
      {
        key: "format",
        type: '"auto" | "full"',
        default: '"auto"',
        desc: l.trans({
          en: "How a date past the break is printed. See the table below.",
          ko: "상대 표기를 넘어선 날짜를 찍는 방식입니다. 아래 표를 보세요.",
        }),
      },
      {
        key: "relative",
        type: '"fromNow" | "always" | "auto" | (ctx) => string',
        default: '"fromNow"',
        desc: l.trans({
          en: "The wording of the relative label. See the table below.",
          ko: "상대 표기의 문구입니다. 아래 표를 보세요.",
        }),
      },
      {
        key: "className",
        type: "string",
        desc: l.trans({
          en: "Classes for the label itself.",
          ko: "label에 붙일 class입니다.",
        }),
      },
    ];

    const recentTimeFormats = [
      {
        when: l.trans({ en: "Past the break, same day", ko: "상대 표기 이후, 같은 날" }),
        shows: "HH:mm",
      },
      {
        when: l.trans({ en: "Past the break, same year", ko: "상대 표기 이후, 같은 해" }),
        shows: "MM-DD",
      },
      {
        when: l.trans({ en: "Past the break, another year", ko: "상대 표기 이후, 다른 해" }),
        shows: "YYYY-MM-DD",
      },
      {
        when: l.trans({ en: 'Past the break, with `format="full"`', ko: '상대 표기 이후, `format="full"`일 때' }),
        shows: "YY-MM-DD HH:mm",
      },
      {
        when: l.trans({ en: "Tooltip", ko: "툴팁" }),
        shows: "YYYY-MM-DD HH:mm",
      },
      {
        when: l.trans({ en: 'Tooltip, with `breakUnit="second"`', ko: '툴팁, `breakUnit="second"`일 때' }),
        shows: "YYYY-MM-DD HH:mm:ss",
      },
      {
        when: l.trans({ en: "Epoch placeholder (`0` or `-1`)", ko: "epoch 자리 값(`0` 또는 `-1`)" }),
        shows: "--:--",
      },
    ];

    const breakSteps = [
      {
        unit: <span className="font-sans">{l.trans({ en: "Not set", ko: "지정 안 함" })}</span>,
        until: l.trans({ en: "Always relative, never a date", ko: "항상 상대 표기이며 날짜로 바뀌지 않음" }),
      },
      { unit: '"second"', until: l.trans({ en: "Never relative, always a date", ko: "상대 표기 없이 항상 날짜" }) },
      { unit: '"minute"', until: l.trans({ en: "Under 60 seconds", ko: "60초 미만" }) },
      { unit: '"hour"', until: l.trans({ en: "Under 60 minutes", ko: "60분 미만" }) },
      { unit: '"day"', until: l.trans({ en: "Under 24 hours", ko: "24시간 미만" }) },
      { unit: '"week"', until: l.trans({ en: "Under 7 days", ko: "7일 미만" }) },
      { unit: '"month"', until: l.trans({ en: "Under 4 weeks", ko: "4주 미만" }) },
      { unit: '"year"', until: l.trans({ en: "Under 12 months", ko: "12개월 미만" }) },
    ];

    const relativeStyles = [
      {
        value: '"fromNow"',
        example: l.trans({ en: "a day ago", ko: "하루 전" }),
        source: l.trans({
          en: "dayjs locale strings. The default.",
          ko: "dayjs locale 문자열입니다. 기본값입니다.",
        }),
      },
      {
        value: '"always"',
        example: l.trans({ en: "1 day ago", ko: "1일 전" }),
        source: l.trans({
          en: "`Intl.RelativeTimeFormat`, always as a number.",
          ko: "`Intl.RelativeTimeFormat`으로, 항상 숫자로 씁니다.",
        }),
      },
      {
        value: '"auto"',
        example: l.trans({ en: "yesterday", ko: "어제" }),
        source: l.trans({
          en: "`Intl.RelativeTimeFormat`, with words like yesterday where the language has them.",
          ko: "`Intl.RelativeTimeFormat`으로, 어제처럼 말로 된 표현이 있으면 그것을 씁니다.",
        }),
      },
      {
        value: "(ctx) => string",
        example: "…",
        source: l.trans({
          en: "Your own wording from `{ unit, count, date, now, defaultLabel }`.",
          ko: "`{ unit, count, date, now, defaultLabel }`를 받아 문구를 직접 만듭니다.",
        }),
      },
    ];

    const loadingChoice = [
      {
        when: l.trans({ en: "Content will appear in this spot", ko: "곧 내용이 들어올 자리" }),
        use: "Loading.Skeleton",
      },
      {
        when: l.trans({ en: "A control or a small area is working", ko: "control이나 작은 영역이 동작 중일 때" }),
        use: "Loading.Spin",
      },
      {
        when: l.trans({ en: "The work has a known end, such as an upload", ko: "업로드처럼 끝이 정해진 작업" }),
        use: "Loading.ProgressBar",
      },
      {
        when: l.trans({ en: "A whole panel is busy", ko: "패널 전체가 작업 중일 때" }),
        use: "Loading.Area",
      },
      {
        when: l.trans({ en: "A button or field is not rendered yet", ko: "버튼이나 입력란이 아직 없을 때" }),
        use: "Loading.Button · Loading.Input",
      },
    ];

    const loadingMembers = [
      {
        key: "Loading.Spin",
        type: '{ className?, indicator?, isCenter?, size?: "sm" | "md" | "lg" | number, tone? }',
        default: 'size "md", tone "primary"',
        desc: l.trans({
          en: 'The spinner. `size` is a step or pixels; `tone` is `"primary"`, `"current"` or `"muted"`.',
          ko: 'spinner입니다. `size`는 단계 이름이나 픽셀, `tone`은 `"primary"`, `"current"`, `"muted"`입니다.',
        }),
      },
      {
        key: "Loading.Skeleton",
        type: "{ className?, active?, style? }",
        default: "active true",
        desc: l.trans({
          en: "Four grey text lines, pulsing while `active`. A good `fallback` for `Load.Stream`.",
          ko: "회색 글줄 네 개이며 `active`인 동안 깜빡입니다. `Load.Stream`의 `fallback`에 알맞습니다.",
        }),
      },
      {
        key: "Loading.ProgressBar",
        type: "{ className?, value, max }",
        desc: l.trans({
          en: "A determinate bar that animates to `value / max`. Use it when both numbers are real.",
          ko: "`value / max`까지 움직이는 진행률 막대입니다. 두 값이 모두 실제 숫자일 때 씁니다.",
        }),
      },
      {
        key: "Loading.Button",
        type: "{ className?, active?, style? }",
        default: "active true",
        desc: l.trans({
          en: "A button-shaped placeholder for a control not there yet. Not a spinner inside a button.",
          ko: "아직 없는 버튼 자리의 placeholder입니다. 버튼 안에 넣는 spinner가 아닙니다.",
        }),
      },
      {
        key: "Loading.Input",
        type: "{ className?, active?, style? }",
        default: "active true",
        desc: l.trans({
          en: "The same placeholder, shaped like an input field.",
          ko: "같은 placeholder를 입력란 모양으로 그립니다.",
        }),
      },
      {
        key: "Loading.Area",
        type: "{ className?, indicator?, children? }",
        desc: l.trans({
          en: "A blurred `absolute inset-0` cover with a spinner and a message (default: processing).",
          ko: "spinner와 메시지(기본값은 처리 중)를 얹은 반투명 `absolute inset-0` 막입니다.",
        }),
      },
    ];

    const badgeProps = [
      {
        key: "variant",
        type: '"default" | "primary" | "secondary" | "accent" | "neutral" | "success" | "warning" | "info" | "error" | "outline"',
        default: '"default"',
        desc: l.trans({
          en: "The colour. Map a model enum to it through a module-scope `as const` table.",
          ko: "색입니다. 모델 enum은 module scope의 `as const` 표로 이어 줍니다.",
        }),
      },
      {
        key: "size",
        type: '"xs" | "sm" | "md" | "lg"',
        default: '"md"',
        desc: l.trans({
          en: "Height and text size.",
          ko: "높이와 글자 크기입니다.",
        }),
      },
      {
        key: "outline",
        type: "boolean",
        desc: l.trans({
          en: 'Draws the variant\'s colour as an outline. `variant="outline"` is the plain, uncoloured one.',
          ko: 'variant의 색을 외곽선으로 그립니다. `variant="outline"`은 색이 없는 기본 외곽선입니다.',
        }),
      },
      {
        key: "...HTMLAttributes<HTMLSpanElement>",
        type: "attributes",
        desc: l.trans({
          en: "Everything a `<span>` takes. `className` is merged last and wins over the variant.",
          ko: "`<span>`이 받는 모든 속성입니다. `className`은 마지막에 병합되어 variant보다 우선합니다.",
        }),
      },
    ];

    const emptyProps = [
      {
        key: "description",
        type: "ReactNode",
        default: 'l("base.noData")',
        desc: l.trans({
          en: "The empty-state text. The default is the translated no-data label.",
          ko: "빈 상태 문구입니다. 기본값은 번역된 '데이터 없음' 문구입니다.",
        }),
      },
      {
        key: "icon",
        type: "ReactNode",
        desc: l.trans({
          en: "The mark above the text. Defaults to an inbox icon.",
          ko: "문구 위의 아이콘입니다. 기본값은 받은편지함 아이콘입니다.",
        }),
      },
      {
        key: "minHeight",
        type: "number",
        default: "300",
        desc: l.trans({
          en: "Minimum height of the empty body, in pixels.",
          ko: "빈 상태 영역의 최소 높이(px)입니다.",
        }),
      },
      {
        key: "className",
        type: "string",
        desc: l.trans({
          en: "Classes for the empty body. `children` sit outside it.",
          ko: "빈 상태 영역에 붙일 class입니다. `children`은 이 영역 바깥에 놓입니다.",
        }),
      },
      {
        key: "children",
        type: "ReactNode",
        desc: l.trans({
          en: "Content under the empty body, such as a create button.",
          ko: "빈 상태 영역 아래에 둘 내용입니다. 만들기 버튼이 대표적입니다.",
        }),
      },
    ];

    const tableProps = [
      {
        key: "columns",
        type: "{ key?, title, dataIndex, render?, responsive? }[]",
        desc: l.trans({
          en: "One header and cell per column. `responsive` lists the breakpoints where it shows.",
          ko: "column마다 header와 cell을 정합니다. `responsive`에는 보일 breakpoint를 적습니다.",
        }),
      },
      {
        key: "dataSource",
        type: "any[]",
        desc: l.trans({
          en: "The rows to draw, all of them. Slice it to the current page yourself.",
          ko: "그릴 행 전부입니다. 현재 페이지만큼 자르는 일은 직접 합니다.",
        }),
      },
      {
        key: "rowKey",
        type: "(row) => string",
        desc: l.trans({
          en: "The React key per row. Defaults to the row index.",
          ko: "행마다 쓸 React key입니다. 기본값은 행 번호입니다.",
        }),
      },
      {
        key: "loading",
        type: "boolean",
        desc: l.trans({
          en: "Dims the rows and draws `loadingIndicator` over them.",
          ko: "행을 흐리게 하고 그 위에 `loadingIndicator`를 그립니다.",
        }),
      },
      {
        key: "loadingIndicator",
        type: "ReactNode",
        desc: l.trans({
          en: "The mark shown over the rows while `loading`. Defaults to a spinner.",
          ko: "`loading` 동안 행 위에 보이는 표시입니다. 기본값은 spinner입니다.",
        }),
      },
      {
        key: "pagination",
        type: "PaginationProps | false",
        desc: l.trans({
          en: "Draws a `Pagination` under the table. Unset or `false` draws none.",
          ko: "표 아래에 `Pagination`을 그립니다. 없거나 `false`면 그리지 않습니다.",
        }),
      },
      {
        key: "onRow",
        type: "(record, index) => { onClick }",
        desc: l.trans({
          en: "Row events such as click-to-open. Rows then show a pointer cursor.",
          ko: "클릭해서 열기 같은 행 이벤트입니다. 이때 행에 pointer 커서가 붙습니다.",
        }),
      },
      {
        key: "rowClassName",
        type: "string | (record, index) => string",
        desc: l.trans({
          en: "Classes for every row, or per row.",
          ko: "모든 행, 또는 행마다 붙일 class입니다.",
        }),
      },
      {
        key: "size",
        type: '"small" | "middle"',
        desc: l.trans({
          en: '`"small"` tightens the cell padding.',
          ko: '`"small"`은 cell 위아래 여백을 줄입니다.',
        }),
      },
      {
        key: "bordered",
        type: "boolean",
        desc: l.trans({
          en: "Draws a rounded border around the table.",
          ko: "표 둘레에 둥근 테두리를 그립니다.",
        }),
      },
      {
        key: "showHeader",
        type: "boolean | Responsive[]",
        default: "true",
        desc: l.trans({
          en: "Hides the header, or shows it only at the listed breakpoints.",
          ko: "header를 숨기거나, 적은 breakpoint에서만 보여 줍니다.",
        }),
      },
      {
        key: "header",
        type: "ReactNode",
        desc: l.trans({
          en: "Content drawn above the table.",
          ko: "표 위에 그릴 내용입니다.",
        }),
      },
      {
        key: "footer",
        type: "ReactNode",
        desc: l.trans({
          en: "Content drawn below the table, under the pager.",
          ko: "표 아래, pager 밑에 그릴 내용입니다.",
        }),
      },
      {
        key: "empty",
        type: "ReactNode",
        default: "<Empty minHeight={160} />",
        desc: l.trans({
          en: "The placeholder for a table with no rows.",
          ko: "행이 없을 때의 placeholder입니다.",
        }),
      },
    ];

    const paginationProps = [
      {
        key: "currentPage",
        type: "number",
        desc: l.trans({
          en: "The current page, counted from 1.",
          ko: "현재 페이지입니다. 1부터 셉니다.",
        }),
      },
      {
        key: "total",
        type: "number",
        desc: l.trans({
          en: "The total item count. At 0 the pager renders `empty`, or nothing.",
          ko: "전체 항목 수입니다. 0이면 `empty`를 그리고, 없으면 아무것도 그리지 않습니다.",
        }),
      },
      {
        key: "itemsPerPage",
        type: "number",
        desc: l.trans({
          en: "Items per page. The page count is `total / itemsPerPage`, rounded up.",
          ko: "페이지당 항목 수입니다. 페이지 수는 `total / itemsPerPage`를 올림한 값입니다.",
        }),
      },
      {
        key: "onPageSelect",
        type: "(page: number) => void",
        desc: l.trans({
          en: "Called with the chosen page, counted from 1.",
          ko: "고른 페이지 번호(1부터)와 함께 호출됩니다.",
        }),
      },
      {
        key: "prev",
        type: "ReactNode",
        desc: l.trans({
          en: "The mark inside the previous-page button. The button itself stays the framework's.",
          ko: "이전 페이지 버튼 안의 표시입니다. 버튼 자체는 프레임워크 것을 씁니다.",
        }),
      },
      {
        key: "next",
        type: "ReactNode",
        desc: l.trans({
          en: "The mark inside the next-page button.",
          ko: "다음 페이지 버튼 안의 표시입니다.",
        }),
      },
      {
        key: "ellipsis",
        type: "ReactNode",
        desc: l.trans({
          en: "The mark standing in for the pages a long pager skips.",
          ko: "긴 pager에서 생략된 페이지 자리에 놓이는 표시입니다.",
        }),
      },
      {
        key: "empty",
        type: "ReactNode",
        desc: l.trans({
          en: "The placeholder for a pager with no pages. Replaces the deprecated `renderEmpty`.",
          ko: "페이지가 없을 때의 placeholder입니다. deprecated된 `renderEmpty`를 대신합니다.",
        }),
      },
      {
        key: "classNames",
        type: "{ className?, activePageNumClassName?, pageNumClassName? }",
        desc: l.trans({
          en: "Classes for the wrapper, the current page button and the other page buttons.",
          ko: "wrapper, 현재 페이지 버튼, 나머지 페이지 버튼에 붙일 class입니다.",
        }),
      },
    ];

    return (
      <Scroll>
        <Scroll.Slide id="display-ui" title={l.trans({ en: "Display UI", ko: "표시 UI" })}>
          <Docs.Title>{l.trans({ en: "Display UI", ko: "표시 UI" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: (
                  <span>
                    Components that show data: model listings, timestamps, loading and empty states, status pills,
                    tables and pagers. All of them come from <code>akanjs/ui</code>.
                  </span>
                ),
                ko: (
                  <span>
                    데이터를 보여 주는 컴포넌트입니다. 모델 목록, 시간, 로딩·빈 상태, 상태 배지, 표와 pager가 있고 모두{" "}
                    <code>akanjs/ui</code>에서 가져옵니다.
                  </span>
                ),
              })}
              <code className={chip}>
                {'import { Badge, Data, Empty, Loading, Pagination, RecentTime, Table } from "akanjs/ui";'}
              </code>
            </div>
            <Docs.IntroTable type={l.trans({ en: "Component", ko: "컴포넌트" })} items={componentRows} />
            <Docs.SubSubTitle>
              {l.trans({ en: "Words used on this page", ko: "이 페이지에서 쓰는 말" })}
            </Docs.SubSubTitle>
            <Docs.IntroTable type={l.trans({ en: "Term", ko: "용어" })} items={termRows} />
            <Docs.SubSubTitle>
              {l.trans({ en: "Store-bound or prop-bound", ko: "store에서 읽을까, prop으로 받을까" })}
            </Docs.SubSubTitle>
            <div>
              {l.trans({
                en: (
                  <span>
                    The pager and the table each come in two versions, and swapping them is the usual mistake. Use the{" "}
                    <code>Data.*</code> one for a model slice, and the plain one for values you already hold:
                  </span>
                ),
                ko: (
                  <span>
                    pager와 표는 각각 두 가지 버전이 있고, 둘을 바꿔 쓰는 것이 흔한 실수입니다. 모델 slice에는{" "}
                    <code>Data.*</code> 쪽을, 이미 가진 값에는 일반 컴포넌트를 씁니다:
                  </span>
                ),
              })}
            </div>
            <Docs.Matrix
              type={l.trans({ en: "Component", ko: "컴포넌트" })}
              columns={pairColumns}
              groups={pairGroups}
              markLabel={l.trans({ en: "Where its values come from", ko: "값을 가져오는 곳" })}
              emptyLabel={l.trans({ en: "Not used", ko: "쓰지 않음" })}
            />
            <Docs.SubSubTitle>{l.trans({ en: "Related pages", ko: "함께 볼 페이지" })}</Docs.SubSubTitle>
            <Docs.LinkGrid items={relatedLinks} />
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="Data" title="Data">
          <Docs.Title>Data</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: (
                  <span>
                    The admin listing screen, split into parts. <code>Data.ListContainer</code> is the whole screen;
                    every other member is one piece of it, exported so a different layout can compose instead of fork.
                  </span>
                ),
                ko: (
                  <span>
                    admin 목록 화면을 부품으로 나눈 것입니다. <code>Data.ListContainer</code>가 화면 전체이고, 나머지
                    멤버는 그 조각입니다. 배치를 바꾸고 싶을 때 fork하지 않고 조합하도록 따로 공개되어 있습니다.
                  </span>
                ),
              })}
            </div>
            <div>
              {l.trans({
                en: (
                  <span>
                    Every member takes the same <code>slice</code>, which tells it the model and the store keys to read.
                  </span>
                ),
                ko: (
                  <span>
                    모든 멤버는 같은 <code>slice</code>를 받습니다. 어떤 모델과 어떤 store key를 읽을지 알려 주는
                    값입니다.
                  </span>
                ),
              })}
            </div>
            <Docs.SubSubTitle>{l.trans({ en: "Members", ko: "멤버" })}</Docs.SubSubTitle>
            <Docs.OptionTable items={dataMembers} />
            <Docs.SubSubTitle>
              {l.trans({ en: "Data.ListContainer props", ko: "Data.ListContainer props" })}
            </Docs.SubSubTitle>
            <Docs.OptionTable items={listContainerProps} />
            <Docs.SubSubTitle>{l.trans({ en: "Render slots", ko: "render slot" })}</Docs.SubSubTitle>
            <Docs.OptionTable items={listContainerSlots} />
            <Docs.SubSubTitle>{l.trans({ en: "Columns", ko: "column" })}</Docs.SubSubTitle>
            <Docs.IntroTable type={l.trans({ en: "You pass", ko: "넘기는 값" })} items={columnShapes} />
            <Docs.SubSubTitle>{l.trans({ en: "Actions and tools", ko: "action과 tool" })}</Docs.SubSubTitle>
            <Docs.IntroTable type={l.trans({ en: "You pass", ko: "넘기는 값" })} items={actionShapes} />
            <Docs.SubSubTitle>
              {l.trans({ en: "Filters and dashboard tiles", ko: "filter와 dashboard 타일" })}
            </Docs.SubSubTitle>
            <ul className="my-4 list-disc space-y-2 pl-5">
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>The query maker lists the model's declared filters.</strong> A filter with a model-typed
                      arg is skipped, and an id arg whose <code>ref</code> names a model gets{" "}
                      <code>Data.RefPicker</code>.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>query maker는 모델에 선언된 filter를 나열합니다.</strong> 모델 타입 인자를 받는 filter는
                      빠지고, <code>ref</code>가 모델을 가리키는 id 인자에는 <code>Data.RefPicker</code>가 붙습니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>It waits for required args.</strong> Nothing is sent until each required arg has a value,
                      and typing is debounced.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>필수 인자가 채워질 때까지 기다립니다.</strong> 필수 인자가 모두 채워져야 요청을 보내고,
                      입력 중에는 debounce가 걸립니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>A tile filters when it knows its query.</strong> <code>queryMap[column]</code> wins;
                      otherwise the summary field's <code>.meta({"{ refName, queryKey, queryArgs }"})</code> is used
                      when it names this model. Without <code>onSelect</code> every tile is plain.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>자기 query를 아는 타일만 filter가 됩니다.</strong> <code>queryMap[column]</code>이
                      우선이고, 없으면 summary field의 <code>.meta({"{ refName, queryKey, queryArgs }"})</code>가 이
                      모델을 가리킬 때 씁니다. <code>onSelect</code>가 없으면 모든 타일이 그냥 표시만 합니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        <code>queryKey</code> keeps the active tile honest.
                      </strong>{" "}
                      It is the filter the list shows, so a tile stops looking active once the toolbar moves off it.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        <code>queryKey</code>로 활성 타일 표시가 정확해집니다.
                      </strong>{" "}
                      목록이 보여 주는 filter이므로, toolbar에서 다른 filter로 옮기면 타일의 활성 표시가 풀립니다.
                    </span>
                  ),
                })}
              </li>
            </ul>
            <Docs.SubSubTitle>{l.trans({ en: "Example", ko: "예시" })}</Docs.SubSubTitle>
            <div>
              {l.trans({
                en: "An admin product list that opens as rows and wires every row action to a modal:",
                ko: "표 모양으로 시작하고, 행 action마다 modal이 연결된 상품 admin 목록입니다:",
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="apps/koyo/lib/product/Product.Zone.tsx"
              code={`"use client";
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
};`}
            />
            <ul className="my-4 list-disc space-y-2 pl-5">
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Root slice only.</strong> Pass <code>fetch.slice.product</code>; a named slice such as{" "}
                      <code>productInOrg</code> throws. Narrow the list with <code>query</code> instead.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>root slice만 받습니다.</strong> <code>fetch.slice.product</code>를 넘기세요.{" "}
                      <code>productInOrg</code> 같은 이름 있는 slice를 넘기면 에러가 납니다. 범위는 <code>query</code>로
                      좁힙니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Give each action its slot.</strong> <code>renderTemplate</code> fills the edit modal and
                      brings the New button; <code>renderView</code> mounts the view modal.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>action마다 짝이 되는 slot을 줍니다.</strong> <code>renderTemplate</code>이 edit modal을
                      채우고 새로 만들기 버튼을 띄우며, <code>renderView</code>가 view modal을 붙입니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        <code>Model.AdminPanel</code> does this wiring for you.
                      </strong>{" "}
                      It takes the module's <code>Unit</code>, <code>Template</code> and <code>View</code> namespaces
                      and fills these slots.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        <code>Model.AdminPanel</code>이 이 연결을 대신 해 줍니다.
                      </strong>{" "}
                      모듈의 <code>Unit</code>, <code>Template</code>, <code>View</code> namespace를 받아 이 slot들을
                      채웁니다.
                    </span>
                  ),
                })}
              </li>
            </ul>
            <Docs.Alert type="info">
              {l.trans({
                en: (
                  <span>
                    <strong>
                      <code>Data.*</code> is for admin screens.
                    </strong>{" "}
                    It reads root slices, which are <code>Admin</code>-guarded, and ships a toolbar, a query maker and a
                    data export: a lot of client JS for a list a visitor only reads. A product screen composes{" "}
                    <code>Load.Units</code> with the module's own <code>Unit</code> and <code>Zone</code> instead.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>Data.*</code>는 admin 화면용입니다.
                    </strong>{" "}
                    <code>Admin</code> guard가 걸린 root slice를 읽고, toolbar·query maker·데이터 내보내기까지 싣고
                    오므로 방문자가 읽기만 하는 목록에는 클라이언트 JS가 너무 많습니다. 제품 화면은{" "}
                    <code>Load.Units</code>와 모듈 자신의 <code>Unit</code>·<code>Zone</code>을 조합하세요.
                  </span>
                ),
              })}
            </Docs.Alert>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="RecentTime" title="RecentTime">
          <Docs.Title>RecentTime</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: (
                  <span>
                    Shows a time as a relative label such as "3 minutes ago", in the page's language, with the exact
                    date in a tooltip. Past <code>breakUnit</code> it prints a date instead.
                  </span>
                ),
                ko: (
                  <span>
                    시간을 페이지 언어에 맞춰 "3분 전" 같은 상대 표기로 보여 주고, 정확한 날짜는 툴팁으로 띄웁니다.{" "}
                    <code>breakUnit</code>을 넘어선 시간은 날짜로 찍습니다.
                  </span>
                ),
              })}
            </div>
            <Docs.SubSubTitle>Props</Docs.SubSubTitle>
            <Docs.OptionTable items={recentTimeProps} />
            <Docs.SubSubTitle>
              {l.trans({ en: "Where relative labels stop", ko: "상대 표기가 멈추는 지점" })}
            </Docs.SubSubTitle>
            <Docs.Table
              columns={[
                { key: "unit", label: "breakUnit", code: true },
                { key: "until", label: l.trans({ en: "Relative label while", ko: "상대 표기 구간" }) },
              ]}
              rows={breakSteps}
            />
            <Docs.SubSubTitle>{l.trans({ en: "What it prints", ko: "찍히는 모양" })}</Docs.SubSubTitle>
            <Docs.Table
              columns={[
                { key: "when", label: l.trans({ en: "Case", ko: "경우" }) },
                { key: "shows", label: l.trans({ en: "Shows", ko: "표시" }), code: true },
              ]}
              rows={recentTimeFormats}
            />
            <Docs.SubSubTitle>{l.trans({ en: "Relative wording", ko: "상대 표기 문구" })}</Docs.SubSubTitle>
            <Docs.Table
              columns={[
                { key: "value", label: "relative", code: true },
                { key: "example", label: l.trans({ en: "Output for one day ago", ko: "하루 전 날짜의 출력" }) },
                { key: "source", label: l.trans({ en: "Wording from", ko: "문구 출처" }) },
              ]}
              rows={relativeStyles}
              stacked
            />
            <Docs.SubSubTitle>{l.trans({ en: "Example", ko: "예시" })}</Docs.SubSubTitle>
            <div>
              {l.trans({
                en: 'A story byline that says "yesterday" rather than "a day ago", and a date after a week:',
                ko: '"하루 전" 대신 "어제"라고 쓰고, 일주일이 지나면 날짜를 찍는 글 작성 시간 표시입니다:',
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="apps/koyo/lib/story/Story.View.tsx"
              code={`import type { cnst } from "@apps/koyo/client";
import type { ModelProps } from "akanjs/client";
import { RecentTime } from "akanjs/ui";

export const Meta = ({ story }: ModelProps<"story", cnst.LightStory>) => {
  return (
    <div className="text-foreground/60 text-sm">
      <RecentTime date={story.createdAt} relative="auto" breakUnit="week" />
    </div>
  );
};`}
            />
            <ul className="my-4 list-disc space-y-2 pl-5">
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>It works in a server component.</strong> The View above carries no{" "}
                      <code>{'"use client"'}</code>.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>서버 컴포넌트에서 그대로 씁니다.</strong> 위 View에는 <code>{'"use client"'}</code>가
                      없습니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        <code>breakUnit</code> is the first unit printed as a date.
                      </strong>{" "}
                      With <code>"week"</code>, anything under a week stays relative and anything older prints a date.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        <code>breakUnit</code>은 날짜로 찍히기 시작하는 단위입니다.
                      </strong>{" "}
                      <code>"week"</code>면 일주일 미만은 상대 표기로, 그보다 오래된 시간은 날짜로 찍힙니다.
                    </span>
                  ),
                })}
              </li>
            </ul>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="Loading" title="Loading">
          <Docs.Title>Loading</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: "Six indicators, one per shape of thing that is waiting. Pick by what the reader is looking at:",
                ko: "기다리는 대상의 모양마다 하나씩, 표시가 여섯 가지 있습니다. 사용자가 보고 있는 것에 맞춰 고르세요:",
              })}
            </div>
            <Docs.Table
              columns={[
                { key: "when", label: l.trans({ en: "What is waiting", ko: "기다리는 것" }) },
                { key: "use", label: l.trans({ en: "Use", ko: "쓸 것" }), code: true },
              ]}
              rows={loadingChoice}
            />
            <Docs.SubSubTitle>{l.trans({ en: "Members", ko: "멤버" })}</Docs.SubSubTitle>
            <Docs.OptionTable items={loadingMembers} />
            <Docs.SubSubTitle>{l.trans({ en: "Example", ko: "예시" })}</Docs.SubSubTitle>
            <div>
              {l.trans({
                en: "An upload row with a spinner and a progress bar:",
                ko: "spinner와 진행률 막대를 함께 둔 업로드 줄입니다:",
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="apps/koyo/ui/UploadProgress.tsx"
              code={`import { cn } from "akanjs/client";
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
};`}
            />
            <ul className="my-4 list-disc space-y-2 pl-5">
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        On a filled surface, use <code>tone="current"</code>.
                      </strong>{" "}
                      The default <code>text-primary/70</code> vanishes on a <code>bg-info</code> badge or a primary
                      button. A <code>text-*</code> in <code>className</code> beats every tone.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        채워진 표면 위에서는 <code>tone="current"</code>를 줍니다.
                      </strong>{" "}
                      기본 <code>text-primary/70</code>은 <code>bg-info</code> 배지나 primary 버튼 위에서 보이지
                      않습니다. <code>className</code>의 <code>text-*</code>는 어떤 tone보다 우선합니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>A replacement icon needs no spin class.</strong> An <code>indicator</code> keeps its own
                      colour, and the wrapper spins an SVG icon for you, so leave out <code>animate-spin</code>.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>바꿔 넣은 아이콘에는 회전 class가 필요 없습니다.</strong> <code>indicator</code>는 자기
                      색을 유지하고, SVG 아이콘이면 wrapper가 대신 돌려 주므로 <code>animate-spin</code>을 빼세요.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Covers need a positioned parent.</strong> <code>Loading.Area</code> and{" "}
                      <code>Loading.Spin isCenter</code> are <code>absolute inset-0</code>, so put them inside a{" "}
                      <code>relative</code> element.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>덮는 표시는 위치가 지정된 부모가 필요합니다.</strong> <code>Loading.Area</code>와{" "}
                      <code>Loading.Spin isCenter</code>는 <code>absolute inset-0</code>이므로 <code>relative</code>{" "}
                      요소 안에 둡니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Each member is its own override slot.</strong> <code>LoadingSkeleton</code> can be
                      re-skinned without touching <code>LoadingSpin</code>, and likewise for the other four.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>멤버마다 별도의 override slot입니다.</strong> <code>LoadingSpin</code>은 그대로 두고{" "}
                      <code>LoadingSkeleton</code>만 바꿔 입힐 수 있고, 나머지 넷도 마찬가지입니다.
                    </span>
                  ),
                })}
              </li>
            </ul>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="Badge" title="Badge">
          <Docs.Title>Badge</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: (
                  <span>
                    The status pill: a <code>{"<span>"}</code> with the <code>badgeRecipe</code> variants and nothing
                    else. Every other attribute passes through, so <code>title</code>, <code>aria-*</code> and a click
                    handler all work.
                  </span>
                ),
                ko: (
                  <span>
                    상태 배지입니다. <code>{"<span>"}</code>에 <code>badgeRecipe</code> variant를 얹은 것이 전부이고,
                    나머지 속성은 그대로 전달되므로 <code>title</code>, <code>aria-*</code>, click handler가 모두
                    동작합니다.
                  </span>
                ),
              })}
            </div>
            <Docs.SubSubTitle>Props</Docs.SubSubTitle>
            <Docs.OptionTable items={badgeProps} />
            <Docs.SubSubTitle>{l.trans({ en: "Example", ko: "예시" })}</Docs.SubSubTitle>
            <div>
              {l.trans({
                en: "A job status badge. The enum maps to a variant through a module-scope table:",
                ko: "작업 상태 배지입니다. enum 값은 module scope 표를 거쳐 variant로 바뀝니다:",
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="apps/koyo/lib/job/Job.Unit.tsx"
              code={`import { type cnst, usePage } from "@apps/koyo/client";
import type { ModelProps } from "akanjs/client";
import { Badge, type BadgeVariants } from "akanjs/ui";

const variantOf = {
  ready: "info",
  running: "warning",
  done: "success",
} as const satisfies { [key in cnst.JobStatus["value"]]: BadgeVariants["variant"] };

export const Status = ({ job }: ModelProps<"job", cnst.LightJob>) => {
  const { l } = usePage();
  return <Badge variant={variantOf[job.status]}>{l(\`jobStatus.\${job.status}\`)}</Badge>;
};`}
            />
            <ul className="my-4 list-disc space-y-2 pl-5">
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Restyle every badge at once.</strong> Bind <code>{"recipes: { badge }"}</code> in a
                      route's <code>_overrides.tsx</code>; no call site changes.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>모든 배지를 한 번에 바꿀 수 있습니다.</strong> route의 <code>_overrides.tsx</code>에{" "}
                      <code>{"recipes: { badge }"}</code>를 연결하면 호출부는 하나도 고치지 않아도 됩니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        Need only the classes? Call <code>badgeRecipe</code>.
                      </strong>{" "}
                      <code>badgeRecipe(variants, className)</code> gives a badge look to an <code>{"<a>"}</code> or a{" "}
                      <code>{"<button>"}</code>. It is server-safe and takes an array as the second argument, so skip{" "}
                      <code>cn()</code>.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        class만 필요하면 <code>badgeRecipe</code>를 부릅니다.
                      </strong>{" "}
                      <code>badgeRecipe(variants, className)</code>로 <code>{"<a>"}</code>나 <code>{"<button>"}</code>에
                      배지 모양을 입힙니다. 서버에서도 안전하고 두 번째 인자로 배열도 받으므로 <code>cn()</code>으로
                      감싸지 않습니다.
                    </span>
                  ),
                })}
              </li>
            </ul>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="Empty" title="Empty">
          <Docs.Title>Empty</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: 'The standard "no data" state: an icon, a translated message, and room for a follow-up action below.',
                ko: '표준 "데이터 없음" 화면입니다. 아이콘과 번역된 문구를 보여 주고, 아래에 다음 행동을 둘 수 있습니다.',
              })}
            </div>
            <Docs.SubSubTitle>Props</Docs.SubSubTitle>
            <Docs.OptionTable items={emptyProps} />
            <Docs.SubSubTitle>{l.trans({ en: "Example", ko: "예시" })}</Docs.SubSubTitle>
            <div>
              {l.trans({
                en: (
                  <span>
                    A product list whose empty state offers a create button, passed through <code>Load.Units</code>:
                  </span>
                ),
                ko: (
                  <span>
                    빈 상태에서 만들기 버튼을 보여 주는 상품 목록입니다. <code>Load.Units</code>에 넘깁니다:
                  </span>
                ),
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="apps/koyo/lib/product/Product.Zone.tsx"
              code={`"use client";
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
};`}
            />
            <ul className="my-4 list-disc space-y-2 pl-5">
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>You rarely mount it yourself.</strong> <code>Load.Units</code> already draws{" "}
                      <code>{"<Empty />"}</code> for a slice with no rows, and <code>Table</code> draws one at 160 px.
                      Pass your own only to change it.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>직접 붙일 일은 드뭅니다.</strong> <code>Load.Units</code>는 행이 없으면 이미{" "}
                      <code>{"<Empty />"}</code>를 그리고, <code>Table</code>도 160px 높이로 하나 그립니다. 바꾸고 싶을
                      때만 직접 넘깁니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>One override restyles them all.</strong> <code>Empty</code> is an override slot, so a
                      route's <code>_overrides.tsx</code> changes every empty state under it.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>override 하나로 전부 바뀝니다.</strong> <code>Empty</code>는 override slot이라, route의{" "}
                      <code>_overrides.tsx</code>가 그 아래 모든 빈 상태를 바꿉니다.
                    </span>
                  ),
                })}
              </li>
            </ul>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="Table" title="Table">
          <Docs.Title>Table</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: (
                  <span>
                    A responsive table for rows you already hold. For a model listing wired to the store, use{" "}
                    <code>Data.TableList</code> instead.
                  </span>
                ),
                ko: (
                  <span>
                    이미 가진 행을 그리는 반응형 표입니다. store에 연결된 모델 목록이라면 <code>Data.TableList</code>를
                    씁니다.
                  </span>
                ),
              })}
            </div>
            <Docs.SubSubTitle>Props</Docs.SubSubTitle>
            <Docs.OptionTable items={tableProps} />
            <Docs.SubSubTitle>{l.trans({ en: "Example", ko: "예시" })}</Docs.SubSubTitle>
            <div>
              {l.trans({
                en: "An invoice table that pages locally and hides the amount on small screens:",
                ko: "페이지를 로컬에서 넘기고, 작은 화면에서는 금액 column을 숨기는 청구서 표입니다:",
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="apps/koyo/ui/InvoiceTable.tsx"
              code={`"use client";
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
};`}
            />
            <ul className="my-4 list-disc space-y-2 pl-5">
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        <code>Table</code> does not slice the rows.
                      </strong>{" "}
                      It draws all of <code>dataSource</code>, so hand it the current page, as above.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        <code>Table</code>은 행을 잘라 주지 않습니다.
                      </strong>{" "}
                      <code>dataSource</code>를 전부 그리므로, 위처럼 현재 페이지만 넘깁니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        <code>pagination</code> forwards four fields only.
                      </strong>{" "}
                      <code>currentPage</code>, <code>total</code>, <code>itemsPerPage</code> and{" "}
                      <code>onPageSelect</code> reach the pager. For <code>prev</code>, <code>next</code> or{" "}
                      <code>empty</code>, set <code>pagination={"{false}"}</code> and render a <code>Pagination</code>{" "}
                      in <code>footer</code>.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        <code>pagination</code>은 네 값만 넘깁니다.
                      </strong>{" "}
                      <code>currentPage</code>, <code>total</code>, <code>itemsPerPage</code>, <code>onPageSelect</code>
                      만 pager에 전달됩니다. <code>prev</code>, <code>next</code>, <code>empty</code>가 필요하면{" "}
                      <code>pagination={"{false}"}</code>로 두고 <code>footer</code>에 <code>Pagination</code>을 직접
                      그립니다.
                    </span>
                  ),
                })}
              </li>
            </ul>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="Pagination" title="Pagination">
          <Docs.Title>Pagination</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: (
                  <span>
                    A standalone page-number control for page state you hold yourself. When the state belongs to a model
                    slice, use <code>Data.Pagination</code>.
                  </span>
                ),
                ko: (
                  <span>
                    페이지 상태를 직접 들고 있을 때 쓰는 단독 페이지 번호 control입니다. 모델 slice의 상태라면{" "}
                    <code>Data.Pagination</code>을 씁니다.
                  </span>
                ),
              })}
            </div>
            <Docs.SubSubTitle>Props</Docs.SubSubTitle>
            <Docs.OptionTable items={paginationProps} />
            <Docs.SubSubTitle>{l.trans({ en: "Example", ko: "예시" })}</Docs.SubSubTitle>
            <div>
              {l.trans({
                en: "A photo grid that shows twelve items a page:",
                ko: "한 페이지에 열두 개씩 보여 주는 사진 grid입니다:",
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="apps/koyo/ui/PagedGrid.tsx"
              code={`"use client";
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
};`}
            />
            <ul className="my-4 list-disc space-y-2 pl-5">
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Long pagers fold.</strong> Past ten pages it shows the first and last page, five pages
                      around the current one, and <code>ellipsis</code> for the rest.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>페이지가 많으면 접힙니다.</strong> 10페이지를 넘으면 첫·마지막 페이지와 현재 페이지 주변
                      다섯 개만 보여 주고, 나머지는 <code>ellipsis</code>로 줄입니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>It follows the button recipe.</strong> The page buttons use the route's{" "}
                      <code>button</code> recipe slot, and <code>Pagination</code> itself is an override slot.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>버튼 recipe를 따릅니다.</strong> 페이지 버튼은 route의 <code>button</code> recipe slot을
                      쓰고, <code>Pagination</code> 자체도 override slot입니다.
                    </span>
                  ),
                })}
              </li>
            </ul>
          </Docs.Description>
        </Scroll.Slide>
        <DocsToc />
      </Scroll>
    );
  });
