import { usePage } from "@apps/akan/client";
import { Code, Divider, Docs, DocsToc, type MatrixGroup } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { page } from "akanjs/client";

export default page().render(() => {
  const { l } = usePage();

  const bulletList = "my-4 list-disc space-y-2 pl-5";

  const termRows = [
    {
      name: "handle",
      desc: l.trans({
        en: "What `fetch.init*`, `fetch.view*` and `fetch.edit*` return. Await it, or read one field off it.",
        ko: "`fetch.init*`, `fetch.view*`, `fetch.edit*`가 돌려주는 값입니다. await하거나, 필드 하나만 꺼내 씁니다.",
      }),
    },
    {
      name: "payload",
      desc: l.trans({
        en: "Plain data a Zone receives, such as `userInitInOrg`. It can cross from server to client.",
        ko: "`userInitInOrg`처럼 Zone이 받는 일반 데이터입니다. 서버에서 클라이언트로 넘길 수 있습니다.",
      }),
    },
    {
      name: "hydrated instance",
      desc: l.trans({
        en: "A model class instance such as `cnst.User` or a `DataList`. It stays in server components.",
        ko: "`cnst.User`나 `DataList` 같은 모델 class 인스턴스입니다. 서버 컴포넌트 안에서만 씁니다.",
      }),
    },
    {
      name: "slice",
      desc: l.trans({
        en: "A named list query of one model. The `inOrg` slice of `user` gives `fetch.initUserInOrg`.",
        ko: "모델 하나에 이름을 붙인 목록 query입니다. `user`의 `inOrg` slice에서 `fetch.initUserInOrg`가 나옵니다.",
      }),
    },
    {
      name: "Zone",
      desc: l.trans({
        en: "A module's client component. It fills the store from a payload and renders it.",
        ko: "모듈의 클라이언트 컴포넌트입니다. payload로 store를 채우고 화면에 그립니다.",
      }),
    },
  ];

  const exportRows = [
    {
      name: ["InitHandle", "ViewHandle", "EditHandle"],
      desc: l.trans({
        en: "What `fetch.init*`, `fetch.view*` and `fetch.edit*` return: awaitable, or split per field.",
        ko: "`fetch.init*`, `fetch.view*`, `fetch.edit*`의 반환 타입입니다. await하거나 필드별로 나눠 씁니다.",
      }),
    },
    {
      name: "ClientInit",
      href: "#ClientInit",
      desc: l.trans({
        en: "Type of a Zone's `init` prop: a list payload or its promise.",
        ko: "Zone `init` prop의 타입입니다. 목록 payload 또는 그 promise입니다.",
      }),
    },
    {
      name: ["ClientView", "ClientEdit"],
      desc: l.trans({
        en: "Types of a Zone's `view` and `edit` props for one record.",
        ko: "레코드 하나를 받는 Zone `view`, `edit` prop의 타입입니다.",
      }),
    },
    {
      name: ["ServerInit", "ServerView", "ServerEdit"],
      desc: l.trans({
        en: "The same three payloads, already resolved instead of a promise.",
        ko: "위 세 타입에서 promise를 뺀, 이미 해소된 payload입니다.",
      }),
    },
    {
      name: "SliceMeta",
      href: "#SliceMeta",
      desc: l.trans({
        en: "Names the slice a component works on: `refName`, `sliceName` and `argLength`.",
        ko: "컴포넌트가 다루는 slice를 가리킵니다. `refName`, `sliceName`, `argLength` 세 필드입니다.",
      }),
    },
    {
      name: "FetchInitForm",
      href: "#FetchInitForm",
      desc: l.trans({
        en: "Options for loading a list: page, limit, sort, insight, default values and invalidate.",
        ko: "목록을 불러올 때의 옵션입니다. page, limit, sort, insight, 기본값, invalidate를 정합니다.",
      }),
    },
    {
      name: "QuerySetting",
      desc: l.trans({
        en: "`{ queryKey, args }`: the filter a root-slice list component runs.",
        ko: "`{ queryKey, args }` 형태로, root slice 목록 컴포넌트가 실행할 filter를 고릅니다.",
      }),
    },
    {
      name: "Account",
      href: "#Account",
      desc: l.trans({
        en: "The account data a sign-in token carries.",
        ko: "로그인 토큰에 담긴 계정 정보입니다.",
      }),
    },
    {
      name: "FetchClient",
      href: "#FetchClient",
      desc: l.trans({
        en: "The runtime client behind every app's `fetch`.",
        ko: "모든 앱의 `fetch` 뒤에서 실제로 요청을 보내는 client입니다.",
      }),
    },
    {
      name: ["getRequest", "headers", "cookies"],
      desc: l.trans({
        en: "Read the request a page is being rendered for. Server only.",
        ko: "지금 렌더링 중인 page의 요청을 읽습니다. 서버 전용입니다.",
      }),
    },
    {
      name: <span className="font-sans">{l.trans({ en: "Everything else", ko: "그 밖의 export" })}</span>,
      desc: l.trans({
        en: "`HttpClient`, `WsClient`, `AgentTurn`, request helpers like `getRequestTheme`, and client types.",
        ko: "`HttpClient`, `WsClient`, `AgentTurn`, `getRequestTheme` 같은 request store helper, 생성된 client가 쓰는 타입입니다.",
      }),
    },
  ];

  const handleColumns = [
    { key: "handle", label: l.trans({ en: "Handle", ko: "handle" }) },
    { key: "call", label: l.trans({ en: "Returned by", ko: "돌려주는 호출" }), code: true },
    { key: "fields", label: l.trans({ en: "Fields", ko: "필드" }), code: true },
  ];
  const handleRows = [
    {
      handle: "`InitHandle`",
      call: "fetch.init<Model><Suffix>(...args, option?)",
      fields: "<model>Init<Suffix> · <model>List<Suffix> · <model>Insight<Suffix>",
    },
    { handle: "`ViewHandle`", call: "fetch.view<Model>(id, option?)", fields: "<model> · <model>View" },
    { handle: "`EditHandle`", call: "fetch.edit<Model>(id, option?)", fields: "<model> · <model>Edit" },
  ];

  const fieldColumns = [
    { key: "zone", label: "Zone", caption: "init · view · edit" },
    { key: "server", label: l.trans({ en: "Server", ko: "서버" }), caption: "Unit · View · Load.Stream" },
  ];
  const toZone = { zone: true };
  const toServer = { server: true };
  const fieldGroups: MatrixGroup[] = [
    {
      label: l.trans({ en: "Plain payload", ko: "일반 payload" }),
      rows: [
        {
          name: "<model>Init<Suffix>",
          desc: l.trans({
            en: "The list payload. Pass it to the Zone's `init` prop.",
            ko: "목록 payload입니다. Zone의 `init` prop에 넘깁니다.",
          }),
          marks: toZone,
        },
        {
          name: "<model>View · <model>Edit",
          desc: l.trans({
            en: "One record's payload. Pass it to the Zone's `view` or `edit` prop.",
            ko: "레코드 하나의 payload입니다. Zone의 `view`나 `edit` prop에 넘깁니다.",
          }),
          marks: toZone,
        },
      ],
    },
    {
      label: l.trans({ en: "Hydrated instances", ko: "hydrate된 인스턴스" }),
      rows: [
        {
          name: "<model>List<Suffix>",
          desc: l.trans({
            en: "A `DataList` of Light models, such as a list to count.",
            ko: "Light 모델의 `DataList`입니다. 개수를 셀 목록 같은 데 씁니다.",
          }),
          marks: toServer,
        },
        {
          name: "<model>Insight<Suffix>",
          desc: l.trans({
            en: "The aggregate as an Insight model instance.",
            ko: "집계 결과를 담은 Insight 모델 인스턴스입니다.",
          }),
          marks: toServer,
        },
        {
          name: "<model>",
          desc: l.trans({
            en: "The full model instance of one record.",
            ko: "레코드 하나의 full 모델 인스턴스입니다.",
          }),
          marks: toServer,
        },
      ],
    },
  ];

  const initParamRows = [
    {
      key: "RefName",
      type: "string",
      desc: l.trans({
        en: "The model's ref name, such as `\"user\"`. The payload's keys are named after it.",
        ko: '`"user"` 같은 모델의 ref name입니다. payload의 key 이름이 이것을 따릅니다.',
      }),
    },
    {
      key: "Light",
      desc: l.trans({
        en: "The Light model each row is, such as `cnst.LightUser`.",
        ko: "각 행의 Light 모델입니다. 예: `cnst.LightUser`.",
      }),
    },
    {
      key: "Insight",
      default: "any",
      desc: l.trans({ en: "The Insight model of the aggregate.", ko: "집계 결과의 Insight 모델입니다." }),
    },
    {
      key: "QueryArgs",
      default: "any",
      desc: l.trans({ en: "The slice's argument tuple.", ko: "slice가 받는 인자 tuple입니다." }),
    },
    {
      key: "Filter",
      default: "any",
      desc: l.trans({
        en: "The model's filter class. It types the sort key.",
        ko: "모델의 filter class입니다. sort key의 타입을 정합니다.",
      }),
    },
  ];

  const initKeyRows = [
    {
      name: ["refName", "sliceName", "argLength"],
      desc: l.trans({
        en: "Which slice the list came from: the same three fields as `SliceMeta`.",
        ko: "목록이 나온 slice입니다. `SliceMeta`와 같은 세 필드입니다.",
      }),
    },
    {
      name: "<model>ObjList",
      desc: l.trans({ en: "The rows, as plain objects.", ko: "일반 객체로 된 행 목록입니다." }),
    },
    {
      name: "<model>ObjInsight",
      desc: l.trans({
        en: "The aggregate as a plain object. `null` when loaded with `insight: false`.",
        ko: "집계 결과를 담은 일반 객체입니다. `insight: false`로 불러왔다면 `null`입니다.",
      }),
    },
    {
      name: ["pageOf<Model>", "limitOf<Model>", "lastPageOf<Model>"],
      desc: l.trans({
        en: "The current page, the page size, and the last page worked out from the count.",
        ko: "현재 페이지, 페이지 크기, 그리고 개수로 계산한 마지막 페이지입니다.",
      }),
    },
    {
      name: "hasMoreOf<Model>",
      desc: l.trans({
        en: "Whether another batch exists, read off the batch size rather than the count.",
        ko: "다음 묶음이 있는지 여부입니다. 개수가 아니라 받아 온 묶음의 크기로 판단합니다.",
      }),
    },
    {
      name: ["queryArgsOf<Model>", "sortOf<Model>"],
      desc: l.trans({
        en: "The arguments and the sort key the list was loaded with.",
        ko: "목록을 불러올 때 쓴 인자와 sort key입니다.",
      }),
    },
    {
      name: "<model>InitAt",
      desc: l.trans({ en: "When the list was loaded.", ko: "목록을 불러온 시각입니다." }),
    },
  ];

  const viewColumns = [
    { key: "type", label: l.trans({ en: "Type", ko: "타입" }) },
    { key: "source", label: l.trans({ en: "Handle field", ko: "handle 필드" }), code: true },
    { key: "consumer", label: l.trans({ en: "Consumed by", ko: "받는 곳" }) },
  ];
  const viewRows = [
    {
      type: "`ClientView`",
      source: "fetch.view<Model>(id) → <model>View",
      consumer: l.trans({ en: "The `view` prop of `Load.View`.", ko: "`Load.View`의 `view` prop입니다." }),
    },
    {
      type: "`ClientEdit`",
      source: "fetch.edit<Model>(id) → <model>Edit",
      consumer: l.trans({ en: "The `edit` prop of `Load.Edit`.", ko: "`Load.Edit`의 `edit` prop입니다." }),
    },
  ];
  const viewKeyRows = [
    {
      name: "refName",
      desc: l.trans({ en: "The model's ref name.", ko: "모델의 ref name입니다." }),
    },
    {
      name: "<model>Obj",
      desc: l.trans({ en: "The record, as a plain object.", ko: "일반 객체로 된 레코드입니다." }),
    },
    {
      name: "<model>ViewAt",
      desc: l.trans({
        en: "When the record was loaded. The edit payload uses this same key.",
        ko: "레코드를 불러온 시각입니다. edit payload도 같은 key를 씁니다.",
      }),
    },
  ];

  const sliceKeyRows = [
    {
      name: "refName",
      desc: l.trans({ en: 'The model\'s ref name, such as `"ticket"`.', ko: '`"ticket"` 같은 모델의 ref name입니다.' }),
    },
    {
      name: "sliceName",
      desc: l.trans({
        en: "Ref name plus slice suffix, such as `ticketInProject`. The root slice's is the ref name itself.",
        ko: "ref name에 slice 접미사를 붙인 이름입니다. 예: `ticketInProject`. root slice는 ref name 그대로입니다.",
      }),
    },
    {
      name: "argLength",
      desc: l.trans({ en: "How many query arguments the slice takes.", ko: "slice가 받는 query 인자 개수입니다." }),
    },
  ];

  const initFormRows = [
    {
      key: "page",
      type: "number",
      default: "1",
      desc: l.trans({ en: "The page to load, counted from 1.", ko: "불러올 페이지입니다. 1부터 셉니다." }),
    },
    {
      key: "limit",
      type: "number",
      default: "20",
      desc: l.trans({ en: "Rows per page.", ko: "한 페이지의 행 수입니다." }),
    },
    {
      key: "sort",
      type: "ExtractSort<Filter>",
      default: '"latest"',
      desc: l.trans({
        en: "One of the filter's sort keys. `latest`, `oldest` and `relevance` always exist.",
        ko: "filter의 sort key 중 하나입니다. `latest`, `oldest`, `relevance`는 항상 있습니다.",
      }),
    },
    {
      key: "insight",
      type: "boolean",
      default: "true",
      desc: l.trans({
        en: "`false` skips the aggregate query, so `<model>ObjInsight` is `null` and there is no total.",
        ko: "`false`면 집계 query를 보내지 않습니다. `<model>ObjInsight`는 `null`이고 총계도 없습니다.",
      }),
    },
    {
      key: "default",
      type: "Partial<DefaultOf<Input>>",
      tags: ["st.do.init*"],
      desc: l.trans({
        en: "Values the slice's form starts from, and returns to after each save.",
        ko: "slice의 form이 처음에 채우는 값이며, 저장할 때마다 이 값으로 돌아갑니다.",
      }),
    },
    {
      key: "invalidate",
      type: "boolean",
      default: "false",
      tags: ["st.do.init*"],
      desc: l.trans({
        en: "`false` reuses a list already loaded with the same arguments, page, limit and sort.",
        ko: "`false`면 같은 인자, page, limit, sort로 이미 불러온 목록을 다시 씁니다.",
      }),
    },
  ];

  const clientMemberRows = [
    {
      name: "new FetchClient(origin)",
      desc: l.trans({
        en: "Builds a client for an API origin such as `getEnv().serverHttpUri`, prefix included.",
        ko: "`getEnv().serverHttpUri` 같은 API origin으로 client를 만듭니다. origin에는 prefix까지 들어갑니다.",
      }),
    },
    {
      name: "setJwt(jwt)",
      desc: l.trans({
        en: "Sends this token with every later call, over HTTP and WebSocket. `null` clears it.",
        ko: "이후의 모든 호출에 이 토큰을 붙입니다. HTTP와 WebSocket 모두입니다. `null`이면 지웁니다.",
      }),
    },
    {
      name: "clone({ origin, jwt, connect, retry, ws })",
      desc: l.trans({
        en: "A copy with the same endpoints, for another origin or user. It keeps this client's default timeout, `retry` policy and WebSocket options, and its own `retry` or `ws` overrides them. `connect` defaults to `true`, except on the server for a clone given an `origin` or a clone of one that points at another origin.",
        ko: "같은 endpoint를 가진 복사본을 다른 origin이나 사용자용으로 만듭니다. 이 client의 기본 제한 시간, `retry` 정책, WebSocket 옵션을 물려받고, 복사본에 준 `retry`나 `ws`가 그 위에 덮입니다. `connect` 기본값은 `true`이지만, 서버에서 `origin`을 준 복사본과, 다른 origin을 가리키는 복사본의 복사본은 예외입니다.",
      }),
    },
    {
      name: "setTimeout(ms)",
      desc: l.trans({
        en: "Budget for calls whose endpoint and caller name none: 30 seconds by default, `false` for no limit. A retried call's tries and the waits between them share that one deadline, so each try gets only the time left.",
        ko: "호출도 endpoint도 제한 시간을 정하지 않았을 때 쓰는 기본값입니다. 기본 30초이며, `false`면 제한이 없습니다. 재시도하는 호출은 모든 시도와 그 사이의 대기가 한 기한을 나눠 쓰므로, 시도마다 남은 시간만 받습니다.",
      }),
    },
    {
      name: ["connect()", "disconnect()"],
      desc: l.trans({
        en: "Open or close the WebSocket that `pubsub` and `message` endpoints use.",
        ko: "`pubsub`, `message` endpoint가 쓰는 WebSocket을 열거나 닫습니다.",
      }),
    },
    {
      name: "fetch.instance",
      desc: l.trans({
        en: "The `FetchClient` inside an app's `fetch` proxy.",
        ko: "앱의 `fetch` proxy 안에 든 `FetchClient`입니다.",
      }),
    },
    {
      name: ["FetchClient.from", "FetchClient.build"],
      desc: l.trans({
        en: "Build an app's `fetch` in the generated `lib/sig.ts` and `lib/useClient.ts`.",
        ko: "생성된 `lib/sig.ts`와 `lib/useClient.ts`에서 앱의 `fetch`를 만듭니다.",
      }),
    },
  ];

  const requestRows = [
    {
      key: "getRequest()",
      type: "Request | undefined",
      desc: l.trans({
        en: "The request being rendered; `undefined` outside a render.",
        ko: "지금 렌더링 중인 요청입니다. 렌더링 밖에서는 `undefined`입니다.",
      }),
    },
    {
      key: "headers()",
      type: "Map<string, string>",
      desc: l.trans({
        en: "The request headers, keys in lower case. A new Map on every call, empty outside a render.",
        ko: "요청 헤더이며 key는 소문자입니다. 부를 때마다 새 Map을 만들고, 렌더링 밖에서는 비어 있습니다.",
      }),
    },
    {
      key: "cookies()",
      type: "Map<string, { name, value }>",
      desc: l.trans({
        en: "The parsed `Cookie` header, empty outside a render. A `j:` value is decoded as JSON.",
        ko: "`Cookie` 헤더를 파싱한 값이며, 렌더링 밖에서는 비어 있습니다. `j:`로 시작하는 값은 JSON으로 풀어 줍니다.",
      }),
    },
    {
      key: "getRequestStore()",
      type: "AkanRequestStore | undefined",
      desc: l.trans({
        en: "The whole per-request store: the request, its theme and its query cache. `undefined` outside a render.",
        ko: "요청마다 하나인 store 전체입니다. 요청, theme, query cache가 들어 있으며, 렌더링 밖에서는 `undefined`입니다.",
      }),
    },
  ];

  return (
    <Scroll>
      <Scroll.Slide id="akanjs-fetch" title="akanjs/fetch">
        <Docs.Title>akanjs/fetch</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "`akanjs/fetch` holds the types that carry fetched data from a route to its components, and the client that sends those calls. Zone files import its types with `import type`.",
              ko: "`akanjs/fetch`에는 route가 가져온 데이터를 컴포넌트까지 나르는 타입과, 그 호출을 실제로 보내는 client가 들어 있습니다. Zone 파일은 여기서 타입만 `import type`으로 가져옵니다.",
            })}
          </div>
          <Docs.SubSubTitle>{l.trans({ en: "Words Used On This Page", ko: "이 페이지에서 쓰는 말" })}</Docs.SubSubTitle>
          <Docs.IntroTable type={l.trans({ en: "Term", ko: "용어" })} items={termRows} />
          <Docs.SubSubTitle>{l.trans({ en: "Exports", ko: "export 목록" })}</Docs.SubSubTitle>
          <Docs.IntroTable type="export" items={exportRows} />
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="InitHandle / ViewHandle / EditHandle" title="InitHandle / ViewHandle / EditHandle">
        <Docs.Title>InitHandle / ViewHandle / EditHandle</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "A route's `fetch.init*`, `fetch.view*` and `fetch.edit*` calls return a handle. Await it and you get the same object these helpers always gave; read a field off it and you get that field's own promise.",
              ko: "route에서 부르는 `fetch.init*`, `fetch.view*`, `fetch.edit*`는 handle을 돌려줍니다. await하면 예전과 같은 객체가 나오고, 필드 하나를 꺼내면 그 필드만의 promise가 나옵니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "So each section renders as soon as its own data lands, and the page never waits for the slowest query.",
              ko: "그래서 섹션마다 자기 데이터가 도착하는 대로 그려지고, page 전체가 가장 느린 query를 기다리지 않습니다.",
            })}
          </div>
          <Docs.SubSubTitle>{l.trans({ en: "Three Handles", ko: "handle 세 가지" })}</Docs.SubSubTitle>
          <Docs.Table columns={handleColumns} rows={handleRows} stacked />
          <Docs.SubSubTitle>{l.trans({ en: "Splitting A Page", ko: "page 나누기" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: "Destructure the handle instead of awaiting it, and hand each field to the section that renders it:",
              ko: "handle을 await하지 말고 구조 분해해서, 필드마다 그것을 그리는 섹션에 넘깁니다:",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/myapp/page/org/[orgId]/_index.tsx"
          language="tsx"
          code={`import { fetch, Org, User } from "@apps/myapp/client";
import { ID } from "akanjs/base";
import { page } from "akanjs/client";
import { Load } from "akanjs/ui";

export default page()
  .param("orgId", ID)
  .render(({ orgId }) => {
    const { userInitInOrg, userListInOrg } = fetch.initUserInOrg(orgId);
    const { orgView } = fetch.viewOrg(orgId);
    return (
      <>
        <Org.Zone.View view={orgView} />
        <Load.Stream of={userListInOrg}>
          {(userList) => <User.Unit.Total count={userList.length} />}
        </Load.Stream>
        <User.Zone.Card init={userInitInOrg} />
      </>
    );
  });`}
        />
        <Docs.Description>
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Every request leaves at call time.</strong> Splitting the result never makes the queries run
                    one after another.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>요청은 호출하는 순간 모두 출발합니다.</strong> 결과를 나눠 받아도 query가 차례로 실행되지
                    않습니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>The list lands first.</strong> <code>{"<model>List<Suffix>"}</code> resolves when the rows
                    arrive. <code>{"<model>Init<Suffix>"}</code> also waits for the count, because it carries{" "}
                    <code>{"lastPageOf<Model>"}</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>목록이 먼저 도착합니다.</strong> <code>{"<model>List<Suffix>"}</code>는 행이 오면 바로
                    해소됩니다. <code>{"<model>Init<Suffix>"}</code>는 <code>{"lastPageOf<Model>"}</code>을 담아야 해서
                    개수까지 기다립니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Await what the first HTML needs.</strong> <code>await</code> still returns the whole object
                    and keeps that section in the shell, which SEO snapshots and prerendering read.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>첫 HTML에 꼭 있어야 하는 것은 await합니다.</strong> <code>await</code>하면 전체 객체가
                    나오고 그 섹션이 shell에 들어가므로, SEO 스냅샷과 prerender가 읽을 수 있습니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Just the payload?</strong> <code>{"fetch.get<Model>Init<Suffix>"}</code>,{" "}
                    <code>{"fetch.get<Model>View"}</code> and <code>{"fetch.get<Model>Edit"}</code> return it as a plain
                    promise.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>payload만 필요하다면</strong> <code>{"fetch.get<Model>Init<Suffix>"}</code>,{" "}
                    <code>{"fetch.get<Model>View"}</code>, <code>{"fetch.get<Model>Edit"}</code>가 그것만 일반 promise로
                    돌려줍니다.
                  </span>
                ),
              })}
            </li>
          </ul>
          <Docs.SubSubTitle>{l.trans({ en: "Where Each Field Goes", ko: "필드별로 넘기는 곳" })}</Docs.SubSubTitle>
          <Docs.Matrix
            type={l.trans({ en: "Field", ko: "필드" })}
            columns={fieldColumns}
            groups={fieldGroups}
            markLabel={l.trans({ en: "hand it here", ko: "여기로 넘김" })}
            emptyLabel={l.trans({ en: "not here", ko: "넘기지 않음" })}
          />
          <Docs.Alert type="warning">
            {l.trans({
              en: (
                <span>
                  <strong>Never pass a hydrated instance to a Zone.</strong> React Flight refuses class instances as
                  client-component props, so <code>{"<model>List<Suffix>"}</code>,{" "}
                  <code>{"<model>Insight<Suffix>"}</code> and <code>{"<model>"}</code> stay in server components.
                </span>
              ),
              ko: (
                <span>
                  <strong>hydrate된 인스턴스는 Zone에 넘기지 않습니다.</strong> React Flight는 class 인스턴스를
                  클라이언트 컴포넌트 prop으로 받지 않습니다. 그래서 <code>{"<model>List<Suffix>"}</code>,{" "}
                  <code>{"<model>Insight<Suffix>"}</code>, <code>{"<model>"}</code>는 서버 컴포넌트에서만 씁니다.
                </span>
              ),
            })}
          </Docs.Alert>
          <Docs.LinkGrid
            items={[
              {
                href: "/docs/arch/ui-composition#load-shells",
                title: l.trans({ en: "The Load Shells", ko: "Load 셸" }),
                desc: l.trans({
                  en: "How `Load.Units`, `Load.View` and `Load.Stream` render a handle's fields.",
                  ko: "`Load.Units`, `Load.View`, `Load.Stream`이 handle의 필드를 그리는 방법입니다.",
                }),
              },
              {
                href: "/conventions/module/zone#file-convention",
                title: l.trans({ en: "Zone Props", ko: "Zone props" }),
                desc: l.trans({
                  en: "How a Zone takes `init`, `view` and `slice`.",
                  ko: "Zone이 `init`, `view`, `slice`를 받는 방법입니다.",
                }),
              },
            ]}
          />
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="ClientInit" title="ClientInit">
        <Docs.Title>ClientInit</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "`ClientInit` is the type of a Zone's `init` prop. It takes the resolved list payload or the `<model>Init<Suffix>` promise from the init handle; a pending promise renders behind the Zone's own Suspense boundary.",
              ko: "`ClientInit`은 Zone `init` prop의 타입입니다. 해소된 목록 payload도, init handle이 주는 `<model>Init<Suffix>` promise도 받습니다. 아직 대기 중인 promise는 Zone 자체의 Suspense 경계 뒤에서 그려집니다.",
            })}
          </div>
          <div>{l.trans({ en: "A list Zone declares it like this:", ko: "목록 Zone은 이렇게 선언합니다:" })}</div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/myapp/lib/user/User.Zone.tsx"
          language="tsx"
          code={`"use client";
import { type cnst, User } from "@apps/myapp/client";
import type { ClientInit } from "akanjs/fetch";
import { Load } from "akanjs/ui";

interface CardProps {
  className?: string;
  init: ClientInit<"user", cnst.LightUser>;
}
export const Card = ({ className, init }: CardProps) => {
  return (
    <Load.Units
      className={className}
      init={init}
      renderItem={(user) => <User.Unit.Card key={user.id} user={user} />}
    />
  );
};`}
        />
        <Docs.Description>
          <Docs.SubSubTitle>{l.trans({ en: "Type Parameters", ko: "타입 인자" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: "Two are usually enough: the ref name and the Light model. The other three default to `any`.",
              ko: "보통 두 개면 됩니다. ref name과 Light 모델만 적고, 나머지 셋은 기본값 `any`로 둡니다.",
            })}
          </div>
          <Docs.OptionTable items={initParamRows} />
          <Docs.SubSubTitle>{l.trans({ en: "What The Payload Holds", ko: "payload에 든 것" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: "Every key but the first three is named after the model. For `user`, the rows are `userObjList`:",
              ko: "앞의 세 key를 빼면 모든 key 이름에 모델 이름이 들어갑니다. `user`라면 행 목록은 `userObjList`입니다:",
            })}
          </div>
          <Docs.IntroTable type="key" items={initKeyRows} />
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="ClientView / ClientEdit" title="ClientView / ClientEdit">
        <Docs.Title>ClientView / ClientEdit</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "`ClientView` and `ClientEdit` are the Zone prop types for one record. Each takes the resolved payload or the promise the view or edit handle hands out.",
              ko: "`ClientView`와 `ClientEdit`은 레코드 하나를 받는 Zone prop의 타입입니다. 둘 다 해소된 payload와, view·edit handle이 주는 promise를 모두 받습니다.",
            })}
          </div>
          <Docs.Table columns={viewColumns} rows={viewRows} stacked />
          <div>
            {l.trans({
              en: "Both payloads have the same three keys:",
              ko: "두 payload는 같은 key 세 개를 가집니다:",
            })}
          </div>
          <Docs.IntroTable type="key" items={viewKeyRows} />
          <div>
            {l.trans({
              en: "A Zone that shows a ticket and edits it:",
              ko: "ticket 하나를 보여 주고 고치는 Zone입니다:",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/myapp/lib/ticket/Ticket.Zone.tsx"
          language="tsx"
          code={`"use client";
import { type cnst, fetch, Ticket } from "@apps/myapp/client";
import type { ClientEdit, ClientView } from "akanjs/fetch";
import { Load } from "akanjs/ui";

interface ViewProps {
  className?: string;
  view: ClientView<"ticket", cnst.Ticket>;
}
export const View = ({ className, view }: ViewProps) => {
  return (
    <Load.View
      className={className}
      view={view}
      renderView={(ticket) => <Ticket.View.General ticket={ticket} />}
    />
  );
};

interface EditProps {
  className?: string;
  edit: ClientEdit<"ticket", cnst.Ticket>;
}
export const Edit = ({ className, edit }: EditProps) => {
  return (
    <Load.Edit
      className={className}
      slice={fetch.slice.ticket}
      edit={edit}
      type="form"
    >
      <Ticket.Template.General />
    </Load.Edit>
  );
};`}
        />
        <Docs.Description>
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>A new record needs no request.</strong> The <code>edit</code> prop of <code>Load.Edit</code>{" "}
                    and <code>Model.EditModal</code> also takes a partial model, so a new-record page passes default
                    values instead of a payload.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>새 레코드에는 요청이 필요 없습니다.</strong> <code>Load.Edit</code>과{" "}
                    <code>Model.EditModal</code>의 <code>edit</code> prop은 일부만 채운 모델도 받습니다. 그래서 새
                    레코드 page는 payload 대신 기본값만 넘깁니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>The full model is a separate field.</strong> <code>{"<model>"}</code> on the same handle is
                    a hydrated instance for server components; the Zone takes only the payload.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>full 모델은 따로 있는 필드입니다.</strong> 같은 handle의 <code>{"<model>"}</code>은 서버
                    컴포넌트용 hydrate된 인스턴스이고, Zone은 payload만 받습니다.
                  </span>
                ),
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="SliceMeta" title="SliceMeta">
        <Docs.Title>SliceMeta</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "`SliceMeta` names the slice a component works on. `Model.*` and `Data.*` components take it as their `slice` prop, to know which store and which list to update after a save.",
              ko: "`SliceMeta`는 컴포넌트가 다루는 slice를 가리킵니다. `Model.*`, `Data.*` 컴포넌트는 이것을 `slice` prop으로 받아, 저장한 뒤 어느 store의 어느 목록을 고칠지 압니다.",
            })}
          </div>
          <Docs.IntroTable type={l.trans({ en: "Field", ko: "필드" })} items={sliceKeyRows} />
          <div>
            {l.trans({
              en: "Read one off `fetch.slice`, and let a component take it as an optional prop:",
              ko: "`fetch.slice`에서 하나를 꺼내 쓰고, 컴포넌트에서는 선택 prop으로 받습니다:",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/myapp/lib/ticket/Ticket.Util.tsx"
          language="tsx"
          code={`"use client";
import { fetch, Ticket } from "@apps/myapp/client";
import type { SliceMeta } from "akanjs/fetch";
import { Model } from "akanjs/ui";

interface EditProps {
  ticketId: string;
  slice?: SliceMeta;
}
export const Edit = ({
  ticketId,
  slice = fetch.slice.ticketInProject,
}: EditProps) => {
  return (
    <Model.Edit slice={slice} modelId={ticketId}>
      <Ticket.Template.General />
    </Model.Edit>
  );
};`}
        />
        <Docs.Description>
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      <code>fetch.slice</code> holds one per slice,
                    </strong>{" "}
                    keyed by <code>sliceName</code> and typed from the app's signals.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>fetch.slice</code>에는 slice마다 하나씩 들어 있습니다.
                    </strong>{" "}
                    key는 <code>sliceName</code>이고, 타입은 앱의 signal에서 나옵니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Every list payload carries the same three fields,</strong> so <code>Load.Units</code> finds
                    its slice from <code>init</code> alone.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>목록 payload에도 같은 세 필드가 들어 있습니다.</strong> 그래서 <code>Load.Units</code>는{" "}
                    <code>init</code>만 보고 자기 slice를 찾습니다.
                  </span>
                ),
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="FetchInitForm" title="FetchInitForm">
        <Docs.Title>FetchInitForm</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "`FetchInitForm` is the option object for loading a list: which page, how many rows, what order, and whether to count. It is the last argument of `fetch.init<Model><Suffix>()` and `st.do.init<Model><Suffix>()`.",
              ko: "`FetchInitForm`은 목록을 불러올 때 쓰는 옵션 객체입니다. 몇 페이지를, 몇 행씩, 어떤 순서로 불러올지와 개수를 셀지 정합니다. `fetch.init<Model><Suffix>()`와 `st.do.init<Model><Suffix>()`의 마지막 인자로 넘깁니다.",
            })}
          </div>
          <Docs.OptionTable items={initFormRows} />
          <div>
            {l.trans({
              en: "Its type arguments, `Input` and `Filter`, type `default` and `sort`. Fields tagged `st.do.init*` are read by the store only. The defaults above apply to `fetch.init*`; `st.do.init*` keeps the list's current `page`, `limit` and `sort` when you leave them out.",
              ko: "타입 인자 `Input`과 `Filter`가 `default`와 `sort`의 타입을 정합니다. `st.do.init*` 표시가 붙은 필드는 store만 읽습니다. 위 기본값은 `fetch.init*` 기준이고, `st.do.init*`는 `page`, `limit`, `sort`를 빼면 목록의 현재 값을 그대로 씁니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "A member list that shows no total loads without the count:",
              ko: "총계를 보여 주지 않는 멤버 목록은 개수를 세지 않고 불러옵니다:",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/myapp/page/org/[orgId]/member.tsx"
          language="tsx"
          code={`import { fetch, User } from "@apps/myapp/client";
import { ID } from "akanjs/base";
import { page } from "akanjs/client";

export default page()
  .param("orgId", ID)
  .render(({ orgId }) => {
    const { userInitInOrg } = fetch.initUserInOrg(orgId, {
      limit: 50,
      sort: "oldest",
      insight: false,
    });
    return <User.Zone.Card init={userInitInOrg} />;
  });`}
        />
        <Docs.Description>
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      Pass <code>insight: false</code> when the screen shows no total and no pagination.
                    </strong>{" "}
                    The rows in hand are then the whole count there is.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      총계도 페이지 이동도 없는 화면이면 <code>insight: false</code>를 넘깁니다.
                    </strong>{" "}
                    그러면 손에 든 행이 곧 전체 개수입니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>The same object takes per-call options.</strong> <code>fetch.init*</code> also accepts{" "}
                    <code>token</code>, <code>timeout</code> and the other <code>FetchPolicy</code> fields in it.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>같은 객체에 호출 단위 옵션도 넣습니다.</strong> <code>fetch.init*</code>는{" "}
                    <code>token</code>, <code>timeout</code> 같은 <code>FetchPolicy</code> 필드도 함께 받습니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>List components take it as their init prop.</strong> <code>Data.CardList</code>,{" "}
                    <code>Data.TableList</code> and <code>Data.ListContainer</code> pass it on to{" "}
                    <code>st.do.init*</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>목록 컴포넌트는 이것을 init prop으로 받습니다.</strong> <code>Data.CardList</code>,{" "}
                    <code>Data.TableList</code>, <code>Data.ListContainer</code>가 그대로 <code>st.do.init*</code>에
                    넘깁니다.
                  </span>
                ),
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="Account" title="Account">
        <Docs.Title>Account</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "`Account` is the account data a sign-in token carries. It always has `appName` and `environment`, and its type argument adds the app's own claims.",
              ko: "`Account`는 로그인 토큰에 담긴 계정 정보입니다. `appName`과 `environment`는 항상 있고, 타입 인자로 앱만의 claim을 더합니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "Read the current account with `getAccount()` from `akanjs/client`, in a page render or in the browser:",
              ko: "현재 계정은 `akanjs/client`의 `getAccount()`로 읽습니다. page 렌더링 중에도, 브라우저에서도 됩니다:",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/myapp/webkit/cookie.ts"
          code={`import { getAccount } from "akanjs/client";
import type { Account } from "akanjs/fetch";

interface SelfClaim {
  self?: { id: string };
}

export const getSelfId = () => {
  const account: Account<SelfClaim> = getAccount<SelfClaim>();
  return account.self?.id;
};`}
        />
        <Docs.Description>
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>A token for another app reads as signed out.</strong> <code>getAccount()</code> returns only{" "}
                    <code>{"{ appName, environment }"}</code> when the token was issued for another app or environment.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>다른 앱의 토큰은 로그아웃 상태로 읽힙니다.</strong> 토큰이 다른 앱이나 환경에서 발급됐다면{" "}
                    <code>getAccount()</code>는 <code>{"{ appName, environment }"}</code>만 돌려줍니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      <code>getDefaultAccount()</code> is that signed-out value,
                    </strong>{" "}
                    built from the current env's <code>appName</code> and <code>environment</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>getDefaultAccount()</code>가 그 로그아웃 상태의 값입니다.
                    </strong>{" "}
                    현재 env의 <code>appName</code>과 <code>environment</code>만 담습니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>The server decodes the same shape.</strong> <code>AccountMiddleware</code> in{" "}
                    <code>libs/shared</code> puts it on each call, and guards read it with{" "}
                    <code>{'context.get("account")'}</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>서버도 같은 모양으로 풉니다.</strong> <code>libs/shared</code>의{" "}
                    <code>AccountMiddleware</code>가 호출마다 이 값을 붙이고, guard는{" "}
                    <code>{'context.get("account")'}</code>로 읽습니다.
                  </span>
                ),
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="FetchClient" title="FetchClient">
        <Docs.Title>FetchClient</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "`FetchClient` turns the app's signal metadata into typed HTTP and WebSocket functions. The `fetch` an app imports is a proxy around one instance, so its instance methods are callable on `fetch` itself.",
              ko: "`FetchClient`는 앱의 signal 정보를 타입이 붙은 HTTP·WebSocket 함수로 바꿉니다. 앱이 import하는 `fetch`는 인스턴스 하나를 감싼 proxy라서, 인스턴스 메서드를 `fetch`에서 바로 부를 수 있습니다.",
            })}
          </div>
          <Docs.IntroTable type={l.trans({ en: "Member", ko: "멤버" })} items={clientMemberRows} />
          <div>
            {l.trans({
              en: "Signal tests use `clone` to call the server as a signed-in user:",
              ko: "signal 테스트는 `clone`으로 로그인한 사용자처럼 서버를 부릅니다:",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/myapp/lib/user/user.signal.spec.ts"
          code={`import { getOrSetupSignalTestFetch } from "akanjs/test";

import type { fetch as appFetch } from "../useServer";

type AppFetch = typeof appFetch;

export const getUserFetch = async (jwt: string): Promise<AppFetch> => {
  const fetch = await getOrSetupSignalTestFetch<AppFetch>();
  return fetch.clone({ jwt }) as AppFetch;
};`}
        />
        <Docs.Description>
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>One clone per user.</strong> Each clone carries its own token, so two users can call the
                    same server side by side.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>사용자마다 복사본 하나.</strong> 복사본마다 자기 토큰을 들고 있어서, 두 사용자가 같은 서버를
                    나란히 부를 수 있습니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      <code>connect: false</code> skips the WebSocket
                    </strong>{" "}
                    for a copy that only makes HTTP calls. The API explorer clones this way. On the server a clone given
                    an <code>origin</code>, and a clone of one that points at another origin, open none unless they pass{" "}
                    <code>connect: true</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>connect: false</code>면 WebSocket을 열지 않습니다.
                    </strong>{" "}
                    HTTP만 부르는 복사본에 씁니다. API explorer가 이렇게 복사합니다. 서버에서 <code>origin</code>을 준
                    복사본과, 다른 origin을 가리키는 복사본의 복사본은 <code>connect: true</code>를 주지 않으면
                    WebSocket을 열지 않습니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Never write the API prefix by hand.</strong> <code>getEnv().serverHttpUri</code> from{" "}
                    <code>akanjs/base</code> already ends with it.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>API prefix를 직접 적지 않습니다.</strong> <code>akanjs/base</code>의{" "}
                    <code>getEnv().serverHttpUri</code>가 이미 prefix까지 담고 있습니다.
                  </span>
                ),
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="getRequest / headers / cookies" title="getRequest / headers / cookies">
        <Docs.Title>getRequest / headers / cookies</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "These read the request a page is being rendered for. `akanjs/fetch` pulls in no client code, so a server component can import them freely.",
              ko: "이 함수들은 지금 렌더링 중인 page의 요청을 읽습니다. `akanjs/fetch`는 클라이언트 코드를 끌어오지 않으므로, 서버 컴포넌트에서 부담 없이 import할 수 있습니다.",
            })}
          </div>
          <Docs.OptionTable items={requestRows} />
          <div>
            {l.trans({
              en: "A page can read them while it renders:",
              ko: "page는 렌더링하는 동안 이 값을 읽을 수 있습니다:",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/myapp/page/_index.tsx"
          language="tsx"
          code={`import { Promo } from "@apps/myapp/client";
import { page } from "akanjs/client";
import { cookies, getRequest, headers } from "akanjs/fetch";

export default page().render(() => {
  const referer = headers().get("referer") ?? getRequest()?.url;
  const campaign = cookies().get("campaign")?.value;
  return <Promo.Zone.Banner referer={referer} campaign={campaign} />;
});`}
        />
        <Docs.Description>
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>They see a request only while a page renders.</strong> Anywhere else the maps are empty and{" "}
                    <code>getRequest()</code> is <code>undefined</code>. There is no fallback to a recent request: with
                    several renders in flight, it could be another visitor's.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>page를 렌더링하는 동안에만 요청이 보입니다.</strong> 그 밖에서는 Map이 비어 있고{" "}
                    <code>getRequest()</code>는 <code>undefined</code>입니다. 최근 요청으로 대신하지 않습니다. 여러
                    렌더링이 동시에 돌 때 그것은 다른 방문자의 요청일 수 있습니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Endpoints read the caller another way:</strong> <code>.with(Self)</code> in the signal, or{" "}
                    <code>{'context.get("account")'}</code> in a guard.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>endpoint는 다른 방법으로 호출자를 읽습니다.</strong> signal에서는 <code>.with(Self)</code>,
                    guard에서는 <code>{'context.get("account")'}</code>를 씁니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      Code that runs on both sides uses <code>akanjs/client</code>.
                    </strong>{" "}
                    Its <code>getCookie(key)</code> reads the request on the server and <code>document.cookie</code> in
                    the browser.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      양쪽에서 도는 코드는 <code>akanjs/client</code>를 씁니다.
                    </strong>{" "}
                    그쪽의 <code>getCookie(key)</code>는 서버에서는 요청을, 브라우저에서는 <code>document.cookie</code>
                    를 읽습니다.
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
