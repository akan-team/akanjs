import { usePage } from "@apps/akan/client";
import { Code, Divider, Docs, DocsToc, type IntroItem } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { page } from "akanjs/client";

export default page()
  .config({ transition: "fade" })
  .head(({ lang }) => {
    const title =
      lang === "ko" ? "서비스: service.dictionary.ts | Akan.js" : "Service: service.dictionary.ts | Akan.js";
    const description =
      lang === "ko"
        ? "엔드포인트와 모든 인자의 이름, 에러와 문구, 키를 되읽는 방법."
        : "Naming endpoints and every argument, errors and phrases, and reading a key back.";
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

    const termRows: IntroItem[] = [
      {
        name: "label",
        desc: l.trans({
          en: 'The name a person reads, one entry per language: `fn(["Disconnect App", "앱 연결 끊기"])`.',
          ko: '사람이 읽는 이름입니다. 언어마다 하나씩 적습니다: `fn(["Disconnect App", "앱 연결 끊기"])`.',
        }),
      },
      {
        name: ".desc()",
        desc: l.trans({
          en: "A longer sentence beside a label. An AI agent picks a tool by reading it.",
          ko: "레이블 옆에 붙는 긴 설명입니다. AI 에이전트는 이 설명을 읽고 툴을 고릅니다.",
        }),
      },
      {
        name: "key",
        desc: l.trans({
          en: "The dotted path code reads a text by, such as `oauth.consentTitle`.",
          ko: "코드가 문구를 꺼낼 때 쓰는, 점으로 이은 경로입니다. `oauth.consentTitle` 같은 모양입니다.",
        }),
      },
      {
        name: l.trans({ en: "language tuple", ko: "언어 배열" }),
        desc: l.trans({
          en: 'One string per language, in the order `serviceDictionary(["en", "ko"])` lists them.',
          ko: '언어마다 문자열 하나씩, `serviceDictionary(["en", "ko"])`에 적은 언어 순서대로 쓴 배열입니다.',
        }),
      },
    ];

    const stageRows: IntroItem[] = [
      {
        name: ".endpoint<XEndpoint>((fn) => ({}))",
        desc: l.trans({
          en: "One entry per signal endpoint: a label, a `.desc()`, and an `.arg()` for every argument.",
          ko: "signal endpoint마다 항목 하나입니다. 레이블, `.desc()`, 인자마다 붙이는 `.arg()`로 이루어집니다.",
        }),
        example: 'l("oauth.signal.exchangeOAuthToken")',
      },
      {
        name: ".error({})",
        desc: l.trans({
          en: 'Every key the service throws as `new Err("<service>.error.<key>")`. Korean ends in `다.`',
          ko: 'service가 `new Err("<service>.error.<key>")`로 던지는 모든 key입니다. 한국어는 `다.`로 끝냅니다.',
        }),
        example: 'throw new Err("localFile.error.privateFilesNotServed")',
      },
      {
        name: ".translate({})",
        desc: l.trans({
          en: "Every other phrase, neither an endpoint nor an error. It is read by the bare key under the module.",
          ko: "endpoint도 에러도 아닌 나머지 문구입니다. 모듈 이름 바로 아래의 key로 읽습니다.",
        }),
        example: 'l("oauth.consentTitle")',
      },
    ];

    const stageNotes = [
      l.trans({
        en: (
          <>
            <strong>Every stage is optional.</strong> Write the ones the module has something for:{" "}
            <code>_security</code> writes only <code>.endpoint()</code>, and <code>_localFile</code> has no{" "}
            <code>.translate()</code>.
          </>
        ),
        ko: (
          <>
            <strong>모든 단계는 선택입니다.</strong> 담을 것이 있는 단계만 씁니다. <code>_security</code>는{" "}
            <code>.endpoint()</code>만 쓰고, <code>_localFile</code>에는 <code>.translate()</code>가 없습니다.
          </>
        ),
      }),
      l.trans({
        en: (
          <>
            <strong>Any order works; one order is the house style.</strong> Each stage returns the same builder, but
            write endpoint → error → translate, the order a reader looks for them in.
          </>
        ),
        ko: (
          <>
            <strong>순서는 자유지만 관례는 하나입니다.</strong> 각 단계가 같은 builder를 돌려주므로 어떤 순서든
            동작합니다. 그래도 읽는 사람이 찾는 순서인 endpoint → error → translate로 씁니다.
          </>
        ),
      }),
      l.trans({
        en: (
          <>
            <strong>The array is the language list.</strong> <code>{'serviceDictionary(["en", "ko"])'}</code> fixes the
            order every tuple in the file follows.
          </>
        ),
        ko: (
          <>
            <strong>배열이 언어 목록입니다.</strong> <code>{'serviceDictionary(["en", "ko"])'}</code>가 파일 안 모든
            언어 배열의 순서를 정합니다.
          </>
        ),
      }),
    ];

    const endpointNotes = [
      l.trans({
        en: (
          <>
            <strong>The keys follow the endpoint class.</strong> The callback must return one entry per endpoint, so a
            renamed or added endpoint breaks the dictionary at compile time, not at the first render.
          </>
        ),
        ko: (
          <>
            <strong>key는 endpoint class를 따릅니다.</strong> 콜백이 endpoint마다 항목을 하나씩 돌려줘야 하므로,
            endpoint 이름을 바꾸거나 새로 추가하면 첫 렌더가 아니라 컴파일 시점에 dictionary가 깨집니다.
          </>
        ),
      }),
      l.trans({
        en: (
          <>
            <strong>
              Import the class with <code>import type</code>.
            </strong>{" "}
            A dictionary is a shared contract file, and a value import would pull the signal's runtime graph in behind
            it.
          </>
        ),
        ko: (
          <>
            <strong>
              class는 <code>import type</code>으로 가져옵니다.
            </strong>{" "}
            dictionary는 공유 계약 파일이라, 값으로 import하면 signal의 runtime 그래프가 뒤에 딸려 들어옵니다.
          </>
        ),
      }),
      l.trans({
        en: (
          <>
            <strong>Two parts are not optional:</strong> the <code>.desc()</code> beside the label, and the error key{" "}
            <code>localFile.service.ts</code> throws by name.
          </>
        ),
        ko: (
          <>
            <strong>빠뜨리면 안 되는 것이 둘 있습니다.</strong> 레이블 옆의 <code>.desc()</code>, 그리고{" "}
            <code>localFile.service.ts</code>가 이름으로 던지는 error key입니다.
          </>
        ),
      }),
    ];

    const readerColumns = [
      { key: "explorer", label: l.trans({ en: "API explorer", ko: "API 탐색기" }) },
      { key: "openapi", label: "OpenAPI" },
      { key: "mcp", label: "MCP" },
    ];
    const readerGroups = [
      {
        label: l.trans({ en: "Endpoint", ko: "endpoint" }),
        rows: [
          {
            name: "label",
            desc: l.trans({
              en: "The API explorer heading, the OpenAPI `summary` and the MCP tool `title`.",
              ko: "API 탐색기의 제목, OpenAPI의 `summary`, MCP 툴의 `title`이 됩니다.",
            }),
            marks: { explorer: true, openapi: true, mcp: true },
          },
          {
            name: ".desc()",
            desc: l.trans({
              en: "The description an agent picks a tool by. The API explorer shows it under the label.",
              ko: "에이전트가 툴을 고를 때 읽는 설명입니다. API 탐색기에서는 레이블 아래에 보입니다.",
            }),
            marks: { explorer: true, openapi: true, mcp: true },
          },
        ],
      },
      {
        label: l.trans({ en: "Argument, in .arg()", ko: ".arg() 안의 인자" }),
        rows: [
          {
            name: "label",
            desc: l.trans({
              en: "Shown beside the identifier in the API explorer, and nowhere else.",
              ko: "API 탐색기에서 식별자 옆에만 보입니다.",
            }),
            marks: { explorer: true, openapi: false, mcp: false },
          },
          {
            name: ".desc()",
            desc: l.trans({
              en: "The argument's description in the MCP input schema and on OpenAPI path and query parameters.",
              ko: "MCP input schema와 OpenAPI의 path·query 파라미터에서 그 인자의 설명이 됩니다.",
            }),
            marks: { explorer: true, openapi: true, mcp: true },
          },
        ],
      },
    ];

    const argNotes = [
      l.trans({
        en: (
          <>
            <strong>Say where the value comes from.</strong> The description does not say what a session ID is; it says
            where the caller gets one: the connected-apps list.
          </>
        ),
        ko: (
          <>
            <strong>값을 어디서 얻는지 적습니다.</strong> 이 설명은 session ID가 무엇인지가 아니라, 호출하는 쪽이 그
            값을 어디서 얻는지(연결된 앱 목록)를 알려 줍니다.
          </>
        ),
      }),
      l.trans({
        en: (
          <>
            <strong>That sentence is worth more than the type.</strong> It is the argument's description in the MCP
            input schema. Without it an agent has only the identifier's spelling, and guesses.
          </>
        ),
        ko: (
          <>
            <strong>이 한 문장이 타입보다 값집니다.</strong> MCP input schema에서 인자 설명이 되는 문장입니다. 없으면
            에이전트에게는 식별자 철자밖에 없어서 값을 찍어 맞힙니다.
          </>
        ),
      }),
      l.trans({
        en: (
          <>
            <strong>The label is for people.</strong> "Session ID" appears beside <code>sessionId</code> in the API
            explorer.
          </>
        ),
        ko: (
          <>
            <strong>레이블은 사람을 위한 것입니다.</strong> API 탐색기에서 <code>sessionId</code> 옆에 "세션 ID"로
            보입니다.
          </>
        ),
      }),
    ];

    const errorNotes = [
      l.trans({
        en: (
          <>
            <strong>
              <code>Err</code> accepts only registered keys.
            </strong>{" "}
            A typo, or a key missing from <code>.error()</code>, is a type error. A key with no text in the reader's
            language or the default one shows up as the raw key.
          </>
        ),
        ko: (
          <>
            <strong>
              <code>Err</code>는 등록된 key만 받습니다.
            </strong>{" "}
            오타나 <code>.error()</code>에 없는 key는 타입 에러입니다. 읽는 사람의 언어에도 기본 언어에도 문구가 없는
            key는 key 문자열 그대로 보입니다.
          </>
        ),
      }),
      l.trans({
        en: (
          <>
            <strong>A brace pair is a slot the caller fills.</strong> <code>{'l("oauth.connectedAt", { at })'}</code>{" "}
            fills <code>{"Connected {at}"}</code>, and <code>{"new Err(key, { days })"}</code> fills an error the same
            way.
          </>
        ),
        ko: (
          <>
            <strong>중괄호는 호출하는 쪽이 채우는 자리입니다.</strong> <code>{'l("oauth.connectedAt", { at })'}</code>이{" "}
            <code>{"{at} 연결"}</code>을 채우고, <code>{"new Err(key, { days })"}</code>도 같은 방식으로 에러 문구를
            채웁니다.
          </>
        ),
      }),
      l.trans({
        en: (
          <>
            <strong>Nothing checks that the value was passed.</strong> A missing one leaves <code>{"{at}"}</code> in the
            text as written, so give the slot an obvious name.
          </>
        ),
        ko: (
          <>
            <strong>값을 넘겼는지는 아무도 검사하지 않습니다.</strong> 빠지면 <code>{"{at}"}</code>이 문구에 그대로
            남으므로, 자리 이름을 뻔하게 짓습니다.
          </>
        ),
      }),
    ];

    const registerRows: IntroItem[] = [
      {
        name: ".error()",
        desc: l.trans({
          en: "Korean ends in `다.`: a statement of what went wrong, not an apology.",
          ko: "무엇이 잘못됐는지 서술하고 `다.`로 끝냅니다. 사과하는 문장이 아닙니다.",
        }),
        example: '"계속하려면 로그인해야 한다."',
      },
      {
        name: ".translate()",
        desc: l.trans({
          en: "Plain `다.` only for a bare statement; a line addressed to the user ends in `습니다` (`consentScope`).",
          ko: "`다.`는 단순한 서술일 때만 쓰고, `consentScope`처럼 사용자에게 말을 거는 문구는 `습니다`로 끝냅니다.",
        }),
        example: '"…할 수 있는 모든 일을 할 수 있습니다."',
      },
      {
        name: "label",
        desc: l.trans({
          en: "English in Title Case, Korean as the plain domain term.",
          ko: "영어는 Title Case로, 한국어는 평소 쓰는 도메인 용어로 씁니다.",
        }),
        example: '["Disconnect App", "앱 연결 끊기"]',
      },
    ];

    const keyRows: IntroItem[] = [
      {
        name: "<service>.signal.<endpoint>",
        desc: l.trans({
          en: "The endpoint label from `.endpoint()`. Read it with `l()`.",
          ko: "`.endpoint()`에 적은 endpoint 레이블입니다. `l()`로 읽습니다.",
        }),
        example: 'l("oauth.signal.approveOAuthConsent")',
      },
      {
        name: "<service>.signal.<endpoint>.desc",
        desc: l.trans({
          en: "Its `.desc()`. Read it with `l()`, adding `.desc` to the label's key.",
          ko: "그 레이블의 `.desc()`입니다. 레이블 key 뒤에 `.desc`를 붙여 `l()`로 읽습니다.",
        }),
        example: 'l("oauth.signal.approveOAuthConsent.desc")',
      },
      {
        name: "<service>.signal.<endpoint>.arg.<arg>",
        desc: l.trans({
          en: "An argument label from `.arg()`. Read it with `l()`.",
          ko: "`.arg()`에 적은 인자 레이블입니다. `l()`로 읽습니다.",
        }),
        example: 'l("oauth.signal.revokeOAuthConnection.arg.sessionId")',
      },
      {
        name: "<service>.error.<key>",
        desc: l.trans({
          en: "An error from `.error()`. `new Err()` throws it on the server; `msg.error()` shows it on the client.",
          ko: "`.error()`에 적은 에러입니다. 서버에서는 `new Err()`로 던지고, 클라이언트에서는 `msg.error()`로 띄웁니다.",
        }),
        example: 'msg.error("oauth.error.notSignedIn")',
      },
      {
        name: "<service>.<key>",
        desc: l.trans({
          en: "A phrase from `.translate()`. Read it with `l()`.",
          ko: "`.translate()`에 적은 문구입니다. `l()`로 읽습니다.",
        }),
        example: 'l("oauth.consentTitle")',
      },
    ];

    const readNotes = [
      l.trans({
        en: (
          <>
            <strong>
              <code>usePage()</code> works on the server too.
            </strong>{" "}
            The consent page is a server component, so its labels add no client boundary.
          </>
        ),
        ko: (
          <>
            <strong>
              <code>usePage()</code>는 서버에서도 동작합니다.
            </strong>{" "}
            동의 페이지는 server component이므로 레이블 때문에 client 경계가 생기지 않습니다.
          </>
        ),
      }),
      l.trans({
        en: (
          <>
            <strong>A thrown error needs no reading code.</strong> When a store action fails with an <code>Err</code>,
            the store toasts its text in the reader's language. For a client-side check, call{" "}
            <code>{'msg.error("oauth.error.notSignedIn")'}</code> and return.
          </>
        ),
        ko: (
          <>
            <strong>던진 에러는 따로 읽을 필요가 없습니다.</strong> store action이 <code>Err</code>로 실패하면 store가
            그 문구를 읽는 사람의 언어로 바꿔 토스트로 띄웁니다. 클라이언트에서 막는 검사라면{" "}
            <code>{'msg.error("oauth.error.notSignedIn")'}</code>를 띄우고 return합니다.
          </>
        ),
      }),
      l.trans({
        en: (
          <>
            <strong>Read an endpoint's description on the server.</strong> Unless the app sets{" "}
            <code>clientRuntime: "all"</code>, the <code>.desc</code> and <code>.arg</code> texts of a signal stay out
            of the dictionary file every page loads and come only to a page that shows the API explorer or whose client
            components write such a key, so a client component reading one by a key built from data gets the text on the
            server and the key in the browser, which React reports as a hydration mismatch. Read them in a server
            component and pass the text down.
          </>
        ),
        ko: (
          <>
            <strong>endpoint 설명은 서버에서 읽습니다.</strong> 앱이 <code>clientRuntime: "all"</code>을 설정하지
            않았다면 signal의 <code>.desc</code>와 <code>.arg</code> 문구가 모든 페이지가 불러오는 사전 파일에서 빠지고,
            API 탐색기를 보여 주거나 client component가 그런 key를 직접 적은 페이지에만 따로 옵니다. 그래서 client
            component가 데이터로 만든 key로 읽으면 서버에서는 문구가, 브라우저에서는 key가 나와 React가 hydration
            불일치를 알립니다. server component에서 읽어 문구를 넘깁니다.
          </>
        ),
      }),
      l.trans({
        en: (
          <>
            <strong>One-off text belongs to the screen.</strong> A phrase used once, on one screen, is{" "}
            <code>{"l.trans({ en, ko })"}</code> in that component. A key only one component reads is a key somebody
            keeps in sync for nothing.
          </>
        ),
        ko: (
          <>
            <strong>한 번 쓰는 문구는 화면의 것입니다.</strong> 한 화면에서 한 번만 쓰는 문구는 그 component에서{" "}
            <code>{"l.trans({ en, ko })"}</code>로 씁니다. component 하나만 읽는 key는 괜히 누군가 계속 맞춰 줘야 하는
            key입니다.
          </>
        ),
      }),
    ];

    const mistakeColumns = [
      { key: "wrong", label: l.trans({ en: "Instead of", ko: "이렇게 쓰지 말고" }) },
      { key: "fix", label: l.trans({ en: "Write", ko: "이렇게 씁니다" }) },
    ];
    const mistakeRows = [
      {
        wrong: '`import { OauthEndpoint } from "./oauth.signal"`',
        fix: l.trans({
          en: "`import type`. A value import pulls the signal's runtime graph into the dictionary.",
          ko: "`import type`으로 씁니다. 값 import는 signal의 runtime 그래프를 dictionary로 끌어옵니다.",
        }),
      },
      {
        wrong: l.trans({ en: "An endpoint label with no `.desc()`", ko: "`.desc()` 없는 endpoint 레이블" }),
        fix: l.trans({
          en: "Write one. An agent picks a tool by its description.",
          ko: "설명을 적습니다. 에이전트는 설명을 보고 툴을 고릅니다.",
        }),
      },
      {
        wrong: l.trans({
          en: 'An argument description that repeats the name: "The session ID"',
          ko: '이름을 되풀이하는 인자 설명: "세션 ID"',
        }),
        fix: l.trans({
          en: 'Say where the caller gets the value: "from the connected-apps list".',
          ko: '호출하는 쪽이 값을 어디서 얻는지 적습니다: "연결된 앱 목록의 세션 ID".',
        }),
      },
      {
        wrong: l.trans({
          en: "A `.translate()` key only one component reads",
          ko: "component 하나만 읽는 `.translate()` key",
        }),
        fix: l.trans({
          en: "`l.trans({ en, ko })` inside that component.",
          ko: "그 component 안에서 `l.trans({ en, ko })`로 씁니다.",
        }),
      },
    ];

    const nextLinks = [
      {
        href: "/conventions/module/dictionary",
        title: "model.dictionary.ts",
        desc: l.trans({
          en: "The full stage chain a database module writes.",
          ko: "데이터베이스 모듈이 쓰는 전체 단계 체인입니다.",
        }),
      },
      {
        href: "/conventions/service/signal",
        title: "service.signal.ts",
        desc: l.trans({
          en: "The endpoints and arguments this file labels.",
          ko: "이 파일이 레이블을 붙이는 endpoint와 인자입니다.",
        }),
      },
      {
        href: "/conventions/service/service",
        title: "service.service.ts",
        desc: l.trans({ en: "Where the `Err` keys are thrown.", ko: "`Err` key를 던지는 곳입니다." }),
      },
      {
        href: "/conventions/service/store",
        title: "service.store.ts",
        desc: l.trans({
          en: "Actions whose failures become error toasts.",
          ko: "실패하면 에러 토스트가 되는 action입니다.",
        }),
      },
    ];

    return (
      <Scroll>
        <Scroll.Slide id="service-dictionary" title="service.dictionary.ts">
          <Docs.Title>service.dictionary.ts</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: (
                  <span>
                    <code>{"<service>.dictionary.ts"}</code> labels, in every language, what a service module shows: its
                    endpoints, its errors and its other phrases. Open it when you add an endpoint, throw a new error, or
                    show a new line of text.
                  </span>
                ),
                ko: (
                  <span>
                    <code>{"<service>.dictionary.ts"}</code>는 service 모듈이 보여 주는 endpoint, 에러, 그 밖의 문구에
                    언어별 레이블을 붙입니다. endpoint를 추가하거나, 새 에러를 던지거나, 새 문구를 화면에 띄울 때 이
                    파일을 엽니다.
                  </span>
                ),
              })}
            </div>
            <div>
              {l.trans({
                en: (
                  <span>
                    A model dictionary starts by naming fields. A service module has none, so its dictionary starts one
                    stage later, at the endpoints, and the first line says so: <code>serviceDictionary</code>, not{" "}
                    <code>modelDictionary</code>.
                  </span>
                ),
                ko: (
                  <span>
                    model dictionary는 필드에 이름을 붙이는 것으로 시작합니다. service 모듈에는 필드가 없어서 한 단계
                    뒤인 endpoint부터 시작하고, 첫 줄부터 다릅니다. <code>modelDictionary</code>가 아니라{" "}
                    <code>serviceDictionary</code>입니다.
                  </span>
                ),
              })}
            </div>
            <Docs.SubSubTitle>
              {l.trans({ en: "Words used on this page", ko: "이 페이지에서 쓰는 말" })}
            </Docs.SubSubTitle>
            <Docs.IntroTable type={l.trans({ en: "Term", ko: "용어" })} items={termRows} />
            <Docs.SubSubTitle>{l.trans({ en: "Three stages", ko: "세 단계" })}</Docs.SubSubTitle>
            <Docs.IntroTable
              type={l.trans({ en: "Stage", ko: "단계" })}
              descLabel={l.trans({ en: "What it holds", ko: "담는 것" })}
              items={stageRows}
            />
            <ul className={bulletList}>
              {stageNotes.map((note, idx) => (
                <li key={idx}>{note}</li>
              ))}
            </ul>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide
          id="endpoint-labels"
          title={l.trans({ en: "Naming The Endpoints", ko: "endpoint에 이름 붙이기" })}
        >
          <Docs.Title>{l.trans({ en: "Naming The Endpoints", ko: "endpoint에 이름 붙이기" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: (
                  <span>
                    Pass the signal's endpoint class to <code>.endpoint()</code> as a type argument, and give each
                    endpoint a label and a <code>.desc()</code>. This is the whole file of <code>_localFile</code>, a
                    module with one endpoint:
                  </span>
                ),
                ko: (
                  <span>
                    <code>.endpoint()</code>에 signal의 endpoint class를 타입 인자로 넘기고, endpoint마다 레이블과{" "}
                    <code>.desc()</code>를 붙입니다. endpoint가 하나뿐인 <code>_localFile</code> 모듈의 파일 전체입니다:
                  </span>
                ),
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="libs/util/lib/_localFile/localFile.dictionary.ts"
              code={`import { serviceDictionary } from "akanjs/dictionary";

import type { LocalFileEndpoint } from "./localFile.signal";

export const dictionary = serviceDictionary(["en", "ko"])
  .endpoint<LocalFileEndpoint>((fn) => ({
    getBlob: fn(["Get Blob", "Blob 가져오기"]).desc([
      "Get blob data from local file",
      "로컬 파일에서 Blob 데이터 가져오기",
    ]),
  }))
  .error({
    privateFilesNotServed: [
      "Private files are not served through localFile",
      "비공개 파일은 localFile을 통해 제공되지 않습니다",
    ],
  });`}
            />
            <ul className={bulletList}>
              {endpointNotes.map((note, idx) => (
                <li key={idx}>{note}</li>
              ))}
            </ul>
            <Docs.SubSubTitle>
              {l.trans({ en: "Who reads which text", ko: "어떤 문구를 누가 읽는지" })}
            </Docs.SubSubTitle>
            <div>
              {l.trans({
                en: "People read the label; a model reads the description. Each piece shows up in these places:",
                ko: "레이블은 사람이, 설명은 모델이 읽습니다. 각 문구가 보이는 곳은 다음과 같습니다:",
              })}
            </div>
            <Docs.Matrix
              type={l.trans({ en: "Text", ko: "문구" })}
              columns={readerColumns}
              groups={readerGroups}
              markLabel={l.trans({ en: "Shown there", ko: "여기에 보임" })}
              emptyLabel={l.trans({ en: "Not used", ko: "쓰지 않음" })}
            />
            <Docs.Alert type="warning">
              {l.trans({
                en: (
                  <span>
                    <strong>
                      Write a <code>.desc()</code> for every endpoint.
                    </strong>{" "}
                    An agent picks a tool by its description; with a label alone it has the name and nothing else. MCP
                    reads the English entry unless <code>{"option.setMcp({ language })"}</code> names another, so the
                    English half must stand on its own.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      모든 endpoint에 <code>.desc()</code>를 적습니다.
                    </strong>{" "}
                    에이전트는 설명을 읽고 툴을 고르며, 레이블만 있으면 이름 말고는 아무것도 모릅니다. MCP는{" "}
                    <code>{"option.setMcp({ language })"}</code>로 바꾸지 않는 한 영어 항목을 읽으므로, 영어 설명만으로
                    뜻이 통해야 합니다.
                  </span>
                ),
              })}
            </Docs.Alert>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide
          id="endpoint-args"
          title={l.trans({ en: "Naming Every Argument", ko: "모든 인자에 이름 붙이기" })}
        >
          <Docs.Title>{l.trans({ en: "Naming Every Argument", ko: "모든 인자에 이름 붙이기" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: (
                  <span>
                    <code>.arg()</code> names each argument the endpoint declares, including <code>skip</code>,{" "}
                    <code>limit</code> and <code>sort</code> when a custom endpoint takes them. Leave one out and the
                    dictionary does not compile:
                  </span>
                ),
                ko: (
                  <span>
                    <code>.arg()</code>로 endpoint가 선언한 인자마다 이름을 붙입니다. 커스텀 endpoint가 받는{" "}
                    <code>skip</code>, <code>limit</code>, <code>sort</code>도 포함되며, 하나라도 빠지면 dictionary가
                    컴파일되지 않습니다:
                  </span>
                ),
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="libs/shared/lib/_oauth/oauth.dictionary.ts"
              code={`    revokeOAuthConnection: fn(["Disconnect App", "앱 연결 끊기"])
      .desc([
        "Closes one application's grant; its tokens stop working at once",
        "애플리케이션 하나의 권한을 닫는다. 그 토큰은 즉시 동작을 멈춘다",
      ])
      .arg((t) => ({
        sessionId: t(["Session ID", "세션 ID"]).desc([
          "The grant to close, from the connected-apps list",
          "닫을 그랜트(연결된 앱 목록의 세션 ID)",
        ]),
      })),`}
            />
            <ul className={bulletList}>
              {argNotes.map((note, idx) => (
                <li key={idx}>{note}</li>
              ))}
            </ul>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="errors-and-phrases" title={l.trans({ en: "Errors And Phrases", ko: "에러와 문구" })}>
          <Docs.Title>{l.trans({ en: "Errors And Phrases", ko: "에러와 문구" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: (
                  <span>
                    An error key is the other half of a throw. The service writes{" "}
                    <code>{'new Err("oauth.error.notSignedIn")'}</code>, and <code>.error()</code> is the only place
                    that key becomes a sentence a person can read.
                  </span>
                ),
                ko: (
                  <span>
                    에러 key는 throw의 나머지 절반입니다. service가 <code>{'new Err("oauth.error.notSignedIn")'}</code>
                    을 던지면, 그 key가 사람이 읽을 문장이 되는 곳은 <code>.error()</code>뿐입니다.
                  </span>
                ),
              })}
            </div>
            <div>
              {l.trans({
                en: (
                  <span>
                    <code>.translate()</code> holds every other phrase the module shows. Both stages take plain language
                    tuples, with no <code>t()</code> and no <code>.desc()</code>:
                  </span>
                ),
                ko: (
                  <span>
                    <code>.translate()</code>에는 모듈이 보여 주는 그 밖의 문구를 담습니다. 두 단계 모두{" "}
                    <code>t()</code>나 <code>.desc()</code> 없이 언어 배열을 그대로 받습니다:
                  </span>
                ),
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="libs/shared/lib/_oauth/oauth.dictionary.ts"
              code={`  .error({
    requestNotFound: [
      "The authorization request is unknown, expired or already decided",
      "인가 요청이 없거나 만료되었거나 이미 처리되었다.",
    ],
    requestBoundToAnotherAccount: [
      "This authorization request was started by another account",
      "이 인가 요청은 다른 계정이 시작했다.",
    ],
    notSignedIn: ["Sign in to continue", "계속하려면 로그인해야 한다."],
    disabled: [
      "OAuth is disabled on this server",
      "이 서버에서 OAuth 가 꺼져 있다.",
    ],
  })
  .translate({
    consentTitle: ["Authorize access", "접근 허용"],
    consentScope: [
      "It will be able to do everything your account can do until you sign it out.",
      "로그아웃시키기 전까지 내 계정이 할 수 있는 모든 일을 할 수 있습니다.",
    ],
    disconnect: ["Disconnect", "연결 끊기"],
    connectedAt: ["Connected {at}", "{at} 연결"],
  });`}
            />
            <ul className={bulletList}>
              {errorNotes.map((note, idx) => (
                <li key={idx}>{note}</li>
              ))}
            </ul>
            <Docs.SubSubTitle>{l.trans({ en: "Tone of voice", ko: "어투" })}</Docs.SubSubTitle>
            <div>
              {l.trans({
                en: "The ending follows who the sentence speaks to. Both conventions in the file above are deliberate:",
                ko: "문장 끝은 그 문장이 누구에게 말하는지를 따릅니다. 위 파일의 두 어투는 모두 의도된 것입니다:",
              })}
            </div>
            <Docs.IntroTable
              type={l.trans({ en: "Stage", ko: "단계" })}
              descLabel={l.trans({ en: "How it is written", ko: "쓰는 법" })}
              items={registerRows}
            />
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="reading-keys" title={l.trans({ en: "Reading A Key Back", ko: "key로 문구 읽기" })}>
          <Docs.Title>{l.trans({ en: "Reading A Key Back", ko: "key로 문구 읽기" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: (
                  <span>
                    Every key sits under the service's own name, and the stage decides what comes next. Endpoint labels
                    get a <code>signal</code> segment so they stay clear of the phrases; phrases get none.
                  </span>
                ),
                ko: (
                  <span>
                    모든 key는 service 이름 아래에 놓이고, 그다음 자리는 단계가 정합니다. endpoint 레이블에는 문구와
                    섞이지 않도록 <code>signal</code> 구간이 붙고, 문구에는 아무것도 붙지 않습니다.
                  </span>
                ),
              })}
            </div>
            <Docs.IntroTable
              type="key"
              descLabel={l.trans({ en: "Where it comes from and how to read it", ko: "적는 곳과 읽는 방법" })}
              items={keyRows}
            />
            <div>
              {l.trans({
                en: "The OAuth consent page reads its phrases this way, on the server. Markup is trimmed here:",
                ko: "OAuth 동의 페이지는 서버에서 이렇게 문구를 읽습니다. 마크업은 줄여서 옮겼습니다:",
              })}
            </div>
            <Code.Snippet
              className="w-full"
              language="tsx"
              title="libs/shared/page/oauth/consent/_index.tsx"
              code={`import { fetch, usePage } from "@libs/shared/client";
import { page } from "akanjs/client";

export default page()
  .search("request", String, { desc: "The request of this screen." })
  .render(async ({ request: requestId }) => {
    const { l } = usePage();
    const request = requestId
      ? await fetch.viewOAuthAuthorizationRequest(requestId).catch(() => null)
      : null;
    return (
      <main>
        <h1>{l("oauth.consentTitle")}</h1>
        {request ? (
          <p>{l("oauth.consentScope")}</p>
        ) : (
          <p>{l("oauth.consentUnavailable")}</p>
        )}
      </main>
    );
  });`}
            />
            <ul className={bulletList}>
              {readNotes.map((note, idx) => (
                <li key={idx}>{note}</li>
              ))}
            </ul>
            <Docs.Alert type="error">
              {l.trans({
                en: (
                  <span>
                    <strong>
                      <code>l()</code> does not take an error key.
                    </strong>{" "}
                    <code>{'l("oauth.error.notSignedIn")'}</code> is a type error. Error keys go through{" "}
                    <code>Err</code> on the server and <code>msg.error()</code> on the client.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>l()</code>은 error key를 받지 않습니다.
                    </strong>{" "}
                    <code>{'l("oauth.error.notSignedIn")'}</code>은 타입 에러입니다. error key는 서버에서는{" "}
                    <code>Err</code>로, 클라이언트에서는 <code>msg.error()</code>로 씁니다.
                  </span>
                ),
              })}
            </Docs.Alert>

            <Docs.SubSubTitle>{l.trans({ en: "Common mistakes", ko: "자주 하는 실수" })}</Docs.SubSubTitle>
            <Docs.Table columns={mistakeColumns} rows={mistakeRows} stacked />

            <Docs.SubSubTitle>{l.trans({ en: "Read next", ko: "이어서 읽기" })}</Docs.SubSubTitle>
            <Docs.LinkGrid items={nextLinks} />
          </Docs.Description>
        </Scroll.Slide>
        <DocsToc />
      </Scroll>
    );
  });
