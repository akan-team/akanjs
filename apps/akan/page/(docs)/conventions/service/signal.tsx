import { usePage } from "@apps/akan/client";
import { Code, cardGridRecipe, Divider, Docs, DocsToc, panelRecipe } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { page } from "akanjs/client";
import { Link } from "akanjs/ui";

export default page().render(() => {
  const { l } = usePage();

  const chip = "mt-2 block overflow-x-auto whitespace-nowrap rounded-md bg-muted/60 px-2.5 py-1.5 font-mono text-xs";
  const inlineLink = "text-primary underline underline-offset-4 hover:no-underline";

  const termRows = [
    {
      name: "service module",
      desc: l.trans({
        en: "A module in `lib/_<name>` with no table of its own, such as `_security` or `_oauth`.",
        ko: "`_security`, `_oauth`처럼 `lib/_<name>`에 있고 자기 테이블이 없는 모듈입니다.",
      }),
    },
    {
      name: "guard",
      desc: l.trans({
        en: "A class that decides whether a call may run, such as `Public`, `Every` or `Admin`.",
        ko: "호출을 실행해도 되는지 정하는 클래스입니다. `Public`, `Every`, `Admin` 등이 있습니다.",
      }),
    },
    {
      name: "internal argument",
      desc: l.trans({
        en: "A value the server fills in rather than the caller, taken with `.with(...)`.",
        ko: "호출자가 아니라 서버가 채워 주는 값입니다. `.with(...)`로 받습니다.",
      }),
    },
    {
      name: "MCP",
      desc: l.trans({
        en: "The protocol AI agents use to call your endpoints. Akan serves it at `/mcp`.",
        ko: "AI 에이전트가 엔드포인트를 호출할 때 쓰는 프로토콜입니다. Akan은 `/mcp`에서 제공합니다.",
      }),
    },
    {
      name: "serverMode",
      desc: l.trans({
        en: "A server's role: `federation` answers requests, `batch` runs background work, `all` does both.",
        ko: "서버의 역할입니다. `federation`은 요청에 답하고, `batch`는 백그라운드 작업을 돌리고, `all`은 둘 다 합니다.",
      }),
    },
  ];

  const moduleColumns = [
    { key: "model", label: l.trans({ en: "Model module", ko: "모델 모듈" }), caption: "lib/<model>" },
    { key: "service", label: l.trans({ en: "Service module", ko: "서비스 모듈" }), caption: "lib/_<service>" },
  ];
  const classGroups = [
    {
      label: l.trans({ en: "Declared in this order", ko: "파일에 적는 순서대로" }),
      rows: [
        {
          name: "XInternal",
          desc: l.trans({
            en: "Work the runtime starts: schedules, queue jobs, boot and shutdown. Written even when empty.",
            ko: "런타임이 시작하는 일입니다. 예약 작업, queue job, 부팅과 종료 때의 작업을 둡니다. 비어 있어도 적습니다.",
          }),
          marks: { model: true, service: true },
        },
        {
          name: "XSlice",
          desc: l.trans({
            en: "A paged window onto a table, with an insight query behind it. No table, no slice.",
            ko: "테이블을 페이지 단위로 보여 주는 창이고, 뒤에 insight 쿼리가 있습니다. 테이블이 없으면 슬라이스도 없습니다.",
          }),
          marks: { model: true, service: false },
        },
        {
          name: "XEndpoint",
          desc: l.trans({
            en: "What callers reach: `query`, `mutation`, `pubsub` and `message`.",
            ko: "호출자가 닿는 곳입니다. `query`, `mutation`, `pubsub`, `message`를 둡니다.",
          }),
          marks: { model: true, service: true },
        },
      ],
    },
  ];

  const exposureColumns = [
    { key: "checks", label: l.trans({ en: "Checks the caller", ko: "호출자 검사" }) },
    { key: "mcp", label: l.trans({ en: "Agents see it", ko: "에이전트에 공개" }), caption: "MCP" },
  ];
  const exposureGroups = [
    {
      label: l.trans({ en: "Names a real guard", ko: "실질 가드를 적은 경우" }),
      rows: [
        {
          name: "{ guards: [Every] }",
          desc: l.trans({
            en: "Published. An agent's call is checked like anyone else's.",
            ko: "공개됩니다. 에이전트의 호출도 다른 호출과 똑같이 검사합니다.",
          }),
          marks: { checks: true, mcp: true },
        },
        {
          name: "{ guards: [Every], mcp: false }",
          desc: l.trans({
            en: "HTTP serves it as before. Only the agent listing drops it.",
            ko: "HTTP는 그대로 제공하고, 에이전트 목록에서만 빠집니다.",
          }),
          marks: { checks: true, mcp: false },
        },
        {
          name: "{ guards: [Every, Person] }",
          desc: l.trans({
            en: "A person-only act. A model is refused and never sees the entry.",
            ko: "사람만 할 수 있는 동작입니다. 모델은 거절되고 목록에서도 보지 못합니다.",
          }),
          marks: { checks: true, mcp: false },
        },
      ],
    },
    {
      label: l.trans({ en: "Names Public, or nothing", ko: "Public만 적었거나 아무것도 없는 경우" }),
      rows: [
        {
          name: "query(T, { guards: [Public] })",
          desc: l.trans({
            en: "An open read, decided on purpose. Published, like the doc tools below.",
            ko: "일부러 열어 둔 읽기입니다. 아래 문서 도구처럼 공개됩니다.",
          }),
          marks: { checks: false, mcp: true },
        },
        {
          name: "mutation(T, { guards: [Public] })",
          desc: l.trans({
            en: "Runs for anyone over HTTP. MCP treats it as having no guard.",
            ko: "HTTP로는 누구나 실행합니다. MCP는 가드가 없는 것으로 봅니다.",
          }),
          marks: { checks: false, mcp: false },
        },
        {
          name: <span className="font-sans">{l.trans({ en: "no guards", ko: "가드 없음" })}</span>,
          desc: l.trans({
            en: "Zero checks over HTTP, and refused by MCP.",
            ko: "HTTP에서는 검사를 하나도 하지 않고, MCP는 거절합니다.",
          }),
          marks: { checks: false, mcp: false },
        },
      ],
    },
  ];

  const routeOptions = [
    {
      key: "path",
      type: "string",
      default: l.trans({ en: "endpoint name", ko: "엔드포인트 이름" }),
      desc: l.trans({
        en: "A literal route, in place of the one built from the endpoint name and its `.param()`s.",
        ko: "엔드포인트 이름과 `.param()`으로 만드는 경로 대신 쓸 고정 경로입니다.",
      }),
    },
    {
      key: "prefix",
      type: "false | string",
      default: l.trans({ en: "model refName", ko: "모델 refName" }),
      desc: l.trans({
        en: "The segment before the path. A model module puts its refName there; a service module, nothing.",
        ko: "경로 앞에 붙는 구간입니다. 모델 모듈은 refName을 붙이고, 서비스 모듈은 아무것도 붙이지 않습니다.",
      }),
    },
    {
      key: "globalPrefix",
      type: "false",
      default: l.trans({ en: "API prefix (/api)", ko: "API 접두사(/api)" }),
      desc: l.trans({
        en: "`false` drops the app's API prefix, so the route sits at the origin root.",
        ko: "`false`면 앱의 API 접두사를 떼어 내, 경로가 origin 루트에 놓입니다.",
      }),
    },
    {
      key: "mcp",
      type: "boolean",
      default: "true",
      desc: l.trans({
        en: "`false` keeps it off the agent listing without changing who may call it.",
        ko: "`false`면 누가 호출할 수 있는지는 그대로 두고, 에이전트 목록에서만 뺍니다.",
      }),
    },
  ];

  const internalArgRows = [
    {
      name: ".with(Req)",
      desc: l.trans({
        en: "The raw `Request`, for a form body or a header Akan does not parse for you.",
        ko: "원본 `Request`입니다. Akan이 대신 파싱하지 않는 form body나 헤더를 읽을 때 씁니다.",
      }),
    },
    {
      name: ".with(Ip)",
      desc: l.trans({
        en: "The caller's IP as the nearest proxy recorded it, or `null` when no address is known at all.",
        ko: "가장 가까운 프록시가 기록한 호출자 IP이고, 주소를 전혀 알 수 없을 때만 `null`입니다.",
      }),
    },
    {
      name: ".with(Account)",
      desc: l.trans({
        en: "The verified account of the caller, imported from `@libs/shared/srvkit`.",
        ko: "검증된 호출자 계정입니다. `@libs/shared/srvkit`에서 가져옵니다.",
      }),
    },
  ];

  const internalBuilders = [
    {
      name: "cron(expression)",
      desc: l.trans({
        en: "Runs on a cron schedule, such as every midnight.",
        ko: "매일 자정처럼 cron 표현식이 정한 일정에 실행합니다.",
      }),
      example: 'purgeReceipts: cron("0 0 * * *").exec(...)',
    },
    {
      name: "interval(ms)",
      desc: l.trans({
        en: "Runs every `ms` milliseconds.",
        ko: "`ms` 밀리초마다 실행합니다.",
      }),
    },
    {
      name: "timeout(ms)",
      desc: l.trans({
        en: "Runs once, `ms` milliseconds after the server starts.",
        ko: "서버가 시작되고 `ms` 밀리초 뒤에 한 번 실행합니다.",
      }),
    },
    {
      name: ["initialize()", "destroy()"],
      desc: l.trans({
        en: "Runs once when the process starts, and once when it stops.",
        ko: "프로세스가 시작할 때 한 번, 멈출 때 한 번 실행합니다.",
      }),
    },
    {
      name: "process(Type)",
      desc: l.trans({
        en: "A background queue job. `.msg()` names each field of its payload.",
        ko: "백그라운드 queue job입니다. `.msg()`로 payload의 각 필드에 이름을 붙입니다.",
      }),
      example: 'reprint: process(Boolean).msg("icecreamOrderId", ID).exec(...)',
    },
    {
      name: "resolveField(Type)",
      desc: l.trans({
        en: "Computes a model's `resolve` field. A service module has no model, so it never uses this.",
        ko: "모델의 `resolve` 필드 값을 계산합니다. 서비스 모듈에는 모델이 없으니 쓸 일이 없습니다.",
      }),
    },
  ];

  const scheduleOptions = [
    {
      key: "serverMode",
      type: '"federation" | "batch" | "all"',
      default: '"all"',
      desc: l.trans({
        en: 'Which server roles run it. `"batch"` runs on batch and `"all"` servers, never on federation.',
        ko: '어느 역할의 서버가 실행할지 정합니다. `"batch"`는 batch와 `"all"` 서버에서만 돌고 federation에서는 돌지 않습니다.',
      }),
    },
    {
      key: "operationMode",
      type: '("cloud" | "edge" | "local")[]',
      default: l.trans({ en: "every mode", ko: "모든 모드" }),
      desc: l.trans({
        en: 'Runs only where `AKAN_PUBLIC_OPERATION_MODE` is in the list, like `["cloud"]`.',
        ko: '`AKAN_PUBLIC_OPERATION_MODE`가 목록에 있을 때만 실행합니다. 예: `["cloud"]`.',
      }),
    },
    {
      key: "lock",
      type: "boolean",
      default: "true",
      desc: l.trans({
        en: "For `cron` and `interval`, skips a run while the previous one still runs in the same process.",
        ko: "`cron`과 `interval`에서, 같은 프로세스의 이전 실행이 아직 도는 중이면 이번 실행을 건너뜁니다.",
      }),
    },
    {
      key: "enabled",
      type: "boolean",
      default: "true",
      desc: l.trans({
        en: "`false` turns the job off without deleting its code.",
        ko: "`false`면 코드를 지우지 않고 작업을 끕니다.",
      }),
    },
  ];

  return (
    <Scroll>
      <Scroll.Slide id="signal-file" title="service.signal.ts">
        <Docs.Title>service.signal.ts</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "service.signal.ts is the door in front of a service module. The signal decides who may call and with which arguments, and the service decides what happens. You open it to add an endpoint, a scheduled job or a realtime room.",
              ko: "service.signal.ts는 서비스 모듈 앞에 달린 문입니다. 누가 어떤 인자로 호출할 수 있는지는 시그널이 정하고, 무슨 일이 일어나는지는 서비스가 정합니다. 엔드포인트나 예약 작업, 실시간 room을 추가할 때 이 파일을 엽니다.",
            })}
          </div>
          <Docs.SubSubTitle>{l.trans({ en: "Words used on this page", ko: "이 페이지에서 쓰는 말" })}</Docs.SubSubTitle>
          <Docs.IntroTable type={l.trans({ en: "Term", ko: "용어" })} items={termRows} />

          <Docs.SubSubTitle>
            {l.trans({ en: "Two classes, not three", ko: "클래스는 셋이 아니라 둘" })}
          </Docs.SubSubTitle>
          <div>
            {l.trans({
              en: "A model module's signal declares three classes. A service module's declares two, because it has no table to put a slice in front of:",
              ko: "모델 모듈의 시그널은 클래스를 세 개 선언합니다. 서비스 모듈은 슬라이스를 앞에 둘 테이블이 없어서 두 개만 선언합니다:",
            })}
          </div>
          <Docs.Matrix
            type={l.trans({ en: "Class", ko: "클래스" })}
            columns={moduleColumns}
            groups={classGroups}
            markLabel={l.trans({ en: "Declared", ko: "선언함" })}
            emptyLabel={l.trans({ en: "Not declared", ko: "선언하지 않음" })}
          />
          <div>
            {l.trans({
              en: "Here is the whole file for a receipt module with one endpoint:",
              ko: "엔드포인트 하나를 가진 영수증 모듈의 파일 전체입니다:",
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/koyo/lib/_receipt/receipt.signal.ts"
            code={`import { Every } from "@libs/shared/srvkit";
import { ID } from "akanjs/base";
import { endpoint, internal } from "akanjs/signal";

import * as srv from "../srv";

export class ReceiptInternal extends internal(srv.receipt, () => ({})) {}

export class ReceiptEndpoint extends endpoint(srv.receipt, ({ mutation }) => ({
  printReceipt: mutation(Boolean, { guards: [Every] })
    .param("icecreamOrderId", ID)
    .exec(async function (icecreamOrderId) {
      return await this.receiptService.print(icecreamOrderId);
    }),
})) {}`}
          />
          <ul className="my-4 list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>The Internal class stays, even empty.</strong> It marks where scheduled work goes.
                  </>
                ),
                ko: (
                  <>
                    <strong>Internal 클래스는 비어 있어도 남깁니다.</strong> 예약 작업이 들어갈 자리를 표시합니다.
                  </>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>
                      <code>exec</code> is one line.
                    </strong>{" "}
                    It hands the arguments to the service and returns what the service returns.
                  </>
                ),
                ko: (
                  <>
                    <strong>
                      <code>exec</code>은 한 줄입니다.
                    </strong>{" "}
                    인자를 서비스에 넘기고, 서비스가 돌려준 값을 그대로 돌려줍니다.
                  </>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>The signal adds the noun back.</strong> The service method is <code>print</code> and the
                    endpoint is <code>printReceipt</code>, so <code>st.do.printReceipt</code> reads like{" "}
                    <code>fetch.printReceipt</code>.
                  </>
                ),
                ko: (
                  <>
                    <strong>시그널은 명사를 다시 붙입니다.</strong> 서비스 메서드는 <code>print</code>, 엔드포인트는{" "}
                    <code>printReceipt</code>입니다. 그래서 <code>st.do.printReceipt</code>와{" "}
                    <code>fetch.printReceipt</code>가 같은 이름으로 읽힙니다.
                  </>
                ),
              })}
            </li>
          </ul>

          <Docs.SubSubTitle>
            {l.trans({ en: "Common mistake: an endpoint with no guards", ko: "흔한 실수: 가드 없는 엔드포인트" })}
          </Docs.SubSubTitle>
          <div>
            {l.trans({
              en: (
                <span>
                  This <code>libs/util</code> file used to have the shape to avoid. The red line is how it read; the
                  green line is the fix it carries now:
                </span>
              ),
              ko: (
                <span>
                  <code>libs/util</code>의 이 파일은 원래 피해야 할 모양이었습니다. 빨간 줄이 예전 모습이고, 초록 줄이
                  지금 들어가 있는 수정입니다:
                </span>
              ),
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="libs/util/lib/_security/security.signal.ts"
            code={`import { endpoint, internal, None } from "akanjs/signal";

import * as srv from "../srv";

export class SecurityInternal extends internal(srv.security, () => ({})) {}

export class SecurityEndpoint extends endpoint(srv.security, ({ mutation }) => ({
  encrypt: mutation(String) // [!code --]
  encrypt: mutation(String, { guards: [None], mcp: false }) // [!code ++]
    .body("data", String)
    .exec(async function (data) {
      return await this.securityService.encrypt(data);
    }),
})) {}`}
          />
          <Docs.Alert type="error">
            {l.trans({
              en: (
                <span>
                  <strong>An endpoint that names no guards runs zero checks.</strong> Without one, anyone could encrypt
                  any input with the app's own key, which turns <code>encrypt</code> into an oracle. A library that
                  cannot reach <code>libs/shared</code>'s <code>Admin</code> closes the endpoint with{" "}
                  <code>[None]</code> and keeps it off MCP with <code>mcp: false</code>.
                </span>
              ),
              ko: (
                <span>
                  <strong>가드를 하나도 적지 않은 엔드포인트는 아무 검사도 하지 않습니다.</strong> 가드가 없으면 누구나
                  앱의 키로 아무 입력이나 암호화할 수 있어서 <code>encrypt</code>가 암호화 오라클이 됩니다.{" "}
                  <code>libs/shared</code>의 <code>Admin</code>에 닿지 못하는 라이브러리는 <code>[None]</code>으로
                  엔드포인트를 닫고, <code>mcp: false</code>로 MCP에서도 뺍니다.
                </span>
              ),
            })}
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide
        id="guards"
        title={l.trans({ en: "Every Endpoint Names Its Guards", ko: "엔드포인트마다 가드를 적는다" })}
      >
        <Docs.Title>
          {l.trans({ en: "Every Endpoint Names Its Guards", ko: "엔드포인트마다 가드를 적는다" })}
        </Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  In a model module, the slice's guards map covers the generated CRUD endpoints. A service module has no
                  slice, so there is no default to inherit: each endpoint writes its own <code>guards</code> array right
                  beside it.
                </span>
              ),
              ko: (
                <span>
                  모델 모듈에서는 슬라이스의 guards 맵이 생성된 CRUD 엔드포인트를 덮어 줍니다. 서비스 모듈에는
                  슬라이스가 없어서 물려받을 기본값이 없습니다. 엔드포인트마다 자기 <code>guards</code> 배열을 바로 옆에
                  적습니다.
                </span>
              ),
            })}
          </div>
          <div>
            {l.trans({
              en: "The same array also decides whether AI agents see the endpoint over MCP:",
              ko: "이 배열은 AI 에이전트가 MCP로 그 엔드포인트를 볼 수 있는지도 함께 정합니다:",
            })}
          </div>
          <Docs.Matrix
            type={l.trans({ en: "What the endpoint declares", ko: "엔드포인트에 적은 것" })}
            columns={exposureColumns}
            groups={exposureGroups}
            markLabel={l.trans({ en: "Yes", ko: "예" })}
            emptyLabel={l.trans({ en: "No", ko: "아니요" })}
          />
          <div>
            {l.trans({
              en: "An open endpoint is fine when it is a decision, written down as one. The docs app's own signal does exactly that:",
              ko: "열어 둔 엔드포인트도 그것이 결정이고, 결정으로 적혀 있다면 괜찮습니다. 이 문서 앱의 시그널이 바로 그렇게 합니다:",
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/akan/lib/_doc/doc.signal.ts"
            code={`import { Int } from "akanjs/base";
import { endpoint, internal, Public } from "akanjs/signal";

import * as cnst from "../cnst";
import { Err } from "../dict";
import * as srv from "../srv";

export class DocInternal extends internal(srv.doc, () => ({})) {}

/**
 * The framework's own documentation, served to agents.
 *
 * \`[Public]\` on every one of these is the decision, not an omission: the corpus is the same markdown the site
 * already serves anonymously under \`/llms/pages\`, so a guard here would protect nothing while making the tools
 * unusable to the agents they exist for.
 */
export class DocEndpoint extends endpoint(srv.doc, ({ query }) => ({
  listDocPages: query([cnst.DocPage], { guards: [Public] })
    .search("section", cnst.DocSection)
    .exec(async function (section) {
      return await this.docService.listPages(section);
    }),

  readDocPage: query(String, { guards: [Public] })
    .param("href", String, { example: "/references/akanjs/signal" })
    .exec(async function (href) {
      // An href that names nothing is the caller's own mistake, and an agent that gets it wrong needs to be told
      // so rather than handed an empty page it would go on to summarize.
      const body = await this.docService.readPage(href);
      if (!body) throw new Err("doc.error.docPageNotFound");
      return body;
    }),

  searchDocPages: query([cnst.DocPage], { guards: [Public] })
    .param("text", String, { example: "cascade remove" })
    .search("limit", Int)
    .exec(async function (text, limit) {
      return await this.docService.searchPages(text, limit);
    }),
})) {}`}
          />
          <ul className="my-4 list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>
                      <code>[Public]</code> is the decision here.
                    </strong>{" "}
                    The same markdown is already served anonymously under <code>/llms/pages</code>, so a guard would
                    protect nothing and lock out the agents these tools exist for.
                  </>
                ),
                ko: (
                  <>
                    <strong>
                      여기서 <code>[Public]</code>은 결정입니다.
                    </strong>{" "}
                    같은 마크다운을 <code>/llms/pages</code>에서 이미 누구에게나 제공하고 있습니다. 가드를 달아도 지키는
                    것은 없고, 이 도구가 존재하는 이유인 에이전트만 막게 됩니다.
                  </>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>The class comment says why.</strong> Why an obvious alternative was rejected is one of the
                    few kinds of comment this codebase keeps.
                  </>
                ),
                ko: (
                  <>
                    <strong>클래스 주석이 이유를 말합니다.</strong> 그럴듯한 대안을 왜 버렸는지는 이 코드베이스가 남기는
                    몇 안 되는 주석 종류 중 하나입니다.
                  </>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>
                      A miss is an <code>Err</code>, not an empty page.
                    </strong>{" "}
                    <code>readDocPage</code> throws <code>doc.error.docPageNotFound</code> so an agent is told it asked
                    for nothing.
                  </>
                ),
                ko: (
                  <>
                    <strong>
                      없는 페이지는 빈 값이 아니라 <code>Err</code>입니다.
                    </strong>{" "}
                    <code>readDocPage</code>는 <code>doc.error.docPageNotFound</code>를 던져, 에이전트가 없는 것을
                    물었다는 사실을 알게 합니다.
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
                    <code>[Public]</code> on a mutation is having no guard, spelled out.
                  </strong>{" "}
                  MCP refuses a <code>mutation</code> whose only guard is <code>Public</code>, just as it refuses one
                  with no guards at all. Which guard to use when is on the{" "}
                  <Link href="/cheatsheet/general/auth" className={inlineLink}>
                    Authorization
                  </Link>{" "}
                  cheatsheet.
                </span>
              ),
              ko: (
                <span>
                  <strong>
                    mutation에 붙은 <code>[Public]</code>은 가드가 없다는 말을 적어 놓은 것과 같습니다.
                  </strong>{" "}
                  MCP는 가드가 <code>Public</code> 하나뿐인 <code>mutation</code>을 가드가 아예 없는 것과 똑같이
                  거절합니다. 어떤 가드를 언제 쓰는지는{" "}
                  <Link href="/cheatsheet/general/auth" className={inlineLink}>
                    인증과 권한
                  </Link>{" "}
                  치트시트에 정리되어 있습니다.
                </span>
              ),
            })}
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="custom-routes" title={l.trans({ en: "Routes A Protocol Fixes", ko: "프로토콜이 정한 경로" })}>
        <Docs.Title>{l.trans({ en: "Routes A Protocol Fixes", ko: "프로토콜이 정한 경로" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  Most endpoints are reached through the path Akan builds, and nobody types it. A protocol endpoint is
                  different: RFC 8414 fixes the metadata document at{" "}
                  <code>/.well-known/oauth-authorization-server</code>, and a client that does not find it there has
                  nowhere else to look.
                </span>
              ),
              ko: (
                <span>
                  대부분의 엔드포인트는 Akan이 만든 경로로 호출되고, 그 URL을 직접 칠 일은 없습니다. 프로토콜
                  엔드포인트는 다릅니다. RFC 8414는 메타데이터 문서 위치를{" "}
                  <code>/.well-known/oauth-authorization-server</code>로 정해 두었고, 클라이언트는 거기서 못 찾으면 달리
                  찾아볼 곳이 없습니다.
                </span>
              ),
            })}
          </div>
          <div>
            {l.trans({
              en: (
                <span>
                  <code>libs/shared</code> puts its OAuth endpoints exactly where the RFCs say:
                </span>
              ),
              ko: (
                <span>
                  <code>libs/shared</code>는 OAuth 엔드포인트를 RFC가 정한 자리에 그대로 둡니다:
                </span>
              ),
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="libs/shared/lib/_oauth/oauth.signal.ts"
            code={`import { Account } from "@libs/shared/srvkit";
import { Any } from "akanjs/base";
import { endpoint, Ip, Public, Req } from "akanjs/signal";

import * as srv from "../srv";

// The protocol endpoints live at the origin's root, where RFC 8414 and the clients look for them, and are \`mcp: false\`
// because they are the way onto the shelf rather than anything on it. \`[Public]\` is the decision: a client holds no
// credential yet, which is what it is here to obtain.
const protocolRoute = { guards: [Public], prefix: false as const, globalPrefix: false as const, mcp: false as const };

export class OauthEndpoint extends endpoint(srv.oauth, ({ query, mutation }) => ({
  oauthAuthorizationServerMetadata: query(Any, {
    ...protocolRoute,
    path: ".well-known/oauth-authorization-server",
  }).exec(function () {
    return this.oauthService.metadata();
  }),

  authorizeOAuth: query(Any, { ...protocolRoute, path: "oauth/authorize" })
    .with(Req)
    .with(Account, { nullable: true })
    .exec(async function (req, account) {
      return await this.oauthService.authorize(req, account);
    }),

  // Nullable: a child reached over a unix socket learns the caller only from the gateway's headers, and a
  // deployment that lost them should register under a shared, wider bucket rather than refuse every client.
  registerOAuthClient: mutation(Any, { ...protocolRoute, path: "oauth/register" })
    .with(Req)
    .with(Ip, { nullable: true })
    .exec(async function (req, ip) {
      return await this.oauthService.register(await req.json().catch(() => null), ip);
    }),
})) {}`}
          />
          <div>
            {l.trans({
              en: (
                <span>
                  Four options place a route. One shared <code>protocolRoute</code> const keeps the five protocol
                  endpoints from disagreeing about them:
                </span>
              ),
              ko: (
                <span>
                  경로의 위치는 옵션 네 개가 정합니다. 공유 const <code>protocolRoute</code> 하나가 프로토콜 엔드포인트
                  다섯 개의 옵션을 한 가지로 맞춰 줍니다:
                </span>
              ),
            })}
          </div>
          <Docs.OptionTable items={routeOptions} />
          <ul className="my-4 list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>
                      <code>[Public]</code> is the decision again.
                    </strong>{" "}
                    A client holds no credential yet, and getting one is why it came.
                  </>
                ),
                ko: (
                  <>
                    <strong>
                      여기서도 <code>[Public]</code>은 결정입니다.
                    </strong>{" "}
                    클라이언트는 아직 자격 증명이 없고, 그것을 받으러 온 것입니다.
                  </>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>
                      <code>prefix: false</code> states the root position outright.
                    </strong>{" "}
                    A service module adds no prefix anyway, so the line documents intent rather than changing the route.
                  </>
                ),
                ko: (
                  <>
                    <strong>
                      <code>prefix: false</code>는 루트 자리임을 분명히 적은 것입니다.
                    </strong>{" "}
                    서비스 모듈은 원래 접두사를 붙이지 않으니, 이 줄은 경로를 바꾸기보다 의도를 밝혀 둡니다.
                  </>
                ),
              })}
            </li>
          </ul>

          <Docs.SubSubTitle>
            {l.trans({ en: "Values the server fills in", ko: "서버가 채워 주는 값" })}
          </Docs.SubSubTitle>
          <div>
            {l.trans({
              en: (
                <span>
                  <code>.with(X)</code> hands <code>exec</code> a value the caller never sends, after the declared
                  arguments:
                </span>
              ),
              ko: (
                <span>
                  <code>.with(X)</code>는 호출자가 보내지 않는 값을 선언한 인자들 뒤에 붙여 <code>exec</code>에
                  넘깁니다:
                </span>
              ),
            })}
          </div>
          <Docs.IntroTable type={l.trans({ en: "Internal argument", ko: "내부 인자" })} items={internalArgRows} />
          <ul className="my-4 list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>Missing means refused, unless nullable.</strong> A <code>null</code> value without{" "}
                    <code>{"{ nullable: true }"}</code> rejects the call as <code>Unauthorized</code>.{" "}
                    <code>authorizeOAuth</code> and <code>registerOAuthClient</code> opt in because they answer
                    strangers.
                  </>
                ),
                ko: (
                  <>
                    <strong>nullable이 아니면, 값이 없을 때 거절됩니다.</strong> <code>{"{ nullable: true }"}</code>{" "}
                    없이 값이 <code>null</code>이면 호출은 <code>Unauthorized</code>로 거절됩니다.{" "}
                    <code>authorizeOAuth</code>와 <code>registerOAuthClient</code>는 처음 보는 상대에게도 답해야 해서
                    nullable을 적습니다.
                  </>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>Never read the IP off the socket.</strong> Behind the gateway every peer is{" "}
                    <code>127.0.0.1</code>, which is why <code>Ip</code> reads what a proxy recorded.
                  </>
                ),
                ko: (
                  <>
                    <strong>IP를 소켓에서 직접 읽지 마세요.</strong> 게이트웨이 뒤에서는 모든 peer가{" "}
                    <code>127.0.0.1</code>입니다. 그래서 <code>Ip</code>는 프록시가 기록한 값을 읽습니다.
                  </>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>Never take the acting user from the body.</strong> Read it with <code>.with(Account)</code>,{" "}
                    <code>Self</code> or <code>Me</code>, which the caller cannot forge.
                  </>
                ),
                ko: (
                  <>
                    <strong>행위자를 body 값으로 받지 마세요.</strong> 호출자가 위조할 수 없는{" "}
                    <code>.with(Account)</code>, <code>Self</code>, <code>Me</code>로 읽습니다.
                  </>
                ),
              })}
            </li>
          </ul>

          <Docs.SubSubTitle>
            {l.trans({ en: "Return a Response as it is", ko: "Response를 그대로 돌려주기" })}
          </Docs.SubSubTitle>
          <div>
            {l.trans({
              en: (
                <span>
                  A <code>Response</code> returned from <code>exec</code> is sent as it stands, with no serialization.
                  The OAuth endpoints use it to answer with the exact status, headers or 302 redirect a client expects.{" "}
                  <code>localFile</code> uses it to stream a file back with no copy:
                </span>
              ),
              ko: (
                <span>
                  <code>exec</code>이 돌려준 <code>Response</code>는 직렬화 없이 그대로 전송됩니다. OAuth 엔드포인트는
                  이것으로 클라이언트가 기다리는 상태 코드와 헤더, 302 redirect를 정확히 돌려줍니다.{" "}
                  <code>localFile</code>은 이것으로 파일을 복사 없이 흘려보냅니다:
                </span>
              ),
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="libs/util/lib/_localFile/localFile.signal.ts"
            code={`export class LocalFileEndpoint extends endpoint(srv.localFile, ({ query }) => ({
  getBlob: query(Any, { guards: [Public], path: "localFile/getBlob/*", mcp: false }) // [!code highlight]
    .with(Req)
    .exec(async function (req) {
      const path = req.url.split("/localFile/getBlob/").slice(1).join("/localFile/getBlob/");
      return await this.localFileService.serveLocalFile(path);
    }),
})) {}`}
          />
          <ul className="my-4 list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>
                      <code>[Public]</code> makes anonymous reads a stated decision.
                    </strong>{" "}
                    <code>mcp: false</code> keeps the file stream off the MCP shelf.
                  </>
                ),
                ko: (
                  <>
                    <strong>
                      <code>[Public]</code>을 적어 익명 읽기를 명시된 결정으로 만듭니다.
                    </strong>{" "}
                    <code>mcp: false</code>로 파일 스트림을 MCP 목록에서 뺍니다.
                  </>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>
                      <code>*</code> matches the rest of the URL.
                    </strong>{" "}
                    <code>exec</code> reads the file path back out of <code>req.url</code>.
                  </>
                ),
                ko: (
                  <>
                    <strong>
                      <code>*</code>는 URL의 나머지 전부와 맞습니다.
                    </strong>{" "}
                    <code>exec</code>은 <code>req.url</code>에서 파일 경로를 다시 꺼내 읽습니다.
                  </>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>The file goes out the way Bun sends a file.</strong> The service sets no Content-Type, so
                    Bun types the body by its stored name and answers a Range with 206, and the response is neither
                    buffered nor compressed. Every answer but a PDF's carries <code>nosniff</code> and a sandboxing
                    Content-Security-Policy, so an uploaded HTML or SVG never runs on the API's origin.
                  </>
                ),
                ko: (
                  <>
                    <strong>파일은 Bun이 파일을 보내는 방식 그대로 나갑니다.</strong> 서비스가 Content-Type을 달지
                    않으므로 Bun이 저장된 이름으로 타입을 정하고 Range에는 206으로 답하며, 응답을 버퍼링하거나 압축하지
                    않습니다. PDF를 뺀 모든 응답에 <code>nosniff</code>와 sandbox Content-Security-Policy가 붙으므로,
                    업로드한 HTML이나 SVG가 API 오리진에서 실행되지 않습니다.
                  </>
                ),
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="internal" title={l.trans({ en: "Work The Runtime Starts", ko: "런타임이 시작하는 일" })}>
        <Docs.Title>{l.trans({ en: "Work The Runtime Starts", ko: "런타임이 시작하는 일" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  <code>internal()</code> holds work the runtime starts on its own: a schedule, a queue job, a step at
                  boot or shutdown. The runtime is the only caller, so there is no request to authorize and no guards to
                  write.
                </span>
              ),
              ko: (
                <span>
                  <code>internal()</code>에는 런타임이 스스로 시작하는 일을 둡니다. 예약 작업, queue job, 부팅이나 종료
                  때의 한 단계 같은 것입니다. 호출자가 런타임뿐이라 인가할 요청이 없고, 가드도 적지 않습니다.
                </span>
              ),
            })}
          </div>
          <Docs.IntroTable type={l.trans({ en: "Builder", ko: "빌더" })} items={internalBuilders} />
          <div>
            {l.trans({
              en: "A job that should run once a night, not once per server, names the batch worker:",
              ko: "서버마다 한 번씩이 아니라 밤마다 딱 한 번 돌아야 하는 작업은 batch 워커를 지정합니다:",
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/koyo/lib/_receipt/receipt.signal.ts"
            code={`import { Every } from "@libs/shared/srvkit";
import { ID } from "akanjs/base";
import { endpoint, internal } from "akanjs/signal";

import * as srv from "../srv";

export class ReceiptInternal extends internal(srv.receipt, ({ cron }) => ({ // [!code ++]
  purgeReceipts: cron("0 0 * * *", { serverMode: "batch" }).exec(async function () { // [!code ++]
    await this.receiptService.purgeExpired(); // [!code ++]
  }), // [!code ++]
})) {} // [!code ++]

export class ReceiptEndpoint extends endpoint(srv.receipt, ({ mutation }) => ({
  printReceipt: mutation(Boolean, { guards: [Every] })
    .param("icecreamOrderId", ID)
    .exec(async function (icecreamOrderId) {
      return await this.receiptService.print(icecreamOrderId);
    }),
})) {}`}
          />
          <div>
            {l.trans({
              en: (
                <span>
                  Every builder except <code>resolveField</code> takes these options as its last argument:
                </span>
              ),
              ko: (
                <span>
                  <code>resolveField</code>를 뺀 모든 빌더는 마지막 인자로 이 옵션을 받습니다:
                </span>
              ),
            })}
          </div>
          <Docs.OptionTable items={scheduleOptions} />
          <ul className="my-4 list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>
                      Match the service's <code>serverMode</code>.
                    </strong>{" "}
                    When the service declares one, the internal must declare the same, or the job is scheduled where
                    that service is switched off.
                  </>
                ),
                ko: (
                  <>
                    <strong>
                      서비스의 <code>serverMode</code>와 맞춥니다.
                    </strong>{" "}
                    서비스가 serverMode를 선언했다면 internal도 같은 값을 적어야 합니다. 그렇지 않으면 그 서비스가 꺼진
                    프로세스에 작업이 예약됩니다.
                  </>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>Empty is normal.</strong> All eight service modules in this workspace still have an empty
                    Internal class; that is its shape until the first scheduled job arrives.
                  </>
                ),
                ko: (
                  <>
                    <strong>비어 있는 것이 보통입니다.</strong> 이 워크스페이스의 서비스 모듈 여덟 개는 모두 아직
                    Internal 클래스가 비어 있습니다. 첫 예약 작업이 생기기 전까지는 그 모습입니다.
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
                    <code>lock</code> does not coordinate servers.
                  </strong>{" "}
                  It only skips an overlapping run inside one process. Every server whose role matches runs its own
                  copy, so give run-once work <code>serverMode: "batch"</code> and run a single batch worker.
                </span>
              ),
              ko: (
                <span>
                  <strong>
                    <code>lock</code>은 서버 사이를 조율하지 않습니다.
                  </strong>{" "}
                  한 프로세스 안에서 겹치는 실행만 건너뜁니다. 역할이 맞는 서버는 각자 자기 사본을 실행하므로, 한 번만
                  돌아야 하는 작업은 <code>serverMode: "batch"</code>로 두고 batch 워커를 하나만 띄웁니다.
                </span>
              ),
            })}
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="realtime" title={l.trans({ en: "Realtime Without A Model", ko: "모델 없이 실시간" })}>
        <Docs.Title>{l.trans({ en: "Realtime Without A Model", ko: "모델 없이 실시간" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  <code>pubsub</code> and <code>message</code> need no table either, so a service module can carry a
                  realtime feature on its own. Both ride the websocket:
                </span>
              ),
              ko: (
                <span>
                  <code>pubsub</code>과 <code>message</code>에도 테이블은 필요 없습니다. 그래서 서비스 모듈만으로도
                  실시간 기능을 만들 수 있습니다. 둘 다 웹소켓으로 오갑니다:
                </span>
              ),
            })}
          </div>
          <div className={cardGridRecipe({ cols: "mdTwo" }, "my-4")}>
            <div className={panelRecipe({ radius: "lg", padding: "sm" }, "min-w-0")}>
              <div className="font-semibold text-primary">pubsub</div>
              <div className="mt-1 text-foreground/70 text-sm">
                {l.trans({
                  en: "A room clients subscribe to. It declares the room's arguments and the payload type.",
                  ko: "클라이언트가 구독하는 room입니다. room 인자와 payload 타입을 선언합니다.",
                })}
              </div>
              <code className={chip}>pubsub(Any).room("roomId", String)</code>
            </div>
            <div className={panelRecipe({ radius: "lg", padding: "sm" }, "min-w-0")}>
              <div className="font-semibold text-primary">message</div>
              <div className="mt-1 text-foreground/70 text-sm">
                {l.trans({
                  en: (
                    <span>
                      One frame a client sends. Each field is declared with <code>.msg()</code>, and <code>exec</code>{" "}
                      answers it.
                    </span>
                  ),
                  ko: (
                    <span>
                      클라이언트가 보내는 frame 하나입니다. 필드마다 <code>.msg()</code>로 선언하고, <code>exec</code>이
                      답합니다.
                    </span>
                  ),
                })}
              </div>
              <code className={chip}>message(Boolean).msg("seq", Int)</code>
            </div>
          </div>
          <div>
            {l.trans({
              en: "The minimal app pairs one of each for a fan-out benchmark:",
              ko: "minimal 앱은 fan-out 벤치마크를 위해 둘을 하나씩 짝지어 둡니다:",
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/minimal/lib/_minimal/minimal.signal.ts"
            code={`export class MinimalEndpoint extends endpoint(srv.minimal, ({ query, message, pubsub }) => ({
  benchFanout: pubsub(Any, { guards: [Public], mcp: false })
    .room("roomId", String)
    .exec(() => undefined),
  benchPublish: message(Boolean, { guards: [Public], mcp: false })
    .msg("roomId", String)
    .msg("seq", Int)
    .msg("sentAt", Int)
    .exec(async function (roomId, seq, sentAt) {
      return await this.minimalService.publishBenchFanout(roomId, seq, sentAt);
    }),
})) {}`}
          />
          <div>
            {l.trans({
              en: (
                <span>
                  The service publishes into the room through its own signal, injected with{" "}
                  <code>{"signal<sig.Minimal>()"}</code>:
                </span>
              ),
              ko: (
                <span>
                  서비스는 <code>{"signal<sig.Minimal>()"}</code>로 주입받은 자기 시그널을 통해 room에 발행합니다:
                </span>
              ),
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/minimal/lib/_minimal/minimal.service.ts"
            code={`export class MinimalService extends serve("minimal" as const, { serverMode: "batch" }, ({ signal }) => ({
  minimalSignal: signal<sig.Minimal>(),
})) {
  async publishBenchFanout(roomId: string, seq: number, sentAt: number) {
    await this.minimalSignal.benchFanout(roomId, { seq, sentAt });
    return true;
  }
}`}
          />
          <ul className="my-4 list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>
                      Declare <code>Binary</code> for bytes.
                    </strong>{" "}
                    <code>pubsub(Binary)</code> skips the JSON envelope and, under backpressure, keeps only the newest
                    frame. Add <code>{'{ backpressure: "queue" }'}</code> when every frame matters.
                  </>
                ),
                ko: (
                  <>
                    <strong>
                      바이트라면 <code>Binary</code>로 선언합니다.
                    </strong>{" "}
                    <code>pubsub(Binary)</code>는 JSON 봉투를 건너뛰고, backpressure가 걸리면 가장 최신 frame만
                    남깁니다. frame을 하나도 빠짐없이 받아야 한다면 <code>{'{ backpressure: "queue" }'}</code>를
                    더합니다.
                  </>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>Neither reaches MCP.</strong> Agents never see a <code>pubsub</code> or a{" "}
                    <code>message</code>, whatever its guards say.
                  </>
                ),
                ko: (
                  <>
                    <strong>둘 다 MCP에는 나가지 않습니다.</strong> 가드를 어떻게 적든 에이전트는 <code>pubsub</code>과{" "}
                    <code>message</code>를 보지 못합니다.
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
                    A <code>pubsub</code> or <code>message</code> is open until it names its own <code>guards</code>.
                  </strong>{" "}
                  Nothing above covers it, not even a slice default in a model module. Both endpoints above say{" "}
                  <code>[Public]</code> only because <code>minimal</code> is a benchmark app, not an example. A room's
                  guards re-run whenever the socket's credential changes.
                </span>
              ),
              ko: (
                <span>
                  <strong>
                    <code>pubsub</code>과 <code>message</code>는 자기 <code>guards</code>를 적기 전까지 열려 있습니다.
                  </strong>{" "}
                  위쪽의 무엇도 덮어 주지 않고, 모델 모듈의 슬라이스 기본값도 닿지 않습니다. 위 두 엔드포인트가{" "}
                  <code>[Public]</code>인 것은 <code>minimal</code>이 예시가 아니라 벤치마크 앱이기 때문입니다. room의
                  가드는 소켓의 자격 증명이 바뀔 때마다 다시 실행됩니다.
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
