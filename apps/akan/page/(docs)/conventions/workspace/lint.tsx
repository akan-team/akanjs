// biome-ignore-all lint/plugin: this page quotes every banned class, import and marker on purpose — the
// diagnostics it would otherwise raise are its subject matter.
import { usePage } from "@apps/akan/client";
import { Code, cardGridRecipe, Divider, Docs, DocsToc, panelRecipe } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { page } from "akanjs/client";

export default page().render(() => {
  const { l } = usePage();

  const bulletList = "my-4 list-disc space-y-2 pl-5";
  const chip = "mt-2 block overflow-x-auto whitespace-nowrap rounded-md bg-muted/60 px-2.5 py-1.5 font-mono text-xs";

  const silentCards = [
    {
      title: l.trans({ en: "A Class With No CSS", ko: "CSS가 없는 class" }),
      code: 'className="bg-blue-500"',
      desc: l.trans({
        en: "The raw palette is stripped from the stylesheet, so the badge renders with no colour.",
        ko: "Tailwind 기본 팔레트는 스타일시트에서 빠져 있어서, badge가 색 없이 그려집니다.",
      }),
    },
    {
      title: l.trans({ en: "A Field No Agent Can Reach", ko: "에이전트가 닿지 못하는 필드" }),
      code: "onChange={(v) => st.do.setTitleOnTicket(v)}",
      desc: l.trans({
        en: "An arrow around the setter hides it, so the field publishes no agent tool.",
        ko: "setter를 화살표 함수로 감싸면 가려져서, 그 필드는 에이전트 툴로 공개되지 않습니다.",
      }),
    },
    {
      title: l.trans({ en: "A Return Value Nobody Gets", ko: "아무도 받지 못하는 반환값" }),
      code: "return ticket;",
      desc: l.trans({
        en: "Store actions are dispatched as `void`, so the caller never sees the value.",
        ko: "store 액션은 `void`로 호출되므로, 호출한 쪽은 그 값을 받지 못합니다.",
      }),
    },
    {
      title: l.trans({ en: "A Note Every Visitor Downloads", ko: "모든 방문자가 내려받는 메모" }),
      code: "//! remove before launch",
      desc: l.trans({
        en: "A bang comment survives minification and ships in the browser bundle.",
        ko: "느낌표 주석은 minify를 거쳐도 남아서 브라우저 번들에 그대로 실립니다.",
      }),
    },
  ];

  const termRows = [
    {
      name: "Biome",
      desc: l.trans({
        en: "The formatter and linter this workspace uses. `akan lint` runs it for you.",
        ko: "이 워크스페이스가 쓰는 포매터이자 린터입니다. `akan lint`가 대신 실행합니다.",
      }),
    },
    {
      name: l.trans({ en: "grit plugin", ko: "grit 플러그인" }),
      desc: l.trans({
        en: "A lint rule written in GritQL for Akan and run by Biome. There are 25.",
        ko: "Akan을 위해 GritQL로 쓴 린트 규칙이며, Biome이 실행합니다. 모두 25개입니다.",
      }),
    },
    {
      name: l.trans({ en: "diagnostic", ko: "진단" }),
      desc: l.trans({
        en: "One finding Biome prints: the file, the line, the rule name and a message.",
        ko: "Biome이 출력하는 검사 결과 한 건입니다. 파일, 줄, 규칙 이름, 메시지가 들어 있습니다.",
      }),
    },
    {
      name: l.trans({ en: "safe fix", ko: "안전한 수정" }),
      desc: l.trans({
        en: "A fix Biome applies by itself, such as sorting classes or dropping an unused import.",
        ko: "클래스 정렬이나 안 쓰는 import 삭제처럼, Biome이 알아서 적용하는 수정입니다.",
      }),
    },
    {
      name: l.trans({ en: "colour vocabulary", ko: "색 어휘" }),
      desc: l.trans({
        en: "The closed set of semantic colour tokens. The raw Tailwind palette is not in it.",
        ko: "시맨틱 색 토큰만 모은 닫힌 집합입니다. Tailwind 기본 팔레트는 여기에 없습니다.",
      }),
    },
    {
      name: l.trans({ en: "scope", ko: "적용 범위" }),
      desc: l.trans({
        en: "The paths a rule looks at. A file outside a rule's scope never trips it.",
        ko: "규칙이 들여다보는 경로입니다. 범위 밖의 파일은 그 규칙에 걸리지 않습니다.",
      }),
    },
  ];

  const whyLabel = l.trans({ en: "Why:", ko: "이유:" });
  const fixLabel = l.trans({ en: "Fix:", ko: "고치는 법:" });

  const fixes = [
    {
      id: "raw-palette",
      rule: "no-raw-palette-class",
      title: l.trans({ en: "A Colour Outside The Vocabulary", ko: "색 어휘에 없는 색" }),
      why: l.trans({
        en: "The raw Tailwind palette is stripped from the compiled stylesheet, so `bg-blue-500` has no CSS behind it. The badge renders unstyled while the DOM still shows the class.",
        ko: "컴파일된 스타일시트에서 Tailwind 기본 팔레트가 빠지므로 `bg-blue-500` 뒤에는 CSS가 없습니다. DOM에는 class가 그대로 보이는데 badge는 스타일 없이 그려집니다.",
      }),
      fix: l.trans({
        en: "Use a semantic token such as `bg-primary`. The hex colour in `style` goes too (`no-inline-color`).",
        ko: "`bg-primary` 같은 시맨틱 토큰을 씁니다. `style` 안의 hex 색도 함께 없앱니다(`no-inline-color`).",
      }),
      snippets: [
        {
          title: "apps/myapp/ui/StatusBadge.tsx",
          code: `export const StatusBadge = ({ label }: StatusBadgeProps) => {
  return (
    <span
      className="rounded bg-blue-500 px-2 text-white" // [!code --]
      style={{ borderColor: "#e5e7eb" }} // [!code --]
      className="rounded border border-border bg-primary px-2 text-primary-foreground" // [!code ++]
    >
      {label}
    </span>
  );
};`,
        },
      ],
    },
    {
      id: "throw-raw-error",
      rule: "no-throw-raw-error",
      title: l.trans({ en: "A Raw Error", ko: "그냥 던진 Error" }),
      why: l.trans({
        en: "A bare `Error` reaches the caller as `Internal Server Error`, with no message and no translation.",
        ko: "그냥 던진 `Error`는 메시지도 번역도 없이 `Internal Server Error`로 호출자에게 도착합니다.",
      }),
      fix: l.trans({
        en: "Throw an `Err` that names a key, and register that key in the module dictionary as an `[en, ko]` pair.",
        ko: "key를 지정한 `Err`를 던지고, 그 key를 모듈 dictionary에 `[en, ko]` 쌍으로 등록합니다.",
      }),
      snippets: [
        {
          title: "apps/myapp/lib/ticket/ticket.service.ts",
          code: `import { Err } from "../dict"; // [!code ++]

async openTicket(ticketId: string) {
  const ticket = await this.getTicket(ticketId);
  if (ticket.status !== "active") throw new Error("ticket is not active"); // [!code --]
  if (ticket.status !== "active") throw new Err("ticket.error.notActive"); // [!code ++]
  return await ticket.open().save();
}`,
        },
        {
          lead: l.trans({
            en: "Then register the key in the same module's dictionary:",
            ko: "그리고 같은 모듈의 dictionary에 key를 등록합니다.",
          }),
          title: "apps/myapp/lib/ticket/ticket.dictionary.ts",
          code: `  .error({
    notActive: ["The ticket is not active", "티켓이 활성 상태가 아니다."], // [!code ++]
  })`,
        },
      ],
    },
    {
      id: "form-setter",
      rule: "no-unpublished-form-setter",
      title: l.trans({ en: "A Setter Wrapped In An Arrow", ko: "화살표 함수로 감싼 setter" }),
      why: l.trans({
        en: "Both lines run the same code, but the arrow is an anonymous closure. The control then emits no `data-akan-action` and publishes no agent tool for the field.",
        ko: "두 줄은 똑같이 실행되지만, 화살표 함수는 이름 없는 closure입니다. 그러면 control에 `data-akan-action`이 붙지 않고, 필드도 에이전트 툴로 공개되지 않습니다.",
      }),
      fix: l.trans({
        en: "Pass the setter by reference. Normalize a value with the control's `transform` prop; do several writes in a `_postSet<Field>` store method.",
        ko: "setter를 참조로 넘깁니다. 값을 다듬으려면 control의 `transform` prop을, 여러 값을 함께 쓰려면 store의 `_postSet<Field>` 메서드를 씁니다.",
      }),
      snippets: [
        {
          title: "apps/myapp/lib/ticket/Ticket.Template.tsx",
          code: `<Field.Text
  label={l("ticket.title")}
  value={ticketForm.title}
  onChange={(v) => st.do.setTitleOnTicket(v)} // [!code --]
  onChange={st.do.setTitleOnTicket} // [!code ++]
/>`,
        },
      ],
    },
    {
      id: "store-return",
      rule: "no-return-in-store-action",
      title: l.trans({ en: "A Value Returned From A Store Action", ko: "store 액션이 돌려주는 값" }),
      why: l.trans({
        en: "Every store method is dispatched through `st.do.<action>()`, which is typed `void`. The returned value reaches no call site.",
        ko: "store의 모든 메서드는 `st.do.<action>()`으로 호출되고, 이 호출은 `void`입니다. 돌려준 값은 어느 호출 지점에도 닿지 않습니다.",
      }),
      fix: l.trans({
        en: "Write the value into state with `this.set({ ... })`. A bare `return;` guard stays legal.",
        ko: "값은 `this.set({ ... })`으로 state에 씁니다. 조건 탈출용 `return;`은 그대로 써도 됩니다.",
      }),
      snippets: [
        {
          title: "apps/myapp/lib/ticket/ticket.store.ts",
          code: `async openTicket(ticketId: string) {
  const ticket = await fetch.openTicket(ticketId);
  return ticket; // [!code --]
  this.set({ ticket }); // [!code ++]
}`,
        },
      ],
    },
    {
      id: "init-fetch",
      rule: "no-init-fetch-in-client",
      title: l.trans({ en: "A Hydration Call Made From The Client", ko: "클라이언트에서 부른 hydration 호출" }),
      why: l.trans({
        en: "`fetch.init<Model><Suffix>` builds the snapshot `Load.Units` seeds the store from. Called after hydration, it costs two extra round trips for a shell the browser already painted.",
        ko: "`fetch.init<Model><Suffix>`는 `Load.Units`가 store를 채울 스냅샷을 만듭니다. hydration 뒤에 부르면, 브라우저가 이미 그린 화면을 위해 왕복을 두 번 더 합니다.",
      }),
      fix: l.trans({
        en: "Start it in the route, where it resolves before the first byte, and hand the promise to the Zone as `init`. To reload from the client, call `st.do.init<Model><Suffix>()`.",
        ko: "첫 바이트 전에 끝나도록 라우트에서 시작하고, 그 promise를 Zone의 `init`으로 넘깁니다. 클라이언트에서 다시 불러올 때는 `st.do.init<Model><Suffix>()`를 부릅니다.",
      }),
      snippets: [
        {
          lead: l.trans({
            en: "Before, the Zone loads the list on mount:",
            ko: "고치기 전에는 Zone이 마운트될 때 목록을 불러옵니다.",
          }),
          title: "apps/myapp/lib/ticket/Ticket.Zone.tsx",
          code: `"use client";

export const Card = ({ projectId }: CardProps) => {
  const [init, setInit] = useState<ClientInit<"ticket", cnst.LightTicket>>();
  useEffect(() => {
    void fetch.initTicketInProject(projectId).then(setInit); // [!code highlight]
  }, []);
  return init ? (
    <Load.Units
      init={init}
      renderItem={(ticket) => <Ticket.Unit.Card ticket={ticket} />}
    />
  ) : null;
};`,
        },
        {
          lead: l.trans({
            en: "After, the route starts the load and hands the promise down:",
            ko: "고친 뒤에는 라우트가 불러오기를 시작하고 그 promise를 넘깁니다.",
          }),
          title: "apps/myapp/page/project/[projectId]/_index.tsx",
          code: `export default page()
  .param("projectId", ID)
  .render(({ projectId }) => {
    const { ticketInitInProject } = fetch.initTicketInProject(projectId);
    return <Ticket.Zone.Card init={ticketInitInProject} />;
  });`,
        },
        {
          lead: l.trans({
            en: "The Zone only renders what it is handed:",
            ko: "Zone은 받은 것을 그리기만 합니다.",
          }),
          title: "apps/myapp/lib/ticket/Ticket.Zone.tsx",
          code: `"use client";

export const Card = ({ init }: CardProps) => {
  return (
    <Load.Units
      init={init}
      renderItem={(ticket) => <Ticket.Unit.Card ticket={ticket} />}
    />
  );
};`,
        },
      ],
    },
    {
      id: "private-methods",
      rule: "no-js-private-class-method",
      title: l.trans({ en: "#private In One Of Four Suffixes", ko: "네 가지 파일에서 쓴 #private" }),
      why: l.trans({
        en: "The framework merges `constant`, `document`, `service` and `store` classes by copying methods onto another class. A copied method that calls a `#` member throws.",
        ko: "프레임워크는 `constant`, `document`, `service`, `store` 클래스의 메서드를 다른 클래스로 복사해 합칩니다. 복사된 메서드가 `#` 멤버를 부르면 에러가 납니다.",
      }),
      fix: l.trans({
        en: "Use a TypeScript `private` method with an underscore prefix. Everywhere else, `srvkit/` included, `#private` stays the house style.",
        ko: "밑줄로 시작하는 TypeScript `private` 메서드를 씁니다. `srvkit/`를 포함한 나머지 파일에서는 `#private`이 그대로 기본 스타일입니다.",
      }),
      snippets: [
        {
          title: "apps/myapp/lib/ticket/ticket.service.ts",
          code: `async #syncStock() { // [!code --]
private async _syncStock() { // [!code ++]
  return await this.ticketModel.syncStock();
}
async refreshStock() {
  return await this.#syncStock(); // [!code --]
  return await this._syncStock(); // [!code ++]
}`,
        },
      ],
    },
  ];

  const paletteRows = [
    {
      name: "no-raw-palette-class",
      desc: l.trans({
        en: "Raw palette classes such as `bg-blue-500` compile to no CSS. Use a token such as `bg-primary`.",
        ko: "`bg-blue-500` 같은 Tailwind 기본 팔레트 class는 CSS가 생기지 않습니다. `bg-primary` 같은 토큰을 씁니다.",
      }),
    },
    {
      name: "no-arbitrary-color",
      desc: l.trans({
        en: "Colour values such as `bg-[#3b82f6]` ignore `data-theme`. A `var()` reference is fine.",
        ko: "`bg-[#3b82f6]` 같은 색 값은 `data-theme`을 무시합니다. `var()` 참조는 괜찮습니다.",
      }),
    },
    {
      name: "no-daisyui-legacy-class",
      desc: l.trans({
        en: "Removed daisyUI classes such as `btn-primary`, `card-body` and `bg-base-100` render unstyled.",
        ko: "`btn-primary`, `card-body`, `bg-base-100` 같은 daisyUI class는 제거되어 스타일 없이 그려집니다.",
      }),
    },
    {
      name: "no-inline-color",
      desc: l.trans({
        en: "A colour literal in `style={{ ... }}` or a `<style>` body skips tokens and theme switching.",
        ko: "`style={{ ... }}`이나 `<style>` 본문의 색 리터럴은 토큰과 테마 전환을 건너뜁니다.",
      }),
    },
    {
      name: "no-interpolated-arbitrary-class",
      desc: l.trans({
        en: `A runtime-built arbitrary value like \`min-h-[\${n}px]\` has no CSS. Use \`style\` or literal classes.`,
        ko: `\`min-h-[\${n}px]\`처럼 런타임에 만든 arbitrary 값은 CSS가 생기지 않습니다. \`style\`이나 고정된 class를 씁니다.`,
      }),
    },
  ];

  const daisyRows = [
    { name: "base-100", desc: "`background`" },
    { name: "base-200", desc: "`muted`" },
    { name: "base-300", desc: "`border`" },
    { name: "base-content", desc: "`foreground`" },
    { name: "<colour>-content", desc: "`<colour>-foreground`" },
    { name: "error", desc: "`destructive`" },
  ];

  const ruleType = l.trans({ en: "Rule", ko: "규칙" });
  const scopeLabel = l.trans({ en: "Scope:", ko: "적용 범위:" });
  const levelLabel = l.trans({ en: "Level:", ko: "수준:" });
  const withNote = (desc: string, label: string, note: string) => (
    <>
      <Docs.CodeText>{desc}</Docs.CodeText>
      <span className="mt-1 block text-foreground/60 text-xs">
        {label} <Docs.CodeText>{note}</Docs.CodeText>
      </span>
    </>
  );
  const scopedItems = (rows: { rule: string; scope: string; desc: string }[]) =>
    rows.map(({ rule, scope, desc }) => ({ name: rule, desc: withNote(desc, scopeLabel, scope) }));
  const appsLibs = "`apps/**` `libs/**`";
  const serverComponentScope = "`page/**` `*.Unit.tsx` `*.View.tsx`";
  const moduleScope = l.trans({ en: "module files, `page/**`, barrels", ko: "모듈 파일, `page/**`, barrel" });

  const codeRows = [
    {
      rule: "no-throw-raw-error",
      scope: l.trans({
        en: "`apps/**` `libs/**`, except tests, `*.constant.ts`, `common/**`, `env/**`",
        ko: "`apps/**` `libs/**` (테스트, `*.constant.ts`, `common/**`, `env/**` 제외)",
      }),
      desc: l.trans({
        en: 'A thrown `Error`. Throw `new Err("<module>.error.<key>")` and register the key.',
        ko: '던진 `Error`입니다. `new Err("<module>.error.<key>")`를 던지고 key를 등록합니다.',
      }),
    },
    {
      rule: "no-deprecated-log-level",
      scope: appsLibs,
      desc: l.trans({
        en: "`logger.log()` reads like its own level but emits at `info`. Write `.info()`.",
        ko: "`logger.log()`는 별도 레벨처럼 보이지만 `info`로 찍힙니다. `.info()`를 씁니다.",
      }),
    },
    {
      rule: "no-bang-comment-in-client",
      scope: l.trans({
        en: "`ui/` `webkit/` `common/` `page/`, `*.constant.ts` `*.store.ts`, module components",
        ko: "`ui/` `webkit/` `common/` `page/`, `*.constant.ts` `*.store.ts`, 모듈 컴포넌트",
      }),
      desc: l.trans({
        en: "A `//!` or `/*!` comment survives minification and ships. Use `// FIXME:` instead.",
        ko: "`//!`나 `/*!` 주석은 minify 뒤에도 남아 배포됩니다. 대신 `// FIXME:`를 씁니다.",
      }),
    },
    {
      rule: "no-document-cookie",
      scope: l.trans({ en: "`apps/**` `libs/**`, except tests", ko: "`apps/**` `libs/**` (테스트 제외)" }),
      desc: l.trans({
        en: "An `app://` page on iOS, macOS and Linux keeps no cookies, so `document.cookie` reads empty in the app. Use `getCookie` / `setCookie` / `removeCookie` from `akanjs/client`.",
        ko: "iOS·macOS·Linux의 `app://` 페이지는 쿠키를 보관하지 않아 앱에서 `document.cookie`가 비어 있습니다. `akanjs/client`의 `getCookie` / `setCookie` / `removeCookie`를 씁니다.",
      }),
    },
    {
      rule: "no-web-storage",
      scope: l.trans({ en: "`apps/**` `libs/**`, except tests", ko: "`apps/**` `libs/**` (테스트 제외)" }),
      desc: l.trans({
        en: "`localStorage` / `sessionStorage` bypass the store akanjs picks per platform and throw during SSR. Use `storage` from `akanjs/client`, or `secretStorage` for credentials.",
        ko: "`localStorage` / `sessionStorage`는 akanjs가 플랫폼별로 고르는 저장소를 우회하고 SSR에서 예외가 납니다. `akanjs/client`의 `storage`를, 자격 증명은 `secretStorage`를 씁니다.",
      }),
    },
    {
      rule: "no-web-only-api-outside-webkit",
      scope: l.trans({
        en: "`apps/**` `libs/**` outside `webkit/`, except tests — a warning",
        ko: "`webkit/` 밖의 `apps/**` `libs/**` (테스트 제외) — 경고",
      }),
      desc: l.trans({
        en: "`navigator.share`, `navigator.serviceWorker`, `Notification.*`, `navigator.geolocation` and `navigator.vibrate` are missing in some app WebViews. Keep them in a `webkit/` hook that branches on `isNativeApp()`.",
        ko: "`navigator.share`, `navigator.serviceWorker`, `Notification.*`, `navigator.geolocation`, `navigator.vibrate`는 일부 앱 WebView에 없습니다. `isNativeApp()`으로 분기하는 `webkit/` 훅 안에 둡니다.",
      }),
    },
  ];

  const storeRows = [
    {
      rule: "no-return-in-store-action",
      scope: "`*.store.ts`",
      desc: l.trans({
        en: "`st.do.<action>()` is typed `void`. Write the value into state with `this.set({ ... })`.",
        ko: "`st.do.<action>()`은 `void`입니다. 값은 `this.set({ ... })`으로 state에 씁니다.",
      }),
    },
    {
      rule: "no-unpublished-form-setter",
      scope: l.trans({ en: "every `.tsx` in `apps/` `libs/`", ko: "`apps/` `libs/`의 모든 `.tsx`" }),
      desc: l.trans({
        en: "An arrow that only forwards to a form setter. Pass `st.do.setXOnY` by reference.",
        ko: "form setter로 값만 넘기는 화살표 함수입니다. `st.do.setXOnY`를 참조로 넘깁니다.",
      }),
    },
    {
      rule: "no-init-fetch-in-client",
      scope: l.trans({ en: '`"use client"` files and `*.store.ts`', ko: '`"use client"` 파일과 `*.store.ts`' }),
      desc: l.trans({
        en: "`fetch.init<Model><Suffix>` or `fetch.get<Model>Init<Suffix>` on the client. Load it in the route.",
        ko: "클라이언트에서 부른 `fetch.init<Model><Suffix>`나 `fetch.get<Model>Init<Suffix>`입니다. 라우트에서 불러옵니다.",
      }),
    },
    {
      rule: "no-model-type-in-util-zone",
      scope: "`*.Util.tsx` `*.Zone.tsx`",
      desc: l.trans({
        en: "A `cnst` model as a prop type of an always-client file. Take an id instead.",
        ko: "항상 클라이언트인 파일의 prop 타입에 쓴 `cnst` 모델입니다. 대신 id를 받습니다.",
      }),
    },
    {
      rule: "no-redeclare-predefined-endpoint",
      scope: "`*.signal.ts`",
      desc: l.trans({
        en: "An endpoint that reuses a generated CRUD name, such as `create<Model>` or `view<Model>`.",
        ko: "`create<Model>`, `view<Model>`처럼 생성된 CRUD 이름을 다시 쓴 엔드포인트입니다.",
      }),
    },
    {
      rule: "no-js-private-class-method",
      scope: "`*.constant.ts` `*.document.ts` `*.service.ts` `*.store.ts`",
      desc: l.trans({
        en: "A `#private` method. Use a TypeScript `private _method()` instead.",
        ko: "`#private` 메서드입니다. 대신 TypeScript `private _method()`를 씁니다.",
      }),
    },
  ];

  const serverRows = [
    {
      rule: "no-import-client-functions",
      scope: serverComponentScope,
      desc: l.trans({
        en: "A React hook or `st` imported into a server component. Move the interaction out.",
        ko: "서버 컴포넌트에 import한 React hook이나 `st`입니다. 상호작용 부분을 떼어냅니다.",
      }),
    },
    {
      rule: "no-use-client-in-server",
      scope: serverComponentScope,
      desc: l.trans({
        en: '`"use client"` on a file that is always a server component. Split the interaction out.',
        ko: '항상 서버 컴포넌트인 파일에 붙은 `"use client"`입니다. 상호작용 부분만 떼어냅니다.',
      }),
    },
    {
      rule: "non-scalar-props-restricted",
      scope: serverComponentScope,
      desc: l.trans({
        en: "A function passed as a prop from a server component. Only `loader`, `render` and `of` take one.",
        ko: "서버 컴포넌트에서 prop으로 넘긴 함수입니다. `loader`, `render`, `of`만 함수를 받습니다.",
      }),
    },
    {
      rule: "no-async-component-in-ui",
      scope: "`ui/**/*.tsx`",
      desc: l.trans({
        en: "An async `ui/` component breaks under a client parent. Await in the page instead.",
        ko: "async `ui/` 컴포넌트는 클라이언트 부모 아래에서 깨집니다. page에서 await합니다.",
      }),
    },
  ];

  const importRows = [
    {
      rule: "no-deep-internal-import",
      scope: moduleScope,
      desc: l.trans({
        en: "An `@apps`/`@libs` path past `<name>/<entry>`, `../../` in a module file, or `../` in its `.tsx`.",
        ko: "`<name>/<entry>`보다 깊은 `@apps`·`@libs` 경로, 모듈 파일의 `../../`, 모듈 `.tsx`의 `../`입니다.",
      }),
    },
    {
      rule: "no-import-external-library",
      scope: moduleScope,
      desc: l.trans({
        en: "A third-party package. Re-export it through a lib's `common/`, `webkit/` or `ui/` first.",
        ko: "서드파티 패키지입니다. 먼저 lib의 `common/`, `webkit/`, `ui/`에서 re-export합니다.",
      }),
    },
    {
      rule: "no-import-server-in-client",
      scope: l.trans({
        en: "`ui/` `webkit/` `page/` `common/`, `*.store.ts` `*.constant.ts`, every `.tsx`",
        ko: "`ui/` `webkit/` `page/` `common/`, `*.store.ts` `*.constant.ts`, 모든 `.tsx`",
      }),
      desc: l.trans({
        en: "Imports a `*.document`/`*.dictionary`/`*.service`/`*.signal` file, `srvkit/` or a server entry.",
        ko: "`*.document`·`*.dictionary`·`*.service`·`*.signal` 파일, `srvkit/`, server 엔트리를 import합니다.",
      }),
    },
    {
      rule: "no-import-client-in-server",
      scope: "`*.document` `*.dictionary` `*.service` `*.signal` `srvkit/` `common/` `*.constant`",
      desc: l.trans({
        en: "Imports a `*.store`, a module component, `ui/`, `webkit/`, a client entry or a client barrel.",
        ko: "`*.store`, 모듈 컴포넌트, `ui/`, `webkit/`, client 엔트리, client barrel을 import합니다.",
      }),
    },
  ];

  const biomeRows = [
    {
      rule: "nursery/useSortedClasses",
      level: l.trans({ en: "`error`, safe fix", ko: "`error`, 안전한 수정" }),
      desc: l.trans({
        en: "Sorts Tailwind classes, `cn()` string arguments too. Never hand-order or undo its output.",
        ko: "`cn()`의 문자열 인자까지 Tailwind class를 정렬합니다. 손으로 정렬하거나 결과를 되돌리지 않습니다.",
      }),
    },
    {
      rule: "suspicious/noConsole",
      level: "`error`",
      desc: l.trans({
        en: "`console.log` and `console.debug`. Only `assert`, `error`, `info` and `warn` are allowed.",
        ko: "`console.log`와 `console.debug`입니다. `assert`, `error`, `info`, `warn`만 허용됩니다.",
      }),
    },
    {
      rule: "correctness/noUnusedImports",
      level: l.trans({ en: "`error`, safe fix", ko: "`error`, 안전한 수정" }),
      desc: l.trans({
        en: "`akan lint` deletes the unused import on its fix pass instead of reporting it.",
        ko: "`akan lint`가 수정 단계에서 안 쓰는 import를 보고하는 대신 지웁니다.",
      }),
    },
    {
      rule: "suspicious/noArrayIndexKey",
      level: "`off`",
      desc: l.trans({
        en: "Off on purpose: `key={idx}` for an embedded scalar with no id of its own is intended.",
        ko: "일부러 껐습니다. 자기 id가 없는 embedded scalar의 `key={idx}`는 의도된 것입니다.",
      }),
    },
    {
      rule: "correctness/useExhaustiveDependencies",
      level: "`off`",
      desc: l.trans({
        en: "Off on purpose: the short dependency arrays in this workspace are deliberate.",
        ko: "일부러 껐습니다. 이 워크스페이스의 짧은 dependency 배열은 의도된 것입니다.",
      }),
    },
  ];

  const importNotes = [
    l.trans({
      en: (
        <>
          <strong>
            <code>import type</code> is always allowed.
          </strong>{" "}
          It is erased before bundling. A mixed value-and-type import is not exempt.
        </>
      ),
      ko: (
        <>
          <strong>
            <code>import type</code>은 언제나 허용됩니다.
          </strong>{" "}
          번들 전에 지워지기 때문입니다. 값과 타입을 섞은 import는 예외가 아닙니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>
            <code>common/</code> and <code>*.constant.ts</code> obey both directions,
          </strong>{" "}
          so shared code reaches neither side.
        </>
      ),
      ko: (
        <>
          <strong>
            <code>common/</code>과 <code>*.constant.ts</code>는 두 방향을 모두 지킵니다.
          </strong>{" "}
          그래서 공유 코드는 어느 쪽에도 닿지 않습니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>Barrels count too.</strong> A client file may not import <code>db</code>, <code>srv</code>,{" "}
          <code>sig</code>, <code>dict</code>, <code>option</code> or <code>useServer</code>; a server file may not
          import <code>st</code>, <code>store</code> or <code>useClient</code>.
        </>
      ),
      ko: (
        <>
          <strong>barrel도 마찬가지입니다.</strong> 클라이언트 파일은 <code>db</code>, <code>srv</code>,{" "}
          <code>sig</code>, <code>dict</code>, <code>option</code>, <code>useServer</code>를, 서버 파일은{" "}
          <code>st</code>, <code>store</code>, <code>useClient</code>를 import할 수 없습니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>Akan&apos;s own packages pass.</strong> Relative paths, <code>akanjs</code>, <code>@akanjs/*</code>,{" "}
          <code>@apps/*</code>, <code>@libs/*</code>, <code>@pkgs/*</code>, <code>react*</code>,{" "}
          <code>@playwright/*</code> and <code>bun:test</code> are not third-party imports.
        </>
      ),
      ko: (
        <>
          <strong>Akan 자체 패키지는 통과합니다.</strong> 상대 경로, <code>akanjs</code>, <code>@akanjs/*</code>,{" "}
          <code>@apps/*</code>, <code>@libs/*</code>, <code>@pkgs/*</code>, <code>react*</code>,{" "}
          <code>@playwright/*</code>, <code>bun:test</code>는 서드파티 import로 보지 않습니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>Cross-module constants are the exception.</strong> A <code>.ts</code> module file may import{" "}
          <code>../map/map.constant</code>.
        </>
      ),
      ko: (
        <>
          <strong>모듈 사이의 constant 참조는 예외입니다.</strong> <code>.ts</code> 모듈 파일은{" "}
          <code>../map/map.constant</code>를 import할 수 있습니다.
        </>
      ),
    }),
  ];

  const codeNotes = [
    l.trans({
      en: (
        <>
          <strong>
            <code>{"//!"}</code> stays legal on the server.
          </strong>{" "}
          Server files, <code>srvkit/</code> and CLI code never reach a browser.
        </>
      ),
      ko: (
        <>
          <strong>
            서버에서는 <code>{"//!"}</code>를 써도 됩니다.
          </strong>{" "}
          서버 파일, <code>srvkit/</code>, CLI 코드는 브라우저에 가지 않습니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>
            <code>no-bang-comment-in-client</code> always points at line 1.
          </strong>{" "}
          It is a file-level diagnostic, so search the file for the marker.
        </>
      ),
      ko: (
        <>
          <strong>
            <code>no-bang-comment-in-client</code>는 언제나 1행을 가리킵니다.
          </strong>{" "}
          파일 단위 진단이므로, 표식은 파일에서 직접 찾아야 합니다.
        </>
      ),
    }),
  ];

  const suppressionForms = [
    {
      name: "// biome-ignore lint/plugin: <reason>",
      desc: l.trans({
        en: "Turns plugin rules off for the next line or statement.",
        ko: "다음 줄이나 문장에서 플러그인 규칙을 끕니다.",
      }),
    },
    {
      name: "{/* biome-ignore lint/plugin: <reason> */}",
      desc: l.trans({
        en: "The same inside JSX, placed above one element.",
        ko: "JSX 안에서 같은 일을 합니다. 요소 하나 바로 위에 둡니다.",
      }),
    },
    {
      name: "// biome-ignore-all lint/plugin: <reason>",
      desc: l.trans({
        en: "At the top of a file, turns plugin rules off for the whole file.",
        ko: "파일 맨 위에 두면 파일 전체에서 플러그인 규칙을 끕니다.",
      }),
    },
    {
      name: "// biome-ignore lint/suspicious/noConsole: <reason>",
      desc: l.trans({
        en: "Biome's own rules are named by their group and rule name instead.",
        ko: "Biome 자체 규칙은 그룹과 규칙 이름으로 지정합니다.",
      }),
    },
  ];

  const extraChecks = [
    {
      name: "page/styles.css",
      desc: l.trans({
        en: "Each theme's text and background token pair must meet WCAG contrast.",
        ko: "테마마다 글자와 배경 토큰 쌍이 WCAG 대비 기준을 넘어야 합니다.",
      }),
    },
    {
      name: "ui/Recipe/*",
      desc: l.trans({
        en: "A recipe with no variant to choose fails. Make it a component or a class constant.",
        ko: "고를 variant가 없는 recipe는 실패합니다. 컴포넌트나 class 상수로 바꿉니다.",
      }),
    },
    {
      name: "AGENTS.md",
      desc: l.trans({
        en: "A stale `## Recipes In Scope` block fails. Run `akan sync <name>` to regenerate it.",
        ko: "`## Recipes In Scope` 블록이 오래되면 실패합니다. `akan sync <name>`으로 다시 만듭니다.",
      }),
    },
  ];

  const configFiles = [
    {
      name: "biome.json",
      desc: l.trans({
        en: "Sits at the workspace root and extends `@akanjs/devkit/biome.base.json`.",
        ko: "워크스페이스 루트에 있고 `@akanjs/devkit/biome.base.json`을 확장합니다.",
      }),
    },
    {
      name: "@akanjs/devkit/biome.base.json",
      desc: l.trans({
        en: "Sets every rule's level and scopes each grit plugin to the paths it applies to.",
        ko: "모든 규칙의 수준을 정하고, grit 플러그인마다 적용 경로를 지정합니다.",
      }),
    },
    {
      name: "@akanjs/devkit/lint/*.grit",
      desc: l.trans({
        en: "The plugin sources, one file per rule. Most open with a comment on what breaks without it.",
        ko: "플러그인 원본이며 규칙마다 파일 하나입니다. 대부분은 그 규칙이 없으면 무엇이 깨지는지 설명하는 주석으로 시작합니다.",
      }),
    },
  ];

  return (
    <Scroll>
      <Scroll.Slide
        id="silent-failures"
        title={l.trans({ en: "Lint Is Not About Style", ko: "린트는 스타일 검사가 아닙니다" })}
      >
        <Docs.Title>{l.trans({ en: "Lint Is Not About Style", ko: "린트는 스타일 검사가 아닙니다" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Most rules here catch code that compiles, runs and looks right, yet quietly does nothing. Only the linter notices.",
              ko: "여기 있는 규칙 대부분은 컴파일되고, 실행되고, 멀쩡해 보이는데 조용히 아무 일도 하지 않는 코드를 잡습니다. 이런 코드는 린터만 알아챕니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: (
                <span>
                  Say you write <code>bg-blue-500</code> on a badge. The page renders and the class is in the DOM, but
                  the badge has no colour, and neither the build nor the browser complains.
                </span>
              ),
              ko: (
                <span>
                  badge에 <code>bg-blue-500</code>을 적었다고 해 봅시다. 페이지는 그려지고 class도 DOM에 있지만
                  badge에는 색이 없고, 빌드도 브라우저도 아무 말이 없습니다.
                </span>
              ),
            })}
          </div>
          <div className={cardGridRecipe({ cols: "mdTwo" }, "my-4")}>
            {silentCards.map(({ title, code, desc }) => (
              <div key={code} className={panelRecipe({ radius: "lg", padding: "sm" }, "min-w-0")}>
                <div className="font-semibold text-primary">{title}</div>
                <div className="mt-1 text-foreground/70 text-sm">
                  <Docs.CodeText>{desc}</Docs.CodeText>
                </div>
                <code className={chip}>{code}</code>
              </div>
            ))}
          </div>
          <Docs.SubSubTitle>{l.trans({ en: "Words used on this page", ko: "이 페이지에서 쓰는 말" })}</Docs.SubSubTitle>
          <Docs.IntroTable type={l.trans({ en: "Term", ko: "용어" })} items={termRows} />
          <Docs.Alert type="error">
            {l.trans({
              en: (
                <span>
                  <strong>
                    <code>akan lint</code> rewrites files.
                  </strong>{" "}
                  <code>--fix</code> is on by default, so run it only on the app or lib you touched (
                  <code>akan lint myapp</code>). A repo-wide run in a dirty tree edits work nobody asked it to; use{" "}
                  <code>bunx biome check "&lt;path&gt;"</code> when you only want a report.
                </span>
              ),
              ko: (
                <span>
                  <strong>
                    <code>akan lint</code>는 파일을 고쳐 씁니다.
                  </strong>{" "}
                  <code>--fix</code>가 기본으로 켜져 있으니 수정한 app이나 lib에만 돌리세요(<code>akan lint myapp</code>
                  ). 작업 중인 트리에서 저장소 전체에 돌리면 아무도 시키지 않은 파일까지 고칩니다. 보고만 받고 싶다면{" "}
                  <code>bunx biome check "&lt;path&gt;"</code>를 씁니다.
                </span>
              ),
            })}
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="fix-errors" title={l.trans({ en: "Six You Will Meet First", ko: "가장 먼저 만날 여섯 가지" })}>
        <Docs.Title>{l.trans({ en: "Six You Will Meet First", ko: "가장 먼저 만날 여섯 가지" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Each diagnostic prints the name of the rule that fired. Find that name below; the fix is mechanical once you know it.",
              ko: "진단에는 걸린 규칙의 이름이 찍힙니다. 아래에서 그 이름을 찾으면 고치는 방법은 정해져 있습니다.",
            })}
          </div>
        </Docs.Description>
        <div className="my-4 space-y-4">
          {fixes.map(({ id, rule, title, why, fix, snippets }) => (
            <div key={id} className={panelRecipe({ radius: "lg", padding: "sm" }, "min-w-0")}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <div className="font-semibold text-primary">{title}</div>
                <code className="text-xs">{rule}</code>
              </div>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-foreground/80 text-sm">
                <li>
                  <strong>{whyLabel}</strong> <Docs.CodeText>{why}</Docs.CodeText>
                </li>
                <li>
                  <strong>{fixLabel}</strong> <Docs.CodeText>{fix}</Docs.CodeText>
                </li>
              </ul>
              {snippets.map(({ lead, title: snippetTitle, code }, idx) => (
                <div key={idx} className="min-w-0">
                  {lead ? <div className="mt-3 text-foreground/70 text-sm">{lead}</div> : null}
                  <Code.Snippet className="w-full" title={snippetTitle} code={code} />
                </div>
              ))}
            </div>
          ))}
        </div>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide
        id="every-rule"
        title={l.trans({ en: "Every Rule That Breaks The Build", ko: "빌드를 깨는 규칙 전체" })}
      >
        <Docs.Title>{l.trans({ en: "Every Rule That Breaks The Build", ko: "빌드를 깨는 규칙 전체" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  Twenty-two are grit plugins written for Akan, and every one of them is an error. The rest are
                  Biome&apos;s own. Each plugin looks only at its scope, so a plain package under <code>pkgs/</code>{" "}
                  never trips the module rules.
                </span>
              ),
              ko: (
                <span>
                  스물두 개는 Akan을 위해 쓴 grit 플러그인이고, 모두 error입니다. 나머지는 Biome 자체 규칙입니다.
                  플러그인은 자기 적용 범위만 보므로, <code>pkgs/</code> 아래의 평범한 패키지는 모듈 규칙에 걸리지
                  않습니다.
                </span>
              ),
            })}
          </div>

          <Docs.SubSubTitle>{l.trans({ en: "Colour vocabulary", ko: "색 어휘" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: (
                <span>
                  All five look at every <code>.ts</code> and <code>.tsx</code> file in <code>apps/</code> and{" "}
                  <code>libs/</code>, except tests.
                </span>
              ),
              ko: (
                <span>
                  다섯 규칙 모두 테스트를 뺀 <code>apps/</code>, <code>libs/</code>의 <code>.ts</code>,{" "}
                  <code>.tsx</code> 파일 전체를 봅니다.
                </span>
              ),
            })}
          </div>
          <Docs.IntroTable type={ruleType} items={paletteRows} />
          <div>
            {l.trans({
              en: (
                <span>
                  daisyUI&apos;s dropped colour slots map onto tokens like this. <code>black</code> and{" "}
                  <code>white</code> stay in the vocabulary.
                </span>
              ),
              ko: (
                <span>
                  daisyUI에서 빠진 색 슬롯은 아래 토큰으로 옮깁니다. <code>black</code>과 <code>white</code>는 어휘에
                  그대로 남아 있습니다.
                </span>
              ),
            })}
          </div>
          <Docs.IntroTable
            type={l.trans({ en: "daisyUI slot", ko: "daisyUI 슬롯" })}
            descLabel={l.trans({ en: "Token to use", ko: "대신 쓸 토큰" })}
            items={daisyRows}
          />

          <Docs.SubSubTitle>{l.trans({ en: "Errors, logs and comments", ko: "에러, 로그, 주석" })}</Docs.SubSubTitle>
          <Docs.IntroTable type={ruleType} items={scopedItems(codeRows)} />
          <ul className={bulletList}>
            {codeNotes.map((note, idx) => (
              <li key={idx}>{note}</li>
            ))}
          </ul>

          <Docs.SubSubTitle>
            {l.trans({ en: "Stores, forms and module files", ko: "store, form, 모듈 파일" })}
          </Docs.SubSubTitle>
          <Docs.IntroTable type={ruleType} items={scopedItems(storeRows)} />
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>Generated CRUD names are taken.</strong> <code>{"<model>"}</code>,{" "}
                    <code>{"light<Model>"}</code>, <code>{"create<Model>"}</code>, <code>{"update<Model>"}</code>,{" "}
                    <code>{"remove<Model>"}</code>, <code>{"view<Model>"}</code>, <code>{"edit<Model>"}</code> and{" "}
                    <code>{"merge<Model>"}</code> already exist, so give a custom endpoint another name.
                  </>
                ),
                ko: (
                  <>
                    <strong>생성된 CRUD 이름은 이미 쓰이고 있습니다.</strong> <code>{"<model>"}</code>,{" "}
                    <code>{"light<Model>"}</code>, <code>{"create<Model>"}</code>, <code>{"update<Model>"}</code>,{" "}
                    <code>{"remove<Model>"}</code>, <code>{"view<Model>"}</code>, <code>{"edit<Model>"}</code>,{" "}
                    <code>{"merge<Model>"}</code>가 이미 있으니, 직접 만드는 엔드포인트에는 다른 이름을 붙입니다.
                  </>
                ),
              })}
            </li>
          </ul>

          <Docs.SubSubTitle>{l.trans({ en: "Server components", ko: "서버 컴포넌트" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: (
                <span>
                  Pages, <code>Unit</code> and <code>View</code> are always server components. These rules keep client
                  code out of them.
                </span>
              ),
              ko: (
                <span>
                  page, <code>Unit</code>, <code>View</code>는 언제나 서버 컴포넌트입니다. 이 규칙들이 그 안에
                  클라이언트 코드가 들어오지 않게 막습니다.
                </span>
              ),
            })}
          </div>
          <Docs.IntroTable type={ruleType} items={scopedItems(serverRows)} />

          <Docs.SubSubTitle>{l.trans({ en: "Imports", ko: "import" })}</Docs.SubSubTitle>
          <Docs.IntroTable type={ruleType} items={scopedItems(importRows)} />
          <ul className={bulletList}>
            {importNotes.map((note, idx) => (
              <li key={idx}>{note}</li>
            ))}
          </ul>

          <Docs.SubSubTitle>{l.trans({ en: "Biome's own rules", ko: "Biome 자체 규칙" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: "These apply to every file. The two that are off are off on purpose.",
              ko: "이 규칙들은 모든 파일에 적용됩니다. 꺼 둔 두 규칙은 일부러 끈 것입니다.",
            })}
          </div>
          <Docs.IntroTable
            type={ruleType}
            items={biomeRows.map(({ rule, level, desc }) => ({ name: rule, desc: withNote(desc, levelLabel, level) }))}
          />
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="suppression" title={l.trans({ en: "Suppressing A Rule", ko: "규칙 하나 끄기" })}>
        <Docs.Title>{l.trans({ en: "Suppressing A Rule", ko: "규칙 하나 끄기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Sometimes a fixed colour is right: an OS-chrome mockup, a data-visualization scale, a vendor's brand. Suppress that one spot, and always write the reason.",
              ko: "고정된 색이 맞을 때도 있습니다. OS 창 목업, 데이터 시각화 색 척도, 벤더의 브랜드 색 같은 경우입니다. 그 자리만 규칙을 끄고, 이유는 반드시 적습니다.",
            })}
          </div>
          <Docs.IntroTable type={l.trans({ en: "Form", ko: "형태" })} items={suppressionForms} />
          <div>
            {l.trans({
              en: "The JSX form looks like this in a real component:",
              ko: "JSX 형태는 실제 컴포넌트에서 이렇게 씁니다.",
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/myapp/ui/BrowserChrome.tsx"
            code={`export const TrafficLights = () => {
  return (
    <div className="flex gap-2">
      {/* biome-ignore lint/plugin: macOS traffic-light colour, not a theme token */}
      <div className="size-3 rounded-full bg-[#ff5f57]" />
    </div>
  );
};`}
          />
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>Every suppression carries a reason.</strong> There is no bare disable block anywhere in this
                    workspace.
                  </>
                ),
                ko: (
                  <>
                    <strong>모든 예외에는 이유가 붙습니다.</strong> 이 워크스페이스에는 이유 없는 disable 블록이 하나도
                    없습니다.
                  </>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>Keep the scope small.</strong> Use the file-level form only when every hit in the file has
                    the same reason, like a data-viz palette file.
                  </>
                ),
                ko: (
                  <>
                    <strong>범위는 좁게 둡니다.</strong> 파일 단위 형태는 데이터 시각화 팔레트 파일처럼 파일 안의 모든
                    위반이 같은 이유일 때만 씁니다.
                  </>
                ),
              })}
            </li>
          </ul>
          <Docs.Alert type="warning">
            {l.trans({
              en: (
                <span>
                  <strong>
                    Write <code>lint/plugin</code>, not <code>plugin</code>.
                  </strong>{" "}
                  The bare <code>{"// biome-ignore plugin:"}</code> form that Biome&apos;s category name suggests is
                  accepted and looks right, but it does <strong>nothing</strong>: the rule still fires.
                </span>
              ),
              ko: (
                <span>
                  <strong>
                    <code>plugin</code>이 아니라 <code>lint/plugin</code>으로 씁니다.
                  </strong>{" "}
                  Biome 카테고리 이름만 보고 <code>{"// biome-ignore plugin:"}</code>으로 적으면 오류 없이 받아들여지고
                  맞아 보이지만 <strong>아무 효과가 없습니다</strong>. 규칙은 그대로 걸립니다.
                </span>
              ),
            })}
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="commands" title={l.trans({ en: "Commands And Configuration", ko: "명령어와 설정" })}>
        <Docs.Title>{l.trans({ en: "Commands And Configuration", ko: "명령어와 설정" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  <code>akan lint</code> formats and fixes one app, lib or package. <code>bunx biome check</code> only
                  reports:
                </span>
              ),
              ko: (
                <span>
                  <code>akan lint</code>는 app, lib, package 하나를 포맷하고 고칩니다. <code>bunx biome check</code>는
                  보고만 합니다.
                </span>
              ),
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="Terminal"
            language="bash"
            code={l.trans({
              en: `akan lint myapp                        # format and fix one target
akan lint myapp --fix false            # report, apply no fixes
akan lint myapp --max-diagnostics 0    # print every diagnostic
akan lint-all                          # every app, lib, and package
bunx biome check apps/myapp/lib/order  # Biome only, writes nothing`,
              ko: `akan lint myapp                        # 대상 하나를 포맷하고 고침
akan lint myapp --fix false            # 보고만 하고 고치지 않음
akan lint myapp --max-diagnostics 0    # 진단을 전부 출력
akan lint-all                          # 모든 app, lib, package
bunx biome check apps/myapp/lib/order  # Biome만 실행, 파일은 그대로`,
            })}
          />
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>Up to 200 diagnostics are printed.</strong> Biome&apos;s own default is 20 with no count,
                    which reads as progress when only the mix of findings changed.
                  </>
                ),
                ko: (
                  <>
                    <strong>진단은 200개까지 출력합니다.</strong> Biome 기본값은 전체 개수 없이 20개만 보여 주므로,
                    문제의 종류만 바뀌어도 줄어든 것처럼 보입니다.
                  </>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>
                      <code>--fix false</code> still runs every <code>akan lint</code> check.
                    </strong>{" "}
                    It skips only Biome&apos;s fixes, so the checks below still run; <code>bunx biome check</code> runs
                    Biome alone.
                  </>
                ),
                ko: (
                  <>
                    <strong>
                      <code>--fix false</code>로 돌려도 <code>akan lint</code>의 검사는 모두 거칩니다.
                    </strong>{" "}
                    Biome의 수정만 건너뛰고 아래 검사는 그대로 합니다. Biome만 돌리려면 <code>bunx biome check</code>를
                    씁니다.
                  </>
                ),
              })}
            </li>
          </ul>

          <Docs.SubSubTitle>
            {l.trans({ en: "What akan lint checks after Biome", ko: "akan lint가 Biome 다음에 확인하는 것" })}
          </Docs.SubSubTitle>
          <Docs.IntroTable type={l.trans({ en: "File", ko: "파일" })} items={extraChecks} />

          <Docs.SubSubTitle>{l.trans({ en: "Where the configuration lives", ko: "설정이 있는 곳" })}</Docs.SubSubTitle>
          <Docs.IntroTable type={l.trans({ en: "File", ko: "파일" })} items={configFiles} />
          <Docs.Alert type="error">
            {l.trans({
              en: (
                <span>
                  <strong>
                    <code>biome.json</code> is strict JSON, and one comment breaks it.
                  </strong>{" "}
                  <code>akan lint</code> reports the parse error on its line, but a bare <code>biome check</code>{" "}
                  silently falls back to other configs and names a file you did not edit, or runs without your rules.
                  Rename it to <code>biome.jsonc</code> to document a disabled rule.
                </span>
              ),
              ko: (
                <span>
                  <strong>
                    <code>biome.json</code>은 엄격한 JSON이라 주석 하나에도 깨집니다.
                  </strong>{" "}
                  <code>akan lint</code>는 파싱 에러를 해당 줄과 함께 보여 주지만, 그냥 <code>biome check</code>를
                  돌리면 조용히 다른 설정으로 넘어가서 손대지 않은 파일을 지목하거나 규칙 없이 실행됩니다. 꺼 둔 규칙을
                  설명해야 한다면 <code>biome.jsonc</code>로 이름을 바꾸세요.
                </span>
              ),
            })}
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <DocsToc />
    </Scroll>
  );
});
