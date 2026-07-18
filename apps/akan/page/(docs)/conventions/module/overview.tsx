import { usePage } from "@apps/akan/client";
import { Code, Docs } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { Link } from "akanjs/ui";

export default function Page() {
  const { l } = usePage();

  const coreFiles = [
    {
      name: "model.abstract.md",
      route: "/conventions/module/abstract",
      role: l.trans({
        en: "Describes business intent, domain rules, workflows, data meaning, related modules, and agent notes that should be read before implementation changes.",
        ko: "구현 변경 전에 읽어야 하는 business intent, domain rule, workflow, data meaning, related module, agent note를 설명합니다.",
      }),
    },
    {
      name: "model.constant.ts",
      route: "/conventions/module/constant",
      role: l.trans({
        en: "Defines the business data shape: fields, enums, model layers, helpers, hidden/secret fields, and resolved fields.",
        ko: "field, enum, model layer, helper, hidden/secret field, resolved field 등 business data shape을 정의합니다.",
      }),
    },
    {
      name: "model.dictionary.ts",
      route: "/conventions/module/dictionary",
      role: l.trans({
        en: "Defines user-facing language for fields, insights, queries, slices, endpoints, errors, and UI text.",
        ko: "field, insight, query, slice, endpoint, error, UI text 등 사용자에게 보이는 언어를 정의합니다.",
      }),
    },
    {
      name: "model.document.ts",
      route: "/conventions/module/document",
      role: l.trans({
        en: "Defines persistence behavior: filters, document methods, model-level helpers, indexes, and schema hooks.",
        ko: "filter, document method, model-level helper, index, schema hook 등 persistence 동작을 정의합니다.",
      }),
    },
    {
      name: "model.service.ts",
      route: "/conventions/module/service",
      role: l.trans({
        en: "Owns business workflows and coordinates generated document methods, injected services, and database operations.",
        ko: "business workflow를 담당하고 generated document method, injected service, database operation을 조율합니다.",
      }),
    },
    {
      name: "model.signal.ts",
      route: "/conventions/module/signal",
      role: l.trans({
        en: "Exposes APIs, slices, realtime messages, pubsub channels, internal tasks, guards, and resolved field handlers.",
        ko: "API, slice, realtime message, pubsub channel, internal task, guard, resolved field handler를 노출합니다.",
      }),
    },
    {
      name: "model.store.ts",
      route: "/conventions/module/store",
      role: l.trans({
        en: "Coordinates client state, form state, list state, generated fetch calls, toast messages, and UI-facing actions.",
        ko: "client state, form state, list state, generated fetch call, toast message, UI-facing action을 조율합니다.",
      }),
    },
  ];

  const uiFiles = [
    {
      name: "Model.Template.tsx",
      route: "/conventions/module/template",
      role: l.trans({
        en: "Renders form pieces and interaction fragments bound to store form state and generated setters.",
        ko: "store form state와 generated setter에 연결된 form 조각과 interaction fragment를 렌더링합니다.",
      }),
    },
    {
      name: "Model.Unit.tsx",
      route: "/conventions/module/unit",
      role: l.trans({
        en: "Renders reusable light-model display pieces such as cards, rows, avatars, columns, and compact summaries.",
        ko: "card, row, avatar, column, compact summary 같은 light-model display 조각을 렌더링합니다.",
      }),
    },
    {
      name: "Model.View.tsx",
      route: "/conventions/module/view",
      role: l.trans({
        en: "Renders full-model detail UI for detail pages, view modals, and sections that need complete model data.",
        ko: "detail page, view modal, complete model data가 필요한 section의 full-model detail UI를 렌더링합니다.",
      }),
    },
    {
      name: "Model.Util.tsx",
      route: "/conventions/module/util",
      role: l.trans({
        en: "Packages small client helper UI such as action buttons, toolboxes, dialogs, query panels, and navigation helpers.",
        ko: "action button, toolbox, dialog, query panel, navigation helper 같은 작은 client helper UI를 묶습니다.",
      }),
    },
    {
      name: "Model.Zone.tsx",
      route: "/conventions/module/zone",
      role: l.trans({
        en: "Composes page sections with Load.Units, Load.View, Unit/View display, Util controls, and section-level UI state.",
        ko: "Load.Units, Load.View, Unit/View display, Util control, section-level UI state로 page section을 조립합니다.",
      }),
    },
  ];

  const flowSteps = [
    {
      title: "abstract",
      desc: l.trans({
        en: "Start with the business intent and durable domain rules.",
        ko: "business intent와 오래 유지되는 domain rule에서 시작합니다.",
      }),
    },
    {
      title: "constant",
      desc: l.trans({
        en: "Start with the business shape and generated model layers.",
        ko: "business shape과 generated model layer에서 시작합니다.",
      }),
    },
    {
      title: "dictionary",
      desc: l.trans({
        en: "Give those fields, actions, errors, and UI phrases user-facing names.",
        ko: "field, action, error, UI phrase에 사용자에게 보이는 이름을 붙입니다.",
      }),
    },
    {
      title: "document",
      desc: l.trans({
        en: "Describe how stored documents are queried, changed, indexed, and loaded.",
        ko: "저장된 document를 query, change, index, load하는 방식을 설명합니다.",
      }),
    },
    {
      title: "service",
      desc: l.trans({
        en: "Implement business workflows using document helpers and other services.",
        ko: "document helper와 다른 service를 사용해 business workflow를 구현합니다.",
      }),
    },
    {
      title: "signal",
      desc: l.trans({
        en: "Expose server behavior as typed slices, endpoints, realtime channels, and tasks.",
        ko: "server behavior를 typed slice, endpoint, realtime channel, task로 노출합니다.",
      }),
    },
    {
      title: "store",
      desc: l.trans({
        en: "Connect generated fetch APIs to client state, form state, and UI actions.",
        ko: "generated fetch API를 client state, form state, UI action에 연결합니다.",
      }),
    },
    {
      title: "UI files",
      desc: l.trans({
        en: "Render forms, lists, detail views, actions, and page sections.",
        ko: "form, list, detail view, action, page section을 렌더링합니다.",
      }),
    },
  ];

  const readingPaths = [
    {
      title: l.trans({ en: "New Model", ko: "새 Model" }),
      steps: "abstract -> constant -> dictionary -> document -> service -> signal -> store",
      desc: l.trans({
        en: "Use this path when defining a business object from scratch.",
        ko: "business object를 처음 정의할 때 이 순서로 읽습니다.",
      }),
    },
    {
      title: l.trans({ en: "New List Page", ko: "새 List Page" }),
      steps: "abstract -> signal slice -> store -> Zone -> Unit",
      desc: l.trans({
        en: "Use this path when a page needs list data, filtering, pagination, and cards.",
        ko: "page에 list data, filtering, pagination, card가 필요할 때 이 순서로 읽습니다.",
      }),
    },
    {
      title: l.trans({ en: "New Detail Or Edit Page", ko: "새 Detail/Edit Page" }),
      steps: "abstract -> signal view -> store -> Zone/View -> Template",
      desc: l.trans({
        en: "Use this path when showing full data or editing an existing model.",
        ko: "full data를 보여주거나 기존 model을 edit할 때 이 순서로 읽습니다.",
      }),
    },
    {
      title: l.trans({ en: "New Action", ko: "새 Action" }),
      steps: "abstract -> service -> signal endpoint -> store action -> Util/Template button",
      desc: l.trans({
        en: "Use this path when a user click should run a business workflow.",
        ko: "사용자 클릭이 business workflow를 실행해야 할 때 이 순서로 읽습니다.",
      }),
    },
  ];

  const boundaries = [
    {
      title: "Business rules",
      desc: l.trans({
        en: "Put them in service, document, or constant helpers. Do not hide them inside render code.",
        ko: "service, document, constant helper에 둡니다. render code 안에 숨기지 않습니다.",
      }),
    },
    {
      title: "API and access",
      desc: l.trans({
        en: "Put slices, endpoints, guards, internal args, realtime, and tasks in signal.",
        ko: "slice, endpoint, guard, internal arg, realtime, task는 signal에 둡니다.",
      }),
    },
    {
      title: "Client coordination",
      desc: l.trans({
        en: "Put fetch calls, form state, list state, toast messages, and UI actions in store.",
        ko: "fetch call, form state, list state, toast message, UI action은 store에 둡니다.",
      }),
    },
    {
      title: "Display",
      desc: l.trans({
        en: "Use Unit for repeated light-model display and View for full-model detail display.",
        ko: "반복되는 light-model display는 Unit, full-model detail display는 View를 사용합니다.",
      }),
    },
    {
      title: "Page sections",
      desc: l.trans({
        en: "Use Zone to compose Load wrappers, Unit/View, Util controls, and section layout.",
        ko: "Load wrapper, Unit/View, Util control, section layout 조립에는 Zone을 사용합니다.",
      }),
    },
    {
      title: "Small controls",
      desc: l.trans({
        en: "Use Util for toolboxes, action buttons, dialog triggers, query panels, and navigation helpers.",
        ko: "toolbox, action button, dialog trigger, query panel, navigation helper에는 Util을 사용합니다.",
      }),
    },
  ];

  return (
    <Scroll>
      <Scroll.Slide id="module-overview" title={l.trans({ en: "Module Overview", ko: "Module 개요" })}>
        <Docs.Title>{l.trans({ en: "Module Overview", ko: "Module 개요" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "An Akan module is one business feature folder. It keeps the model shape, language, persistence behavior, business workflows, APIs, client state, and UI pieces close together.",
              ko: "Akan module은 하나의 business feature folder입니다. model shape, language, persistence behavior, business workflow, API, client state, UI 조각을 가까운 곳에 함께 둡니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "This overview is a map. Use it to understand which file to open next, then move to each detail page for patterns and examples.",
              ko: "이 overview는 지도입니다. 다음에 어떤 파일을 열어야 하는지 파악한 뒤, 자세한 패턴과 예시는 각 detail page에서 확인하세요.",
            })}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="module-file-map" title={l.trans({ en: "Module File Map", ko: "Module file map" })}>
        <Docs.Title>{l.trans({ en: "Module File Map", ko: "Module file map" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Most modules are easier to understand when split into two groups: data/server files and UI/client files. Each card links to the matching guide.",
              ko: "대부분의 module은 data/server 파일과 UI/client 파일 두 그룹으로 나누면 이해하기 쉽습니다. 각 card는 해당 guide로 이동합니다.",
            })}
          </div>
        </Docs.Description>
        <Docs.SubTitle>{l.trans({ en: "Data And Server Files", ko: "Data와 server 파일" })}</Docs.SubTitle>
        <div className="grid gap-3 xl:grid-cols-3">
          {coreFiles.map(({ name, route, role }) => (
            <Link
              key={name}
              href={route}
              className="rounded-xl border border-base-300 bg-base-100 p-4 hover:border-primary"
            >
              <div className="font-bold text-base-content">{name}</div>
              <div className="mt-2 text-base-content/70">{role}</div>
            </Link>
          ))}
        </div>
        <div className="mb-8" />
        <Docs.SubTitle>{l.trans({ en: "UI And Client Files", ko: "UI와 client 파일" })}</Docs.SubTitle>
        <div className="grid gap-3 xl:grid-cols-3">
          {uiFiles.map(({ name, route, role }) => (
            <Link
              key={name}
              href={route}
              className="rounded-xl border border-base-300 bg-base-100 p-4 hover:border-primary"
            >
              <div className="font-bold text-base-content">{name}</div>
              <div className="mt-2 text-base-content/70">{role}</div>
            </Link>
          ))}
        </div>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide
        id="server-client-flow"
        title={l.trans({ en: "Server To Client Flow", ko: "Server to client 흐름" })}
      >
        <Docs.Title>{l.trans({ en: "Server To Client Flow", ko: "Server to client 흐름" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "A module usually grows from data shape to persistence, then to API, client state, and UI. You do not need every file for every feature, but this order keeps ownership clear.",
              ko: "module은 보통 data shape에서 persistence로, 그다음 API, client state, UI로 확장됩니다. 모든 feature에 모든 파일이 필요한 것은 아니지만, 이 순서를 따르면 역할이 명확해집니다.",
            })}
          </div>
        </Docs.Description>
        <div className="grid xl:grid-cols-7">
          {flowSteps.map(({ title, desc }) => (
            <div key={title} className="rounded-xl border border-base-300 bg-base-100 p-1">
              <div className="font-bold text-base-content">{title}</div>
              <div className="mt-2 text-base-content/70">{desc}</div>
            </div>
          ))}
        </div>
        <Code.Snippet
          title="module flow"
          code={`constant -> dictionary -> document -> service -> signal -> store -> UI files

UI files:
Template -> forms
Unit -> list item display
View -> full detail display
Util -> small controls
Zone -> page section composition`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="role-boundaries" title={l.trans({ en: "Role Boundaries", ko: "역할 경계" })}>
        <Docs.Title>{l.trans({ en: "Role Boundaries", ko: "역할 경계" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "When a module becomes confusing, it is usually because logic moved into the wrong file. Use these boundaries before adding code.",
              ko: "module이 헷갈리기 시작하는 경우는 보통 logic이 잘못된 파일에 들어갔기 때문입니다. 코드를 추가하기 전에 아래 경계를 확인하세요.",
            })}
          </div>
        </Docs.Description>
        <div className="grid gap-3 xl:grid-cols-3">
          {boundaries.map(({ title, desc }) => (
            <div key={title} className="rounded-xl border border-base-300 bg-base-100 p-4">
              <div className="font-bold text-base-content">{title}</div>
              <div className="mt-2 text-base-content/70">{desc}</div>
            </div>
          ))}
        </div>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="reading-paths" title={l.trans({ en: "Recommended Reading Paths", ko: "추천 읽기 순서" })}>
        <Docs.Title>{l.trans({ en: "Recommended Reading Paths", ko: "추천 읽기 순서" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Start from the task you are trying to build. The first file in each path is the best place to inspect or design the change.",
              ko: "지금 만들려는 작업에서 시작하세요. 각 경로의 첫 파일이 변경을 조사하거나 설계하기 가장 좋은 시작점입니다.",
            })}
          </div>
        </Docs.Description>
        <div className="grid gap-3 xl:grid-cols-2">
          {readingPaths.map(({ title, steps, desc }) => (
            <div key={steps} className="rounded-xl border border-base-300 bg-base-100 p-4">
              <div className="font-bold text-base-content">{title}</div>
              <div className="mt-2 font-mono text-base-content">{steps}</div>
              <div className="mt-2 text-base-content/70">{desc}</div>
            </div>
          ))}
        </div>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="practical-rules" title={l.trans({ en: "Practical Rules", ko: "실전 규칙" })}>
        <Docs.Title>{l.trans({ en: "Practical Rules", ko: "실전 규칙" })}</Docs.Title>
        <Docs.Description>
          <div className="space-y-1">
            {[
              l.trans({
                en: "Keep the overview short. Put detailed syntax and examples in each file-specific guide.",
                ko: "overview는 짧게 유지합니다. 자세한 syntax와 example은 각 파일별 guide에 둡니다.",
              }),
              l.trans({
                en: "Let generated types and helpers connect files instead of copying shapes by hand.",
                ko: "shape를 직접 복사하지 말고 generated type과 helper로 파일들을 연결합니다.",
              }),
              l.trans({
                en: "Design server behavior before UI when a feature changes stored data.",
                ko: "feature가 저장된 data를 변경한다면 UI보다 server behavior를 먼저 설계합니다.",
              }),
              l.trans({
                en: "Use UI files for composition and presentation, not hidden business decisions.",
                ko: "UI 파일은 composition과 presentation에 사용하고, 숨겨진 business decision을 넣지 않습니다.",
              }),
              l.trans({
                en: "When a section gets large, move display into Unit/View and controls into Util before expanding Zone.",
                ko: "section이 커지면 Zone을 키우기 전에 display는 Unit/View로, control은 Util로 옮깁니다.",
              }),
            ].map((rule) => (
              <div key={rule} className="rounded-xl border border-base-300 bg-base-100 px-4 text-base-content/70">
                {rule}
              </div>
            ))}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.TitleNavigator className="fixed top-32 right-0 hidden w-[250px] flex-col gap-2 lg:flex" />
    </Scroll>
  );
}
