import { usePage } from "@apps/akan/client";
import { Code, cardGridRecipe, Divider, Docs, DocsToc, panelRecipe } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { page } from "akanjs/client";
import { Link } from "akanjs/ui";

export default page()
  .config({ transition: "fade", rscPatchHeadSafe: true })
  .head(({ lang }) => {
    const title = lang === "ko" ? "아키텍처: UI 구성 | Akan.js" : "Architecture: UI Composition | Akan.js";
    const description =
      lang === "ko"
        ? "모델 화면의 구성 — Load 셸과 CRUD 모달, store 기반 폼."
        : "The shape of a model screen: load shells, CRUD modals and store-driven forms.";
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

    const termRows = [
      {
        name: "shell",
        desc: l.trans({
          en: "A ready-made akanjs/ui component that draws loading, empty, paging or modal states around yours.",
          ko: "내 컴포넌트 둘레에 로딩, 빈 상태, 페이지 이동, 모달을 그려 주는 akanjs/ui의 완성된 컴포넌트입니다.",
        }),
      },
      {
        name: "slice",
        desc: l.trans({
          en: "A module's named list query, such as icecreamOrderInPublic. A shell takes one as slice.",
          ko: "icecreamOrderInPublic처럼 이름이 붙은 모듈의 목록 query입니다. 셸은 이것을 slice prop으로 받습니다.",
        }),
      },
      {
        name: "handle",
        desc: l.trans({
          en: "What fetch.init, fetch.view and fetch.edit return: await it, or destructure one promise per field.",
          ko: "fetch.init, fetch.view, fetch.edit이 돌려주는 값입니다. await하거나, field마다 promise 하나씩 구조 분해합니다.",
        }),
      },
      {
        name: "Suspense boundary",
        desc: l.trans({
          en: "A spot that shows a fallback first and streams its content in when the data lands.",
          ko: "먼저 fallback을 보여 주고, 데이터가 도착하면 내용을 스트리밍해 채우는 자리입니다.",
        }),
      },
    ];

    const uiRows = [
      {
        name: ["Load.Units", "Load.View", "Load.Edit"],
        desc: l.trans({
          en: "Data shells: seed the store from a fetch handle and render loading, empty and list states.",
          ko: "fetch handle로 store를 채우고 loading·empty·list 상태를 그리는 데이터 셸입니다.",
        }),
      },
      {
        name: "Load.Stream",
        desc: l.trans({
          en: "Awaits one promise behind its own Suspense boundary; a resolved value renders inline.",
          ko: "promise 하나를 자체 Suspense 경계 뒤에서 기다립니다. 이미 해소된 값은 바로 그립니다.",
        }),
      },
      {
        name: ["Model.New", "Model.Edit", "Model.SureToRemove"],
        desc: l.trans({
          en: "Create, edit and remove modals wired to the generated store actions.",
          ko: "생성된 store action에 연결된 생성·수정·삭제 모달입니다.",
        }),
      },
      {
        name: "Field",
        desc: l.trans({
          en: "The control for every model field type. Never a bare input for a model field.",
          ko: "모든 모델 field 타입의 컨트롤입니다. 모델 field에 맨 input을 쓰지 않습니다.",
        }),
      },
      {
        name: ["Tab", "Layout", "Link", "Image", "Empty"],
        desc: l.trans({
          en: "Composition primitives. Tab keeps panel bodies on the server; Link adds the locale prefix.",
          ko: "조합용 기본 요소입니다. Tab은 패널 본문을 서버에 남기고, Link는 locale 접두어를 붙입니다.",
        }),
      },
      {
        name: "cn",
        desc: l.trans({
          en: "The only class merge, from akanjs/client. Pass the caller's className last.",
          ko: "akanjs/client의 유일한 클래스 병합 함수입니다. 호출자의 className을 마지막에 넘깁니다.",
        }),
      },
    ];

    const screens = [
      {
        title: l.trans({ en: "Index — find one", ko: "목록 — 찾기" }),
        shell: "Load.Units",
        desc: l.trans({
          en: "For discovery: search, scan, page through and choose a record.",
          ko: "탐색을 위한 화면입니다. 검색하고, 훑고, 페이지를 넘기고, 하나를 고릅니다.",
        }),
      },
      {
        title: l.trans({ en: "New — create one", ko: "생성 — 만들기" }),
        shell: "Model.New",
        desc: l.trans({
          en: "Controlled input through one Template and a submit action.",
          ko: "Template 하나와 submit action으로 입력을 받습니다.",
        }),
      },
      {
        title: l.trans({ en: "View — read one", ko: "상세 — 보기" }),
        shell: "Load.View",
        desc: l.trans({
          en: "Presents one record clearly, then offers the follow-up actions.",
          ko: "레코드 하나를 명확히 보여 준 뒤, 이어서 할 수 있는 동작을 제시합니다.",
        }),
      },
      {
        title: l.trans({ en: "Edit — change one", ko: "수정 — 고치기" }),
        shell: "Load.Edit",
        desc: l.trans({
          en: "The same Template as New, with the record's current values in it.",
          ko: "생성과 같은 Template에 레코드의 현재 값을 채워 고칩니다.",
        }),
      },
    ];

    const helperRows = [
      {
        name: "fetch",
        desc: l.trans({
          en: "One call per endpoint, plus per-slice init, view and edit handles. Called server-side.",
          ko: "endpoint마다 함수 하나, slice마다 init·view·edit handle입니다. 서버 쪽에서 호출합니다.",
        }),
      },
      {
        name: "st",
        desc: l.trans({
          en: "Read with st.use.*, write with st.do.*. The CRUD actions are generated.",
          ko: "st.use.*로 읽고 st.do.*로 씁니다. CRUD action은 생성됩니다.",
        }),
      },
      {
        name: "<Model>.*",
        desc: l.trans({
          en: "A module's Unit, View, Zone, Template and Util. Name by role: IcecreamOrder.Unit.Card.",
          ko: "모듈의 Unit·View·Zone·Template·Util입니다. 역할로 이름 짓습니다: IcecreamOrder.Unit.Card.",
        }),
      },
      {
        name: "usePage",
        desc: l.trans({
          en: "l, l.trans and the page context. Works in a server component.",
          ko: "l, l.trans, page context입니다. server component에서도 씁니다.",
        }),
      },
    ];

    const loadRows = [
      {
        name: "Load.Units",
        desc: l.trans({
          en: "init from fetch.init<Model><Suffix>. renderItem draws a row; renderList takes the whole list.",
          ko: "fetch.init<Model><Suffix>의 init을 받습니다. renderItem은 행 하나, renderList는 목록 전체를 그립니다.",
        }),
      },
      {
        name: "Load.View",
        desc: l.trans({
          en: "view from fetch.view<Model>. renderView is required; empty is the placeholder.",
          ko: "fetch.view<Model>의 view를 받습니다. renderView는 필수이고 empty가 자리표시자입니다.",
        }),
      },
      {
        name: "Load.Edit",
        desc: l.trans({
          en: "edit from fetch.edit<Model>, or a partial. slice is required; type picks modal or form.",
          ko: "fetch.edit<Model>의 edit 또는 partial을 받습니다. slice는 필수이고 type으로 modal·form을 고릅니다.",
        }),
      },
      {
        name: "Load.Stream",
        desc: l.trans({
          en: "of takes a promise or a value; children renders it. Takes a slice's x<Model>List<Suffix>.",
          ko: "of는 promise나 값을 받고 children이 그립니다. slice의 x<Model>List<Suffix>를 받습니다.",
        }),
      },
      {
        name: ["Load.Pagination", "Load.Page"],
        desc: l.trans({
          en: "The paging control alone, and the shared SSR/CSR page loader.",
          ko: "페이지 이동 컨트롤 단독, 그리고 SSR·CSR 공용 page loader입니다.",
        }),
      },
    ];

    const modalProps = [
      {
        name: "trigger",
        desc: l.trans({
          en: "Replaces the default button that opens the modal. On Model.New and Model.Edit, children is the form body handed to the modal, not the label, and neither takes a className. Model.SureToRemove takes no children at all, so its trigger is the whole control.",
          ko: "모달을 여는 기본 버튼을 대체합니다. Model.New와 Model.Edit에서 children은 라벨이 아니라 모달 안에 들어갈 폼 본문이고, 둘 다 className을 받지 않습니다. Model.SureToRemove는 children을 아예 받지 않으므로 trigger가 컨트롤 전체입니다.",
        }),
      },
      {
        name: "draft",
        desc: l.trans({
          en: "Form recovery, on by default. The shell saves the whole form as the user types and offers it back on the next open. The scope is the record id for an edit and the seed plus the route for a new form, per signed-in user. Secret and hidden values are never saved.",
          ko: "폼 복구이며 기본으로 켜져 있습니다. 사용자가 입력하는 동안 폼 전체를 저장했다가 다음에 열 때 돌려줍니다. scope는 edit이면 레코드 id, new면 seed와 route이고, 로그인한 사용자별로 나뉩니다. secret과 hidden 값은 저장하지 않습니다.",
        }),
      },
      {
        name: "name",
        desc: l.trans({
          en: "Model.SureToRemove shows this in the confirmation. With typeNameToRemove, the user must also type it back before the delete button enables.",
          ko: "Model.SureToRemove가 확인창에 보여 주는 값입니다. typeNameToRemove를 켜면, 삭제 버튼이 활성화되기 전에 사용자가 이 값을 직접 입력해야 합니다.",
        }),
      },
    ];

    const textRows = [
      {
        name: 'l("icecreamOrder.size")',
        desc: l.trans({
          en: "A field label, read from the model's dictionary.",
          ko: "field 라벨입니다. 모델의 dictionary에서 읽습니다.",
        }),
      },
      {
        name: 'l("icecreamOrder.modelName")',
        desc: l.trans({ en: "The model's own name.", ko: "모델 자신의 이름입니다." }),
      },
      {
        name: "l.trans({ en, ko })",
        desc: l.trans({
          en: "A one-off sentence that belongs to no model.",
          ko: "어느 모델에도 속하지 않는 일회성 문장입니다.",
        }),
      },
    ];

    return (
      <Scroll>
        <Scroll.Slide id="ui-composition" title={l.trans({ en: "UI Composition", ko: "UI 구성" })}>
          <Docs.Title>{l.trans({ en: "UI Composition", ko: "UI 구성" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: "Picture an order list screen. Besides the list itself, it needs six more things:",
                ko: "주문 목록 화면 하나를 떠올려 보세요. 목록 자체 말고도 여섯 가지가 더 필요합니다:",
              })}
            </div>
            <ul className="my-4 list-disc space-y-1 pl-5">
              <li>{l.trans({ en: "a skeleton while it loads", ko: "불러오는 동안 보여 줄 스켈레톤" })}</li>
              <li>{l.trans({ en: "a placeholder when it is empty", ko: "비었을 때 보여 줄 자리표시자" })}</li>
              <li>{l.trans({ en: "a page control at the bottom", ko: "하단의 페이지 이동 컨트롤" })}</li>
              <li>{l.trans({ en: "a modal for a new order", ko: "새 주문을 만드는 모달" })}</li>
              <li>{l.trans({ en: "a second modal for editing one", ko: "주문을 고치는 두 번째 모달" })}</li>
              <li>{l.trans({ en: "a confirmation before anything is deleted", ko: "무언가를 지우기 전의 확인창" })}</li>
            </ul>
            <div>
              {l.trans({
                en: "That is six states around one array, and none of them is your product. akanjs/ui ships all six, already wired to the generated store. You write the row and the detail view; the shells around them handle loading, empty, paging, refresh and the CRUD modals.",
                ko: "배열 하나를 둘러싼 상태가 여섯 개인데, 그중 어느 것도 여러분의 제품은 아닙니다. akanjs/ui는 여섯 가지를 모두 제공하고, 생성된 store에 이미 연결해 두었습니다. 여러분은 행 하나와 상세 화면 하나만 쓰면 되고, 그 둘레의 셸이 loading·empty·paging·refresh와 CRUD 모달을 맡습니다.",
              })}
            </div>
            <Docs.Figure
              title={l.trans({
                en: "You write the row; the shell draws the rest",
                ko: "행은 내가 쓰고, 나머지는 셸이 그립니다",
              })}
              image="shell-around-row"
              prompt={`
              One browser window filling most of the frame, and nothing at all drawn outside it — no people, devices,
              clouds, servers or arrows. Inside the window, a small button at the top right labelled "New". Below it, a
              vertical stack of four identical row cards, each holding two short text lines; only the top card's
              outline is traced as the red accent, and it is labelled "Your Row". Under the stack, a short row of four
              small page-number boxes labelled "Pagination". A tall bracket runs down the left side of the stack and
              the page boxes, labelled "Load.Units".
            `}
              alt={l.trans({
                en: "On an order list screen you write only one row component. Load.Units repeats it, draws the page control under it and handles loading and empty states; the New button is a Model.New shell.",
                ko: "주문 목록 화면에서 직접 쓰는 것은 행 컴포넌트 하나뿐입니다. Load.Units가 그 행을 반복하고, 아래에 페이지 이동 컨트롤을 그리고, 로딩과 빈 상태를 처리합니다. New 버튼은 Model.New 셸입니다.",
              })}
            />
            <div>
              {l.trans({
                en: (
                  <span>
                    This page is the inventory of those shells and the rules for combining them. Where the client
                    boundary falls is the subject of{" "}
                    <Link href="/docs/arch/frontend" className="text-primary">
                      UI Architecture
                    </Link>
                    .
                  </span>
                ),
                ko: (
                  <span>
                    이 문서는 그 셸들의 목록과 조합 규칙입니다. 클라이언트 경계가 어디에 그어지는지는 앞 문서{" "}
                    <Link href="/docs/arch/frontend" className="text-primary">
                      UI 아키텍처
                    </Link>
                    에서 다룹니다.
                  </span>
                ),
              })}
            </div>

            <Docs.SubSubTitle>
              {l.trans({ en: "Words used on this page", ko: "이 페이지에서 쓰는 말" })}
            </Docs.SubSubTitle>
            <Docs.IntroTable type={l.trans({ en: "Term", ko: "용어" })} items={termRows} />

            <Docs.SubSubTitle>
              {l.trans({ en: "What akanjs/ui gives you", ko: "akanjs/ui가 주는 것" })}
            </Docs.SubSubTitle>
            <Docs.IntroTable type={l.trans({ en: "Export", ko: "Export" })} items={uiRows} />

            <Docs.SubSubTitle>
              {l.trans({ en: "Where your own components go", ko: "직접 쓰는 컴포넌트는 어디에 두나" })}
            </Docs.SubSubTitle>
            <div>
              {l.trans({
                en: "What you write splits the same way, by whether it belongs to one model:",
                ko: "직접 쓰는 쪽도 모델 하나에 묶이는지를 기준으로 똑같이 나뉩니다:",
              })}
            </div>
            <div className={cardGridRecipe({ cols: "mdTwo" }, "my-4")}>
              <div className={panelRecipe({ radius: "lg", padding: "sm" }, "min-w-0")}>
                <div className="font-mono font-semibold text-primary">lib/&lt;model&gt;/</div>
                <div className="mt-1 text-foreground/70 text-sm">
                  {l.trans({
                    en: "Anything bound to one model. The module owns its own row, detail view, form and actions.",
                    ko: "모델 하나에 묶인 것입니다. 모듈이 자기 행, 상세 화면, 폼, 액션을 직접 소유합니다.",
                  })}
                </div>
              </div>
              <div className={panelRecipe({ radius: "lg", padding: "sm" }, "min-w-0")}>
                <div className="font-mono font-semibold text-primary">ui/</div>
                <div className="mt-1 text-foreground/70 text-sm">
                  {l.trans({
                    en: "Anything reusable across models and bound to none of them.",
                    ko: "여러 모델에서 재사용되고, 어느 하나에도 묶이지 않는 것입니다.",
                  })}
                </div>
              </div>
            </div>
            <div>
              {l.trans({
                en: "A component that seems to need both is really two components: one in each place.",
                ko: "둘 다 필요해 보이는 컴포넌트는 사실 컴포넌트 둘입니다. 각자 제자리에 하나씩 둡니다.",
              })}
            </div>
            <Docs.Alert type="error">
              {l.trans({
                en: (
                  <span>
                    <strong>Reach third-party packages through a lib.</strong> A third-party package may not be imported
                    from <code>page/**</code>, from a barrel, or from any module component file; re-export it through a
                    lib first. That is why <code>libs/shared/ui/Field.tsx</code> extends the framework{" "}
                    <code>Field</code> with <code>Rich</code>, <code>Img</code> and <code>Map</code> instead of each app
                    importing an editor directly.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>서드파티 패키지는 lib를 거쳐 씁니다.</strong> <code>page/**</code>, barrel, 모듈 component
                    파일에서는 서드파티 패키지를 import할 수 없으므로, 먼저 lib에서 re-export합니다.{" "}
                    <code>libs/shared/ui/Field.tsx</code>가 프레임워크의 <code>Field</code>에 <code>Rich</code>,{" "}
                    <code>Img</code>, <code>Map</code>을 더해 확장하는 것도 그래서이며, 덕분에 각 앱이 에디터를 직접
                    import하지 않습니다.
                  </span>
                ),
              })}
            </Docs.Alert>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="screen-flow" title={l.trans({ en: "The Shape Of A Model Screen", ko: "모델 화면의 모양" })}>
          <Docs.Title>{l.trans({ en: "The Shape Of A Model Screen", ko: "모델 화면의 모양" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: "A model almost always produces the same four screens. Users scan a list, create a record, open one, and come back to edit it. Each arrow below is a shell that already exists, so the four screens are four small files rather than four workflows.",
                ko: "모델 하나는 거의 언제나 같은 네 화면을 만들어 냅니다. 사용자는 목록을 훑고, 레코드를 만들고, 하나를 열어 보고, 다시 돌아와 고칩니다. 아래 화살표는 모두 이미 있는 셸이므로, 네 화면은 네 개의 workflow가 아니라 네 개의 작은 파일입니다.",
              })}
            </div>
            <Docs.Sequence
              title={l.trans({ en: "Index, new, view, edit", ko: "목록, 생성, 상세, 수정" })}
              actors={{
                start: { label: l.trans({ en: "Start", ko: "시작" }), tone: "muted" },
                index: { label: l.trans({ en: "Index", ko: "목록" }), lines: ["Load.Units"] },
                new: { label: l.trans({ en: "New", ko: "생성" }), lines: ["Model.New"] },
                view: { label: l.trans({ en: "View", ko: "상세" }), lines: ["Load.View"] },
                edit: { label: l.trans({ en: "Edit", ko: "수정" }), lines: ["Load.Edit"] },
                end: { label: l.trans({ en: "End", ko: "끝" }), tone: "muted" },
              }}
              messages={[
                { from: "start", to: "index", label: "" },
                { from: "index", to: "new", label: l.trans({ en: "new", ko: "생성" }) },
                { from: "new", to: "view", label: l.trans({ en: "submit", ko: "제출" }) },
                { from: "index", to: "view", label: l.trans({ en: "pick a Unit", ko: "Unit 선택" }) },
                { from: "view", to: "edit", label: l.trans({ en: "edit", ko: "수정" }) },
                { from: "edit", to: "view", label: l.trans({ en: "submit", ko: "제출" }) },
                { from: "view", to: "index", label: l.trans({ en: "back", ko: "뒤로" }) },
                { from: "view", to: "end", label: "Model.SureToRemove" },
              ]}
              emphasis={["index"]}
            />
            <div>
              {l.trans({
                en: "Each screen has one job, and one shell that does the heavy lifting:",
                ko: "화면마다 맡은 일이 하나 있고, 그 일을 대신해 주는 셸이 하나 있습니다:",
              })}
            </div>
            <div className={cardGridRecipe({ cols: "mdTwo" }, "my-4")}>
              {screens.map((screen) => (
                <div key={screen.shell} className={panelRecipe({ radius: "lg", padding: "sm" }, "min-w-0")}>
                  <div className="font-semibold text-primary">{screen.title}</div>
                  <code className={chip}>{screen.shell}</code>
                  <div className="mt-2 text-foreground/70 text-sm">{screen.desc}</div>
                </div>
              ))}
            </div>

            <Docs.SubSubTitle>
              {l.trans({ en: "The same stack under every screen", ko: "모든 화면 아래의 같은 스택" })}
            </Docs.SubSubTitle>
            <div>
              {l.trans({
                en: "Underneath all four screens, the same layers run in the same order, from the route down to the database:",
                ko: "네 화면 모두의 아래에서는 route부터 데이터베이스까지 같은 층이 같은 순서로 돕니다:",
              })}
            </div>
            <Docs.Flow
              title={l.trans({ en: "From the route to the database", ko: "route에서 데이터베이스까지" })}
              direction="TB"
              nodes={{
                route: { label: "page()", lines: [l.trans({ en: "route entry", ko: "route 진입점" })] },
                server: { label: "Unit · View", lines: [l.trans({ en: "server components", ko: "server component" })] },
                client: {
                  label: "Zone · Template · Util",
                  lines: [l.trans({ en: "client components", ko: "client component" })],
                },
                store: { label: "store", lines: ["st.use · st.do"] },
                fetchClient: {
                  label: "fetch",
                  lines: [l.trans({ en: "generated endpoint calls", ko: "생성된 endpoint 호출" })],
                },
                signal: { label: "signal", lines: ["endpoint · slice"] },
                service: { label: "service" },
                document: { label: "document", tone: "muted" },
              }}
              edges={[
                ["route", "server"],
                ["route", "client"],
                ["client", "store"],
                ["store", "fetchClient"],
                ["route", "fetchClient"],
                ["fetchClient", "signal"],
                ["signal", "service"],
                ["service", "document"],
              ]}
              emphasis={["fetchClient"]}
            />
            <Docs.Alert type="info">
              {l.trans({
                en: (
                  <span>
                    <strong>Two roads to fetch, one rule.</strong> The route calls <code>fetch</code> directly; a client
                    component reaches it only through a store action. That one rule keeps the two paths from drifting
                    apart.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>fetch에 닿는 길은 둘, 규칙은 하나.</strong> route는 <code>fetch</code>를 직접 부르고, client
                    component는 store action을 통해서만 닿습니다. 이 한 가지 규칙이 두 경로가 어긋나지 않게 합니다.
                  </span>
                ),
              })}
            </Docs.Alert>
            <div>
              {l.trans({
                en: "Day to day, four generated helpers are the whole surface you touch:",
                ko: "매일 쓰는 표면은 생성된 helper 넷이 전부입니다:",
              })}
            </div>
            <Docs.IntroTable type={l.trans({ en: "Helper", ko: "헬퍼" })} items={helperRows} />
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="load-shells" title={l.trans({ en: "The Load Shells", ko: "Load 셸" })}>
          <Docs.Title>{l.trans({ en: "The Load Shells", ko: "Load 셸" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: "Never hand-roll a loading, empty or list state. A Load shell does three things for you:",
                ko: "loading, empty, list 상태를 직접 만들지 마세요. Load 셸이 세 가지를 대신해 줍니다:",
              })}
            </div>
            <ul className="my-4 list-disc space-y-2 pl-5">
              <li>
                {l.trans({
                  en: "It takes the handle the route fetched, so the data is already on its way before the page is sent.",
                  ko: "route가 가져온 handle을 받습니다. 그래서 데이터는 page가 전송되기 전부터 이미 오는 중입니다.",
                })}
              </li>
              <li>
                {l.trans({
                  en: "It seeds the client store from that handle, so the generated pagination, query, sort and refresh actions keep working after hydration.",
                  ko: "그 handle로 client store를 채웁니다. 그래서 hydration 이후에도 생성된 pagination·query·sort·refresh action이 계속 동작합니다.",
                })}
              </li>
              <li>
                {l.trans({
                  en: "It renders the loading, empty and list states around your row component.",
                  ko: "여러분의 행 컴포넌트 둘레에 loading, empty, list 세 가지 상태를 그립니다.",
                })}
              </li>
            </ul>
            <Docs.IntroTable type={l.trans({ en: "Shell", ko: "셸" })} items={loadRows} />

            <Docs.SubSubTitle>
              {l.trans({ en: "Don't wait for the slowest query", ko: "가장 느린 query를 기다리지 않기" })}
            </Docs.SubSubTitle>
            <div>
              {l.trans({
                en: "The route destructures the handle instead of awaiting it. The init field goes to a Zone, and any leftover list promise goes to a Load.Stream:",
                ko: "route는 handle을 await하지 않고 구조 분해합니다. init field는 Zone에 넘기고, 남는 list promise는 Load.Stream에 넘깁니다:",
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="apps/koyo/page/(public)/icecreamOrder/_index.tsx"
              code={`import { fetch, IcecreamOrder } from "@apps/koyo/client";
import { page } from "akanjs/client";
import { Load, Loading } from "akanjs/ui";

export default page().render(() => {
  const { icecreamOrderInitInPublic, icecreamOrderListInPublic } = fetch.initIcecreamOrderInPublic();
  return (
    <>
      <Load.Stream of={icecreamOrderListInPublic} fallback={<Loading.Skeleton active />}>
        {(icecreamOrderList) => <IcecreamOrder.Unit.Total count={icecreamOrderList.length} />}
      </Load.Stream>
      <IcecreamOrder.Zone.Card init={icecreamOrderInitInPublic} />
    </>
  );
});`}
            />
            <ul className="my-4 list-disc space-y-2 pl-5">
              <li>
                {l.trans({
                  en: "Load.Stream shows the skeleton until the list lands, then renders the total from it.",
                  ko: "Load.Stream은 목록이 도착할 때까지 스켈레톤을 보여 주고, 도착하면 그것으로 합계를 그립니다.",
                })}
              </li>
              <li>
                {l.trans({
                  en: "The Zone receives init and renders the rows behind a boundary of its own.",
                  ko: "Zone은 init을 받아 자기만의 경계 뒤에서 행을 그립니다.",
                })}
              </li>
              <li>
                {l.trans({
                  en: "Each renders as its own data lands, so the page never waits for the slowest query.",
                  ko: "둘은 각자 자기 데이터가 도착하는 대로 그려지므로, page가 가장 느린 query를 기다릴 일이 없습니다.",
                })}
              </li>
            </ul>
            <Docs.Alert type="warning">
              {l.trans({
                en: (
                  <span>
                    <strong>A list or insight never goes to a Zone.</strong>{" "}
                    <code>x&lt;Model&gt;List&lt;Suffix&gt;</code> and <code>x&lt;Model&gt;Insight&lt;Suffix&gt;</code>{" "}
                    resolve to hydrated model instances: class objects with methods. React Flight, the format the server
                    uses to hand props to client components, refuses them. Consume them in a server component or inside
                    a <code>Load.Stream</code>. The <code>init</code> field is the one shaped for the boundary.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>list와 insight는 Zone에 넘기지 않습니다.</strong>{" "}
                    <code>x&lt;Model&gt;List&lt;Suffix&gt;</code>와 <code>x&lt;Model&gt;Insight&lt;Suffix&gt;</code>는
                    메서드를 가진 클래스 객체, 즉 hydrate된 모델 인스턴스로 해소됩니다. 서버가 client component에 prop을
                    넘기는 형식인 React Flight는 이를 거부합니다. server component 안이나 <code>Load.Stream</code>{" "}
                    안에서 소비하세요. 경계를 넘도록 만들어진 field는 <code>init</code>입니다.
                  </span>
                ),
              })}
            </Docs.Alert>
            <Docs.Alert type="error">
              {l.trans({
                en: (
                  <span>
                    <strong>
                      Never call <code>fetch.init*</code> from a client file.
                    </strong>{" "}
                    From a route it resolves before the first byte; after hydration it is two extra round-trips for a
                    shell the browser already painted. To reload from the client, use the generated{" "}
                    <code>st.do.init&lt;Model&gt;&lt;Suffix&gt;()</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      client 파일에서 <code>fetch.init*</code>을 호출하지 마세요.
                    </strong>{" "}
                    route에서는 첫 바이트 전에 해소되지만, hydration 이후에는 브라우저가 이미 그린 화면을 위해 왕복 두
                    번을 더 치릅니다. 클라이언트에서 다시 불러올 때는 생성된{" "}
                    <code>st.do.init&lt;Model&gt;&lt;Suffix&gt;()</code>를 쓰세요.
                  </span>
                ),
              })}
            </Docs.Alert>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="model-shells" title={l.trans({ en: "The CRUD Modals", ko: "CRUD 모달" })}>
          <Docs.Title>{l.trans({ en: "The CRUD Modals", ko: "CRUD 모달" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: "Creating, editing and removing a record are three workflows every model needs and no model should implement. Each shell takes the slice it operates on, opens the module's own Template, and calls the generated store action on submit.",
                ko: "레코드를 만들고, 고치고, 지우는 일은 모든 모델에 필요하지만 어떤 모델도 직접 구현할 필요가 없는 세 가지 workflow입니다. 각 셸은 다룰 slice를 받아 모듈의 Template을 열고, 제출하면 생성된 store action을 호출합니다.",
              })}
            </div>
            <Docs.Figure
              title={l.trans({
                en: "Model.New: the trigger opens it, children fill it",
                ko: "Model.New: trigger가 열고, children이 채웁니다",
              })}
              image="model-new-parts"
              prompt={`
              One browser window filling most of the frame, and nothing at all drawn outside it — no people, devices,
              clouds, servers or arrows outside the window. In the window's top right corner, a small button labelled
              "trigger". In the center, a smaller modal window with a thin top bar, laid over the page; inside the
              modal, three stacked form fields, each a short label line above an empty input box, and one small
              button at the modal's bottom right. A dashed outline traced as the red accent surrounds only the three
              form fields and is labelled "children". One curved arrow runs from the trigger button to the modal.
            `}
              alt={l.trans({
                en: "The trigger prop is the button on the page that opens the modal. The children of Model.New are the form fields inside the modal, not the button's label; the modal itself and its submit button come from the shell.",
                ko: "trigger prop은 페이지에서 모달을 여는 버튼입니다. Model.New의 children은 버튼 라벨이 아니라 모달 안의 폼 필드이고, 모달 자체와 제출 버튼은 셸이 그립니다.",
              })}
            />
            <Code.Snippet
              className="w-full"
              title="apps/koyo/lib/icecreamOrder/IcecreamOrder.Util.tsx"
              code={`"use client";
import { fetch, IcecreamOrder, usePage } from "@apps/koyo/client";
import { Model } from "akanjs/ui";
import { BiPlus, BiTrash } from "react-icons/bi";

export const New = () => {
  const { l } = usePage();
  return (
    <Model.New
      slice={fetch.slice.icecreamOrder}
      trigger={
        <button type="button">
          <BiPlus /> {l("base.create")}
        </button>
      }
    >
      <IcecreamOrder.Template.General />
    </Model.New>
  );
};

interface RemoveProps {
  icecreamOrderId: string;
}
export const Remove = ({ icecreamOrderId }: RemoveProps) => {
  const { l } = usePage();
  return (
    <Model.SureToRemove
      modelId={icecreamOrderId}
      name={l("icecreamOrder.modelName")}
      slice={fetch.slice.icecreamOrder}
      redirect="/icecreamOrder"
      trigger={
        <button type="button">
          <BiTrash /> {l("base.remove")}
        </button>
      }
    />
  );
};`}
            />
            <div>
              {l.trans({
                en: "A Util export is named for the endpoint verb minus the model noun, so this file exports New and Remove rather than NewIcecreamOrder. Three props are worth knowing before you reach for one of these shells:",
                ko: "Util의 export는 endpoint 동사에서 모델 명사를 뺀 이름을 씁니다. 그래서 이 파일은 NewIcecreamOrder가 아니라 New와 Remove를 내보냅니다. 이 셸을 쓰기 전에 알아 둘 prop이 셋 있습니다:",
              })}
            </div>
            <div className="my-4 space-y-3">
              {modalProps.map((prop) => (
                <div key={prop.name} className={panelRecipe({ radius: "lg", padding: "sm" }, "min-w-0")}>
                  <div className="mb-1 font-mono font-semibold text-primary">{prop.name}</div>
                  <div className="text-foreground/70 text-sm">{prop.desc}</div>
                </div>
              ))}
            </div>
            <Docs.Alert type="warning">
              {l.trans({
                en: (
                  <span>
                    <strong>Never persist form values yourself.</strong> The old per-field <code>cache</code> and{" "}
                    <code>cacheKey</code> props are deprecated and store nothing: they covered five control types, keyed
                    on the translated label, and restored over server data. <code>{"draft={false}"}</code> turns
                    recovery off, and <code>{'draft="<scope>"'}</code> names the scope when the context is in neither
                    the id nor the seed.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>폼 값을 직접 저장하지 마세요.</strong> 예전의 field별 <code>cache</code>와{" "}
                    <code>cacheKey</code> prop은 deprecated이며 아무것도 저장하지 않습니다. 컨트롤 다섯 종류만 다뤘고,
                    번역된 라벨을 키로 썼고, 서버 데이터 위에 덮어썼기 때문입니다. <code>{"draft={false}"}</code>는
                    복구를 끄고, <code>{'draft="<scope>"'}</code>는 맥락이 id에도 seed에도 없을 때 scope를 직접
                    지정합니다.
                  </span>
                ),
              })}
            </Docs.Alert>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide
          id="forms-and-fields"
          title={l.trans({ en: "Forms Are Store-Driven", ko: "폼은 store가 움직입니다" })}
        >
          <Docs.Title>{l.trans({ en: "Forms Are Store-Driven", ko: "폼은 store가 움직입니다" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: "A Template, the module's form component, holds no state of its own. Every control reads one key of <model>Form from the store and writes it back through the generated setter. Two things follow from that:",
                ko: "모듈의 폼 컴포넌트인 Template은 자기 상태를 갖지 않습니다. 모든 컨트롤이 store의 <model>Form에서 key 하나를 읽고, 생성된 setter로 다시 씁니다. 여기서 두 가지가 따라옵니다:",
              })}
            </div>
            <ul className="my-4 list-disc space-y-2 pl-5">
              <li>
                {l.trans({
                  en: "A Template contains zero useState.",
                  ko: "Template에는 useState가 하나도 없습니다.",
                })}
              </li>
              <li>
                {l.trans({
                  en: "A saved draft can be restored into it, because the whole form lives in one place.",
                  ko: "폼 전체가 한곳에 있으므로, 저장해 둔 draft를 그대로 되돌려 넣을 수 있습니다.",
                })}
              </li>
            </ul>
            <Code.Snippet
              className="w-full"
              title="apps/koyo/lib/icecreamOrder/IcecreamOrder.Template.tsx"
              code={`"use client";
import { cnst, st, usePage } from "@apps/koyo/client";
import { Field } from "@libs/shared/ui";
import { Layout } from "akanjs/ui";

interface GeneralProps {
  className?: string;
}
export const General = ({ className }: GeneralProps) => {
  const icecreamOrderForm = st.use.icecreamOrderForm();
  const { l } = usePage();
  return (
    <Layout.Template className={className}>
      <Field.Number
        label={l("icecreamOrder.size")}
        desc={l("icecreamOrder.size.desc")}
        value={icecreamOrderForm.size}
        onChange={st.do.setSizeOnIcecreamOrder}
      />
      <Field.MultiToggleSelect
        label={l("icecreamOrder.toppings")}
        desc={l("icecreamOrder.toppings.desc")}
        value={icecreamOrderForm.toppings}
        items={cnst.Topping}
        onChange={st.do.setToppingsOnIcecreamOrder}
      />
    </Layout.Template>
  );
};`}
            />
            <Docs.Alert type="warning">
              {l.trans({
                en: (
                  <span>
                    <strong>Pass the setter by reference.</strong>{" "}
                    <code>{"onChange={(v) => st.do.setSizeOnIcecreamOrder(v)}"}</code> runs identically, but the arrow
                    is a fresh anonymous closure. The control then emits no <code>data-akan-action</code> and publishes
                    no agent tool for that field, so the in-page agent, E2E selectors and any external browser agent
                    quietly lose it. To normalize a value, use the control&apos;s <code>transform</code> prop instead.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>setter는 참조로 넘기세요.</strong>{" "}
                    <code>{"onChange={(v) => st.do.setSizeOnIcecreamOrder(v)}"}</code>도 똑같이 동작하지만, 화살표
                    함수는 매번 새로 만들어지는 익명 클로저입니다. 그러면 컨트롤이 <code>data-akan-action</code>을
                    내보내지 않고 그 field의 에이전트 tool도 publish되지 않아서, 인페이지 에이전트와 E2E selector와 외부
                    브라우저 에이전트가 조용히 그 field를 잃습니다. 값 변환이 필요하면 컨트롤의 <code>transform</code>{" "}
                    prop을 쓰세요.
                  </span>
                ),
              })}
            </Docs.Alert>

            <Docs.SubSubTitle>{l.trans({ en: "Nested rows and files", ko: "중첩된 행과 파일" })}</Docs.SubSubTitle>
            <div className={cardGridRecipe({ cols: "mdTwo" }, "my-4")}>
              <div className={panelRecipe({ radius: "lg", padding: "sm" }, "min-w-0")}>
                <div className="font-semibold text-primary">{l.trans({ en: "Nested rows", ko: "중첩된 행" })}</div>
                <div className="mt-1 text-foreground/70 text-sm">
                  {l.trans({
                    en: "Write one nested value by its path, and add or remove rows with the generated add<Field>OnX and sub<Field>OnX actions.",
                    ko: "중첩된 값 하나는 경로로 쓰고, 행을 더하거나 뺄 때는 생성된 add<Field>OnX, sub<Field>OnX action을 씁니다.",
                  })}
                </div>
                <code className={chip}>{'st.do.writeOnIcecreamOrder("toppings.3.name", value)'}</code>
              </div>
              <div className={panelRecipe({ radius: "lg", padding: "sm" }, "min-w-0")}>
                <div className="font-semibold text-primary">
                  {l.trans({ en: "Image and file fields", ko: "이미지와 파일 field" })}
                </div>
                <div className="mt-1 text-foreground/70 text-sm">
                  {l.trans({
                    en: "An image or file field is a relation to the File model, and the store generates its upload action. Never hand-roll a data-URL fallback.",
                    ko: "이미지나 파일 field는 File 모델에 대한 relation이고, store가 업로드 action을 생성합니다. data-URL 대체 구현을 직접 만들지 마세요.",
                  })}
                </div>
                <code className={chip}>upload&lt;Field&gt;On&lt;Model&gt;(fileList)</code>
              </div>
            </div>

            <Docs.SubSubTitle>
              {l.trans({ en: "What a store action does, and doesn't", ko: "store action이 하는 일과 하지 않는 일" })}
            </Docs.SubSubTitle>
            <div className={cardGridRecipe({ cols: "mdTwo" }, "my-4")}>
              <div className={panelRecipe({ radius: "lg", padding: "sm" }, "min-w-0")}>
                <div className="font-semibold text-primary">{l.trans({ en: "Does", ko: "하는 일" })}</div>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-foreground/70 text-sm">
                  <li>{l.trans({ en: "Read state and call fetch.", ko: "state를 읽고 fetch를 호출합니다." })}</li>
                  <li>
                    {l.trans({
                      en: "Update the loading, list and form state.",
                      ko: "loading·list·form 상태를 갱신합니다.",
                    })}
                  </li>
                  <li>
                    {l.trans({
                      en: "Write any result into state with this.set({ ... }).",
                      ko: "결과가 있으면 this.set({ ... })으로 state에 씁니다.",
                    })}
                  </li>
                </ul>
              </div>
              <div className={panelRecipe({ radius: "lg", padding: "sm" }, "min-w-0")}>
                <div className="font-semibold text-primary">{l.trans({ en: "Doesn't", ko: "하지 않는 일" })}</div>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-foreground/70 text-sm">
                  <li>
                    {l.trans({
                      en: "Return a value. Every action dispatches through st.do.<action>() and is typed void, so nothing can reach it.",
                      ko: "값을 반환하지 않습니다. 모든 action은 st.do.<action>()으로 디스패치되고 void 타입이라 반환값에 아무도 닿지 못합니다.",
                    })}
                  </li>
                  <li>
                    {l.trans({
                      en: "Catch errors. The framework toasts the Err for you.",
                      ko: "에러를 catch하지 않습니다. Err는 프레임워크가 토스트로 띄웁니다.",
                    })}
                  </li>
                  <li>
                    {l.trans({
                      en: "Repeat business rules. Password, permission, stock and payment rules stay in the service.",
                      ko: "비즈니스 규칙을 반복하지 않습니다. 비밀번호, 권한, 재고, 결제 규칙은 service에 남습니다.",
                    })}
                  </li>
                </ul>
              </div>
            </div>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="i18n" title={l.trans({ en: "One Vocabulary, Many Screens", ko: "하나의 어휘, 여러 화면" })}>
          <Docs.Title>{l.trans({ en: "One Vocabulary, Many Screens", ko: "하나의 어휘, 여러 화면" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: "Every string a user reads goes through the module's dictionary. Field labels, enum values, error messages and the model's own name are declared once as [en, ko] pairs, and components read them by key.",
                ko: "사용자가 읽는 모든 문구는 모듈의 dictionary를 거칩니다. field 라벨, enum 값, 오류 메시지, 모델 이름까지 [en, ko] 쌍으로 한 번 선언하고, component는 key로 읽습니다.",
              })}
            </div>
            <div>
              {l.trans({
                en: "That way the vocabulary lives next to the model, not scattered through whichever components happen to display it.",
                ko: "그래서 어휘는 그것을 표시하게 된 component들에 흩어지지 않고, 모델 바로 옆에 모여 있습니다.",
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="apps/koyo/lib/icecreamOrder/icecreamOrder.dictionary.ts"
              code={`import { modelDictionary } from "akanjs/dictionary"; // [!code collapse:4]

import type { IcecreamOrder, IcecreamOrderInsight, IcecreamOrderStatus } from "./icecreamOrder.constant";

export const dictionary = modelDictionary(["en", "ko"])
  .of((t) => t(["Icecream Order", "아이스크림 주문"]).desc(["One customer order", "고객 주문 한 건"]))
  .model<IcecreamOrder>((t) => ({
    size: t(["Size", "사이즈"]).desc(["Cup size in millilitres", "컵 용량, 밀리리터"]),
    toppings: t(["Toppings", "토핑"]).desc(["Toppings on the order", "주문에 올린 토핑"]),
    status: t(["Status", "상태"]).desc(["Current order status", "현재 주문 상태"]),
  }))
  .insight<IcecreamOrderInsight>((t) => ({}))
  .enum<IcecreamOrderStatus>("icecreamOrderStatus", (t) => ({
    active: t(["Active", "접수됨"]).desc(["Created and waiting", "생성되어 대기 중"]),
    served: t(["Served", "제공됨"]).desc(["Handed to the customer", "고객에게 전달됨"]),
  }))
  .error({
    alreadyServed: ["This order has already been served", "이미 제공된 주문입니다."],
  });`}
            />
            <div>
              {l.trans({
                en: "A component then reads text in one of three ways:",
                ko: "component는 세 가지 방법 중 하나로 문구를 읽습니다:",
              })}
            </div>
            <Docs.IntroTable type={l.trans({ en: "Call", ko: "호출" })} items={textRows} />
            <div>
              {l.trans({
                en: "usePage() resolves all three on both the server and the client, so a fully localized screen never needs a client boundary for its text.",
                ko: "usePage()가 셋 모두를 서버와 클라이언트 양쪽에서 해결하므로, 완전히 다국어인 화면도 문구 때문에 client 경계를 만들 일이 없습니다.",
              })}
            </div>
            <div>
              {l.trans({
                en: (
                  <span>
                    That same vocabulary, the same <code>fetch</code> and the same store back a customer web site, an
                    admin console, a partner portal and a mobile app — those are client surfaces of one app, not
                    separate apps, and which one a screen belongs to is a product decision before it is an
                    infrastructure one.{" "}
                    <Link href="/docs/core/multi-client" className="text-primary">
                      Multi Client
                    </Link>{" "}
                    covers how a basePath gives each surface its own routes, layout and permissions.
                  </span>
                ),
                ko: (
                  <span>
                    같은 어휘, 같은 <code>fetch</code>, 같은 store가 고객 웹사이트와 관리자 콘솔과 파트너 포털과 모바일
                    앱을 함께 받칩니다. 이들은 별개의 앱이 아니라 한 앱의 client 표면이고, 어떤 화면이 어디에 속하는지는
                    인프라 결정이기 전에 제품 결정입니다. basePath가 각 표면에 자기 route와 layout과 permission을 어떻게
                    주는지는{" "}
                    <Link href="/docs/core/multi-client" className="text-primary">
                      다중 클라이언트
                    </Link>{" "}
                    문서에서 다룹니다.
                  </span>
                ),
              })}
            </div>
          </Docs.Description>
        </Scroll.Slide>
        <DocsToc />
      </Scroll>
    );
  });
