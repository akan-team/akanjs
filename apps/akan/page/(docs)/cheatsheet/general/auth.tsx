import { usePage } from "@apps/akan/client";
import { Code, cardGridRecipe, Divider, Docs, DocsToc, panelRecipe } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { page } from "akanjs/client";

export default page()
  .config({ transition: "fade" })
  .head(({ lang }) => {
    const title = lang === "ko" ? "일반: 인증과 권한 | Akan.js" : "General: Authorization | Akan.js";
    const description =
      lang === "ko"
        ? "가드와 scope, 에이전트 노출 — Akan이 엔드포인트 호출 권한을 판정하는 방식."
        : "Guards, scope and agent exposure: how Akan decides who may call an endpoint.";
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

    const steps = [
      l.trans({
        en: (
          <>
            <strong>Middleware reads the caller.</strong> <code>AccountMiddleware</code> from <code>libs/shared</code>{" "}
            verifies the token and leaves the result on the call as the account.
          </>
        ),
        ko: (
          <>
            <strong>미들웨어가 호출자를 읽습니다.</strong> <code>libs/shared</code>의 <code>AccountMiddleware</code>가
            토큰을 검증하고, 그 결과를 account로 호출에 붙여 둡니다.
          </>
        ),
      }),
      l.trans({
        en: (
          <>
            <strong>Guards decide.</strong> Each guard in the <code>guards</code> array answers{" "}
            <code>canPass(context)</code> in declaration order, and the first refusal ends the call.
          </>
        ),
        ko: (
          <>
            <strong>가드가 판정합니다.</strong> <code>guards</code> 배열의 가드가 선언 순서대로{" "}
            <code>canPass(context)</code>에 답하고, 처음 거절한 곳에서 호출이 끝납니다.
          </>
        ),
      }),
      l.trans({
        en: (
          <>
            <strong>Internal arguments hand the handler its values.</strong> <code>.with(Self)</code> and its kind fill
            in values the server resolved, never ones the client typed.
          </>
        ),
        ko: (
          <>
            <strong>내부 인자가 핸들러에 값을 넘깁니다.</strong> <code>.with(Self)</code> 같은 인자는 클라이언트가 보낸
            값이 아니라 서버가 채운 값입니다.
          </>
        ),
      }),
    ];

    const termRows = [
      {
        name: "account",
        desc: l.trans({
          en: "What the middleware leaves on the call. A guest's account holds neither `self` nor `me`.",
          ko: "미들웨어가 호출에 붙여 두는 값입니다. 비로그인 호출자의 account에는 `self`도 `me`도 없습니다.",
        }),
      },
      {
        name: ["self", "me"],
        desc: l.trans({
          en: "The two identities an account can carry: `self` is the user, `me` is the admin.",
          ko: "account가 가질 수 있는 두 신원입니다. `self`는 사용자, `me`는 관리자입니다.",
        }),
      },
      {
        name: "scope",
        href: "#scope",
        desc: l.trans({
          en: "What a guard needs to answer: the caller alone (`account`) or the call's arguments (`resource`).",
          ko: "가드가 판정에 필요로 하는 것입니다. 호출자만 보거나(`account`), 호출 인자까지 봅니다(`resource`).",
        }),
      },
      {
        name: "agent",
        href: "#agent-exposure",
        desc: l.trans({
          en: "An AI model calling through the MCP endpoint or on an OAuth token, instead of a person.",
          ko: "사람 대신 MCP 엔드포인트나 OAuth 토큰으로 호출하는 AI 모델입니다.",
        }),
      },
    ];

    const sliceGuardRows = [
      {
        key: "root",
        type: "GuardCls | GuardCls[]",
        desc: l.trans({
          en: "The root slice: an admin list API that takes a filter name and its args. Always `Admin`.",
          ko: "root 슬라이스입니다. 필터 이름과 그 인자를 받는 관리자용 목록 API라서 항상 `Admin`입니다.",
        }),
      },
      {
        key: "get",
        type: "GuardCls | GuardCls[]",
        desc: l.trans({
          en: "The single-document reads `icecreamOrder(id)` and `lightIcecreamOrder(id)`.",
          ko: "문서 하나를 읽는 `icecreamOrder(id)`와 `lightIcecreamOrder(id)`입니다.",
        }),
      },
      {
        key: "cru",
        type: "GuardCls | GuardCls[]",
        desc: l.trans({
          en: "`createIcecreamOrder`, `updateIcecreamOrder` and `removeIcecreamOrder` together.",
          ko: "`createIcecreamOrder`, `updateIcecreamOrder`, `removeIcecreamOrder`를 함께 맡습니다.",
        }),
      },
      {
        key: "create",
        type: "GuardCls | GuardCls[]",
        default: "cru",
        desc: l.trans({
          en: "Overrides `cru` for `createIcecreamOrder` alone.",
          ko: "`createIcecreamOrder`에만 `cru` 대신 적용됩니다.",
        }),
      },
      {
        key: "update",
        type: "GuardCls | GuardCls[]",
        default: "cru",
        desc: l.trans({
          en: "Overrides `cru` for `updateIcecreamOrder` alone.",
          ko: "`updateIcecreamOrder`에만 `cru` 대신 적용됩니다.",
        }),
      },
      {
        key: "remove",
        type: "GuardCls | GuardCls[]",
        default: "cru",
        desc: l.trans({
          en: "Overrides `cru` for `removeIcecreamOrder` alone.",
          ko: "`removeIcecreamOrder`에만 `cru` 대신 적용됩니다.",
        }),
      },
    ];

    const guardRules = [
      l.trans({
        en: (
          <>
            <strong>
              Every <code>slice()</code> takes a guards map, and <code>root:</code> is always <code>Admin</code>.
            </strong>{" "}
            The root slice lets its caller pick any filter the model declares, which is an admin's job.
          </>
        ),
        ko: (
          <>
            <strong>
              모든 <code>slice()</code>에 guards 맵을 주고, <code>root:</code>는 항상 <code>Admin</code>입니다.
            </strong>{" "}
            root 슬라이스는 모델에 선언된 필터를 호출자가 골라 쓰는 API라서 관리자의 일입니다.
          </>
        ),
      }),
      l.trans({
        en: (
          <>
            <strong>A named slice and a custom endpoint never inherit the map.</strong> Each names its own array,{" "}
            <code>{"init({ guards: [...] })"}</code> or <code>{"mutation(..., { guards: [...] })"}</code>, so a reader
            sees who may call it without opening another file.
          </>
        ),
        ko: (
          <>
            <strong>이름 있는 슬라이스와 커스텀 엔드포인트는 이 맵을 물려받지 않습니다.</strong>{" "}
            <code>{"init({ guards: [...] })"}</code>나 <code>{"mutation(..., { guards: [...] })"}</code>처럼 자기 배열을
            직접 적으므로, 다른 파일을 열지 않고도 누가 호출할 수 있는지 보입니다.
          </>
        ),
      }),
      l.trans({
        en: (
          <>
            <strong>The generated CRUD stays admin-only here.</strong> Customers reach their own orders through
            endpoints that read the caller, shown further down.
          </>
        ),
        ko: (
          <>
            <strong>이 예제에서 자동 생성 CRUD는 관리자 전용입니다.</strong> 고객은 호출자를 읽는 엔드포인트로 자기
            주문에 닿으며, 그 방법은 아래에서 다룹니다.
          </>
        ),
      }),
    ];

    const guardColumns = [
      { key: "anon", label: l.trans({ en: "Guest", ko: "비로그인" }) },
      { key: "user", label: "user", code: true },
      { key: "admin", label: "admin", code: true },
      { key: "superAdmin", label: "superAdmin", code: true },
    ];

    const guardGroups = [
      {
        label: "akanjs/signal",
        rows: [
          {
            name: "Public",
            desc: l.trans({
              en: "Passes everyone, guests and agents included. For a slice `get:`, never a mutation.",
              ko: "비로그인 호출자와 에이전트까지 모두 통과시킵니다. 슬라이스의 `get:`에 쓰고, mutation에는 쓰지 않습니다.",
            }),
            marks: { anon: true, user: true, admin: true, superAdmin: true },
          },
          {
            name: "None",
            desc: l.trans({
              en: "Refuses everyone: the explicit way to close a generated endpoint.",
              ko: "모두 거절합니다. 자동 생성된 엔드포인트를 명시적으로 닫을 때 씁니다.",
            }),
            marks: {},
          },
        ],
      },
      {
        label: "@libs/shared/srvkit",
        rows: [
          {
            name: "Every",
            desc: l.trans({
              en: "Any signed-in caller: `user`, `admin` or `superAdmin`.",
              ko: "로그인한 호출자라면 `user`, `admin`, `superAdmin` 누구든 통과합니다.",
            }),
            marks: { user: true, admin: true, superAdmin: true },
          },
          {
            name: "User",
            desc: l.trans({
              en: "The `user` role only. An admin who is not also a user is refused.",
              ko: "`user` 역할만 통과합니다. 사용자를 겸하지 않은 관리자는 거절됩니다.",
            }),
            marks: { user: true },
          },
          {
            name: "Admin",
            desc: l.trans({
              en: "`admin` or `superAdmin`. The admin-console guard, and every slice's `root:`.",
              ko: "`admin` 또는 `superAdmin`입니다. 관리자 콘솔용 가드이자 모든 슬라이스의 `root:`입니다.",
            }),
            marks: { admin: true, superAdmin: true },
          },
          {
            name: "SuperAdmin",
            desc: l.trans({ en: "`superAdmin` only.", ko: "`superAdmin`만 통과합니다." }),
            marks: { superAdmin: true },
          },
          {
            name: "Owner",
            desc: l.trans({
              en: "The roles of `Every`, but `resource` scope: judged at call time, never in a listing.",
              ko: "허용 역할은 `Every`와 같지만 `resource` scope라서, 목록에서는 평가하지 않고 호출 시점에 판정합니다.",
            }),
            marks: { user: true, admin: true, superAdmin: true },
          },
          {
            name: "SelfOrAdmin",
            desc: l.trans({
              en: "`resource` scope. The user the `userId` argument names, or an admin; no `userId` refuses all.",
              ko: "`resource` scope입니다. `userId` 인자가 가리키는 사용자나 관리자만 통과하고, `userId`가 없으면 모두 거절합니다.",
            }),
            marks: { user: true, admin: true, superAdmin: true },
          },
          {
            name: "Person",
            desc: l.trans({
              en: "Passes any person and refuses an agent. Pair it with a role guard: `guards: [Every, Person]`.",
              ko: "사람은 누구든 통과시키고 에이전트는 거절합니다. 역할 가드와 함께 씁니다: `guards: [Every, Person]`.",
            }),
            marks: { anon: true, user: true, admin: true, superAdmin: true },
          },
        ],
      },
    ];

    const refusalRows = [
      {
        caller: l.trans({ en: "Role guard: no identity at all", ko: "역할 가드: 신원이 아예 없음" }),
        status: "401",
        meaning: l.trans({
          en: "An MCP client reads this status as “obtain a token”.",
          ko: "MCP 클라이언트는 이 상태 코드를 “토큰을 받아 오라”로 읽습니다.",
        }),
      },
      {
        caller: l.trans({ en: "Role guard: signed in, lacks the role", ko: "역할 가드: 로그인했지만 역할이 없음" }),
        status: "403",
        meaning: l.trans({
          en: "Names the roles required and the roles the caller holds.",
          ko: "필요한 역할과 호출자가 가진 역할을 함께 알려 줍니다.",
        }),
      },
      {
        caller: l.trans({ en: "Any guard: returns `false`", ko: "모든 가드: `false`를 돌려줌" }),
        status: "403",
        meaning: l.trans({
          en: "Names the guard that refused, by its `static name`.",
          ko: "거절한 가드를 `static name`으로 알려 줍니다.",
        }),
      },
      {
        caller: l.trans({
          en: "Internal argument: a required `.with()` value is `null`",
          ko: "내부 인자: 필수 `.with()` 값이 `null`",
        }),
        status: "401",
        meaning: l.trans({
          en: "Names the missing argument; mark it `{ nullable: true }` if the handler can do without it.",
          ko: "빠진 인자의 이름을 알려 주며, 그 값 없이도 도는 핸들러라면 `{ nullable: true }`를 붙입니다.",
        }),
      },
    ];

    const scopeCards = [
      {
        title: 'scope = "account"',
        code: "SignedIn · Every · Admin · Person",
        desc: l.trans({
          en: "The verdict reads the caller and nothing about the call, so it runs with no arguments. An agent listing uses it to hide what this caller certainly cannot use.",
          ko: "호출자만 보고 호출 내용은 보지 않으므로 인자 없이도 평가할 수 있습니다. 에이전트 목록은 이 값으로 호출자가 확실히 못 쓰는 항목을 숨깁니다.",
        }),
      },
      {
        title: 'scope = "resource"',
        code: "Can<Verb><Model> · Owner · SelfOrAdmin",
        desc: l.trans({
          en: (
            <span>
              It reads the call's arguments through <code>context.getArg()</code> and refuses without them, so a listing
              never evaluates it. The entry stays visible and is stopped at call time.
            </span>
          ),
          ko: (
            <span>
              <code>context.getArg()</code>로 호출 인자를 읽고 인자가 없으면 거절하므로, 목록에서는 평가하지 않습니다.
              항목은 보이게 두고 실제 호출 시점에 막습니다.
            </span>
          ),
        }),
      },
    ];

    const patternNotes = [
      l.trans({
        en: (
          <>
            <strong>Admin bypass goes first.</strong> An admin never owns the record, so an ownership test above the
            bypass locks the admin console out of its own data.
          </>
        ),
        ko: (
          <>
            <strong>관리자 우회를 맨 앞에 둡니다.</strong> 관리자는 레코드의 소유자가 아니므로, 소유권 검사를 우회보다
            위에 두면 관리자 콘솔이 자기 데이터에서 잠깁니다.
          </>
        ),
      }),
      l.trans({
        en: (
          <>
            <strong>
              No resource named ⇒ <code>false</code>.
            </strong>{" "}
            Returning <code>true</code> here would pass every call that forgot to send the argument.
          </>
        ),
        ko: (
          <>
            <strong>
              가리키는 리소스가 없으면 <code>false</code>입니다.
            </strong>{" "}
            여기서 <code>true</code>를 돌려주면 인자를 빠뜨린 모든 호출이 통과합니다.
          </>
        ),
      }),
      l.trans({
        en: (
          <>
            <strong>
              A load that throws ⇒ warn, then <code>false</code>.
            </strong>{" "}
            A database hiccup must not read as permission granted, and the warn is the only sign that the guard refuses
            for the wrong reason.
          </>
        ),
        ko: (
          <>
            <strong>
              로드가 실패하면 warn을 남기고 <code>false</code>입니다.
            </strong>{" "}
            데이터베이스가 잠깐 흔들린 것이 허가로 읽혀서는 안 되고, warn은 가드가 엉뚱한 이유로 거절하고 있다는 유일한
            흔적입니다.
          </>
        ),
      }),
      l.trans({
        en: (
          <>
            <strong>
              <code>static name</code> stays.
            </strong>{" "}
            It looks like dead code, but fetch serializes guard names onto every endpoint and the API explorer filters
            on them; deleting it breaks that UI.
          </>
        ),
        ko: (
          <>
            <strong>
              <code>static name</code>은 지우지 않습니다.
            </strong>{" "}
            죽은 코드처럼 보이지만, fetch가 가드 이름을 모든 엔드포인트에 직렬화하고 API 탐색기가 그 이름으로 거릅니다.
            지우면 그 UI가 깨집니다.
          </>
        ),
      }),
    ];

    const everyGuardNotes = [
      l.trans({
        en: (
          <>
            <strong>
              Read the caller with <code>context.get("account")</code>.
            </strong>{" "}
            It answers the same over HTTP, a websocket and MCP; branching on <code>getHttpContext()</code> does not.
          </>
        ),
        ko: (
          <>
            <strong>
              호출자는 <code>context.get("account")</code>로 읽습니다.
            </strong>{" "}
            HTTP, 웹소켓, MCP 어디서든 같은 값을 주지만, <code>getHttpContext()</code>로 분기하면 그렇지 않습니다.
          </>
        ),
      }),
      l.trans({
        en: (
          <>
            <strong>No side effects.</strong> When a socket's credential changes, the guards of every room it joined run
            again outside any request.
          </>
        ),
        ko: (
          <>
            <strong>부수 효과를 만들지 않습니다.</strong> 웹소켓의 자격 증명이 바뀌면, 그 소켓이 구독한 모든 방의 가드가
            요청 밖에서 다시 실행됩니다.
          </>
        ),
      }),
      l.trans({
        en: (
          <>
            <strong>No per-call state on the instance.</strong> One instance of each guard class serves every call, so a
            field set in one call is seen by the next.
          </>
        ),
        ko: (
          <>
            <strong>인스턴스에 호출별 상태를 두지 않습니다.</strong> 가드 클래스마다 인스턴스 하나가 모든 호출을
            처리하므로, 한 호출에서 쓴 필드를 다음 호출이 봅니다.
          </>
        ),
      }),
    ];

    const gateNotes = [
      l.trans({
        en: (
          <>
            <strong>Guards ship with the library that owns the model.</strong> Its own signals import them, so an app
            that mounts the library inherits the authorization and cannot forget it.
          </>
        ),
        ko: (
          <>
            <strong>가드는 모델을 가진 라이브러리와 함께 배포됩니다.</strong> 그 라이브러리의 signal이 직접
            import하므로, 라이브러리를 마운트한 앱은 권한 검사를 그대로 물려받고 빠뜨릴 수 없습니다.
          </>
        ),
      }),
      l.trans({
        en: (
          <>
            <strong>The service re-checks ownership anyway.</strong> A service method is also reached from another
            service, a cron trigger or a queue job, and none of those passed a guard.
          </>
        ),
        ko: (
          <>
            <strong>그래도 서비스는 소유권을 한 번 더 확인합니다.</strong> 서비스 메서드는 다른 서비스, cron 트리거, 큐
            작업에서도 불리고, 이 경로들은 가드를 거치지 않습니다.
          </>
        ),
      }),
    ];

    const actingNotes = [
      l.trans({
        en: (
          <>
            <strong>
              <code>.with(Self)</code>
            </strong>{" "}
            hands <code>listMyIcecreamOrders</code> the signed-in user, so the client sends no id at all.
          </>
        ),
        ko: (
          <>
            <strong>
              <code>.with(Self)</code>
            </strong>
            가 <code>listMyIcecreamOrders</code>에 로그인한 사용자를 넘겨주므로, 클라이언트는 id를 보내지 않습니다.
          </>
        ),
      }),
      l.trans({
        en: (
          <>
            <strong>
              <code>{"{ nullable: true }"}</code>
            </strong>{" "}
            lets <code>refundIcecreamOrder</code> run without an admin. Without it, a <code>null</code> value answers
            401 Unauthorized, which is the safe default.
          </>
        ),
        ko: (
          <>
            <strong>
              <code>{"{ nullable: true }"}</code>
            </strong>
            를 붙였기 때문에 <code>refundIcecreamOrder</code>는 관리자가 아니어도 실행됩니다. 붙이지 않으면 값이{" "}
            <code>null</code>일 때 401 Unauthorized로 답하며, 이것이 안전한 기본값입니다.
          </>
        ),
      }),
      l.trans({
        en: (
          <>
            <strong>
              <code>.with(AgentCall)</code>
            </strong>{" "}
            keeps the refund open to an agent but skips the customer mail when one drives it. To refuse agents outright,
            use <code>guards: [Every, Person]</code> instead.
          </>
        ),
        ko: (
          <>
            <strong>
              <code>.with(AgentCall)</code>
            </strong>
            는 에이전트도 환불할 수 있게 두되, 에이전트가 호출하면 고객 메일은 보내지 않습니다. 에이전트를 아예 막으려면{" "}
            <code>guards: [Every, Person]</code>을 씁니다.
          </>
        ),
      }),
    ];

    const internalArgRows = [
      {
        name: ".with(Self)",
        desc: l.trans({
          en: "The signed-in user, or `null`. The one to reach for in a user-facing endpoint.",
          ko: "로그인한 사용자, 없으면 `null`입니다. 사용자용 엔드포인트에서 기본으로 씁니다.",
        }),
      },
      {
        name: ".with(Me)",
        desc: l.trans({
          en: "The signed-in admin, or `null`. `Self` and `Me` are two identities on one account, not two roles.",
          ko: "로그인한 관리자, 없으면 `null`입니다. `Self`와 `Me`는 한 신원의 두 역할이 아니라, 한 account의 두 신원입니다.",
        }),
      },
      {
        name: ".with(Account)",
        desc: l.trans({
          en: "The whole account, for a handler that branches on both identities at once.",
          ko: "account 전체입니다. 두 신원을 한꺼번에 봐야 하는 핸들러에서 씁니다.",
        }),
      },
      {
        name: ".with(AgentCall)",
        desc: l.trans({
          en: "`true` when an agent drives the call. It narrows what the call does, not who may make it.",
          ko: "사람이 아니라 에이전트가 호출하고 있으면 `true`입니다. 누가 호출할 수 있는지가 아니라 그 호출이 무엇을 일으킬지를 좁힙니다.",
        }),
      },
      {
        name: "CurrentUserId",
        desc: l.trans({
          en: "The workspace scaffold writes it to `srvkit/internalArgs.ts`, for handlers needing only an id.",
          ko: "워크스페이스 스캐폴드가 `srvkit/internalArgs.ts`에 넣어 주는 인자로, id만 필요한 핸들러용입니다.",
        }),
      },
      {
        name: ["Ip", "Ws", "Req", "Res"],
        desc: l.trans({
          en: "From `akanjs/signal`: the caller's IP, the websocket, and the raw HTTP request and response.",
          ko: "`akanjs/signal`에 있습니다. 호출자의 IP, 웹소켓, 가공하지 않은 HTTP 요청과 응답입니다.",
        }),
      },
    ];

    const bothServe = { http: true, mcp: true };
    const httpOnly = { http: true };
    const exposureGroups = [
      {
        label: l.trans({ en: "Decided by the guards", ko: "가드가 정하는 것" }),
        rows: [
          {
            name: "guards: [Every]",
            desc: l.trans({
              en: "A real guard publishes the endpoint, and the same guard judges every call on both.",
              ko: "실제로 판정하는 가드가 있으면 공개되고, 양쪽 모두에서 호출마다 판정하는 것도 그 가드입니다.",
            }),
            marks: bothServe,
          },
          {
            name: <span className="font-sans">{l.trans({ en: "no guards", ko: "guards 없음" })}</span>,
            desc: l.trans({
              en: "Every call is refused with 403, and outside local operation the server does not boot. Write `guards: [Public]` if anonymous access is the intent.",
              ko: "모든 호출이 403으로 거절되고, local 운영이 아니면 서버가 부팅하지 않습니다. 익명 접근이 의도라면 `guards: [Public]`이라고 적으세요.",
            }),
            marks: {},
          },
          {
            name: "query · [Public]",
            desc: l.trans({
              en: "Anonymous access, written down: a query publishes.",
              ko: "익명 접근을 명시한 것이므로 query는 공개됩니다.",
            }),
            marks: bothServe,
          },
          {
            name: "mutation · [Public]",
            desc: l.trans({
              en: "Not published, though HTTP serves it to anonymous callers.",
              ko: "공개되지 않지만, HTTP로는 익명 호출자에게도 제공됩니다.",
            }),
            marks: httpOnly,
          },
          {
            name: "[Every, Person]",
            desc: l.trans({
              en: "`Person` sets `static agents = false`: the act is gone from the catalogue, not hidden per caller.",
              ko: "`Person`은 `static agents = false`를 선언하므로, 호출자별로 숨는 것이 아니라 카탈로그에서 아예 빠집니다.",
            }),
            marks: httpOnly,
          },
        ],
      },
      {
        label: l.trans({ en: "Your own choice", ko: "직접 고르는 것" }),
        rows: [
          {
            name: "mcp: false",
            desc: l.trans({
              en: "Off the shelf, guards untouched. Curation, not authorization: HTTP serves it as before.",
              ko: "가드는 그대로 두고 에이전트 목록에서만 내립니다. 권한이 아니라 큐레이션이라 HTTP는 이전처럼 제공합니다.",
            }),
            marks: httpOnly,
          },
          {
            name: "mcp: { cru: false }",
            desc: l.trans({
              en: "The same on `slice()`, as a map keyed like its `guards` map.",
              ko: "`slice()`에서 같은 일을 하려면 guards 맵과 키가 같은 맵으로 적습니다.",
            }),
            marks: httpOnly,
          },
        ],
      },
    ];

    return (
      <Scroll>
        <Scroll.Slide id="overview" title={l.trans({ en: "Authorization", ko: "인증과 권한" })}>
          <Docs.Title>{l.trans({ en: "Authorization", ko: "인증과 권한" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: "You ship the order list for a shop with several branches, and every row looks right because the branch id comes from the URL. Then a customer edits the URL, and the same endpoint hands them somebody else's orders.",
                ko: "지점이 여러 개인 가게의 주문 목록을 배포했습니다. 지점 id를 URL에서 꺼내니 화면의 모든 행이 제대로 보입니다. 그런데 고객이 URL을 고치자, 같은 엔드포인트가 남의 주문을 그대로 내어 줍니다.",
              })}
            </div>
            <div>
              {l.trans({
                en: "Authorization answers two questions in front of every endpoint: who is calling, and may they do this? Three steps answer them, the same over HTTP, a websocket or the MCP endpoint:",
                ko: "권한 검사는 모든 엔드포인트 앞에서 두 가지를 묻습니다. 누가 호출했는가, 그리고 이 일을 해도 되는가입니다. HTTP, 웹소켓, MCP 엔드포인트 어느 쪽으로 오든 같은 세 단계로 답합니다:",
              })}
            </div>
            <ol className="my-4 list-decimal space-y-2 pl-5">
              {steps.map((step, idx) => (
                <li key={idx}>{step}</li>
              ))}
            </ol>
            <Docs.SubSubTitle>
              {l.trans({ en: "Words used on this page", ko: "이 페이지에서 쓰는 말" })}
            </Docs.SubSubTitle>
            <Docs.IntroTable type={l.trans({ en: "Term", ko: "용어" })} items={termRows} />
            <Docs.Flow
              title={l.trans({ en: "One call, from the door to the handler", ko: "호출 하나가 핸들러에 닿기까지" })}
              direction="TB"
              nodes={{
                request: {
                  label: l.trans({ en: "Request", ko: "요청" }),
                  lines: ["HTTP · websocket · MCP"],
                },
                args: { label: l.trans({ en: "Arguments parsed", ko: "인자 파싱" }) },
                middleware: {
                  label: l.trans({ en: "Middleware", ko: "미들웨어" }),
                  lines: ["Logging · Timeout · Account"],
                },
                guards: {
                  label: l.trans({ en: "guards array", ko: "guards 배열" }),
                  lines: [l.trans({ en: "in declaration order", ko: "선언 순서대로" })],
                },
                internal: {
                  label: l.trans({ en: "Internal arguments", ko: "내부 인자" }),
                  lines: [".with(Self) · .with(Me)"],
                },
                handler: { label: l.trans({ en: "exec() handler", ko: "exec() 핸들러" }) },
                resolve: {
                  label: "resolveReturn",
                  lines: [l.trans({ en: "hidden and secret fields masked", ko: "hidden·secret 필드 마스킹" })],
                },
                denied: { label: "401 · 403", tone: "danger" },
              }}
              edges={[
                ["request", "args"],
                ["args", "middleware"],
                ["middleware", "guards"],
                ["guards", "internal"],
                ["internal", "handler"],
                ["handler", "resolve"],
                ["guards", "denied", { label: l.trans({ en: "first refusal", ko: "첫 거절" }), dashed: true }],
              ]}
              emphasis={["guards"]}
            />
            <Docs.Alert type="error">
              {l.trans({
                en: (
                  <span>
                    <strong>No guards array means no caller.</strong> An endpoint that names no <code>guards</code>{" "}
                    answers every call with 403, and outside local operation the server does not boot with one. Name the
                    guards it needs, or <code>[Public]</code> when anonymous access is the intent.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>guards 배열이 없으면 아무도 호출할 수 없습니다.</strong> <code>guards</code>를 적지 않은
                    엔드포인트는 모든 호출에 403으로 답하고, local 운영이 아니면 그런 엔드포인트가 있는 서버는 부팅하지
                    않습니다. 필요한 가드를 적거나, 익명 접근이 의도라면 <code>[Public]</code>을 적으세요.
                  </span>
                ),
              })}
            </Docs.Alert>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="guards" title={l.trans({ en: "The Guards That Ship", ko: "기본 제공 가드" })}>
          <Docs.Title>{l.trans({ en: "The Guards That Ship", ko: "기본 제공 가드" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: (
                  <span>
                    A guard is a class with one method, <code>canPass</code>. A slice names guards in its{" "}
                    <code>guards</code> map, and every custom endpoint in its own <code>guards</code> array:
                  </span>
                ),
                ko: (
                  <span>
                    가드는 <code>canPass</code> 메서드 하나를 가진 클래스입니다. 슬라이스는 <code>guards</code> 맵에,
                    커스텀 엔드포인트는 자기 <code>guards</code> 배열에 가드를 적습니다:
                  </span>
                ),
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="apps/koyo/lib/icecreamOrder/icecreamOrder.signal.ts"
              code={`import { Admin, Every, Self } from "@libs/shared/srvkit";
import { ID } from "akanjs/base";
import { endpoint, internal, slice } from "akanjs/signal";

import * as cnst from "../cnst";
import * as srv from "../srv";

export class IcecreamOrderInternal extends internal(srv.icecreamOrder, () => ({})) {}

export class IcecreamOrderSlice extends slice(
  srv.icecreamOrder,
  { guards: { root: Admin, get: Admin, cru: Admin } }, // [!code highlight]
  () => ({}),
) {}

export class IcecreamOrderEndpoint extends endpoint(srv.icecreamOrder, ({ mutation }) => ({
  cancelIcecreamOrder: mutation(cnst.IcecreamOrder, { guards: [Every] }) // [!code highlight]
    .param("icecreamOrderId", ID)
    .with(Self)
    .exec(async function (icecreamOrderId, self) {
      return await this.icecreamOrderService.cancel(icecreamOrderId, self.id);
    }),
})) {}`}
            />
            <ul className={bulletList}>
              {guardRules.map((note, idx) => (
                <li key={idx}>{note}</li>
              ))}
            </ul>

            <Docs.SubSubTitle>
              {l.trans({ en: "Keys of the slice guards map", ko: "슬라이스 guards 맵의 키" })}
            </Docs.SubSubTitle>
            <div>
              {l.trans({
                en: "Each key guards the endpoints the slice generates for the model:",
                ko: "각 키는 슬라이스가 모델에 대해 만들어 주는 엔드포인트를 지킵니다:",
              })}
            </div>
            <Docs.OptionTable items={sliceGuardRows} />

            <Docs.SubSubTitle>{l.trans({ en: "Guards on the shelf", ko: "기본 제공 가드 목록" })}</Docs.SubSubTitle>
            <div>
              {l.trans({
                en: (
                  <span>
                    <code>akanjs/signal</code> ships two guards that judge nobody. <code>@libs/shared/srvkit</code>{" "}
                    ships the role ladder that every app mounting <code>libs/shared</code> inherits.
                  </span>
                ),
                ko: (
                  <span>
                    <code>akanjs/signal</code>에는 누구도 가려내지 않는 가드 두 개가 있습니다.{" "}
                    <code>@libs/shared/srvkit</code>에는 <code>libs/shared</code>를 마운트한 모든 앱이 물려받는 역할
                    사다리가 있습니다.
                  </span>
                ),
              })}
            </div>
            <Docs.Matrix
              type={l.trans({ en: "Guard", ko: "가드" })}
              columns={guardColumns}
              groups={guardGroups}
              markLabel={l.trans({ en: "Passes", ko: "통과" })}
              emptyLabel={l.trans({ en: "Refused", ko: "거절" })}
            />
            <div>
              {l.trans({
                en: (
                  <span>
                    An agent's token carries the same <code>self</code> or <code>me</code> as the person who granted it,
                    so every guard above except <code>Person</code> judges the agent like that person.
                  </span>
                ),
                ko: (
                  <span>
                    에이전트의 토큰에는 접근을 허락한 사람과 같은 <code>self</code>나 <code>me</code>가 실려 있습니다.
                    그래서 위 표에서 <code>Person</code>을 뺀 모든 가드는 에이전트를 그 사람처럼 판정합니다.
                  </span>
                ),
              })}
            </div>

            <Docs.SubSubTitle>{l.trans({ en: "401 or 403", ko: "401인가 403인가" })}</Docs.SubSubTitle>
            <div>
              {l.trans({
                en: "Which status a refused call gets depends on where it was refused:",
                ko: "거절된 호출이 받는 상태 코드는 어디서 거절됐는지에 따라 다릅니다:",
              })}
            </div>
            <Docs.Table
              stacked
              columns={[
                { key: "caller", label: l.trans({ en: "Refused because", ko: "거절 이유" }) },
                { key: "status", label: l.trans({ en: "Status", ko: "상태" }), code: true },
                { key: "meaning", label: l.trans({ en: "What the caller learns", ko: "호출자가 받는 것" }) },
              ]}
              rows={refusalRows}
            />
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="scope" title={l.trans({ en: "Declare The Scope", ko: "scope 선언하기" })}>
          <Docs.Title>{l.trans({ en: "Declare The Scope", ko: "scope 선언하기" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: (
                  <span>
                    Every guard class also declares <code>static scope: GuardScope</code>, required and with no default.
                    It says what the guard needs in order to answer, so an agent catalogue can evaluate some guards
                    before any call exists.
                  </span>
                ),
                ko: (
                  <span>
                    모든 가드 클래스는 <code>static scope: GuardScope</code>도 선언해야 하며, 기본값은 없습니다. 이 값은
                    가드가 판정에 무엇이 필요한지 알려 주고, 덕분에 에이전트 카탈로그는 호출이 오기 전에 일부 가드를
                    미리 평가할 수 있습니다.
                  </span>
                ),
              })}
            </div>
            <div>
              {l.trans({
                en: (
                  <span>
                    A guard that reads only the caller is <code>{'"account"'}</code>:
                  </span>
                ),
                ko: (
                  <span>
                    호출자만 읽는 가드는 <code>{'"account"'}</code>로 표시합니다:
                  </span>
                ),
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="apps/koyo/srvkit/guards.ts"
              code={`import type { Guard, GuardScope, SignalContext } from "akanjs/signal";

export class SignedIn implements Guard {
  // fetch serializes guard names and the API explorer filters on them; deleting this breaks that UI.
  static name = "SignedIn";
  static scope: GuardScope = "account"; // [!code highlight]

  canPass(context: SignalContext): boolean {
    return !!context.get<{ self?: { id: string } }>("account")?.self;
  }
}`}
            />
            <div className={cardGridRecipe({ cols: "mdTwo" }, "my-4")}>
              {scopeCards.map(({ title, code, desc }) => (
                <div key={title} className={panelRecipe({ radius: "lg", padding: "sm" }, "min-w-0")}>
                  <div className="font-mono font-semibold text-primary text-sm">{title}</div>
                  <code className={chip}>{code}</code>
                  <div className="mt-2 text-foreground/70 text-sm">{desc}</div>
                </div>
              ))}
            </div>

            <Docs.SubSubTitle>{l.trans({ en: "Marking it wrong", ko: "잘못 표시했을 때" })}</Docs.SubSubTitle>
            <div>
              {l.trans({
                en: (
                  <span>
                    Neither mistake is a type error: both strings satisfy <code>GuardScope</code>, and the compiler
                    cannot see whether <code>canPass</code> reads an argument. The two fail differently:
                  </span>
                ),
                ko: (
                  <span>
                    어느 쪽으로 잘못 적어도 타입 에러는 나지 않습니다. 두 문자열 모두 <code>GuardScope</code>를
                    만족하고, <code>canPass</code>가 인자를 읽는지는 컴파일러가 알 수 없기 때문입니다. 두 실수는 이렇게
                    다르게 실패합니다:
                  </span>
                ),
              })}
            </div>
            <Docs.Table
              stacked
              columns={[
                { key: "mistake", label: l.trans({ en: "Mistake", ko: "실수" }) },
                { key: "result", label: l.trans({ en: "What happens", ko: "결과" }) },
              ]}
              rows={[
                {
                  mistake: l.trans({
                    en: 'A resource guard marked `"account"`',
                    ko: 'resource 가드에 `"account"`를 표시함',
                  }),
                  result: l.trans({
                    en: "A listing runs it argument-free; it refuses or throws and hides the entry from legitimate callers.",
                    ko: "목록이 인자 없이 평가하므로 거절하거나 예외를 던지고, 쓸 수 있는 호출자에게서도 항목이 숨겨집니다.",
                  }),
                },
                {
                  mistake: l.trans({
                    en: 'An account guard marked `"resource"`',
                    ko: 'account 가드에 `"resource"`를 표시함',
                  }),
                  result: l.trans({
                    en: "It filters nothing: the entry is listed to every caller, even one it will refuse at call time.",
                    ko: "아무것도 걸러내지 못합니다. 호출 시점에 거절할 호출자에게까지 항목이 목록에 실립니다.",
                  }),
                },
              ]}
            />
            <div>
              {l.trans({
                en: (
                  <span>
                    <strong>Rule of thumb:</strong> <code>SignedIn</code>, <code>Admin</code> and every role check are{" "}
                    <code>{'"account"'}</code>; every <code>{"Can<Verb><Model>"}</code> is <code>{'"resource"'}</code>.
                    Among the shipped guards, only <code>Owner</code> and <code>SelfOrAdmin</code> are{" "}
                    <code>{'"resource"'}</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>기준:</strong> <code>SignedIn</code>, <code>Admin</code>, 모든 역할 검사는{" "}
                    <code>{'"account"'}</code>이고, 모든 <code>{"Can<Verb><Model>"}</code>은 <code>{'"resource"'}</code>
                    입니다. 기본 제공 가드 중 <code>{'"resource"'}</code>는 <code>Owner</code>와{" "}
                    <code>SelfOrAdmin</code>
                    뿐입니다.
                  </span>
                ),
              })}
            </div>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide
          id="resource-guard"
          title={l.trans({ en: "Resource Guards Fail Closed", ko: "리소스 가드: 모르면 거절" })}
        >
          <Docs.Title>{l.trans({ en: "Resource Guards Fail Closed", ko: "리소스 가드: 모르면 거절" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: (
                  <span>
                    A role guard answers who you are, not whether this record is yours. That is a{" "}
                    <code>{"Can<Verb><Model>"}</code> class in <code>srvkit/guards.ts</code>: it loads the record the
                    call names, then decides.
                  </span>
                ),
                ko: (
                  <span>
                    역할 가드는 호출자가 누구인지만 답할 뿐, 이 레코드가 호출자의 것인지는 답하지 못합니다. 그 판단은{" "}
                    <code>srvkit/guards.ts</code>의 <code>{"Can<Verb><Model>"}</code> 클래스가 맡으며, 호출이 가리키는
                    레코드를 직접 불러온 뒤 판정합니다.
                  </span>
                ),
              })}
            </div>

            <Docs.SubSubTitle>{l.trans({ en: "1. Write the guard", ko: "1. 가드 작성하기" })}</Docs.SubSubTitle>
            <div>
              {l.trans({
                en: (
                  <span>
                    Add it beside the other guards in <code>srvkit/guards.ts</code>:
                  </span>
                ),
                ko: (
                  <span>
                    <code>srvkit/guards.ts</code>에 다른 가드와 나란히 추가합니다:
                  </span>
                ),
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="apps/koyo/srvkit/guards.ts"
              code={`import { Logger } from "akanjs/common"; // [!code ++]
import type { Guard, GuardScope, SignalContext } from "akanjs/signal";
import type * as srv from "../lib/srv"; // [!code ++]

export class SignedIn implements Guard { // [!code collapse:9]
  // fetch serializes guard names and the API explorer filters on them; deleting this breaks that UI.
  static name = "SignedIn";
  static scope: GuardScope = "account";

  canPass(context: SignalContext): boolean {
    return !!context.get<{ self?: { id: string } }>("account")?.self;
  }
}

export class CanCancelIcecreamOrder implements Guard { // [!code ++:21]
  static name = "CanCancelIcecreamOrder";
  static scope: GuardScope = "resource";
  static #logger = new Logger("CanCancelIcecreamOrder");

  async canPass(context: SignalContext): Promise<boolean> {
    const account = context.get<{ self?: { id: string }; me?: { id: string } }>("account");
    if (account?.me) return true;
    const selfId = account?.self?.id;
    const icecreamOrderId = context.getArg<string>("icecreamOrderId");
    if (!selfId || !icecreamOrderId) return false;
    try {
      const service = context.getService<srv.IcecreamOrderService>("icecreamOrder");
      const icecreamOrder = await service.getIcecreamOrder(icecreamOrderId);
      return icecreamOrder.owner === selfId;
    } catch (error) {
      CanCancelIcecreamOrder.#logger.warn(\`cancel guard could not load \${icecreamOrderId}: \${String(error)}\`);
      return false;
    }
  }
}`}
            />
            <div>
              {l.trans({
                en: "Four things in that body are the pattern, not this model's details:",
                ko: "이 본문에서 다음 네 가지는 이 모델의 사정이 아니라 패턴입니다:",
              })}
            </div>
            <ul className={bulletList}>
              {patternNotes.map((note, idx) => (
                <li key={idx}>{note}</li>
              ))}
            </ul>
            <div>
              {l.trans({
                en: "Three more hold for every guard you write, not only resource guards:",
                ko: "리소스 가드뿐 아니라 직접 만드는 모든 가드에 세 가지가 더 적용됩니다:",
              })}
            </div>
            <ul className={bulletList}>
              {everyGuardNotes.map((note, idx) => (
                <li key={idx}>{note}</li>
              ))}
            </ul>

            <Docs.SubSubTitle>
              {l.trans({ en: "2. Name it on the endpoint", ko: "2. 엔드포인트에 적기" })}
            </Docs.SubSubTitle>
            <div>
              {l.trans({
                en: (
                  <span>
                    Put it after the role guard in the endpoint's own <code>guards</code> array:
                  </span>
                ),
                ko: (
                  <span>
                    엔드포인트의 <code>guards</code> 배열에서 역할 가드 뒤에 둡니다:
                  </span>
                ),
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="apps/koyo/lib/icecreamOrder/icecreamOrder.signal.ts"
              code={`import { CanCancelIcecreamOrder } from "@apps/koyo/srvkit"; // [!code ++]
import { Every, Self } from "@libs/shared/srvkit";
import { ID } from "akanjs/base";
import { endpoint } from "akanjs/signal";

import * as cnst from "../cnst";
import * as srv from "../srv";

export class IcecreamOrderEndpoint extends endpoint(srv.icecreamOrder, ({ mutation }) => ({
  cancelIcecreamOrder: mutation(cnst.IcecreamOrder, { guards: [Every, CanCancelIcecreamOrder] }) // [!code highlight]
    .param("icecreamOrderId", ID)
    .with(Self)
    .exec(async function (icecreamOrderId, self) {
      return await this.icecreamOrderService.cancel(icecreamOrderId, self.id);
    }),
})) {}`}
            />
            <div>
              {l.trans({
                en: (
                  <span>
                    <strong>Order matters.</strong> Guards run in declaration order and stop at the first refusal, so{" "}
                    <code>Every</code> answers an anonymous caller with 401 before the record is ever loaded.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>순서가 중요합니다.</strong> 가드는 선언 순서대로 실행되고 첫 거절에서 멈추므로,{" "}
                    <code>Every</code>가 비로그인 호출자에게 먼저 401로 답하고 레코드는 불러오지도 않습니다.
                  </span>
                ),
              })}
            </div>

            <Docs.SubSubTitle>
              {l.trans({ en: "Two independent gates", ko: "서로 독립된 두 개의 문" })}
            </Docs.SubSubTitle>
            <ul className={bulletList}>
              {gateNotes.map((note, idx) => (
                <li key={idx}>{note}</li>
              ))}
            </ul>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide
          id="acting-user"
          title={l.trans({ en: "The Acting User Comes From The Server", ko: "호출자 정보는 서버가 넣어 줍니다" })}
        >
          <Docs.Title>
            {l.trans({ en: "The Acting User Comes From The Server", ko: "호출자 정보는 서버가 넣어 줍니다" })}
          </Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: (
                  <span>
                    A guard decides whether the call runs; an internal argument tells the handler who is running it.{" "}
                    <code>.with(...)</code> reads that value from the account the middleware verified, after the guards
                    pass, and never from the request body.
                  </span>
                ),
                ko: (
                  <span>
                    가드는 호출을 실행할지 정하고, 내부 인자는 누가 실행하는지 핸들러에 알려 줍니다.{" "}
                    <code>.with(...)</code>는 가드를 통과한 뒤 미들웨어가 검증해 둔 account에서 그 값을 꺼내며, 요청
                    본문에서 읽는 일은 없습니다.
                  </span>
                ),
              })}
            </div>
            <div>
              {l.trans({
                en: "Two endpoints that read the caller:",
                ko: "호출자를 읽는 엔드포인트 두 개입니다:",
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="apps/koyo/lib/icecreamOrder/icecreamOrder.signal.ts"
              code={`import { AgentCall, Every, Me, Self, User } from "@libs/shared/srvkit";
import { ID } from "akanjs/base";
import { endpoint } from "akanjs/signal";

import * as cnst from "../cnst";
import * as srv from "../srv";

export class IcecreamOrderEndpoint extends endpoint(srv.icecreamOrder, ({ query, mutation }) => ({
  listMyIcecreamOrders: query([cnst.LightIcecreamOrder], { guards: [User] })
    .with(Self) // [!code highlight]
    .exec(async function (self) {
      return await this.icecreamOrderService.listByOwner(self.id);
    }),
  refundIcecreamOrder: mutation(cnst.IcecreamOrder, { guards: [Every] })
    .param("icecreamOrderId", ID)
    .with(Me, { nullable: true }) // [!code highlight]
    .with(AgentCall)
    .exec(async function (icecreamOrderId, me, isAgentCall) {
      return await this.icecreamOrderService.refund(icecreamOrderId, {
        byAdmin: !!me,
        notifyCustomer: !isAgentCall,
      });
    }),
})) {}`}
            />
            <ul className={bulletList}>
              {actingNotes.map((note, idx) => (
                <li key={idx}>{note}</li>
              ))}
            </ul>

            <Docs.SubSubTitle>
              {l.trans({ en: "Internal arguments on the shelf", ko: "기본 제공 내부 인자" })}
            </Docs.SubSubTitle>
            <div>
              {l.trans({
                en: (
                  <span>
                    <code>@libs/shared/srvkit</code> ships the first four. Write your own in <code>srvkit/</code> the
                    same way: a class with one <code>getArg(context)</code>.
                  </span>
                ),
                ko: (
                  <span>
                    앞의 네 개는 <code>@libs/shared/srvkit</code>에 있습니다. 직접 만들 때도 같은 모양으로,{" "}
                    <code>getArg(context)</code> 하나를 가진 클래스를 <code>srvkit/</code>에 둡니다.
                  </span>
                ),
              })}
            </div>
            <Docs.IntroTable type={l.trans({ en: "Internal argument", ko: "내부 인자" })} items={internalArgRows} />
            <Docs.Alert type="warning">
              {l.trans({
                en: (
                  <span>
                    <strong>Never take the acting user as a body or param.</strong> A <code>userId</code> the client
                    typed is a value the client chose: the handler cannot tell it from the caller's own id, and a guard
                    that already passed says nothing about it.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>호출자를 body나 param으로 받지 마세요.</strong> 클라이언트가 보낸 <code>userId</code>는
                    클라이언트가 고른 값입니다. 핸들러는 그 값을 호출자 자신의 id와 구분할 수 없고, 이미 통과한 가드도
                    그 값에 대해서는 아무것도 보장하지 않습니다.
                  </span>
                ),
              })}
            </Docs.Alert>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide
          id="agent-exposure"
          title={l.trans({ en: "Guards Are Also The Agent Decision", ko: "가드가 에이전트 공개도 정합니다" })}
        >
          <Docs.Title>
            {l.trans({ en: "Guards Are Also The Agent Decision", ko: "가드가 에이전트 공개도 정합니다" })}
          </Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: (
                  <span>
                    Every signal is also served to AI agents as an MCP server on <code>POST /mcp</code>, mounted by
                    default. There is no per-endpoint opt-in: the guards you already wrote decide what is published.
                  </span>
                ),
                ko: (
                  <span>
                    모든 signal은 기본으로 마운트되는 <code>POST /mcp</code>에서 MCP 서버로도 AI 에이전트에게
                    제공됩니다. 엔드포인트별로 켜는 스위치는 없고, 이미 적은 가드가 무엇을 공개할지 정합니다.
                  </span>
                ),
              })}
            </div>
            <div>
              {l.trans({
                en: "Guards are already the authorization decision, so a second switch would add nothing. It would only keep every endpoint added later invisible to agents until somebody remembered to flip it.",
                ko: "가드가 이미 권한 결정이므로 스위치를 하나 더 두어도 더해지는 것이 없습니다. 오히려 나중에 추가되는 엔드포인트마다, 누군가 스위치를 켜기 전까지 에이전트에게 보이지 않게 될 뿐입니다.",
              })}
            </div>
            <Docs.Matrix
              type={l.trans({ en: "Endpoint", ko: "엔드포인트" })}
              columns={[
                { key: "http", label: "HTTP" },
                { key: "mcp", label: "MCP" },
              ]}
              groups={exposureGroups}
              markLabel={l.trans({ en: "Served", ko: "제공" })}
              emptyLabel={l.trans({ en: "Left out", ko: "제외" })}
            />
            <Docs.Alert type="warning">
              {l.trans({
                en: (
                  <span>
                    <strong>Never make a refusal more helpful.</strong> A refused endpoint answers the <em>same</em>{" "}
                    unknown-tool error as one that does not exist, and a guard's 401 or 403 reaches the agent as one
                    generic sentence. The gap between “no such tool” and “you may not call it” is exactly what
                    enumerates your private surface.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>거절 메시지를 더 친절하게 만들지 마세요.</strong> 공개되지 않은 엔드포인트는 존재하지 않는
                    엔드포인트와 <em>똑같은</em> unknown tool 에러로 답하고, 가드의 401·403도 에이전트에게는 똑같은 문장
                    하나로 전달됩니다. “그런 툴은 없다”와 “그 툴은 부를 수 없다”의 차이가 바로 비공개 표면을 드러내는
                    단서입니다.
                  </span>
                ),
              })}
            </Docs.Alert>
            <Docs.SubSubTitle>{l.trans({ en: "Related pages", ko: "함께 볼 페이지" })}</Docs.SubSubTitle>
            <Docs.LinkGrid
              items={[
                {
                  href: "/cheatsheet/interface/mcp",
                  title: l.trans({ en: "MCP Server", ko: "MCP 서버" }),
                  desc: l.trans({
                    en: "Resource URIs, OAuth metadata, rate limits and the rest of the wire.",
                    ko: "resource URI, OAuth 메타데이터, rate limit 등 MCP 통신의 나머지 세부 사항입니다.",
                  }),
                },
                {
                  href: "/cheatsheet/general/mcp-auth",
                  title: l.trans({ en: "OAuth For Agents", ko: "에이전트를 위한 OAuth" }),
                  desc: l.trans({
                    en: "How an agent signs in and gets the token these guards judge.",
                    ko: "에이전트가 로그인해서, 이 가드들이 판정할 토큰을 받는 과정입니다.",
                  }),
                },
              ]}
            />
          </Docs.Description>
        </Scroll.Slide>
        <DocsToc />
      </Scroll>
    );
  });
