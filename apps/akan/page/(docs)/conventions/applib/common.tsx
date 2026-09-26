import { usePage } from "@apps/akan/client";
import { Code, Divider, Docs, DocsToc, type IntroItem } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { page } from "akanjs/client";

export default page().render(() => {
  const { l } = usePage();

  const layerPlacement: IntroItem[] = [
    {
      name: "common/",
      desc: l.trans({
        en: "Pure, isomorphic, zero-dependency; imports only sibling common/* and akanjs/base, not Err.",
        ko: "순수하고 서버·클라이언트 양쪽에서 실행되며 의존성이 없습니다. 형제 common/*과 akanjs/base만 import하고 Err는 못 씁니다.",
      }),
      example: "libs/util/common/isHttpUri.ts\n// camelCase file, filename equals the single export",
    },
    {
      name: "webkit/",
      desc: l.trans({
        en: "Touches window, navigator or Capacitor, or is a React hook.",
        ko: "window, navigator, Capacitor를 건드리거나 React hook입니다.",
      }),
      example: "libs/util/webkit/useGeoLocation.tsx\n// use<Thing>.tsx — .tsx even with no JSX",
    },
    {
      name: "srvkit/",
      desc: l.trans({
        en: "Touches node:*, Bun, process.env, a secret, or a server SDK.",
        ko: "node:*, Bun, process.env, secret, 서버 SDK 중 하나라도 건드립니다.",
      }),
      example: "libs/util/srvkit/cloudflareApi.ts\n// camelCase file, PascalCase class",
    },
    {
      name: "ui/",
      desc: l.trans({
        en: "Renders JSX or defines a recipe, bound to no model; a model-bound component goes in its module.",
        ko: "JSX를 그리거나 레시피로 모양을 정의하되 model 하나에 묶이지 않습니다. model에 묶인 컴포넌트는 그 module에 둡니다.",
      }),
      example: "apps/akan/ui/BrowserMockup.tsx\n// PascalCase component, camelCase sidecar",
    },
    {
      name: "plugin/",
      desc: l.trans({
        en: "A build-time or CLI-time AkanPlugin, registered in akan.config.ts.",
        ko: "빌드 시점이나 CLI 시점에 실행되는 AkanPlugin입니다. akan.config.ts에 등록합니다.",
      }),
      example: "libs/util/plugin/pushNotification.plugin.ts\n// <name>.plugin.ts",
    },
  ];

  const helperKinds: IntroItem[] = [
    {
      name: <span className="font-sans">{l.trans({ en: "Formatter", ko: "포맷터" })}</span>,
      desc: l.trans({
        en: "Formatting that a service's output and the UI share, such as bytes, money or short labels.",
        ko: "service 응답과 UI 표시가 함께 쓰는 포맷 로직입니다. 바이트, 금액, 짧은 라벨 같은 것입니다.",
      }),
      example: `// apps/koyo/common/formatBytes.ts
export const formatBytes = (bytes: number) => {
  if (bytes < 1) return "0B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const idx = Math.min(Math.floor(Math.log2(bytes) / 10), units.length - 1);
  return \`\${(bytes / 1024 ** idx).toFixed(1)}\${units[idx]}\`;
};`,
    },
    {
      name: <span className="font-sans">{l.trans({ en: "Validator", ko: "검증 함수" })}</span>,
      desc: l.trans({
        en: "A validation or predicate that must give the same answer on the server and in the browser.",
        ko: "서버와 브라우저에서 같은 답을 내야 하는 검증 함수나 판별 함수입니다.",
      }),
      example: `// apps/koyo/common/isWebUrl.ts
export const isWebUrl = (value: string) => {
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
};`,
    },
    {
      name: <span className="font-sans">{l.trans({ en: "Random and string utility", ko: "랜덤·문자열 유틸" })}</span>,
      desc: l.trans({
        en: "A small generic helper: random codes, padding, shuffling or a short string transform.",
        ko: "랜덤 코드, 자릿수 채우기, 섞기, 짧은 문자열 변환 같은 작은 범용 helper입니다.",
      }),
      example: `// libs/util/common/randomCode.ts
import { pad } from "./pad";

export const randomCode = (length = 6) =>
  pad(Math.floor(Math.random() * 10 ** length), length);`,
    },
    {
      name: <span className="font-sans">{l.trans({ en: "Metadata builder", ko: "메타데이터 빌더" })}</span>,
      desc: l.trans({
        en: "A small object or builder that describes a query, filter or display without running it.",
        ko: "query, filter, 표시 방식을 실행하지 않고 설명만 하는 작은 객체나 빌더입니다.",
      }),
      example: `// libs/shared/lib/summary/summary.constant.ts
import { getQueryMeta } from "@libs/shared/common";

activeUser: field(Int, { default: 0 }).meta(
  getQueryMeta<UserFilter>("user").query("byStatuses").args([["active"]]),
),`,
    },
    {
      name: <span className="font-sans">{l.trans({ en: "Content transform", ko: "콘텐츠 변환" })}</span>,
      desc: l.trans({
        en: "A pure transform of stored content, such as rich-editor JSON into plain text.",
        ko: "저장된 콘텐츠를 다른 모양으로 바꾸는 순수 변환입니다. rich editor JSON을 일반 텍스트로 바꾸는 것이 예입니다.",
      }),
      example: `// libs/shared/common/richEditor.ts
export class RichEditor {
  static richTextToPlain(content: unknown): string {
    const walk = (node: unknown): string => {
      if (!node || typeof node !== "object") return "";
      const { type, text, children } = node as ContentNode;
      if (typeof text === "string") return text;
      const inner = Array.isArray(children) ? children.map(walk).join("") : "";
      return type === "paragraph" ? \`\${inner}\\n\` : inner;
    };
    return walk((content as { root?: unknown } | null)?.root).trim();
  }
}`,
    },
  ];

  const folderColumns = [
    { key: "common", label: "common/", code: true },
    { key: "webkit", label: "webkit/", code: true },
    { key: "srvkit", label: "srvkit/", code: true },
  ];
  const inCommon = { common: true, webkit: false, srvkit: false };
  const inWebkit = { common: false, webkit: true, srvkit: false };
  const inSrvkit = { common: false, webkit: false, srvkit: true };
  const runtimeGroups = [
    {
      label: l.trans({ en: "Both sides have it", ko: "양쪽 모두에 있는 것" }),
      rows: [
        {
          name: "./<sibling> · akanjs/base",
          desc: l.trans({
            en: "A sibling file and `akanjs/base` are the only value imports a common file makes.",
            ko: "같은 폴더의 파일과 `akanjs/base`만 값으로 import할 수 있습니다.",
          }),
          marks: inCommon,
        },
        {
          name: "URL · Intl · Math · JSON",
          desc: l.trans({
            en: "Standard JavaScript built-ins exist in Bun and in every browser.",
            ko: "표준 JavaScript 내장 객체는 Bun에도, 모든 브라우저에도 있습니다.",
          }),
          marks: inCommon,
        },
        {
          name: "import type",
          desc: l.trans({
            en: "Erased before bundling, so the type may come from any package.",
            ko: "번들링 전에 지워지므로 어느 패키지의 타입이든 가져올 수 있습니다.",
          }),
          marks: inCommon,
        },
      ],
    },
    {
      label: l.trans({ en: "Only the browser has it", ko: "브라우저에만 있는 것" }),
      rows: [
        {
          name: "window · document · navigator",
          desc: l.trans({
            en: "Browser globals do not exist on the server.",
            ko: "브라우저 전역 객체는 서버에 없습니다.",
          }),
          marks: inWebkit,
        },
        {
          name: "Capacitor · React hook",
          desc: l.trans({
            en: "The native-app bridge is browser-only, and a React hook needs a client component.",
            ko: "네이티브 앱 브리지는 브라우저에만 있고, React hook은 클라이언트 컴포넌트에서만 씁니다.",
          }),
          marks: inWebkit,
        },
      ],
    },
    {
      label: l.trans({ en: "Only the server has it", ko: "서버에만 있는 것" }),
      rows: [
        {
          name: "node:* · fs · Bun",
          desc: l.trans({
            en: "Server runtime APIs that a browser bundle cannot load.",
            ko: "브라우저 번들이 불러올 수 없는 서버 런타임 API입니다.",
          }),
          marks: inSrvkit,
        },
        {
          name: "process.env · secret",
          desc: l.trans({
            en: "Server settings and secrets must never reach the browser bundle.",
            ko: "서버 설정과 secret은 브라우저 번들에 들어가면 안 됩니다.",
          }),
          marks: inSrvkit,
        },
        {
          name: <span className="font-sans">{l.trans({ en: "server SDK", ko: "서버 SDK" })}</span>,
          desc: l.trans({
            en: "A vendor client for payment, mail or storage.",
            ko: "결제, 메일, 스토리지 같은 vendor client입니다.",
          }),
          marks: inSrvkit,
        },
      ],
    },
  ];

  const server = l.trans({ en: "Server", ko: "서버" });
  const browser = l.trans({ en: "Browser", ko: "브라우저" });
  const callerRows = [
    { file: "user.service.ts", side: server, call: "`withRedirectQuery(signupRedirect, { userId: user.id })`" },
    { file: "user.service.ts", side: server, call: "`randomCode(6)`" },
    { file: "user.store.ts", side: browser, call: "`router.push(withRedirectQuery(redirect, { userId }))`" },
    { file: "User.Util.tsx", side: browser, call: "`pad(phoneCodeRemain.minute, 2)`" },
  ];

  return (
    <Scroll>
      <Scroll.Slide id="common-overview" title={l.trans({ en: "Common Utility Overview", ko: "공통 유틸리티 개요" })}>
        <Docs.Title>{l.trans({ en: "Common Utility Overview", ko: "공통 유틸리티 개요" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  <code>common/</code> holds code that behaves the same on the server and in the browser: small, pure
                  helpers that need no runtime of their own. A service, a signal, a store, a page and a{" "}
                  <code>*.constant.ts</code> file can all import the same helper.
                </span>
              ),
              ko: (
                <span>
                  <code>common/</code>에는 서버와 브라우저에서 똑같이 동작하는 코드를 둡니다. 어느 런타임에도 기대지
                  않는 작고 순수한 helper입니다. service, signal, store, page, <code>*.constant.ts</code>가 모두 같은
                  helper를 import해 씁니다.
                </span>
              ),
            })}
          </div>
          <div>
            {l.trans({
              en: "Reach for it when both sides need the same formatting, validation, metadata or transform, so the two never disagree.",
              ko: "포맷, 검증, 메타데이터, 변환 로직이 양쪽에 모두 필요할 때 씁니다. 한곳에 두면 서버와 브라우저의 답이 어긋나지 않습니다.",
            })}
          </div>

          <Docs.SubSubTitle>{l.trans({ en: "Which folder?", ko: "어느 폴더에 둘까" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: (
                <span>
                  Code outside <code>lib/</code> goes in one of five folders. Choose by what the code touches, not what
                  it is for; the <code>srvkit/</code> and <code>webkit/</code> pages open with this same table.
                </span>
              ),
              ko: (
                <span>
                  <code>lib/</code> 바깥 코드는 다섯 폴더 중 하나에 둡니다. 무엇을 위한 코드인지가 아니라 무엇을
                  건드리는지로 고르며, <code>srvkit/</code>과 <code>webkit/</code> 문서도 같은 표로 시작합니다.
                </span>
              ),
            })}
          </div>
          <Docs.IntroTable type={l.trans({ en: "Folder", ko: "폴더" })} items={layerPlacement} />
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="what-belongs" title={l.trans({ en: "What Belongs In common/", ko: "common/에 두는 것" })}>
        <Docs.Title>{l.trans({ en: "What Belongs In common/", ko: "common/에 두는 것" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Five kinds of helper usually live here. Each needs nothing but its arguments, so it gives the same answer on either side:",
              ko: "여기에는 보통 다섯 종류의 helper를 둡니다. 모두 인자 말고는 필요한 것이 없어서, 어느 쪽에서 부르든 같은 답을 냅니다:",
            })}
          </div>
          <Docs.IntroTable type={l.trans({ en: "Kind", ko: "종류" })} items={helperKinds} />
          <ul className="my-4 list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Two are hypothetical, three are real.</strong> <code>formatBytes</code> and{" "}
                    <code>isWebUrl</code> sit in a sample app; the other three are files in this workspace.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>둘은 예시, 셋은 실제 코드입니다.</strong> <code>formatBytes</code>와 <code>isWebUrl</code>은
                    예시 앱의 파일이고, 나머지 셋은 이 워크스페이스에 실제로 있는 파일입니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      A constant file may import <code>common/</code>, never <code>ui/</code>, <code>webkit/</code> or{" "}
                      <code>srvkit/</code>.
                    </strong>{" "}
                    <code>summary.constant.ts</code> is loaded on both sides, so the <code>getQueryMeta</code> builder
                    it calls has to live in <code>common/</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      constant 파일은 <code>common/</code>은 import할 수 있지만 <code>ui/</code>, <code>webkit/</code>,{" "}
                      <code>srvkit/</code>은 import할 수 없습니다.
                    </strong>{" "}
                    <code>summary.constant.ts</code>는 양쪽에서 모두 불러오므로, 여기서 부르는 <code>getQueryMeta</code>{" "}
                    빌더도 <code>common/</code>에 있어야 합니다.
                  </span>
                ),
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="barrel-optimization" title={l.trans({ en: "Barrel And File Shape", ko: "barrel과 파일 구성" })}>
        <Docs.Title>{l.trans({ en: "Barrel And File Shape", ko: "barrel과 파일 구성" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  Like <code>ui/</code>, <code>webkit/</code> and <code>srvkit/</code>, <code>common/</code> is a barrel
                  folder: its <code>index.ts</code> re-exports every helper in it. Its one-line entries look like this:
                </span>
              ),
              ko: (
                <span>
                  <code>common/</code>도 <code>ui/</code>, <code>webkit/</code>, <code>srvkit/</code>처럼 barrel
                  폴더입니다. 폴더의 <code>index.ts</code>가 안의 helper를 모두 다시 export하며, 한 줄씩 이렇게
                  생겼습니다:
                </span>
              ),
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="libs/util/common/index.ts"
            code={`export * from "./isHttpUri";
export * from "./pad";
export * from "./randomCode";
export * from "./shortenUnit";
export * from "./validate";`}
          />
          <div>
            {l.trans({
              en: (
                <span>
                  So a caller imports the folder, never a single file — <code>@libs/&lt;lib&gt;/common</code> or{" "}
                  <code>@apps/&lt;app&gt;/common</code>:
                </span>
              ),
              ko: (
                <span>
                  그래서 쓰는 쪽은 파일 하나가 아니라 폴더를 import합니다. 경로는 <code>@libs/&lt;lib&gt;/common</code>{" "}
                  또는 <code>@apps/&lt;app&gt;/common</code>입니다:
                </span>
              ),
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="libs/shared/lib/user/user.service.ts"
            code={`import { withRedirectQuery } from "@libs/shared/common";
import { randomCode, randomString } from "@libs/util/common";`}
          />
          <ul className="my-4 list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>One file, one export.</strong> <code>randomCode.ts</code> exports <code>randomCode</code>,
                    so a helper is found by its name.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>파일 하나에 export 하나.</strong> <code>randomCode.ts</code>는 <code>randomCode</code>를
                    export하므로, helper 이름만 알면 파일을 찾을 수 있습니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Only camelCase file names reach the barrel.</strong> A dotted name such as{" "}
                    <code>queryMeta.helper.ts</code>, and every test file, stays private to the folder.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>camelCase 파일 이름만 barrel에 들어갑니다.</strong> <code>queryMeta.helper.ts</code>처럼
                    점이 들어간 이름과 테스트 파일은 폴더 안에서만 씁니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Siblings import each other by relative path.</strong> <code>randomCode.ts</code> imports{" "}
                    <code>./pad</code>, not its own barrel.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>같은 폴더끼리는 상대 경로로 import합니다.</strong> <code>randomCode.ts</code>는 자기 폴더의
                    barrel이 아니라 <code>./pad</code>를 import합니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      <code>index.ts</code> is generated.
                    </strong>{" "}
                    Add, rename or delete a helper file; never edit the index by hand.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>index.ts</code>는 자동으로 만들어집니다.
                    </strong>{" "}
                    helper 파일을 추가하거나 이름을 바꾸거나 지우기만 하고, index를 직접 고치지 않습니다.
                  </span>
                ),
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide
        id="server-client-usage"
        title={l.trans({ en: "Using It On Both Sides", ko: "서버와 브라우저에서 함께 쓰기" })}
      >
        <Docs.Title>{l.trans({ en: "Using It On Both Sides", ko: "서버와 브라우저에서 함께 쓰기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "A common helper runs wherever it is imported: in Bun for a service, in the browser for a store or a client component. So it may use only what both sides have:",
              ko: "common helper는 import한 쪽에서 실행됩니다. service가 부르면 Bun에서, store나 클라이언트 컴포넌트가 부르면 브라우저에서 돕니다. 그래서 양쪽에 모두 있는 것만 쓸 수 있습니다:",
            })}
          </div>
          <Docs.Matrix
            type={l.trans({ en: "What the helper uses", ko: "helper가 쓰는 것" })}
            columns={folderColumns}
            groups={runtimeGroups}
            markLabel={l.trans({ en: "Put it here", ko: "여기에 둡니다" })}
            emptyLabel={l.trans({ en: "Not here", ko: "여기가 아닙니다" })}
          />

          <Docs.SubSubTitle>{l.trans({ en: "One helper, both sides", ko: "helper 하나를 양쪽에서" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: (
                <span>
                  <code>withRedirectQuery</code> adds query params to a redirect URL that may already carry some. It
                  needs only <code>URLSearchParams</code> and string methods:
                </span>
              ),
              ko: (
                <span>
                  <code>withRedirectQuery</code>는 이미 query가 붙어 있을 수 있는 redirect URL에 param을 더합니다.{" "}
                  <code>URLSearchParams</code>와 문자열 메서드만 씁니다:
                </span>
              ),
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="libs/shared/common/redirectQuery.ts"
            code={`export const withRedirectQuery = (
  redirect: string,
  params: Record<string, string>,
) => {
  const queryIndex = redirect.indexOf("?");
  const path = queryIndex === -1 ? redirect : redirect.slice(0, queryIndex);
  const query = new URLSearchParams(
    queryIndex === -1 ? "" : redirect.slice(queryIndex + 1),
  );
  for (const [key, value] of Object.entries(params)) query.set(key, value);
  const search = query.toString();
  return search ? \`\${path}?\${search}\` : path;
};`}
          />
          <div>
            {l.trans({
              en: (
                <span>
                  The user module in <code>libs/shared/lib/user/</code> calls it on both sides, along with two{" "}
                  <code>@libs/util/common</code> helpers:
                </span>
              ),
              ko: (
                <span>
                  <code>libs/shared/lib/user/</code>의 user 모듈은 이 helper를 서버와 브라우저 양쪽에서 부릅니다.{" "}
                  <code>@libs/util/common</code>의 helper 두 개도 함께 씁니다:
                </span>
              ),
            })}
          </div>
          <Docs.Table
            columns={[
              { key: "file", label: l.trans({ en: "File", ko: "파일" }), code: true },
              { key: "side", label: l.trans({ en: "Runs on", ko: "실행 위치" }) },
              { key: "call", label: l.trans({ en: "Call", ko: "호출" }) },
            ]}
            rows={callerRows}
            stacked
          />
          <ul className="my-4 list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>One import for both.</strong> The service and the store import the same name from{" "}
                    <code>@libs/shared/common</code>; nothing changes per side.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>import는 하나입니다.</strong> service와 store가 <code>@libs/shared/common</code>에서 같은
                    이름을 import하고, 쪽마다 달라지는 것은 없습니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>The two sides cannot drift.</strong> The service builds the signup redirect and the store
                    builds the next step's URL with one function, so they agree on the query format.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>양쪽이 어긋날 수 없습니다.</strong> service는 가입 redirect를, store는 다음 단계 URL을 같은
                    함수로 만들므로 query 형식이 항상 같습니다.
                  </span>
                ),
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="practical-rules" title={l.trans({ en: "Practical Rules", ko: "실전 규칙" })}>
        <Docs.Title>{l.trans({ en: "Practical Rules", ko: "실전 규칙" })}</Docs.Title>
        <Docs.Description>
          <Docs.SubSubTitle>{l.trans({ en: "Where a helper goes", ko: "helper를 어디에 둘까" })}</Docs.SubSubTitle>
          <ul className="my-4 list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      Both sides need it → <code>common/</code>.
                    </strong>{" "}
                    Service or signal code and page or component code run the same logic.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      양쪽에 필요하면 → <code>common/</code>.
                    </strong>{" "}
                    service·signal 코드와 page·component 코드가 같은 로직을 씁니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      Needs a server-only API → <code>srvkit/</code>.
                    </strong>
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      서버 전용 API가 필요하면 → <code>srvkit/</code>.
                    </strong>
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      Needs a browser-only API → <code>webkit/</code>.
                    </strong>
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      브라우저 전용 API가 필요하면 → <code>webkit/</code>.
                    </strong>
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      Never beside a model, never in <code>base/</code>.
                    </strong>{" "}
                    A helper file does not go inside <code>lib/&lt;model&gt;/</code>, and there is no <code>base/</code>{" "}
                    folder; shared utilities go in that app's or lib's own <code>common/</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      model 옆이나 <code>base/</code>에 두지 않습니다.
                    </strong>{" "}
                    helper 파일은 <code>lib/&lt;model&gt;/</code> 안에 두지 않고, <code>base/</code> 폴더도 만들지
                    않습니다. 공용 유틸은 그 app이나 lib의 <code>common/</code>에 둡니다.
                  </span>
                ),
              })}
            </li>
          </ul>

          <Docs.SubSubTitle>{l.trans({ en: "Inside a common file", ko: "common 파일 안에서" })}</Docs.SubSubTitle>
          <ul className="my-4 list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Small, pure, imported from the barrel.</strong> One job per helper, no side effects, and
                    callers use the folder path.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>작고 순수하게, barrel에서 import.</strong> helper 하나에 일 하나, 부수 효과 없이 두고, 쓰는
                    쪽은 폴더 경로로 import합니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Return, do not throw.</strong> <code>Err</code> cannot be imported into <code>common/</code>
                    , so return a sentinel such as <code>null</code> or <code>false</code> and let the service or store
                    decide.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>throw하지 말고 값을 돌려줍니다.</strong> <code>common/</code>에는 <code>Err</code>를
                    import할 수 없으므로, <code>null</code>이나 <code>false</code> 같은 값을 돌려주고 판단은 service나
                    store에 맡깁니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      Write <code>{"// FIXME:"}</code>, not <code>{"//!"}</code>.
                    </strong>{" "}
                    <code>common/</code> ships to the browser, and a <code>{"//!"}</code> comment survives minification.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>{"//!"}</code> 대신 <code>{"// FIXME:"}</code>를 씁니다.
                    </strong>{" "}
                    <code>common/</code>은 브라우저로 전송되는데, <code>{"//!"}</code> 주석은 minify 뒤에도 남습니다.
                  </span>
                ),
              })}
            </li>
          </ul>
          <Docs.Alert type="error">
            {l.trans({
              en: (
                <span>
                  <strong>A common file imports neither side.</strong> Lint rejects a value import from the client side
                  (a store, a module component, <code>ui/</code>, <code>webkit/</code>, <code>akanjs/client</code>) and
                  from the server side (a service, document, signal, dictionary, <code>srvkit/</code>,{" "}
                  <code>akanjs/server</code>). <code>import type</code> is erased before bundling, so a type from either
                  side stays legal.
                </span>
              ),
              ko: (
                <span>
                  <strong>common 파일은 어느 쪽도 import하지 않습니다.</strong> 클라이언트 쪽(store, module 컴포넌트,{" "}
                  <code>ui/</code>, <code>webkit/</code>, <code>akanjs/client</code>)이든 서버 쪽(service, document,
                  signal, dictionary, <code>srvkit/</code>, <code>akanjs/server</code>)이든 값으로 import하면 lint가
                  막습니다. <code>import type</code>은 번들링 전에 지워지므로 어느 쪽 타입이든 가져와도 됩니다.
                </span>
              ),
            })}
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <DocsToc />
    </Scroll>
  );
});
