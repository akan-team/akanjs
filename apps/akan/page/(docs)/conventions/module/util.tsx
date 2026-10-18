import { usePage } from "@apps/akan/client";
import {
  Code,
  cardGridRecipe,
  Divider,
  Docs,
  DocsToc,
  type IntroItem,
  type LinkGridItem,
  type MatrixGroup,
  panelRecipe,
} from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { page } from "akanjs/client";

export default page()
  .config({ transition: "fade" })
  .head(({ lang }) => {
    const title = lang === "ko" ? "도메인: Model.Util.tsx | Akan.js" : "Domain: Model.Util.tsx | Akan.js";
    const description =
      lang === "ko"
        ? "모듈이 내놓는 작은 클라이언트 컴포넌트 — 삭제, 툴박스, 다이얼로그, 필터."
        : "The small client components a module exposes: remove, toolbox, dialog, filter.";
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

    const overviewCards = [
      {
        title: l.trans({ en: "Always a client file", ko: "항상 클라이언트 파일" }),
        code: '"use client";',
        desc: l.trans({
          en: '"use client" goes on line 1 by file role. A Util exists to handle a click, a hook or the store.',
          ko: '"use client"는 파일 역할에 따라 항상 첫 줄에 둡니다. Util은 클릭, hook, store를 다루기 위한 파일입니다.',
        }),
      },
      {
        title: l.trans({ en: "Named after its action", ko: "동작 이름으로 짓습니다" }),
        code: "Project.Util.Remove",
        desc: l.trans({
          en: "Name it after the verb without the model, such as Remove, Resolve or SetOrg. The namespace adds the model.",
          ko: "Remove, Resolve, SetOrg처럼 모델 이름 없이 동작 이름으로 짓습니다. 모델 이름은 네임스페이스가 붙여 줍니다.",
        }),
      },
      {
        title: l.trans({ en: "Takes ids, not models", ko: "모델이 아니라 id를 받습니다" }),
        code: "projectId: string",
        desc: l.trans({
          en: "A model prop would cross the server-client boundary as a class instance. Read the rest from the store.",
          ko: "모델 prop은 클래스 인스턴스째로 서버와 클라이언트의 경계를 넘게 됩니다. 나머지 값은 store에서 읽습니다.",
        }),
      },
      {
        title: l.trans({ en: "Calls, never decides", ko: "호출만 하고 판단하지 않습니다" }),
        code: "st.do.resolveReport(reportId)",
        desc: l.trans({
          en: "It calls a store action or a Model wrapper. Who may act and what changes is decided by the service and document.",
          ko: "store 액션이나 Model 래퍼를 호출할 뿐입니다. 누가 할 수 있고 무엇이 바뀌는지는 service와 document가 정합니다.",
        }),
      },
    ];

    const termRows: IntroItem[] = [
      {
        name: ["Model.Edit", "Model.Remove"],
        desc: l.trans({
          en: "Components from `akanjs/ui` that run a module's generated edit or remove flow for you.",
          ko: "`akanjs/ui`가 제공하는 컴포넌트로, 모듈의 자동 생성된 수정·삭제 흐름을 대신 실행합니다.",
        }),
      },
      {
        name: ["st.do", "st.use"],
        desc: l.trans({
          en: "The client store: `st.do.x()` runs an action, and `st.use.x()` reads a key and re-renders on change.",
          ko: "클라이언트 store입니다. `st.do.x()`는 액션을 실행하고, `st.use.x()`는 키 하나를 읽어 값이 바뀌면 다시 그립니다.",
        }),
      },
      {
        name: "fetch.slice.<name>",
        desc: l.trans({
          en: "Slice metadata that tells a wrapper which model and list to act on. It sends no request.",
          ko: "래퍼가 다룰 모델과 목록을 알려 주는 slice 메타데이터입니다. 요청을 보내지 않습니다.",
        }),
      },
      {
        name: "query args",
        desc: l.trans({
          en: "The arguments a slice list was loaded with, such as the project ids that filter a ticket list.",
          ko: "slice 목록을 불러올 때 쓴 인자입니다. 티켓 목록을 거르는 프로젝트 id 목록이 그 예입니다.",
        }),
      },
    ];

    const fileRuleRows: IntroItem[] = [
      {
        name: "lib/<model>/<Model>.Util.tsx",
        desc: l.trans({
          en: "Sits beside the module's other files. A service module may have one; a scalar module may not.",
          ko: "모듈의 다른 파일 옆에 둡니다. 서비스 모듈에도 둘 수 있고, 스칼라 모듈에는 둘 수 없습니다.",
        }),
      },
      {
        name: '"use client"',
        desc: l.trans({
          en: "Always line 1, above the imports. Template and Zone carry it too; Unit and View never do.",
          ko: "항상 import 위 첫 줄에 둡니다. Template과 Zone도 같고, Unit과 View에는 절대 두지 않습니다.",
        }),
      },
      {
        name: ["Remove", "Toolbox", "SetOrg", "QueryMakerInSelf", "BackButton"],
        desc: l.trans({
          en: "Named exports only. Callers write `Project.Util.Remove`, so no name repeats the model.",
          ko: "named export만 씁니다. 호출하는 쪽이 `Project.Util.Remove`로 쓰므로 이름에 모델명을 반복하지 않습니다.",
        }),
      },
      {
        name: "interface RemoveProps",
        desc: l.trans({
          en: "Declared right above its component and named after it. It takes ids and plain values.",
          ko: "컴포넌트 바로 위에 선언하고 컴포넌트 이름을 따릅니다. id와 단순한 값만 받습니다.",
        }),
      },
      {
        name: "@apps/<app>/client",
        desc: l.trans({
          en: "One flat import for `fetch`, `st` and `usePage`. UI pieces come from `akanjs/ui`.",
          ko: "`fetch`, `st`, `usePage`는 import 한 줄로 가져옵니다. UI 조각은 `akanjs/ui`에서 가져옵니다.",
        }),
      },
    ];

    const wrapperRows: IntroItem[] = [
      {
        name: "Model.Edit",
        desc: l.trans({
          en: "Draws an Edit button that opens its Template child in an edit modal.",
          ko: "Edit 버튼을 그리고, 누르면 children으로 받은 Template을 수정 모달에 엽니다.",
        }),
        example: '<Model.Edit slice={fetch.slice.project} modelId={projectId} renderTitle="name">',
      },
      {
        name: "Model.Remove",
        desc: l.trans({
          en: "Its children become the trigger. It asks for confirmation, then removes the record.",
          ko: "children이 트리거가 됩니다. 확인을 받은 뒤 레코드를 삭제합니다.",
        }),
        example: "<Model.Remove slice={fetch.slice.project} modelId={projectId}>…</Model.Remove>",
      },
      {
        name: "Model.SureToRemove",
        desc: l.trans({
          en: "A stricter remove that shows the record's `name`. `typeNameToRemove` makes the user retype it.",
          ko: "레코드의 `name`을 보여 주는 더 엄격한 삭제입니다. `typeNameToRemove`를 주면 이름을 다시 입력해야 합니다.",
        }),
        example: "<Model.SureToRemove slice={fetch.slice.project} modelId={projectId} name={name} />",
      },
    ];

    const routeApiRows: IntroItem[] = [
      {
        name: "st.use.queryArgsOf<Model><Suffix>()",
        desc: l.trans({
          en: "The args the slice list was last loaded with, as an array in the slice's arg order.",
          ko: "slice 목록을 마지막으로 불러온 인자입니다. slice 인자 순서대로 담긴 배열입니다.",
        }),
      },
      {
        name: "st.do.setQueryArgsOf<Model><Suffix>(...args)",
        desc: l.trans({
          en: "Takes one value per slice arg, then reloads the list and insight from page 1.",
          ko: "slice 인자마다 값을 하나씩 받고, 목록과 insight를 1페이지부터 다시 불러옵니다.",
        }),
      },
      {
        name: "st.use.path()",
        desc: l.trans({
          en: "The current path without the locale prefix, such as `/board/abc/post/1`.",
          ko: "언어 접두사를 뺀 현재 경로입니다. `/board/abc/post/1` 같은 값입니다.",
        }),
      },
      {
        name: "Link.Back",
        desc: l.trans({
          en: "A wrapper from `akanjs/ui` whose click calls `router.back()`.",
          ko: "`akanjs/ui`의 래퍼로, 누르면 `router.back()`을 호출합니다.",
        }),
      },
    ];

    const ruleColumns = [
      { key: "util", label: "Util" },
      { key: "display", label: l.trans({ en: "View", ko: "화면" }), caption: "Unit · View" },
      { key: "form", label: l.trans({ en: "Form", ko: "폼" }), caption: "Template" },
      { key: "logic", label: l.trans({ en: "Logic", ko: "로직" }), caption: "store · service" },
    ];
    const inUtil = { util: true, display: false, form: false, logic: false };
    const inLogic = { util: false, display: false, form: false, logic: true };

    const ruleGroups: MatrixGroup[] = [
      {
        label: l.trans({ en: "The Util's job", ko: "Util의 일" }),
        rows: [
          {
            name: "onClick → st.do.*",
            desc: l.trans({
              en: "A button that runs one store action.",
              ko: "store 액션 하나를 실행하는 버튼입니다.",
            }),
            marks: inUtil,
          },
          {
            name: "Model.Edit · Model.Remove",
            desc: l.trans({
              en: "Wrappers that open the generated edit and remove flows.",
              ko: "자동 생성된 수정·삭제 흐름을 여는 래퍼입니다.",
            }),
            marks: inUtil,
          },
          {
            name: "Dialog · Modal",
            desc: l.trans({
              en: "A dialog trigger, and the draft value only that dialog uses.",
              ko: "다이얼로그 트리거와, 그 다이얼로그만 쓰는 임시 값입니다.",
            }),
            marks: inUtil,
          },
          {
            name: (
              <>
                setQueryArgs
                <wbr />
                Of…
              </>
            ),
            desc: l.trans({
              en: "Filter controls that change a slice list's query args.",
              ko: "slice 목록의 query args를 바꾸는 필터 컨트롤입니다.",
            }),
            marks: inUtil,
          },
          {
            name: "st.use.path · Link.Back",
            desc: l.trans({
              en: "Helpers that read the route to decide what to show.",
              ko: "현재 경로를 읽어 무엇을 보여 줄지 정하는 도우미입니다.",
            }),
            marks: inUtil,
          },
        ],
      },
      {
        label: l.trans({ en: "Another file's job", ko: "다른 파일의 일" }),
        rows: [
          {
            name: <span className="font-sans">{l.trans({ en: "fields and markup", ko: "필드와 마크업" })}</span>,
            desc: l.trans({
              en: "A Unit draws one row, and a View draws one record in full.",
              ko: "행 하나는 Unit이, 레코드 하나의 상세는 View가 그립니다.",
            }),
            marks: { util: false, display: true, form: false, logic: false },
          },
          {
            name: "Field.* · <model>Form",
            desc: l.trans({
              en: "A form whose fields are bound to the store.",
              ko: "필드가 store에 묶인 폼입니다.",
            }),
            marks: { util: false, display: false, form: true, logic: false },
          },
          {
            name: (
              <span className="font-sans">{l.trans({ en: "who may act, what changes", ko: "권한과 변경 내용" })}</span>
            ),
            desc: l.trans({
              en: "Business rules run on the server, in the service and document.",
              ko: "업무 규칙은 서버의 service와 document에서 실행됩니다.",
            }),
            marks: inLogic,
          },
          {
            name: (
              <span className="font-sans">
                {l.trans({ en: "multi-step async flow", ko: "여러 단계의 비동기 흐름" })}
              </span>
            ),
            desc: l.trans({
              en: "A store action that the Util calls in one line.",
              ko: "Util이 한 줄로 호출하는 store 액션입니다.",
            }),
            marks: inLogic,
          },
        ],
      },
    ];

    const mistakeColumns = [
      { key: "mistake", label: l.trans({ en: "Mistake", ko: "실수" }), code: true },
      { key: "fix", label: l.trans({ en: "Instead", ko: "이렇게 고칩니다" }) },
    ];
    const mistakeRows = [
      {
        mistake: "{isOwner && <Remove />}",
        fix: l.trans({
          en: "Write `isOwner ? <Remove /> : null`, the house form for conditional render.",
          ko: "조건부 렌더링은 `isOwner ? <Remove /> : null` 형태로 씁니다.",
        }),
      },
      {
        mistake: "onChange={(v) => st.do.setNameOnX(v)}",
        fix: l.trans({
          en: "Pass the setter by reference; the arrow hides the field from the agent and fails lint.",
          ko: "setter를 그대로 넘깁니다. 화살표 함수로 감싸면 에이전트가 필드를 못 보고 lint도 실패합니다.",
        }),
      },
      {
        mistake: "useEffect(() => { … }, [])",
        fix: l.trans({
          en: "Load data in the page and pass it down; `akan quality ssr` flags a mount-time load.",
          ko: "데이터는 page에서 불러와 내려 줍니다. 마운트 시점 로드는 `akan quality ssr`이 경고합니다.",
        }),
      },
      {
        mistake: "fetch.initTicketInSelf()",
        fix: l.trans({
          en: "Lint rejects `fetch.init*` in a client file. Reload with `st.do.initTicketInSelf()`.",
          ko: "클라이언트 파일의 `fetch.init*`는 lint가 막습니다. `st.do.initTicketInSelf()`로 다시 불러옵니다.",
        }),
      },
      {
        mistake: "<div>…markup only…</div>",
        fix: l.trans({
          en: "A Util with no click, hook or store is server work. Move it to a Unit or View.",
          ko: "클릭, hook, store가 없는 Util은 서버가 할 일입니다. Unit이나 View로 옮깁니다.",
        }),
      },
    ];

    const relatedLinks: LinkGridItem[] = [
      {
        href: "/conventions/module/unit#actions-inside-units",
        title: "Model.Unit.tsx",
        desc: l.trans({
          en: "How a Unit places a Util button beside its link.",
          ko: "Unit이 링크 옆에 Util 버튼을 두는 방법입니다.",
        }),
      },
      {
        href: "/conventions/module/store#slice-features",
        title: "Model.store.ts",
        desc: l.trans({
          en: "Every generated slice action, including setQueryArgsOf.",
          ko: "setQueryArgsOf를 포함한 slice 자동 생성 액션 전체입니다.",
        }),
      },
      {
        href: "/references/ui/core#Model",
        title: "Model",
        desc: l.trans({
          en: "Every prop of Model.Edit, Model.Remove and the other wrappers.",
          ko: "Model.Edit, Model.Remove 등 래퍼의 모든 prop입니다.",
        }),
      },
      {
        href: "/docs/arch/agentic#agent-surface",
        title: l.trans({ en: "In-Page Agent", ko: "인페이지 에이전트" }),
        desc: l.trans({
          en: "How st.tool publishes a button to the agent.",
          ko: "st.tool로 버튼을 에이전트에게 공개하는 방법입니다.",
        }),
      },
    ];

    return (
      <Scroll>
        <Scroll.Slide id="util-overview" title="Model.Util.tsx">
          <Docs.Title>Model.Util.tsx</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: "A Util file holds a module's small client components, each doing one action: a remove button, a toolbox, a dialog trigger, a filter control or a back link.",
                ko: "Util 파일에는 모듈의 작은 클라이언트 컴포넌트를 둡니다. 삭제 버튼, 툴박스, 다이얼로그 트리거, 필터 컨트롤, 뒤로 가기 링크처럼 각자 동작 하나를 맡습니다.",
              })}
            </div>
            <div>
              {l.trans({
                en: "Clicks and store actions gather here, so Unit and View stay server-rendered and Page, Zone and Template keep to their own jobs.",
                ko: "클릭과 store 액션을 여기에 모으면 Unit과 View는 서버 렌더링으로 남고, Page, Zone, Template도 각자 역할에 집중합니다.",
              })}
            </div>
            <div className={cardGridRecipe({ cols: "mdTwo" }, "my-4")}>
              {overviewCards.map((card) => (
                <div key={card.code} className={panelRecipe({ radius: "lg", padding: "sm" }, "min-w-0")}>
                  <div className="font-semibold text-primary">{card.title}</div>
                  <code className={chip}>{card.code}</code>
                  <div className="mt-2 text-foreground/70 text-sm">{card.desc}</div>
                </div>
              ))}
            </div>
            <Docs.SubSubTitle>
              {l.trans({ en: "Words used on this page", ko: "이 페이지에서 쓰는 말" })}
            </Docs.SubSubTitle>
            <Docs.IntroTable type={l.trans({ en: "Term", ko: "용어" })} items={termRows} />
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="file-convention" title={l.trans({ en: "File Convention", ko: "파일 규칙" })}>
          <Docs.Title>{l.trans({ en: "File Convention", ko: "파일 규칙" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: (
                  <span>
                    Every Util file has the same shape. <code>akan create-module product</code> writes the first one for
                    you, with a single <code>Remove</code> export:
                  </span>
                ),
                ko: (
                  <span>
                    Util 파일은 모두 같은 모양입니다. <code>akan create-module product</code>를 실행하면{" "}
                    <code>Remove</code> export 하나가 든 첫 파일을 만들어 줍니다:
                  </span>
                ),
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="apps/koyo/lib/product/Product.Util.tsx"
              code={`"use client";
import { fetch, usePage } from "@apps/koyo/client";
import { Model } from "akanjs/ui";
import { BiTrash } from "react-icons/bi";

interface RemoveProps {
  productId: string;
}
export const Remove = ({ productId }: RemoveProps) => {
  const { l } = usePage();
  return (
    <Model.Remove modelId={productId} slice={fetch.slice.product}>
      <BiTrash /> {l("base.remove")}
    </Model.Remove>
  );
};`}
            />
            <ul className={bulletList}>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        <code>fetch.slice.product</code> sends no request.
                      </strong>{" "}
                      It is slice metadata that tells <code>Model.Remove</code> which model to remove.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        <code>fetch.slice.product</code>는 요청을 보내지 않습니다.
                      </strong>{" "}
                      <code>Model.Remove</code>에게 어떤 모델을 지울지 알려 주는 slice 메타데이터입니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        <code>l("base.remove")</code> is a shared label.
                      </strong>{" "}
                      Words every module shares live under <code>base.*</code>; a module's own words live under{" "}
                      <code>{"<model>.*"}</code>.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        <code>l("base.remove")</code>는 공용 문구입니다.
                      </strong>{" "}
                      모든 모듈이 함께 쓰는 문구는 <code>base.*</code>에, 모듈 고유의 문구는 <code>{"<model>.*"}</code>
                      에 있습니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        Only <code>react*</code> packages import directly.
                      </strong>{" "}
                      <code>react-icons</code> is fine; any other third-party package reaches a Util through a lib
                      re-export.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        직접 import할 수 있는 외부 패키지는 이름이 <code>react</code>로 시작하는 것뿐입니다.
                      </strong>{" "}
                      <code>react-icons</code>는 괜찮고, 다른 외부 패키지는 lib에서 re-export한 것을 가져옵니다.
                    </span>
                  ),
                })}
              </li>
            </ul>
            <Docs.SubSubTitle>{l.trans({ en: "The rules in the file", ko: "파일에 담긴 규칙" })}</Docs.SubSubTitle>
            <Docs.IntroTable type={l.trans({ en: "Part", ko: "부분" })} items={fileRuleRows} />
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide
          id="model-wrapper-actions"
          title={l.trans({ en: "Model Wrapper Actions", ko: "Model 래퍼로 만드는 동작" })}
        >
          <Docs.Title>{l.trans({ en: "Model Wrapper Actions", ko: "Model 래퍼로 만드는 동작" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: "Most Utils are thin controls around the Model wrappers. A toolbox gathers several of them, so the Unit or Zone that shows it stays small.",
                ko: "Util 대부분은 Model 래퍼를 감싼 얇은 컨트롤입니다. 툴박스는 여러 래퍼를 한데 모아, 그것을 보여 주는 Unit이나 Zone을 작게 유지합니다.",
              })}
            </div>
            <Docs.IntroTable type={l.trans({ en: "Wrapper", ko: "래퍼" })} items={wrapperRows} />
            <div>
              {l.trans({
                en: "A project toolbox in a dropdown menu. Only the owner sees the remove item:",
                ko: "드롭다운 메뉴 안의 프로젝트 툴박스입니다. 삭제 항목은 소유자에게만 보입니다:",
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="apps/koyo/lib/project/Project.Util.tsx"
              code={`interface ToolboxProps {
  projectId: string;
  name: string;
  isOwner: boolean;
}
export const Toolbox = ({ projectId, name, isOwner }: ToolboxProps) => {
  const { l } = usePage();
  const archive = st
    .tool("archiveProject")
    .desc("Archive one project.")
    .arg("projectId", ID)
    .exec((id) => st.do.archiveProject(id));
  return (
    <Dropdown
      value={<AiOutlineMore />}
      content={
        <>
          <li>
            <Model.Edit renderTitle="name" slice={fetch.slice.projectInOrg} modelId={projectId}>
              <Project.Template.General />
            </Model.Edit>
          </li>
          <li>
            <button type="button" onClick={() => void archive(projectId)}>{l("project.archiveProject")}</button>
          </li>
          {isOwner ? (
            <li>
              <Model.SureToRemove slice={fetch.slice.project} modelId={projectId} name={name} />
            </li>
          ) : null}
        </>
      }
    />
  );
};`}
            />
            <ul className={bulletList}>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>The wrappers call the generated actions.</strong> <code>Model.Edit</code> runs{" "}
                      <code>st.do.editProject</code> and <code>Model.SureToRemove</code> runs{" "}
                      <code>st.do.removeProject</code>, so the Util writes no handler for them.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>래퍼가 자동 생성된 액션을 호출합니다.</strong> <code>Model.Edit</code>는{" "}
                      <code>st.do.editProject</code>를, <code>Model.SureToRemove</code>는{" "}
                      <code>st.do.removeProject</code>를 실행하므로 Util이 핸들러를 따로 쓰지 않습니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        A custom action declares its own <code>st.tool</code>.
                      </strong>{" "}
                      The archive button calls the tool's callable with the id, so a click and the agent run one
                      handler.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        직접 만든 동작은 <code>st.tool</code>을 스스로 선언합니다.
                      </strong>{" "}
                      보관 버튼은 id를 넘겨 그 툴의 callable을 호출하므로, 사용자의 클릭과 에이전트가 같은 핸들러를
                      실행합니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        Owner-only items use <code>cond ? … : null</code>.
                      </strong>{" "}
                      The <code>isOwner</code> prop makes the condition visible to whoever renders the toolbox.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        소유자 전용 항목은 <code>cond ? … : null</code>로 씁니다.
                      </strong>{" "}
                      <code>isOwner</code> prop 덕분에 툴박스를 그리는 쪽에서 조건이 보입니다.
                    </span>
                  ),
                })}
              </li>
            </ul>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide
          id="dialog-modal-actions"
          title={l.trans({ en: "Dialog And Modal Actions", ko: "다이얼로그와 모달 동작" })}
        >
          <Docs.Title>{l.trans({ en: "Dialog And Modal Actions", ko: "다이얼로그와 모달 동작" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: "When an action needs a confirmation or a small input first, its dialog lives in the same Util. First decide where the open state lives:",
                ko: "동작 전에 확인이나 작은 입력이 필요하면, 그 다이얼로그도 같은 Util에 둡니다. 먼저 열림 상태를 어디에 둘지 정합니다:",
              })}
            </div>
            <div className={cardGridRecipe({ cols: "mdTwo" }, "my-4")}>
              <div className={panelRecipe({ radius: "lg", padding: "sm" }, "min-w-0")}>
                <div className="font-semibold text-primary">
                  {l.trans({ en: "Inside the dialog", ko: "다이얼로그 안에" })}
                </div>
                <code className={chip}>{"<Dialog> + useState"}</code>
                <div className="mt-2 text-foreground/70 text-sm">
                  {l.trans({
                    en: (
                      <span>
                        <code>Dialog</code> opens and closes itself. <code>useState</code> holds a draft value that only
                        this dialog uses.
                      </span>
                    ),
                    ko: (
                      <span>
                        <code>Dialog</code>가 스스로 열고 닫습니다. 이 다이얼로그만 쓰는 임시 값은 <code>useState</code>
                        에 둡니다.
                      </span>
                    ),
                  })}
                </div>
              </div>
              <div className={panelRecipe({ radius: "lg", padding: "sm" }, "min-w-0")}>
                <div className="font-semibold text-primary">{l.trans({ en: "In the store", ko: "store에" })}</div>
                <code className={chip}>st.use.reportModal()</code>
                <div className="mt-2 text-foreground/70 text-sm">
                  {l.trans({
                    en: (
                      <span>
                        <code>{"edit<Model>(id, { modal })"}</code> writes the <code>{"<model>Modal"}</code> key, so any
                        component or action can open or close it.
                      </span>
                    ),
                    ko: (
                      <span>
                        <code>{"edit<Model>(id, { modal })"}</code>가 <code>{"<model>Modal"}</code> 키에 값을 쓰므로,
                        어느 컴포넌트나 액션에서든 열고 닫을 수 있습니다.
                      </span>
                    ),
                  })}
                </div>
              </div>
            </div>

            <Docs.SubSubTitle>{l.trans({ en: "Local state: SetOrg", ko: "로컬 상태: SetOrg" })}</Docs.SubSubTitle>
            <div>
              {l.trans({
                en: "SetOrg picks an organization in a dialog, then saves it to the business license:",
                ko: "SetOrg는 다이얼로그에서 조직을 고른 뒤 사업자 등록증에 저장합니다:",
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="apps/koyo/lib/bizLicense/BizLicense.Util.tsx"
              code={`interface SetOrgProps {
  bizLicenseId: string;
}
export const SetOrg = ({ bizLicenseId }: SetOrgProps) => {
  const { l } = usePage();
  const [orgId, setOrgId] = useState<string | null>(null);
  return (
    <Dialog>
      <Dialog.Trigger>
        <button type="button" className={buttonRecipe()}>{l("bizLicense.setOrg")}</button>
      </Dialog.Trigger>
      <Dialog.Modal>
        <Field.ParentId value={orgId} onChange={setOrgId} slice={fetch.slice.orgInSelf} />
        <Dialog.Action>
          <button
            type="button"
            className={buttonRecipe({ variant: "primary" })}
            disabled={!orgId}
            onClick={() => {
              if (orgId) void st.do.setOrgInBizLicense(bizLicenseId, orgId);
            }}
          >
            {l.trans({ en: "Save", ko: "저장" })}
          </button>
        </Dialog.Action>
      </Dialog.Modal>
    </Dialog>
  );
};`}
            />
            <ul className={bulletList}>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        <code>useState</code> is fine here.
                      </strong>{" "}
                      The picked id is a draft that belongs to this dialog alone. Server data never goes in{" "}
                      <code>useState</code>.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        여기서는 <code>useState</code>를 써도 됩니다.
                      </strong>{" "}
                      고른 id는 이 다이얼로그에만 속한 임시 값입니다. 서버 데이터는 절대 <code>useState</code>에 두지
                      않습니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        <code>Field.ParentId</code> picks a related record.
                      </strong>{" "}
                      It loads its options from <code>fetch.slice.orgInSelf</code> and hands the chosen id to{" "}
                      <code>onChange</code>.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        <code>Field.ParentId</code>는 연결할 레코드를 고릅니다.
                      </strong>{" "}
                      <code>fetch.slice.orgInSelf</code>에서 선택지를 불러오고, 고른 id를 <code>onChange</code>에
                      넘깁니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        <code>Dialog.Action</code> fills the footer.
                      </strong>{" "}
                      The save button stays disabled until an organization is picked.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        <code>Dialog.Action</code>은 모달 하단을 채웁니다.
                      </strong>{" "}
                      조직을 고르기 전까지 저장 버튼은 비활성 상태입니다.
                    </span>
                  ),
                })}
              </li>
            </ul>

            <Docs.SubSubTitle>{l.trans({ en: "Store state: Resolve", ko: "store 상태: Resolve" })}</Docs.SubSubTitle>
            <div>
              {l.trans({
                en: "Resolve keeps the modal key in the store, so a store action opens the modal:",
                ko: "Resolve는 모달 키를 store에 두므로, store 액션이 모달을 엽니다:",
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="apps/koyo/lib/report/Report.Util.tsx"
              code={`interface ResolveProps {
  reportId: string;
}
export const Resolve = ({ reportId }: ResolveProps) => {
  const { l } = usePage();
  const reportModal = st.use.reportModal();
  return (
    <>
      <button type="button" onClick={() => void st.do.editReport(reportId, { modal: \`resolve-\${reportId}\` })}>
        {l("report.resolveReport")}
      </button>
      <Modal open={reportModal === \`resolve-\${reportId}\`} onCancel={st.do.resetReport}>
        <button type="button" onClick={() => void st.do.resolveReport(reportId)}>
          {l.trans({ en: "Confirm", ko: "확인" })}
        </button>
      </Modal>
    </>
  );
};`}
            />
            <ul className={bulletList}>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        <code>editReport(id, {"{ modal }"})</code> loads the record and names the modal.
                      </strong>{" "}
                      It fills <code>reportForm</code> and sets <code>reportModal</code> to the name you pass.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        <code>editReport(id, {"{ modal }"})</code>는 레코드를 불러오고 모달 이름을 정합니다.
                      </strong>{" "}
                      <code>reportForm</code>을 채우고, 넘긴 이름을 <code>reportModal</code>에 씁니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>The key carries the id.</strong> <code>{`resolve-\${reportId}`}</code> keeps each row's
                      modal apart when a list renders many Resolve buttons.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>키에 id를 넣습니다.</strong> 목록이 Resolve 버튼을 여러 개 그려도{" "}
                      <code>{`resolve-\${reportId}`}</code> 덕분에 행마다 모달이 따로 열립니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        <code>resetReport</code> closes it.
                      </strong>{" "}
                      It clears <code>report</code>, <code>reportForm</code> and <code>reportModal</code>; hand it to{" "}
                      <code>onCancel</code> as is.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        <code>resetReport</code>가 모달을 닫습니다.
                      </strong>{" "}
                      <code>report</code>, <code>reportForm</code>, <code>reportModal</code>을 비우며,{" "}
                      <code>onCancel</code>에 그대로 넘기면 됩니다.
                    </span>
                  ),
                })}
              </li>
            </ul>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide
          id="query-context-utils"
          title={l.trans({ en: "Query And Route Helpers", ko: "쿼리와 경로 도우미" })}
        >
          <Docs.Title>{l.trans({ en: "Query And Route Helpers", ko: "쿼리와 경로 도우미" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: "Filter controls and route-aware helpers are Utils too. They read store or route state, then call a generated action or a router helper.",
                ko: "필터 컨트롤과 현재 경로에 따라 달라지는 도우미도 Util입니다. store나 경로를 읽고, 자동 생성된 액션이나 router 도우미를 호출합니다.",
              })}
            </div>
            <Docs.IntroTable type={l.trans({ en: "What they use", ko: "쓰는 API" })} items={routeApiRows} />

            <Docs.SubSubTitle>{l.trans({ en: "Changing a filter", ko: "필터 바꾸기" })}</Docs.SubSubTitle>
            <div>
              {l.trans({
                en: "QueryMakerInSelf keeps the project filter of the ticketInSelf list and clears its assignee filter:",
                ko: "QueryMakerInSelf는 ticketInSelf 목록의 프로젝트 필터는 그대로 두고 담당자 필터만 비웁니다:",
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="apps/koyo/lib/ticket/Ticket.Util.tsx"
              code={`export const QueryMakerInSelf = () => {
  const { l } = usePage();
  const [projectIds] = st.use.queryArgsOfTicketInSelf();
  return (
    <button type="button" onClick={() => void st.do.setQueryArgsOfTicketInSelf(projectIds, [])}>
      {l.trans({ en: "All Assignees", ko: "모든 담당자" })}
    </button>
  );
};`}
            />
            <ul className={bulletList}>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Spread the args, one per slice arg.</strong> Wrapping them in one array would put the
                      whole array into the first arg.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>인자는 slice 인자마다 하나씩 펼쳐 넘깁니다.</strong> 배열 하나로 감싸면 그 배열 전체가 첫
                      번째 인자로 들어갑니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>An updater works too.</strong>{" "}
                      <code>{"setQueryArgsOfTicketInSelf((projectIds, userIds) => [projectIds, []])"}</code> derives the
                      next args from the current ones.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>갱신 함수도 넘길 수 있습니다.</strong>{" "}
                      <code>{"setQueryArgsOfTicketInSelf((projectIds, userIds) => [projectIds, []])"}</code>는 현재
                      인자로 다음 인자를 만듭니다.
                    </span>
                  ),
                })}
              </li>
            </ul>

            <Docs.SubSubTitle>{l.trans({ en: "Reading the route", ko: "경로 읽기" })}</Docs.SubSubTitle>
            <div>
              {l.trans({
                en: "BackButton shows a back link only on pages under one board:",
                ko: "BackButton은 특정 게시판 아래의 페이지에서만 뒤로 가기 링크를 보여 줍니다:",
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="apps/koyo/lib/board/Board.Util.tsx"
              code={`interface BackButtonProps {
  id: string;
}
export const BackButton = ({ id }: BackButtonProps) => {
  const { l } = usePage();
  const path = st.use.path({ agent: false });
  if (!path.startsWith(\`/board/\${id}/\`)) return null;
  return <Link.Back>{l.trans({ en: "Back", ko: "뒤로" })}</Link.Back>;
};`}
            />
            <ul className={bulletList}>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        <code>{"{ agent: false }"}</code> keeps the key off the agent's surface.
                      </strong>{" "}
                      The path only decides what to draw, so the in-page agent has no reason to read it.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        <code>{"{ agent: false }"}</code>는 이 키를 에이전트에게 공개하지 않습니다.
                      </strong>{" "}
                      경로는 무엇을 그릴지 정하는 데만 쓰이므로 인페이지 에이전트가 읽을 이유가 없습니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        An early <code>return null</code> is a guard clause.
                      </strong>{" "}
                      Use it only to bail out like this; elsewhere write <code>cond ? {"<X />"} : null</code>.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        앞쪽의 <code>return null</code>은 가드 절입니다.
                      </strong>{" "}
                      이렇게 일찍 빠져나올 때만 쓰고, 그 밖에서는 <code>cond ? {"<X />"} : null</code>로 씁니다.
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
                en: "What belongs in a Util, and which file takes everything else:",
                ko: "Util에 두는 것과, 나머지를 맡는 파일을 한눈에 정리했습니다:",
              })}
            </div>
            <Docs.Matrix
              type={l.trans({ en: "The work", ko: "할 일" })}
              columns={ruleColumns}
              groups={ruleGroups}
              markLabel={l.trans({ en: "Belongs here", ko: "여기에 둡니다" })}
              emptyLabel={l.trans({ en: "Not here", ko: "여기에 두지 않습니다" })}
            />

            <Docs.SubSubTitle>{l.trans({ en: "Writing a Util", ko: "Util 작성 규칙" })}</Docs.SubSubTitle>
            <ul className={bulletList}>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        Labels go through <code>l</code>.
                      </strong>{" "}
                      Take it from <code>usePage()</code> and write <code>l("model.key")</code> or{" "}
                      <code>{"l.trans({ en, ko })"}</code>, never hard-coded action text.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        문구는 <code>l</code>을 거칩니다.
                      </strong>{" "}
                      <code>usePage()</code>에서 꺼내 <code>l("model.key")</code>나 <code>{"l.trans({ en, ko })"}</code>
                      로 쓰고, 동작 문구를 하드코딩하지 않습니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Call, do not decide.</strong> Call <code>st.do</code> actions or Model wrappers, and keep
                      business rules in the service and document.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>호출만 하고 판단하지 않습니다.</strong> <code>st.do</code> 액션이나 Model 래퍼를 호출하고,
                      업무 규칙은 service와 document에 둡니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        <code>useState</code> is for UI-only values.
                      </strong>{" "}
                      An open dialog, a selected option or a draft input qualifies; server data does not.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        <code>useState</code>는 UI에만 필요한 값에 씁니다.
                      </strong>{" "}
                      열린 다이얼로그, 고른 옵션, 입력 중인 값은 괜찮고 서버 데이터는 안 됩니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Keep props explicit.</strong> The caller should see which id, slice, role or name the
                      action depends on.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>props는 명시적으로 둡니다.</strong> 동작이 어떤 id, slice, 역할, 이름에 기대는지 호출하는
                      쪽에서 보여야 합니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Split big toolboxes.</strong> Break a large toolbox or workflow modal into named exports
                      instead of hiding too much in one component.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>큰 툴박스는 나눕니다.</strong> 큰 툴박스나 작업 흐름 모달은 한 컴포넌트에 몰아넣지 말고
                      named export로 나눕니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Publish custom buttons to the agent.</strong> Model wrappers declare their own agent
                      tools; a plain button publishes nothing until you declare <code>st.tool(…)</code> beside it and
                      hand its callable to <code>onClick</code>.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>직접 만든 버튼은 에이전트에게 공개합니다.</strong> Model 래퍼는 에이전트 툴을 스스로
                      선언하지만, 일반 버튼은 옆에 <code>st.tool(…)</code>을 선언하고 그 callable을 <code>onClick</code>
                      에 넘기기 전까지 아무것도 공개하지 않습니다.
                    </span>
                  ),
                })}
              </li>
            </ul>

            <Docs.SubSubTitle>{l.trans({ en: "Common mistakes", ko: "흔한 실수" })}</Docs.SubSubTitle>
            <Docs.Table columns={mistakeColumns} rows={mistakeRows} stacked />
            <Docs.Alert type="error">
              {l.trans({
                en: (
                  <span>
                    <strong>
                      A Util prop cannot be a <code>cnst</code> model.
                    </strong>{" "}
                    A prop such as <code>report: cnst.Report</code> fails <code>akan lint</code>. Take{" "}
                    <code>reportId: string</code> and read the model from the store; an enum value such as{" "}
                    <code>{'cnst.ProjectRole["value"]'}</code> is still fine.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      Util의 prop은 <code>cnst</code> 모델일 수 없습니다.
                    </strong>{" "}
                    <code>report: cnst.Report</code> 같은 prop은 <code>akan lint</code>에서 실패합니다.{" "}
                    <code>reportId: string</code>을 받고 모델은 store에서 읽습니다.{" "}
                    <code>{'cnst.ProjectRole["value"]'}</code> 같은 enum 값은 괜찮습니다.
                  </span>
                ),
              })}
            </Docs.Alert>
            <Docs.SubSubTitle>{l.trans({ en: "Related pages", ko: "함께 볼 페이지" })}</Docs.SubSubTitle>
            <Docs.LinkGrid items={relatedLinks} />
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <DocsToc />
      </Scroll>
    );
  });
