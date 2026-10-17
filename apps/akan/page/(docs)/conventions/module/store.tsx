import { usePage } from "@apps/akan/client";
import {
  Code,
  cardGridRecipe,
  Divider,
  Docs,
  DocsToc,
  type IntroItem,
  type OptionItem,
  panelRecipe,
} from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { page } from "akanjs/client";

export default page()
  .config({ transition: "fade" })
  .head(({ lang }) => {
    const title = lang === "ko" ? "도메인: model.store.ts | Akan.js" : "Domain: model.store.ts | Akan.js";
    const description =
      lang === "ko"
        ? "store 클래스 구조와 상태, 생성되는 API, 사용 패턴."
        : "The store class structure, its state, the generated API and usage patterns.";
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

    const bulletList = "my-4 list-disc space-y-2 pl-5";
    const chip = "mt-2 block overflow-x-auto whitespace-nowrap rounded-md bg-muted/60 px-2.5 py-1.5 font-mono text-xs";

    const termRows: IntroItem[] = [
      {
        name: "state",
        desc: l.trans({
          en: "A value the store holds. A component re-renders when a key it reads changes.",
          ko: "store가 들고 있는 값입니다. 컴포넌트는 자신이 읽는 key가 바뀌면 다시 렌더링됩니다.",
        }),
      },
      {
        name: "action",
        desc: l.trans({
          en: "A method of the store class. Components call it through `st.do.<action>()`.",
          ko: "store 클래스의 method입니다. 컴포넌트는 `st.do.<action>()`으로 호출합니다.",
        }),
      },
      {
        name: "st",
        desc: l.trans({
          en: "The app's root store, merged from every module store. Import it from `@apps/<app>/client`.",
          ko: "모든 module store를 합친 앱의 root store입니다. `@apps/<app>/client`에서 import합니다.",
        }),
      },
      {
        name: "slice",
        desc: l.trans({
          en: "A list query declared in `<model>.signal.ts`. Each one gets its own list state and actions.",
          ko: "`<model>.signal.ts`에 선언한 목록 쿼리입니다. slice마다 목록 상태와 액션이 따로 생깁니다.",
        }),
      },
      {
        name: "DataList",
        desc: l.trans({
          en: "The id-indexed list type that slice state uses. Update it with `list.set(x).save()`.",
          ko: "slice 상태가 쓰는, id로 색인된 목록 타입입니다. `list.set(x).save()`로 갱신합니다.",
        }),
      },
    ];

    const ownerColumns = [
      { key: "store", label: "store", code: true, caption: "*.store.ts" },
      {
        key: "other",
        label: l.trans({ en: "Other layers", ko: "다른 레이어" }),
        caption: "constant · document · service · signal",
      },
    ];
    const inStore = { store: true, other: false };
    const elsewhere = { store: false, other: true };

    const ownerGroups = [
      {
        label: l.trans({ en: "UI orchestration", ko: "UI 흐름 조율" }),
        rows: [
          {
            name: "fetch.*",
            desc: l.trans({
              en: "Calling the server and tracking its loading state.",
              ko: "서버를 호출하고 그 로딩 상태를 관리합니다.",
            }),
            marks: inStore,
          },
          {
            name: "msg.*",
            desc: l.trans({
              en: "Toast messages around a call: loading, success, error.",
              ko: "호출 전후의 토스트 메시지(로딩, 성공, 오류)입니다.",
            }),
            marks: inStore,
          },
          {
            name: <span className="font-sans">{l.trans({ en: "modal · selection", ko: "모달 · 선택" })}</span>,
            desc: l.trans({
              en: "Which modal is open and which rows are selected.",
              ko: "어떤 모달이 열려 있고 어떤 행이 선택됐는지입니다.",
            }),
            marks: inStore,
          },
          {
            name: <span className="font-sans">{l.trans({ en: "form · list", ko: "폼 · 목록" })}</span>,
            desc: l.trans({
              en: "Form values and loaded lists. A model store generates both.",
              ko: "폼 값과 불러온 목록입니다. 모델 store는 둘 다 자동으로 만듭니다.",
            }),
            marks: inStore,
          },
          {
            name: "router.push",
            desc: l.trans({
              en: "Client navigation after an action succeeds.",
              ko: "액션이 성공한 뒤의 클라이언트 페이지 이동입니다.",
            }),
            marks: inStore,
          },
        ],
      },
      {
        label: l.trans({ en: "Business rules", ko: "비즈니스 규칙" }),
        rows: [
          {
            name: <span className="font-sans">{l.trans({ en: "domain rule", ko: "도메인 규칙" })}</span>,
            desc: l.trans({
              en: "Validation and state transitions live in constant, document and service.",
              ko: "검증과 상태 전이는 constant, document, service에 둡니다.",
            }),
            marks: elsewhere,
          },
          {
            name: <span className="font-sans">{l.trans({ en: "access check", ko: "권한 확인" })}</span>,
            desc: l.trans({
              en: "Who may call an endpoint is decided by its guards in the signal.",
              ko: "누가 endpoint를 부를 수 있는지는 signal의 guard가 정합니다.",
            }),
            marks: elsewhere,
          },
        ],
      },
    ];

    const storeArgRows: IntroItem[] = [
      {
        name: "sig.<model>",
        desc: l.trans({
          en: 'Binds a model and generates its state and actions. A service store passes `"<name>" as const`.',
          ko: '모델에 묶고 상태와 액션을 자동 생성합니다. service store는 `"<name>" as const`를 넘깁니다.',
        }),
      },
      {
        name: "() => ({ … })",
        desc: l.trans({
          en: "Required. The state factory; its defaults are recreated for each store instance.",
          ko: "필수입니다. 상태 factory이며, 기본값은 store 인스턴스마다 새로 만들어집니다.",
        }),
      },
      {
        name: "({ search, computed }) => ({ … })",
        desc: l.trans({
          en: "Optional. Read-only derived state, covered under Writable And Derived State.",
          ko: "선택입니다. 읽기 전용 파생 상태로, 아래 '쓰기 상태와 파생 상태'에서 다룹니다.",
        }),
      },
      {
        name: "...<model>.stores",
        desc: l.trans({
          en: "Optional. Library stores for the same model, merged in first.",
          ko: "선택입니다. 같은 모델의 라이브러리 store로, 가장 먼저 합쳐집니다.",
        }),
      },
    ];

    const stateKindRows: IntroItem[] = [
      {
        name: "menuOpen: false",
        desc: l.trans({
          en: "A plain value in memory that resets with the store. For ordinary UI state.",
          ko: "메모리에 있는 평범한 값으로, store와 함께 초기화됩니다. 일반적인 UI 상태에 씁니다.",
        }),
      },
      {
        name: "persist(Type, options?)",
        desc: l.trans({
          en: "Kept in `localStorage`. For values that must survive a reload.",
          ko: "`localStorage`에 보관합니다. 새로고침 후에도 남아야 하는 값에 씁니다.",
        }),
      },
      {
        name: "session(Type, options?)",
        desc: l.trans({
          en: "Kept in `sessionStorage`. For values needed only in the current browser session.",
          ko: "`sessionStorage`에 보관합니다. 현재 브라우저 세션 동안만 필요한 값에 씁니다.",
        }),
      },
      {
        name: "search(paramKey, Type, options?)",
        desc: l.trans({
          en: "Read-only, parsed from the URL query string. For filters and tabs a link should carry.",
          ko: "읽기 전용이며 URL 쿼리 문자열에서 읽습니다. 링크로 공유돼야 하는 필터와 탭에 씁니다.",
        }),
      },
      {
        name: "computed(deps, selector, options?)",
        desc: l.trans({
          en: "Read-only, recomputed when a writable key in `deps` changes.",
          ko: "읽기 전용이며, `deps`의 쓰기 상태가 바뀔 때 다시 계산됩니다.",
        }),
      },
    ];

    const builderOptions: OptionItem[] = [
      {
        key: "default",
        type: "T | () => T",
        tags: ["persist", "session", "search"],
        desc: l.trans({
          en: "Starting value. Without it: `[]` for arrays, the first enum value, else the type's own default.",
          ko: "시작 값입니다. 없으면 배열은 `[]`, enum은 첫 값, 그 밖에는 타입의 기본값을 씁니다.",
        }),
      },
      {
        key: "nullable",
        type: "boolean",
        default: "false",
        tags: ["persist", "session", "search"],
        desc: l.trans({
          en: "Allows `null`, and starts at `null` when no default is given.",
          ko: "`null`을 허용하고, 기본값이 없으면 `null`로 시작합니다.",
        }),
      },
      {
        key: "key",
        type: "string",
        default: l.trans({ en: "the state key", ko: "상태 key" }),
        tags: ["persist", "session"],
        desc: l.trans({ en: "Name used in browser storage.", ko: "브라우저 저장소에서 쓸 이름입니다." }),
      },
      {
        key: "equals",
        type: "(a, b) => boolean",
        default: "Object.is",
        tags: ["computed"],
        desc: l.trans({
          en: "Decides whether a recomputed value counts as a change.",
          ko: "다시 계산한 값을 변경으로 볼지 판단합니다.",
        }),
      },
    ];

    const stateManagementMethods: IntroItem[] = [
      {
        name: "get()",
        desc: l.trans({
          en: "Returns the current state. Use it when a value may be `null`.",
          ko: "현재 상태를 돌려줍니다. 값이 `null`일 수 있을 때 씁니다.",
        }),
        example: "const { ticket, ticketList } = this.get();",
      },
      {
        name: "pick(...keys)",
        desc: l.trans({
          en: 'Returns required keys; throws if one is `null`, `undefined` or `""`.',
          ko: '반드시 있어야 하는 key를 돌려줍니다. `null`, `undefined`, `""`이면 에러를 던집니다.',
        }),
        example: `const { ticketForm } = this.pick("ticketForm");`,
      },
      {
        name: "set(state)",
        desc: l.trans({
          en: "Writes state. An object merges shallowly; a function mutates an immer copy in place.",
          ko: "상태를 씁니다. 객체는 얕게 병합하고, 함수를 넘기면 immer 사본을 직접 고칩니다.",
        }),
        example: `this.set({ ticketModal: null });
this.set((state) => { state.ticketForm.title = ""; });`,
      },
    ];

    const baseVariables: IntroItem[] = [
      {
        name: "<model>: Full | null",
        desc: l.trans({
          en: "The full model currently open, such as `ticket`. `null` until one is loaded.",
          ko: "지금 열린 full 모델입니다(예: `ticket`). 불러오기 전에는 `null`입니다.",
        }),
      },
      {
        name: "<model>Loading: string | boolean",
        desc: l.trans({
          en: "`true` at first, `true` or the record id while a request runs, then `false`.",
          ko: "처음엔 `true`, 요청 중에는 `true`나 레코드 id, 끝나면 `false`입니다.",
        }),
      },
      {
        name: "<model>Form: DefaultOf<Full>",
        desc: l.trans({
          en: "Form values for creating or editing one record.",
          ko: "레코드 하나를 만들거나 고칠 때 쓰는 폼 값입니다.",
        }),
      },
      {
        name: "<model>FormLoading: string | boolean",
        desc: l.trans({
          en: "`true` until a form opens, the id while `edit<Model>` loads, then `false`.",
          ko: "폼이 열리기 전엔 `true`, `edit<Model>`이 불러오는 동안 id, 준비되면 `false`입니다.",
        }),
      },
      {
        name: "<model>Submit: Submit",
        desc: l.trans({
          en: "`{ disabled, loading, times }` for the submit button.",
          ko: "제출 버튼용 `{ disabled, loading, times }`입니다.",
        }),
      },
      {
        name: "<model>ViewAt: Date",
        desc: l.trans({
          en: "When `<model>` was last loaded or saved.",
          ko: "`<model>`을 마지막으로 불러오거나 저장한 시각입니다.",
        }),
      },
      {
        name: "<model>Modal: string | null",
        desc: l.trans({
          en: 'Which modal is open: `"edit"`, `"view"`, your own key, or `null`.',
          ko: '열린 모달입니다. `"edit"`, `"view"`, 직접 정한 key, 또는 `null`입니다.',
        }),
      },
      {
        name: "<model>FormDraft: DraftState | null",
        desc: l.trans({
          en: "The open form's unsaved draft. `Load.Edit`, `Model.EditModal` and `Model.New` manage it.",
          ko: "열린 폼의 저장되지 않은 임시본(draft)입니다. `Load.Edit`, `Model.EditModal`, `Model.New`가 관리합니다.",
        }),
      },
    ];

    const baseMethods: IntroItem[] = [
      {
        name: "create<Model>InForm(options?)",
        desc: l.trans({
          en: "Creates from `<model>Form`, resets the form and adds the row to the list.",
          ko: "`<model>Form`으로 생성하고, 폼을 초기값으로 되돌린 뒤 목록에 행을 추가합니다.",
        }),
      },
      {
        name: "update<Model>InForm(options?)",
        desc: l.trans({
          en: "Saves `<model>Form` over its record, resets the form and patches loaded lists.",
          ko: "`<model>Form`을 해당 레코드에 저장하고, 폼을 초기값으로 되돌린 뒤 목록을 갱신합니다.",
        }),
      },
      {
        name: "create<Model>(data, options?)",
        desc: l.trans({
          en: "Creates a record from `data`; the form is untouched.",
          ko: "`data`로 생성합니다. 폼은 건드리지 않습니다.",
        }),
      },
      {
        name: "update<Model>(id, data, options?)",
        desc: l.trans({
          en: "Updates one record from `data`; the form is untouched.",
          ko: "`data`로 레코드 하나를 수정합니다. 폼은 건드리지 않습니다.",
        }),
      },
      {
        name: "remove<Model>(id, options?)",
        desc: l.trans({
          en: "Removes a record and drops it from every loaded list.",
          ko: "레코드를 삭제하고 불러온 모든 목록에서 뺍니다.",
        }),
      },
      {
        name: "check<Model>Submitable(disabled?)",
        desc: l.trans({
          en: "Sets `<model>Submit.disabled` from whether the form is valid.",
          ko: "폼이 유효한지에 따라 `<model>Submit.disabled`를 설정합니다.",
        }),
      },
      {
        name: "submit<Model>(options?)",
        desc: l.trans({
          en: "Calls `update<Model>InForm` when the form has an id, else `create<Model>InForm`.",
          ko: "폼에 id가 있으면 `update<Model>InForm`, 없으면 `create<Model>InForm`을 부릅니다.",
        }),
      },
      {
        name: "new<Model>(partial?, options?)",
        desc: l.trans({
          en: 'Fills the form for a new record and opens the `"edit"` modal.',
          ko: '새 레코드용으로 폼을 채우고 `"edit"` 모달을 엽니다.',
        }),
      },
      {
        name: "edit<Model>(modelOrId, options?)",
        desc: l.trans({
          en: 'Loads the record into the form and opens the `"edit"` modal.',
          ko: '레코드를 폼에 불러오고 `"edit"` 모달을 엽니다.',
        }),
      },
      {
        name: "merge<Model>(modelOrId, data, options?)",
        desc: l.trans({
          en: "Saves `data` through the update endpoint and patches the cached copies.",
          ko: "update endpoint로 `data`를 저장하고, 캐시된 사본을 갱신합니다.",
        }),
      },
      {
        name: "view<Model>(modelOrId, options?)",
        desc: l.trans({
          en: 'Loads the record into `<model>` and opens the `"view"` modal.',
          ko: '레코드를 `<model>`에 불러오고 `"view"` 모달을 엽니다.',
        }),
      },
      {
        name: "set<Model>(...models)",
        desc: l.trans({
          en: "Writes returned models into `<model>` and into loaded lists that hold them.",
          ko: "받은 모델을 `<model>`과, 그 행을 가진 목록에 씁니다.",
        }),
      },
      {
        name: "reset<Model>(model?)",
        desc: l.trans({
          en: "Clears `<model>` or sets the one given, resets the form and closes the modal.",
          ko: "`<model>`을 비우거나 넘긴 모델로 바꾸고, 폼을 초기화하고, 모달을 닫습니다.",
        }),
      },
      {
        name: ["load<Model>FormDraft", "restore<Model>FormDraft", "discard<Model>FormDraft"],
        desc: l.trans({
          en: "Drive the form draft. `Load.Edit`, `Model.EditModal` and `Model.New` call them for you.",
          ko: "폼 임시본을 다룹니다. `Load.Edit`, `Model.EditModal`, `Model.New`가 대신 호출합니다.",
        }),
      },
    ];

    const createOptions: OptionItem[] = [
      {
        key: "onSuccess",
        type: "(model) => void | Promise<void>",
        desc: l.trans({
          en: "Runs after the save with the saved model, e.g. to navigate.",
          ko: "저장된 모델을 받아 저장 후 실행됩니다. 페이지 이동 등에 씁니다.",
        }),
      },
      {
        key: "onError",
        type: "(error: string) => void",
        desc: l.trans({ en: "Runs when the request fails.", ko: "요청이 실패하면 실행됩니다." }),
      },
      {
        key: "modal",
        type: "string",
        default: "null",
        desc: l.trans({
          en: "Modal to show after saving. Left out, the modal closes.",
          ko: "저장 후 보여 줄 모달입니다. 생략하면 모달이 닫힙니다.",
        }),
      },
      {
        key: "sliceName",
        type: "string",
        default: "<model>",
        desc: l.trans({
          en: "Slice whose list receives a created row, such as `ticketInProject`.",
          ko: "생성된 행을 받을 slice입니다(예: `ticketInProject`).",
        }),
      },
      {
        key: "path",
        type: "string",
        desc: l.trans({
          en: "Also writes the saved model into this state key.",
          ko: "저장된 모델을 이 상태 key에도 씁니다.",
        }),
      },
    ];

    const formSetters: IntroItem[] = [
      {
        name: "set<Field>On<Model>(value)",
        desc: l.trans({
          en: "Writes one field of `<model>Form`. Pass it to `onChange` by reference.",
          ko: "`<model>Form`의 필드 하나를 씁니다. `onChange`에 참조로 넘깁니다.",
        }),
      },
      {
        name: "add<Field>On<Model>(value, { idx?, limit? })",
        desc: l.trans({
          en: "Array field: inserts one or more items at `idx`, at the end by default.",
          ko: "배열 필드: 항목을 `idx` 위치에 넣습니다. 기본은 맨 끝입니다.",
        }),
      },
      {
        name: "sub<Field>On<Model>(idx)",
        desc: l.trans({
          en: "Array field: removes the item at `idx`, or at every index in an array.",
          ko: "배열 필드: `idx` 위치의 항목, 또는 배열로 준 모든 위치의 항목을 뺍니다.",
        }),
      },
      {
        name: "addOrSub<Field>On<Model>(value)",
        desc: l.trans({
          en: "Array field: adds the value if absent, removes it if present.",
          ko: "배열 필드: 값이 없으면 넣고, 있으면 뺍니다.",
        }),
      },
      {
        name: "upload<Field>On<Model>(fileList, idx?)",
        desc: l.trans({
          en: "`File` field: uploads, then polls until the file leaves `uploading`.",
          ko: "`File` 필드: 업로드한 뒤 파일이 `uploading` 상태를 벗어날 때까지 확인합니다.",
        }),
      },
      {
        name: "writeOn<Model>(path, value)",
        desc: l.trans({
          en: 'Writes a nested path, such as `"payments.3.name"`.',
          ko: '`"payments.3.name"` 같은 중첩 경로에 씁니다.',
        }),
      },
    ];

    const sliceNameRows: IntroItem[] = (
      [
        ["<model>List<Suffix>", "ticketList", "ticketListInProject"],
        ["init<Model><Suffix>", "initTicket", "initTicketInProject"],
        ["pageOf<Model><Suffix>", "pageOfTicket", "pageOfTicketInProject"],
      ] as const
    ).map(([pattern, root, named]) => ({
      name: pattern,
      desc: l.trans({
        en: `\`${root}\` for the root slice, \`${named}\` for inProject.`,
        ko: `root slice는 \`${root}\`, inProject는 \`${named}\`입니다.`,
      }),
    }));

    const sliceVariables: IntroItem[] = [
      {
        name: "<model>List<Suffix>: DataList<Light>",
        desc: l.trans({
          en: "Rows on screen, loaded by init, refresh or paging.",
          ko: "화면에 보이는 행입니다. init, refresh, 페이지 이동으로 불러옵니다.",
        }),
      },
      {
        name: "<model>ListLoading<Suffix>: boolean",
        desc: l.trans({ en: "Whether the list is loading.", ko: "목록을 불러오는 중인지 나타냅니다." }),
      },
      {
        name: "<model>InitList<Suffix>: DataList<Light>",
        desc: l.trans({ en: "Rows from the last init or refresh.", ko: "마지막 init 또는 refresh가 받은 행입니다." }),
      },
      {
        name: "<model>InitAt<Suffix>: Date",
        desc: l.trans({ en: "When the list was last initialized.", ko: "목록을 마지막으로 초기화한 시각입니다." }),
      },
      {
        name: "<model>Selection<Suffix>: DataList<Light>",
        desc: l.trans({ en: "Rows the user selected.", ko: "사용자가 선택한 행입니다." }),
      },
      {
        name: "<model>Insight<Suffix>: Insight",
        desc: l.trans({ en: "Aggregates for the query, such as `count`.", ko: "`count` 같은 쿼리 집계값입니다." }),
      },
      {
        name: "default<Model><Suffix>: DefaultOf<Full>",
        desc: l.trans({
          en: "Starting values for a new form opened from this slice.",
          ko: "이 slice에서 여는 새 폼의 시작 값입니다.",
        }),
      },
      {
        name: "pageOf<Model><Suffix>: number",
        desc: l.trans({ en: "Current page, starting at 1.", ko: "현재 페이지이며 1부터 시작합니다." }),
      },
      {
        name: "lastPageOf<Model><Suffix>: number",
        desc: l.trans({
          en: "Total number of pages, computed from `count` and the limit.",
          ko: "`count`와 limit으로 계산한 전체 페이지 수입니다.",
        }),
      },
      {
        name: "limitOf<Model><Suffix>: number",
        desc: l.trans({ en: "Rows per page, 20 by default.", ko: "페이지당 행 수이며 기본값은 20입니다." }),
      },
      {
        name: "hasMoreOf<Model><Suffix>: boolean",
        desc: l.trans({
          en: "Whether the server holds rows past the ones loaded. Read this, not the count.",
          ko: "불러온 행 뒤에 서버에 행이 더 있는지입니다. count 대신 이 값을 읽습니다.",
        }),
      },
      {
        name: "isCumulativeOf<Model><Suffix>: boolean",
        desc: l.trans({
          en: "`true` after `loadMoreOf…`: the list accumulates instead of paging.",
          ko: "`loadMoreOf…` 뒤에는 `true`입니다. 목록이 페이지를 바꾸지 않고 쌓입니다.",
        }),
      },
      {
        name: "queryArgsOf<Model><Suffix>: Args",
        desc: l.trans({ en: "Current query arguments.", ko: "현재 쿼리 인자입니다." }),
      },
      {
        name: "sortOf<Model><Suffix>: Sort",
        desc: l.trans({
          en: 'Current sort key, `"latest"` by default.',
          ko: '현재 정렬 key이며 기본값은 `"latest"`입니다.',
        }),
      },
    ];

    const sliceMethods: IntroItem[] = [
      {
        name: "init<Model><Suffix>(...args, initForm?)",
        desc: l.trans({
          en: "Loads the list for these query args. Skips the request if that query is loaded.",
          ko: "이 쿼리 인자로 목록을 불러옵니다. 같은 쿼리가 이미 있으면 요청하지 않습니다.",
        }),
      },
      {
        name: "refresh<Model><Suffix>(initForm?)",
        desc: l.trans({
          en: "Refetches the current list from the server.",
          ko: "현재 목록을 서버에서 다시 불러옵니다.",
        }),
      },
      {
        name: "select<Model><Suffix>(light | light[], { refresh?, remove? })",
        desc: l.trans({
          en: "Adds to the selection; `refresh` replaces it, `remove` takes rows out.",
          ko: "선택에 추가합니다. `refresh`는 선택을 교체하고, `remove`는 뺍니다.",
        }),
      },
      {
        name: "setPageOf<Model><Suffix>(page, options?)",
        desc: l.trans({ en: "Swaps the list to that page.", ko: "목록을 해당 페이지로 바꿉니다." }),
      },
      {
        name: "loadMoreOf<Model><Suffix>(options?)",
        desc: l.trans({
          en: "Appends the rows after the ones loaded. Takes no page number.",
          ko: "이미 불러온 행 다음의 행을 이어 붙입니다. 페이지 번호는 받지 않습니다.",
        }),
      },
      {
        name: "setLimitOf<Model><Suffix>(limit, options?)",
        desc: l.trans({ en: "Changes rows per page and reloads.", ko: "페이지당 행 수를 바꾸고 다시 불러옵니다." }),
      },
      {
        name: "setQueryArgsOf<Model><Suffix>(...args)",
        desc: l.trans({
          en: "Changes the query args and reloads. Also takes `(prev) => next`.",
          ko: "쿼리 인자를 바꾸고 다시 불러옵니다. `(prev) => next` 함수도 받습니다.",
        }),
      },
      {
        name: "setSortOf<Model><Suffix>(sort, options?)",
        desc: l.trans({ en: "Changes the sort and reloads.", ko: "정렬을 바꾸고 다시 불러옵니다." }),
      },
    ];

    const initFormOptions: OptionItem[] = [
      {
        key: "page",
        type: "number",
        default: l.trans({ en: "current, 1 at first", ko: "현재 값, 처음엔 1" }),
        desc: l.trans({ en: "Page to load.", ko: "불러올 페이지입니다." }),
      },
      {
        key: "limit",
        type: "number",
        default: l.trans({ en: "current, 20 at first", ko: "현재 값, 처음엔 20" }),
        desc: l.trans({ en: "Rows per page.", ko: "페이지당 행 수입니다." }),
      },
      {
        key: "sort",
        type: "string",
        default: l.trans({ en: 'current, "latest" at first', ko: '현재 값, 처음엔 "latest"' }),
        desc: l.trans({ en: "A sort key the filter declares.", ko: "filter가 선언한 정렬 key입니다." }),
      },
      {
        key: "insight",
        type: "boolean",
        default: "true",
        desc: l.trans({
          en: "`false` skips the count query; the count becomes the rows loaded.",
          ko: "`false`면 count 쿼리를 생략하고, 불러온 행 수를 count로 씁니다.",
        }),
      },
      {
        key: "default",
        type: "Partial<DefaultOf<Input>>",
        desc: l.trans({
          en: "Starting values `new<Model>` fills a new form with.",
          ko: "`new<Model>`이 새 폼에 채울 시작 값입니다.",
        }),
      },
      {
        key: "invalidate",
        type: "boolean",
        tags: ["init: false", "refresh: true"],
        desc: l.trans({
          en: "`true` always refetches; `false` reuses an identical query already loaded.",
          ko: "`true`면 항상 다시 불러오고, `false`면 이미 불러온 같은 쿼리를 재사용합니다.",
        }),
      },
      {
        key: "queryArgs",
        type: "Args",
        tags: ["refresh"],
        desc: l.trans({
          en: "Replaces the leading query args; the rest keep their current values.",
          ko: "앞쪽 쿼리 인자를 바꿉니다. 나머지 인자는 현재 값을 유지합니다.",
        }),
      },
    ];

    return (
      <Scroll>
        <Scroll.Slide id="store-overview" title="model.store.ts">
          <Docs.Title>model.store.ts</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: (
                  <span>
                    <code>{"<model>.store.ts"}</code> holds one module's client state and the actions that change it.
                    Pages and components read state from the store and call its actions; they never coordinate{" "}
                    <code>fetch</code> calls themselves.
                  </span>
                ),
                ko: (
                  <span>
                    <code>{"<model>.store.ts"}</code>는 module 하나의 클라이언트 상태와, 그 상태를 바꾸는 액션을
                    담습니다. page와 컴포넌트는 store에서 상태를 읽고 액션을 호출할 뿐, <code>fetch</code> 호출을 직접
                    조율하지 않습니다.
                  </span>
                ),
              })}
            </div>
            <div>
              {l.trans({
                en: "Most stores stay nearly empty, because a model store generates its state and CRUD actions. Write an action by hand only for one of these:",
                ko: "모델 store는 상태와 CRUD 액션을 자동으로 만들기 때문에, 대부분의 store는 거의 비어 있습니다. 직접 액션을 쓰는 경우는 다음 셋뿐입니다:",
              })}
            </div>
            <div className={cardGridRecipe({ cols: "three" }, "my-4")}>
              <div className={panelRecipe({ radius: "lg", padding: "sm" }, "min-w-0")}>
                <div className="font-semibold text-primary">{l.trans({ en: "A Toast", ko: "토스트" })}</div>
                <code className={chip}>{'msg.success("ticket.openTicketSuccess")'}</code>
                <div className="mt-2 text-foreground/70 text-sm">
                  {l.trans({
                    en: "Loading and success messages around a custom endpoint call.",
                    ko: "커스텀 endpoint 호출 전후의 로딩, 성공 메시지입니다.",
                  })}
                </div>
              </div>
              <div className={panelRecipe({ radius: "lg", padding: "sm" }, "min-w-0")}>
                <div className="font-semibold text-primary">
                  {l.trans({ en: "An Optimistic Update", ko: "낙관적 업데이트" })}
                </div>
                <code className={chip}>void fetch.x(…)</code>
                <div className="mt-2 text-foreground/70 text-sm">
                  {l.trans({
                    en: "Change the client model first, send the request without waiting, then commit.",
                    ko: "클라이언트 모델을 먼저 바꾸고, 요청은 기다리지 않고 보낸 뒤 반영합니다.",
                  })}
                </div>
              </div>
              <div className={panelRecipe({ radius: "lg", padding: "sm" }, "min-w-0")}>
                <div className="font-semibold text-primary">
                  {l.trans({ en: "A Multi-Field Write", ko: "여러 필드 동시 쓰기" })}
                </div>
                <code className={chip}>{"this.set({ a, b, c })"}</code>
                <div className="mt-2 text-foreground/70 text-sm">
                  {l.trans({
                    en: "Several state keys that must change together in one write.",
                    ko: "함께 바뀌어야 하는 여러 상태 key를 한 번에 씁니다.",
                  })}
                </div>
              </div>
            </div>
            <Docs.SubSubTitle>{l.trans({ en: "What the store owns", ko: "store가 맡는 일" })}</Docs.SubSubTitle>
            <Docs.Matrix
              type={l.trans({ en: "The work", ko: "할 일" })}
              columns={ownerColumns}
              groups={ownerGroups}
              markLabel={l.trans({ en: "Belongs here", ko: "여기에 둡니다" })}
              emptyLabel={l.trans({ en: "Not here", ko: "여기에 두지 않습니다" })}
            />
            <Docs.SubSubTitle>
              {l.trans({ en: "Words used on this page", ko: "이 페이지에서 쓰는 말" })}
            </Docs.SubSubTitle>
            <Docs.IntroTable type={l.trans({ en: "Term", ko: "용어" })} items={termRows} />
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="class-structure" title={l.trans({ en: "Store Class Structure", ko: "store 클래스 구조" })}>
          <Docs.Title>{l.trans({ en: "Store Class Structure", ko: "store 클래스 구조" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: (
                  <span>
                    A store is a class that extends <code>store(…)</code>. The first argument decides which of two kinds
                    it is:
                  </span>
                ),
                ko: (
                  <span>
                    store는 <code>store(…)</code>를 상속하는 클래스입니다. 첫 번째 인자에 따라 두 종류로 나뉩니다:
                  </span>
                ),
              })}
            </div>
            <div className={cardGridRecipe({ cols: "mdTwo" }, "my-4")}>
              <div className={panelRecipe({ radius: "lg", padding: "sm" }, "min-w-0")}>
                <div className="font-semibold text-primary">{l.trans({ en: "Model Store", ko: "모델 store" })}</div>
                <code className={chip}>{"store(sig.ticket, () => ({ … }))"}</code>
                <div className="mt-2 text-foreground/70 text-sm">
                  {l.trans({
                    en: "Bound to a model's signal. It gets the model, form and list state and the CRUD actions.",
                    ko: "모델의 signal에 묶입니다. 모델, 폼, 목록 상태와 CRUD 액션을 받습니다.",
                  })}
                </div>
              </div>
              <div className={panelRecipe({ radius: "lg", padding: "sm" }, "min-w-0")}>
                <div className="font-semibold text-primary">
                  {l.trans({ en: "Service Store", ko: "service store" })}
                </div>
                <code className={chip}>{'store("myapp" as const, () => ({ … }))'}</code>
                <div className="mt-2 text-foreground/70 text-sm">
                  {l.trans({
                    en: "No signal. It holds only the state and actions you write.",
                    ko: "signal이 없습니다. 직접 쓴 상태와 액션만 가집니다.",
                  })}
                </div>
              </div>
            </div>
            <Docs.IntroTable type={l.trans({ en: "Argument", ko: "인자" })} items={storeArgRows} />
            <div>
              {l.trans({
                en: "A model store with one custom action, complete with its imports:",
                ko: "커스텀 액션 하나를 가진 모델 store입니다. import까지 모두 담았습니다:",
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="apps/koyo/lib/ticket/ticket.store.ts"
              code={`import type { Dayjs } from "akanjs/base";
import { store } from "akanjs/store";

import * as cnst from "../cnst";
import { fetch, msg, sig } from "../useClient";

export class TicketStore extends store(sig.ticket, () => ({
  backlogTicketList: [] as cnst.LightTicket[],
})) {
  async openTicket(id: string, due: Dayjs) {
    msg.loading("ticket.openTicketLoading", { key: "openTicket" });
    this.setTicket(await fetch.openTicket(id, due));
    msg.success("ticket.openTicketSuccess", { key: "openTicket" });
    this.set({ ticketModal: null });
  }
}`}
            />
            <ul className={bulletList}>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Imports come from the module's own barrels.</strong> <code>fetch</code>, <code>msg</code>{" "}
                      and <code>sig</code> from <code>../useClient</code>, model classes from <code>../cnst</code>.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>import는 module 자신의 barrel에서 가져옵니다.</strong> <code>fetch</code>,{" "}
                      <code>msg</code>, <code>sig</code>는 <code>../useClient</code>에서, 모델 클래스는{" "}
                      <code>../cnst</code>에서 가져옵니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>An action body is about three lines:</strong> <code>await fetch.x()</code>, a generated
                      setter such as <code>this.setTicket()</code>, then the toast.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>액션 본문은 세 줄 정도입니다.</strong> <code>await fetch.x()</code>,{" "}
                      <code>this.setTicket()</code> 같은 자동 생성 setter, 그리고 토스트 순서입니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        <code>msg</code> takes a dictionary key,
                      </strong>{" "}
                      and the shared <code>key</code> option lets the success toast replace the loading one.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        <code>msg</code>는 사전 key를 받습니다.
                      </strong>{" "}
                      같은 <code>key</code> 옵션을 주면 성공 토스트가 로딩 토스트를 대신합니다.
                    </span>
                  ),
                })}
              </li>
            </ul>
            <div>
              {l.trans({
                en: (
                  <span>
                    A service store starts from the same scaffold. Keep the <code>{"// state"}</code> and{" "}
                    <code>{"// action"}</code> markers even while it is empty:
                  </span>
                ),
                ko: (
                  <span>
                    service store도 같은 뼈대에서 시작합니다. 비어 있어도 <code>{"// state"}</code>,{" "}
                    <code>{"// action"}</code> 표시는 남겨 둡니다:
                  </span>
                ),
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="apps/myapp/lib/_myapp/myapp.store.ts"
              code={`import { store } from "akanjs/store";

export class MyappStore extends store("myapp" as const, () => ({
  // state
  menuOpen: false,
})) {
  // action
}`}
            />
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide
          id="generated-extension"
          title={l.trans({ en: "Extending Library Stores", ko: "라이브러리 store 확장하기" })}
        >
          <Docs.Title>{l.trans({ en: "Extending Library Stores", ko: "라이브러리 store 확장하기" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: (
                  <span>
                    When an app has a module that a library also has, such as <code>user</code> from{" "}
                    <code>libs/shared</code>, the app store extends the library's. List the library stores after the
                    state factory:
                  </span>
                ),
                ko: (
                  <span>
                    라이브러리에도 있는 module을 앱이 가질 때(예: <code>libs/shared</code>의 <code>user</code>), 앱
                    store는 라이브러리 store를 확장합니다. 상태 factory 뒤에 라이브러리 store를 나열합니다:
                  </span>
                ),
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="apps/koyo/lib/user/user.store.ts"
              code={`import { store } from "akanjs/store";

import { user } from "../__lib/lib.store";
import * as cnst from "../cnst";
import { fetch, sig } from "../useClient";

export class UserStore extends store(
  sig.user,
  () => ({
    self: new cnst.User(),
  }),
  ...user.stores,
) {
  async refreshSelf() {
    const { self } = this.get();
    this.set({ self: await fetch.user(self.id) });
  }
}`}
            />
            <ul className={bulletList}>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        <code>../__lib/lib.store</code> lists them for you.
                      </strong>{" "}
                      It exports <code>{"<model>.stores"}</code> for every model a library you use also has a store for.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        <code>../__lib/lib.store</code>가 목록을 만들어 둡니다.
                      </strong>{" "}
                      사용하는 라이브러리에도 store가 있는 모델마다 <code>{"<model>.stores"}</code>를 export합니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>The library comes first.</strong> Its state and actions are merged in, then the app adds
                      its own state and actions on top.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>라이브러리가 먼저입니다.</strong> 라이브러리의 상태와 액션이 먼저 합쳐지고, 그 위에 앱의
                      상태와 액션이 더해집니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>A derived-state factory goes before them.</strong> The order is{" "}
                      <code>{"store(sig.user, state, derived, ...user.stores)"}</code>.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>파생 상태 factory는 그 앞에 둡니다.</strong> 순서는{" "}
                      <code>{"store(sig.user, state, derived, ...user.stores)"}</code>입니다.
                    </span>
                  ),
                })}
              </li>
            </ul>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide
          id="writable-derived-state"
          title={l.trans({ en: "Writable And Derived State", ko: "쓰기 상태와 파생 상태" })}
        >
          <Docs.Title>{l.trans({ en: "Writable And Derived State", ko: "쓰기 상태와 파생 상태" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: (
                  <span>
                    Most state is a plain value. The state factory also offers <code>persist</code> and{" "}
                    <code>session</code> to keep a value in browser storage, and an optional third argument declares
                    read-only state with <code>search</code> and <code>computed</code>:
                  </span>
                ),
                ko: (
                  <span>
                    대부분의 상태는 평범한 값입니다. 상태 factory는 값을 브라우저 저장소에 두는 <code>persist</code>,{" "}
                    <code>session</code>도 제공하고, 선택 사항인 세 번째 인자에서는 <code>search</code>,{" "}
                    <code>computed</code>로 읽기 전용 상태를 선언합니다:
                  </span>
                ),
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="apps/koyo/lib/ticket/ticket.store.ts"
              code={`export class TicketStore extends store(
  sig.ticket,
  ({ persist, session }) => ({
    viewMode: persist(String, { default: "board" }),
    draftKeyword: session(String, { default: "" }),
  }),
  ({ search, computed }) => ({
    status: search("status", cnst.TicketStatus, { default: "active" }),
    hasKeyword: computed(["draftKeyword"], (keyword) => keyword.length > 0),
  }),
) {}`}
            />
            <Docs.IntroTable type={l.trans({ en: "Declared as", ko: "선언" })} items={stateKindRows} />
            <Docs.SubSubTitle>{l.trans({ en: "Builder options", ko: "빌더 옵션" })}</Docs.SubSubTitle>
            <Docs.OptionTable items={builderOptions} />
            <ul className={bulletList}>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        <code>computed</code> reads writable keys only.
                      </strong>{" "}
                      Every name in <code>deps</code> must be a writable key of the same store, generated keys such as{" "}
                      <code>ticketForm</code> included, and never another <code>search</code> or <code>computed</code>{" "}
                      key.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        <code>computed</code>는 쓰기 상태만 읽습니다.
                      </strong>{" "}
                      <code>deps</code>의 이름은 모두 같은 store의 쓰기 상태 key여야 합니다. <code>ticketForm</code>{" "}
                      같은 자동 생성 key도 되지만, 다른 <code>search</code>나 <code>computed</code> key는 안 됩니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        <code>search</code> falls back to its default.
                      </strong>{" "}
                      A missing, empty or unparsable parameter reads as the default, and so does every server render.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        <code>search</code>는 기본값으로 돌아갑니다.
                      </strong>{" "}
                      파라미터가 없거나 비었거나 해석할 수 없으면 기본값을 읽고, 서버 렌더링에서도 항상 기본값입니다.
                    </span>
                  ),
                })}
              </li>
            </ul>
            <Docs.Alert type="warning">
              {l.trans({
                en: (
                  <span>
                    <strong>Derived state is read-only.</strong> <code>{"this.set({ … })"}</code> on a{" "}
                    <code>search</code> or <code>computed</code> key throws, and no <code>{"set<Key>"}</code> setter is
                    generated for it. Change the URL or the writable keys it reads instead.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>파생 상태는 읽기 전용입니다.</strong> <code>search</code>나 <code>computed</code> key에{" "}
                    <code>{"this.set({ … })"}</code>을 하면 에러가 나고, <code>{"set<Key>"}</code> setter도 생기지
                    않습니다. 대신 URL이나, 그 값이 읽는 쓰기 상태를 바꾸세요.
                  </span>
                ),
              })}
            </Docs.Alert>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="state-management" title={l.trans({ en: "Reading And Writing State", ko: "상태 읽고 쓰기" })}>
          <Docs.Title>{l.trans({ en: "Reading And Writing State", ko: "상태 읽고 쓰기" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: (
                  <span>
                    Inside an action, three methods on <code>this</code> cover every read and write. Use{" "}
                    <code>pick</code> when the next line cannot work without the value:
                  </span>
                ),
                ko: (
                  <span>
                    액션 안에서는 <code>this</code>의 method 세 개로 모든 읽기와 쓰기를 합니다. 다음 줄이 그 값 없이는
                    동작할 수 없다면 <code>pick</code>을 씁니다:
                  </span>
                ),
              })}
            </div>
            <Docs.IntroTable type={l.trans({ en: "Method", ko: "메서드" })} items={stateManagementMethods} />
            <Docs.Alert type="warning">
              {l.trans({
                en: (
                  <span>
                    <strong>
                      <code>pick</code> throws on a missing value.
                    </strong>{" "}
                    When <code>null</code> is a valid branch you want to handle, read with <code>get</code> and return
                    early.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>pick</code>은 값이 없으면 에러를 던집니다.
                    </strong>{" "}
                    <code>null</code>도 처리해야 할 정상 분기라면 <code>get</code>으로 읽고 일찍 return하세요.
                  </span>
                ),
              })}
            </Docs.Alert>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="standard-api" title={l.trans({ en: "Standard Model API", ko: "기본 모델 API" })}>
          <Docs.Title>{l.trans({ en: "Standard Model API", ko: "기본 모델 API" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: (
                  <span>
                    A store bound to <code>{"sig.<model>"}</code> gets the state and actions below without writing them.
                    Each name uses the model name: for <code>ticket</code>, <code>{"<model>Form"}</code> is{" "}
                    <code>ticketForm</code> and <code>{"create<Model>"}</code> is <code>createTicket</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <code>{"sig.<model>"}</code>에 묶인 store는 아래 상태와 액션을 직접 쓰지 않아도 받습니다. 이름에는
                    모델 이름이 들어갑니다. <code>ticket</code>이라면 <code>{"<model>Form"}</code>은{" "}
                    <code>ticketForm</code>, <code>{"create<Model>"}</code>은 <code>createTicket</code>입니다.
                  </span>
                ),
              })}
            </div>
            <Docs.SubSubTitle>{l.trans({ en: "Base state", ko: "기본 상태" })}</Docs.SubSubTitle>
            <Docs.IntroTable type={l.trans({ en: "Field", ko: "필드" })} items={baseVariables} />
            <Docs.SubSubTitle>{l.trans({ en: "Base actions", ko: "기본 액션" })}</Docs.SubSubTitle>
            <Docs.IntroTable type={l.trans({ en: "Method", ko: "메서드" })} items={baseMethods} />
            <div>
              {l.trans({
                en: (
                  <span>
                    <code>{"create<Model>…"}</code>, <code>{"update<Model>…"}</code> and <code>{"submit<Model>"}</code>{" "}
                    take the same options:
                  </span>
                ),
                ko: (
                  <span>
                    <code>{"create<Model>…"}</code>, <code>{"update<Model>…"}</code>, <code>{"submit<Model>"}</code>은
                    같은 옵션을 받습니다:
                  </span>
                ),
              })}
            </div>
            <Docs.OptionTable items={createOptions} />
            <Docs.SubSubTitle>{l.trans({ en: "Form setters", ko: "폼 setter" })}</Docs.SubSubTitle>
            <div>
              {l.trans({
                en: (
                  <span>
                    Every field of the model also gets setters that write into <code>{"<model>Form"}</code>. The array
                    and <code>File</code> rows appear only for fields of that type:
                  </span>
                ),
                ko: (
                  <span>
                    모델의 필드마다 <code>{"<model>Form"}</code>에 쓰는 setter도 생깁니다. 배열과 <code>File</code>{" "}
                    항목은 그 타입의 필드에만 생깁니다:
                  </span>
                ),
              })}
            </div>
            <Docs.IntroTable type={l.trans({ en: "Method", ko: "메서드" })} items={formSetters} />
            <div>
              {l.trans({
                en: (
                  <span>
                    To react when a field changes, declare <code>{"_postSet<Field>"}</code> on the store. It runs after
                    every write of that field:
                  </span>
                ),
                ko: (
                  <span>
                    필드가 바뀔 때 반응하려면 store에 <code>{"_postSet<Field>"}</code>를 선언합니다. 그 필드에 값이 쓰일
                    때마다 쓰기 직후에 실행됩니다:
                  </span>
                ),
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="apps/koyo/lib/ticket/ticket.store.ts"
              code={`export class TicketStore extends store(sig.ticket, () => ({
  // state
})) {
  _postSetStatus(status: cnst.TicketStatus["value"]) {
    if (status === "done") this.setClosedAtOnTicket(dayjs());
  }
}`}
            />
            <ul className={bulletList}>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Pass setters by reference.</strong> <code>{"onChange={st.do.setTitleOnTicket}"}</code>{" "}
                      lets the control publish the field to agents and tests; an inline arrow does not.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>setter는 참조로 넘깁니다.</strong> <code>{"onChange={st.do.setTitleOnTicket}"}</code>여야
                      컨트롤이 그 필드를 에이전트와 테스트에 공개합니다. 인라인 화살표 함수는 공개하지 못합니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        <code>{"_postSet<Field>"}</code> fires for every writer
                      </strong>{" "}
                      — the person's control, an agent's tool, or <code>{"fill<Model>Form"}</code> — so the rule holds
                      on every screen.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        <code>{"_postSet<Field>"}</code>는 누가 쓰든 실행됩니다.
                      </strong>{" "}
                      사람의 컨트롤, 에이전트의 툴, <code>{"fill<Model>Form"}</code> 모두 해당하므로 어느 화면에서나
                      규칙이 지켜집니다.
                    </span>
                  ),
                })}
              </li>
            </ul>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="slice-features" title={l.trans({ en: "Generated Slice API", ko: "slice 자동 생성 API" })}>
          <Docs.Title>{l.trans({ en: "Generated Slice API", ko: "slice 자동 생성 API" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: (
                  <span>
                    Each slice declared in <code>{"<model>.signal.ts"}</code> gets its own list state and actions for
                    paging, sorting, selection and counts. This slice is named <code>inProject</code>:
                  </span>
                ),
                ko: (
                  <span>
                    <code>{"<model>.signal.ts"}</code>에 선언한 slice마다 페이지, 정렬, 선택, 개수를 다루는 목록 상태와
                    액션이 따로 생깁니다. 다음 slice의 이름은 <code>inProject</code>입니다:
                  </span>
                ),
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="apps/koyo/lib/ticket/ticket.signal.ts"
              code={`export class TicketSlice extends slice(
  srv.ticket,
  { guards: { root: Admin, get: User, cru: User } },
  (init) => ({
    inProject: init({ guards: [User] })
      .param("projectId", ID)
      .exec(function (projectId) {
        return this.ticketService.queryInProject(projectId);
      }),
  }),
) {}`}
            />
            <div>
              {l.trans({
                en: (
                  <span>
                    The slice name becomes a suffix. The root slice that every model has adds nothing, and{" "}
                    <code>inProject</code> adds <code>InProject</code>:
                  </span>
                ),
                ko: (
                  <span>
                    slice 이름은 접미사가 됩니다. 모든 모델에 있는 root slice는 아무것도 붙이지 않고,{" "}
                    <code>inProject</code>는 <code>InProject</code>를 붙입니다:
                  </span>
                ),
              })}
            </div>
            <Docs.IntroTable type={l.trans({ en: "Pattern", ko: "패턴" })} items={sliceNameRows} />
            <Docs.SubSubTitle>{l.trans({ en: "Slice state", ko: "slice 상태" })}</Docs.SubSubTitle>
            <Docs.IntroTable type={l.trans({ en: "Field", ko: "필드" })} items={sliceVariables} />
            <Docs.SubSubTitle>{l.trans({ en: "Slice actions", ko: "slice 액션" })}</Docs.SubSubTitle>
            <Docs.IntroTable type={l.trans({ en: "Method", ko: "메서드" })} items={sliceMethods} />
            <div>
              {l.trans({
                en: (
                  <span>
                    <code>{"init<Model><Suffix>"}</code> and <code>{"refresh<Model><Suffix>"}</code> take an optional{" "}
                    <code>initForm</code> last:
                  </span>
                ),
                ko: (
                  <span>
                    <code>{"init<Model><Suffix>"}</code>와 <code>{"refresh<Model><Suffix>"}</code>는 마지막 인자로{" "}
                    <code>initForm</code>을 받을 수 있습니다:
                  </span>
                ),
              })}
            </div>
            <Docs.OptionTable items={initFormOptions} />
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="usage-patterns" title={l.trans({ en: "Usage Patterns", ko: "사용 패턴" })}>
          <Docs.Title>{l.trans({ en: "Usage Patterns", ko: "사용 패턴" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: (
                  <span>
                    Inside a store action, handle state through <code>this</code> — <code>get</code>, <code>pick</code>,{" "}
                    <code>set</code> and the generated actions — and call the server with <code>fetch</code>:
                  </span>
                ),
                ko: (
                  <span>
                    store 액션 안에서는 <code>this</code>의 <code>get</code>, <code>pick</code>, <code>set</code>과 자동
                    생성 액션으로 상태를 다루고, 서버는 <code>fetch</code>로 호출합니다:
                  </span>
                ),
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="apps/koyo/lib/ticket/ticket.store.ts"
              code={`async archiveTicketMany() {
  const { ticketSelectionInProject } = this.get();
  const ticketIds = ticketSelectionInProject.map((ticket) => ticket.id);
  await fetch.archiveTicketMany(ticketIds);
  this.selectTicketInProject([], { refresh: true });
}`}
            />
            <ul className={bulletList}>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        Generated actions are on <code>this</code> too.
                      </strong>{" "}
                      <code>this.selectTicketInProject([], {"{ refresh: true }"})</code> clears the selection exactly as{" "}
                      <code>st.do</code> would.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        자동 생성 액션은 <code>this</code>에도 있습니다.
                      </strong>{" "}
                      <code>this.selectTicketInProject([], {"{ refresh: true }"})</code>는 <code>st.do</code>로 부를
                      때와 똑같이 선택을 비웁니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        A <code>DataList</code> maps like an array.
                      </strong>{" "}
                      <code>ticketSelectionInProject.map(…)</code> returns a plain array, here of ids.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        <code>DataList</code>는 배열처럼 map할 수 있습니다.
                      </strong>{" "}
                      <code>ticketSelectionInProject.map(…)</code>은 일반 배열을 돌려주며, 여기서는 id 배열입니다.
                    </span>
                  ),
                })}
              </li>
            </ul>
            <div>
              {l.trans({
                en: (
                  <span>
                    In a component, read with <code>{"st.use.<key>()"}</code> and call actions with{" "}
                    <code>{"st.do.<action>()"}</code>:
                  </span>
                ),
                ko: (
                  <span>
                    컴포넌트에서는 <code>{"st.use.<key>()"}</code>로 읽고 <code>{"st.do.<action>()"}</code>으로 액션을
                    호출합니다:
                  </span>
                ),
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="apps/koyo/lib/ticket/Ticket.Util.tsx"
              code={`"use client";
import { st, usePage } from "@apps/koyo/client";
import { dayjs } from "akanjs/base";

interface OpenProps {
  className?: string;
}
export const Open = ({ className }: OpenProps) => {
  const { l } = usePage();
  const ticket = st.use.ticket();
  if (!ticket) return null;
  return (
    <button
      type="button"
      className={className}
      onClick={() => void st.do.openTicket(ticket.id, dayjs().add(7, "day"))}
    >
      {l("ticket.openTicket")}
    </button>
  );
};`}
            />
            <ul className={bulletList}>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        <code>{"st.use.<key>()"}</code> subscribes to one key.
                      </strong>{" "}
                      The button re-renders only when <code>ticket</code> changes, not on every store write.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        <code>{"st.use.<key>()"}</code>는 key 하나를 구독합니다.
                      </strong>{" "}
                      store의 다른 값이 바뀌어도 버튼은 그대로이고, <code>ticket</code>이 바뀔 때만 다시 렌더링됩니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        <code>void</code> marks a call you do not await.
                      </strong>{" "}
                      An <code>st.do</code> action returns a promise, and a thrown <code>Err</code> is already shown as
                      a toast.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        <code>void</code>는 기다리지 않는 호출이라는 표시입니다.
                      </strong>{" "}
                      <code>st.do</code> 액션은 promise를 돌려주며, 던져진 <code>Err</code>는 이미 토스트로 표시됩니다.
                    </span>
                  ),
                })}
              </li>
            </ul>
            <Docs.SubSubTitle>{l.trans({ en: "Generated setters", ko: "자동 생성 setter" })}</Docs.SubSubTitle>
            <div>
              {l.trans({
                en: (
                  <span>
                    Every plain state key also gets <code>{"st.do.set<Key>(value)"}</code>. These two lines do the same
                    thing:
                  </span>
                ),
                ko: (
                  <span>
                    일반 상태 key마다 <code>{"st.do.set<Key>(value)"}</code>도 생깁니다. 다음 두 줄은 같은 일을 합니다:
                  </span>
                ),
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="apps/koyo/lib/ticket/Ticket.Util.tsx"
              code={`st.do.setTicketModal(null);
st.set({ ticketModal: null });`}
            />
            <ul className={bulletList}>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>An action with the same name wins.</strong> <code>setTicket</code> is the generated{" "}
                      <code>{"set<Model>"}</code> action and <code>setPageOfTicket</code> is a slice action, so neither
                      is a plain setter.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>같은 이름의 액션이 우선합니다.</strong> <code>setTicket</code>은 자동 생성된{" "}
                      <code>{"set<Model>"}</code> 액션이고 <code>setPageOfTicket</code>은 slice 액션이라, 둘 다 단순
                      setter가 아닙니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Derived keys get no setter.</strong> <code>search</code> and <code>computed</code> state
                      is read-only.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>파생 key에는 setter가 없습니다.</strong> <code>search</code>와 <code>computed</code>{" "}
                      상태는 읽기 전용입니다.
                    </span>
                  ),
                })}
              </li>
            </ul>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="practical-rules" title={l.trans({ en: "Rules And Common Mistakes", ko: "규칙과 흔한 실수" })}>
          <Docs.Title>{l.trans({ en: "Rules And Common Mistakes", ko: "규칙과 흔한 실수" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: "Check a store against these rules before you commit it:",
                ko: "store를 커밋하기 전에 다음 규칙을 확인하세요:",
              })}
            </div>
            <ul className={bulletList}>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Return nothing from an action.</strong> Every action is dispatched through{" "}
                      <code>st.do</code>, so a returned value is unreachable. Write the result into state with{" "}
                      <code>this.set()</code>; a bare <code>return;</code> guard is fine.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>액션은 값을 반환하지 않습니다.</strong> 모든 액션은 <code>st.do</code>를 거쳐 실행되므로
                      반환값에 닿을 수 없습니다. 결과는 <code>this.set()</code>으로 상태에 씁니다. 값 없는{" "}
                      <code>return;</code> guard는 괜찮습니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Update lists through the DataList API.</strong> Write{" "}
                      <code>{"this.set({ ticketList: ticketList.set(ticket).save() })"}</code>, not an array spread.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>목록은 DataList API로 갱신합니다.</strong> 배열 spread 대신{" "}
                      <code>{"this.set({ ticketList: ticketList.set(ticket).save() })"}</code>처럼 씁니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Use generated actions after a mutation.</strong>{" "}
                      <code>this.setTicket(await fetch.x())</code> updates the open model and every loaded list that
                      holds the row.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>mutation 뒤에는 자동 생성 액션을 씁니다.</strong>{" "}
                      <code>this.setTicket(await fetch.x())</code> 한 줄이 열린 모델과, 그 행을 가진 불러온 목록을 모두
                      갱신합니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        No <code>try/catch</code> in an action.
                      </strong>{" "}
                      A thrown <code>Err</code> is shown as a toast for you. For a client-side check, call{" "}
                      <code>{'msg.error("<key>")'}</code> and return early instead of throwing.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        액션에는 <code>try/catch</code>를 쓰지 않습니다.
                      </strong>{" "}
                      던져진 <code>Err</code>는 자동으로 토스트로 표시됩니다. 클라이언트 쪽 검사가 실패하면 throw 대신{" "}
                      <code>{'msg.error("<key>")'}</code>를 부르고 일찍 return합니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        Use <code>pick</code> for required state, <code>get</code> when <code>null</code> is a valid
                        branch.
                      </strong>{" "}
                      See Reading And Writing State.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        반드시 있어야 하는 상태는 <code>pick</code>, <code>null</code>도 정상인 분기는 <code>get</code>
                        으로 읽습니다.
                      </strong>{" "}
                      '상태 읽고 쓰기'를 참고하세요.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Extend a library store before adding your own.</strong> Pass{" "}
                      <code>{"...<model>.stores"}</code> to <code>store()</code>, then add app-specific state and
                      actions.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>내 상태를 더하기 전에 라이브러리 store부터 확장합니다.</strong> <code>store()</code>에{" "}
                      <code>{"...<model>.stores"}</code>를 넘긴 뒤 앱 전용 상태와 액션을 더합니다.
                    </span>
                  ),
                })}
              </li>
            </ul>
            <Docs.SubSubTitle>{l.trans({ en: "Reaching Another Store", ko: "다른 store에 닿기" })}</Docs.SubSubTitle>
            <div>
              {l.trans({
                en: (
                  <span>
                    To call another store's action or touch its state, type <code>this</code> as <code>RootStore</code>:
                  </span>
                ),
                ko: (
                  <span>
                    다른 store의 액션을 부르거나 그 상태를 다룰 때는 <code>this</code>를 <code>RootStore</code> 타입으로
                    봅니다.
                  </span>
                ),
              })}
            </div>
          </Docs.Description>
          <Code.Snippet
            className="w-full"
            title="libs/shared/lib/user/user.store.ts"
            code={`import { router } from "akanjs/client";
import { store } from "akanjs/store";

import * as cnst from "../cnst";
import type { RootStore } from "../st";
import { fetch, sig } from "../useClient";

export class UserStore extends store(sig.user, () => ({
  self: new cnst.User(),
})) {
  async removeSelf({ redirect }: { redirect?: string }) {
    const { self } = this.get();
    if (!self.id) return;
    await fetch.removeUser(self.id);
    await (this as unknown as RootStore).logout();
    if (redirect) router.push(redirect);
    else router.refresh();
  }
}`}
          />
          <Docs.Description>
            <ul className={bulletList}>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>The cast only tells the type what is already there.</strong> Every store is mixed into one
                      root at runtime, so <code>(this as unknown as RootStore)</code> can call any action and{" "}
                      <code>{".set({ … })"}</code> / <code>.get()</code> any state.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>캐스팅은 이미 있는 것을 타입에 알려 줄 뿐입니다.</strong> 실행 중에는 모든 store가 하나의
                      root로 합쳐지므로, <code>(this as unknown as RootStore)</code>로 어느 액션이든 부르고{" "}
                      <code>{".set({ … })"}</code> / <code>.get()</code>으로 어느 상태든 다룹니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        Keep it <code>import type</code>.
                      </strong>{" "}
                      <code>st.ts</code> imports every store, so a value import from it is a cycle.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        <code>import type</code>으로만 가져옵니다.
                      </strong>{" "}
                      <code>st.ts</code>가 모든 store를 import하므로, 값으로 import하면 순환이 생깁니다.
                    </span>
                  ),
                })}
              </li>
            </ul>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <DocsToc />
      </Scroll>
    );
  });
