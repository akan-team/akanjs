import { usePage } from "@apps/akan/client";
import { Code, Divider, Docs, DocsToc } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { page } from "akanjs/client";

export default page()
  .config({ transition: "fade" })
  .head(({ lang }) => {
    const title = lang === "ko" ? "일반: 스크립트 정책 | Akan.js" : "General: Script Policy | Akan.js";
    const description =
      lang === "ko"
        ? "페이지가 보내는 script-src 정책, 직접 쓴 인라인 스크립트를 해시나 nonce로 허용하는 방법, 위반 보고를 보는 방법."
        : "The script-src policy a page sends, how to name your own inline scripts by hash or nonce, and how to see reports.";
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

    const classColumns = [
      { key: "response", label: l.trans({ en: "Response", ko: "응답" }) },
      {
        key: "policy",
        label: l.trans({ en: "script-src it reports against", ko: "보고 기준이 되는 script-src" }),
        code: true,
      },
    ];
    const classRows = [
      {
        response: l.trans({ en: "A server-rendered page", ko: "서버 렌더링 페이지" }),
        policy: "'self' 'nonce-…' 'sha256-<bootstrap>' 'sha256-<flush>' 'sha256-<import map>' 'strict-dynamic'",
      },
      {
        response: l.trans({ en: "The same page from the HTML cache", ko: "HTML 캐시에서 나온 같은 페이지" }),
        policy:
          "'self' 'sha256-<bootstrap>' 'sha256-<flush>' 'sha256-<import map>' 'sha256-<each script React wrote>' 'strict-dynamic'",
      },
      {
        response: l.trans({ en: "The CSR document (?csr=true)", ko: "CSR 문서 (?csr=true)" }),
        policy: "'self' 'sha256-<the inlined bundle>' 'strict-dynamic'",
      },
      {
        response: l.trans({
          en: "System pages (404, 500), the OAuth error page",
          ko: "시스템 페이지 (404, 500), OAuth 오류 페이지",
        }),
        policy: "'self' 'strict-dynamic'",
      },
      {
        response: l.trans({ en: "The gateway's status page", ko: "게이트웨이 상태 페이지" }),
        policy: "'self' 'sha256-<its reload script>' 'strict-dynamic'",
      },
      {
        response: l.trans({ en: "Under akan start", ko: "akan start에서" }),
        policy: "… 'nonce-…' 'strict-dynamic' 'unsafe-eval'",
      },
    ];

    const scriptColumns = [
      { key: "script", label: l.trans({ en: "Inline script", ko: "인라인 스크립트" }) },
      { key: "where", label: l.trans({ en: "Where it is written", ko: "쓰는 곳" }), code: true },
      { key: "how", label: l.trans({ en: "How the policy names it", ko: "정책이 허용하는 방식" }) },
    ];
    const scriptRows = [
      {
        script: l.trans({
          en: "Bootstrap: chunk loader, theme init, the page's values",
          ko: "부트스트랩: 청크 로더, 테마 초기화, 페이지 값",
        }),
        where: "server/ssrInlineScripts.ts",
        how: l.trans({
          en: "Static text, by hash. Route state, dictionary URL, import map key and prefixes are a JSON block before it.",
          ko: "고정된 텍스트라 해시로. 라우트 상태, 사전 URL, import map 키, prefix는 그 앞의 JSON 블록에 있습니다.",
        }),
      },
      {
        script: l.trans({ en: "Flight chunks, a late redirect, the end", ko: "Flight 청크, 늦은 리다이렉트, 끝" }),
        where: "server/ssrInlineScripts.ts",
        how: l.trans({
          en: "JSON blocks, which never run. One static flush call per batch reads them, by hash.",
          ko: "실행되지 않는 JSON 블록. 묶음마다 고정된 flush 호출 하나가 읽고, 해시로 허용됩니다.",
        }),
      },
      {
        script: l.trans({ en: "Import map", ko: "Import map" }),
        where: "server/ssrInlineScripts.ts",
        how: l.trans({ en: "One per build, by hash.", ko: "빌드마다 하나, 해시로." }),
      },
      {
        script: l.trans({
          en: "React's own scripts that reveal a streamed boundary",
          ko: "스트리밍된 경계를 드러내는 React 자체 스크립트",
        }),
        where: "react-dom/server",
        how: l.trans({
          en: "The response's nonce. A cached page lists their hashes instead.",
          ko: "응답의 nonce. 캐시된 페이지는 대신 그 해시를 나열합니다.",
        }),
      },
      {
        script: l.trans({ en: "The CSR document's inlined bundle", ko: "CSR 문서에 인라인된 번들" }),
        where: "server/webCsrSurface.ts",
        how: l.trans({ en: "Hashed once per built file.", ko: "빌드된 파일마다 한 번 해시합니다." }),
      },
      {
        script: l.trans({ en: "The gateway status page's reload loop", ko: "게이트웨이 상태 페이지의 새로고침 루프" }),
        where: "server/gateway/gatewayStatusPage.ts",
        how: l.trans({ en: "Static text, by hash.", ko: "고정된 텍스트라 해시로." }),
      },
      {
        script: l.trans({
          en: "Dev only: HMR client, the dev registry shim and shell, the error page's reload, Akan Studio",
          ko: "개발 전용: HMR 클라이언트, dev 레지스트리 shim과 shell, 오류 페이지 새로고침, Akan Studio",
        }),
        where: "server/hmr/*, server/devtools/studio/*",
        how: l.trans({
          en: "The response's nonce (they import modules themselves); Studio's runtime by hash.",
          ko: "응답의 nonce (스스로 모듈을 import하므로). Studio 런타임은 해시로.",
        }),
      },
      {
        script: l.trans({
          en: "An MCP app view, a native app's index.html",
          ko: "MCP 앱 뷰, 네이티브 앱의 index.html",
        }),
        where: "server/mcp/McpAppShell.ts, @akanjs/native",
        how: l.trans({
          en: "Not served as a page: the MCP host's sandbox sets the view's policy, and a native build hashes its own index.html.",
          ko: "페이지로 제공되지 않습니다: MCP 호스트의 샌드박스가 뷰의 정책을 정하고, 네이티브 빌드는 자기 index.html을 해시합니다.",
        }),
      },
    ];

    const settingRows = [
      {
        key: "AKAN_CONTENT_SECURITY_POLICY_REPORT_ONLY",
        type: "string",
        desc: l.trans({
          en: "`off` drops the report-only header. Any other value is sent as written in its place, with no hash or nonce added.",
          ko: "`off`면 report-only 헤더를 보내지 않습니다. 다른 값은 해시나 nonce를 붙이지 않고 그대로 대신 보냅니다.",
        }),
        example: "AKAN_CONTENT_SECURITY_POLICY_REPORT_ONLY=off",
      },
      {
        key: "AKAN_CONTENT_SECURITY_POLICY_SCRIPT_SRC",
        type: "string",
        desc: l.trans({
          en: "Source expressions added to every response's script-src, separated by spaces: `'wasm-unsafe-eval'` for a page that compiles WebAssembly, or the hash of a snippet every page carries.",
          ko: "모든 응답의 script-src에 추가할 source 표현식으로, 공백으로 구분합니다: WebAssembly를 컴파일하는 페이지라면 `'wasm-unsafe-eval'`, 모든 페이지에 있는 스니펫이라면 그 해시.",
        }),
        example: "AKAN_CONTENT_SECURITY_POLICY_SCRIPT_SRC='wasm-unsafe-eval'",
      },
      {
        key: "AKAN_CONTENT_SECURITY_POLICY_REPORT_URI",
        type: "string",
        desc: l.trans({
          en: "Where the browser posts each report: added as `report-uri` and `report-to`, with a `Reporting-Endpoints` header.",
          ko: "브라우저가 보고를 보내는 곳: `report-uri`와 `report-to`로 추가되고 `Reporting-Endpoints` 헤더가 함께 갑니다.",
        }),
        example: "AKAN_CONTENT_SECURITY_POLICY_REPORT_URI=https://reports.example.com/csp",
      },
      {
        key: "AKAN_CONTENT_SECURITY_POLICY",
        type: "string",
        default: "frame-ancestors 'self'; base-uri 'self'",
        desc: l.trans({
          en: "The enforced policy, as before: a value replaces it and `off` drops it. It does not change the report-only header.",
          ko: "강제되는 정책으로 이전과 같습니다: 값을 주면 대체하고 `off`면 보내지 않습니다. report-only 헤더는 바꾸지 않습니다.",
        }),
      },
    ];

    return (
      <Scroll>
        <Scroll.Slide id="overview" title={l.trans({ en: "Script Policy", ko: "스크립트 정책" })}>
          <Docs.Title>{l.trans({ en: "Script Policy", ko: "스크립트 정책" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: (
                  <span>
                    Every HTML response carries <code>Content-Security-Policy-Report-Only</code> with a{" "}
                    <code>script-src</code> that names each script the framework writes. In 3.4 the browser only reports
                    what the policy would refuse; 3.5.0 moves the same <code>script-src</code> into the enforced{" "}
                    <code>Content-Security-Policy</code>. An app with no inline script of its own has nothing to do.
                  </span>
                ),
                ko: (
                  <span>
                    모든 HTML 응답은 프레임워크가 쓰는 스크립트를 하나하나 허용하는 <code>script-src</code>를{" "}
                    <code>Content-Security-Policy-Report-Only</code>로 보냅니다. 3.4에서는 정책이 막았을 것을 브라우저가
                    보고만 하고, 3.5.0에서는 같은 <code>script-src</code>가 강제되는{" "}
                    <code>Content-Security-Policy</code>로 옮겨집니다. 직접 쓴 인라인 스크립트가 없는 앱은 할 일이
                    없습니다.
                  </span>
                ),
              })}
            </div>
            <Docs.SubSubTitle>{l.trans({ en: "What each response sends", ko: "응답마다 보내는 것" })}</Docs.SubSubTitle>
            <Docs.Table columns={classColumns} rows={classRows} stacked />
            <ul className={bulletList}>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <code>'strict-dynamic'</code> turns <code>'self'</code> off in a current browser: a script runs
                      because the policy names it by hash or nonce, or because a script that already runs added it.{" "}
                      <code>'self'</code> is what an older browser falls back to.
                    </span>
                  ),
                  ko: (
                    <span>
                      <code>'strict-dynamic'</code>은 최신 브라우저에서 <code>'self'</code>를 끕니다: 스크립트는 정책이
                      해시나 nonce로 허용했거나, 이미 실행 중인 스크립트가 추가했을 때 실행됩니다. <code>'self'</code>는
                      구형 브라우저가 대신 쓰는 값입니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      The enforced header is unchanged: <code>frame-ancestors 'self'; base-uri 'self'</code>.
                    </span>
                  ),
                  ko: (
                    <span>
                      강제되는 헤더는 그대로입니다: <code>frame-ancestors 'self'; base-uri 'self'</code>.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: "A page replayed from the HTML cache has no nonce: it lists the hash of every script its first render ran under one, which is one per boundary that streamed in.",
                  ko: "HTML 캐시에서 다시 보내는 페이지에는 nonce가 없습니다: 첫 렌더가 nonce로 실행한 스크립트의 해시를 모두 나열하며, 스트리밍으로 들어온 boundary마다 하나씩입니다.",
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      A response names at most 32 hashes, which keeps the header under 2 KB: a proxy in front reads a
                      response's headers into one buffer (4 KB in nginx unless configured) and answers 502 past it. A
                      page whose replay would need more is rendered for each request and says so:{" "}
                      <code>X-Akan-Cache: BYPASS</code> with <code>X-Akan-Cache-Reason: script-hashes</code>, counted
                      under that reason in <code>akan_route_cache_lookups_total</code>, and one warning in the log per
                      route. Hashes a <code>.head()</code> declares past the 32 are left out, with one warning per
                      route.
                    </span>
                  ),
                  ko: (
                    <span>
                      한 응답은 해시를 최대 32개까지 적고, 그러면 헤더가 2 KB를 넘지 않습니다: 앞단의 프록시는 응답
                      헤더를 버퍼 하나에 읽고 (nginx는 설정하지 않으면 4 KB) 넘치면 502로 답합니다. 다시 보낼 때 그보다
                      많이 필요한 페이지는 요청마다 렌더링하고 그 사실을 알립니다: <code>X-Akan-Cache: BYPASS</code>와{" "}
                      <code>X-Akan-Cache-Reason: script-hashes</code>, <code>akan_route_cache_lookups_total</code>의
                      같은 reason, 그리고 route마다 한 번의 경고 로그입니다. <code>.head()</code>가 선언한 해시 중
                      32개를 넘는 것은 빠지고, route마다 한 번 경고합니다.
                    </span>
                  ),
                })}
              </li>
            </ul>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide
          id="own-scripts"
          title={l.trans({ en: "Your Own Inline Scripts", ko: "직접 쓴 인라인 스크립트" })}
        >
          <Docs.Title>{l.trans({ en: "Your Own Inline Scripts", ko: "직접 쓴 인라인 스크립트" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: (
                  <span>
                    An inline <code>{"<script>"}</code> a <code>.head()</code> or a layout writes is reported until the
                    policy names it. Name a constant snippet by hash with <code>scriptHashes()</code>: the page stays
                    cacheable, and the hash is the one the browser prints in its console report.
                  </span>
                ),
                ko: (
                  <span>
                    <code>.head()</code>나 레이아웃이 쓰는 인라인 <code>{"<script>"}</code>는 정책이 허용하기 전까지
                    보고됩니다. 고정된 스니펫은 <code>scriptHashes()</code>로 해시를 알려 주세요: 페이지는 계속
                    캐시되고, 해시는 브라우저가 콘솔 보고에 출력하는 그 값입니다.
                  </span>
                ),
              })}
            </div>
          </Docs.Description>
          <Code.Snippet
            className="w-full"
            title="apps/myapp/page/_layout.tsx"
            code={`import { layout, scriptHashes } from "akanjs/client";

const consent = "window.dataLayer=window.dataLayer||[];";

export default layout()
  .head(() => {
    scriptHashes("sha256-djPdT5J1kuWFwawDhtbzz0YHt/63i3CUBG3CyUjLa4c=");
    return <script dangerouslySetInnerHTML={{ __html: consent }} />;
  })
  .render(({ children }) => children);`}
          />
          <Docs.Description>
            <div>
              {l.trans({
                en: (
                  <span>
                    For text that differs per request, or a <code>{"<script src>"}</code> written in JSX, pass the
                    response's nonce. Reading it makes the page dynamic, so neither result cache stores it.
                  </span>
                ),
                ko: (
                  <span>
                    요청마다 달라지는 텍스트나 JSX로 쓴 <code>{"<script src>"}</code>에는 응답의 nonce를 넘기세요.
                    nonce를 읽으면 페이지가 dynamic이 되어 어느 결과 캐시에도 저장되지 않습니다.
                  </span>
                ),
              })}
            </div>
          </Docs.Description>
          <Code.Snippet
            className="w-full"
            title="apps/myapp/page/_layout.tsx"
            code={`import { layout, scriptNonce } from "akanjs/client";

export default layout()
  .head(() => <script nonce={scriptNonce()} src="https://tags.example.com/loader.js" async />)
  .render(({ children }) => children);`}
          />
          <Docs.Description>
            <ul className={bulletList}>
              <li>
                {l.trans({
                  en: (
                    <span>
                      Call both from <code>.head()</code>: the header leaves with the first byte, so a hash a component
                      declares while it renders is too late. Both do nothing in the browser.
                    </span>
                  ),
                  ko: (
                    <span>
                      둘 다 <code>.head()</code>에서 호출하세요: 헤더는 첫 바이트와 함께 나가므로 컴포넌트가 렌더링 중에
                      선언한 해시는 늦습니다. 브라우저에서는 둘 다 아무 일도 하지 않습니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: "A third-party script loaded from another origin needs the nonce on its tag, or a script that already runs must add it (a tag manager's own loader does). Listing its host in the policy does nothing under 'strict-dynamic'. Whatever a trusted script then adds needs no entry.",
                  ko: "다른 origin에서 불러오는 서드파티 스크립트는 태그에 nonce가 있거나, 이미 실행 중인 스크립트가 추가해야 합니다 (태그 매니저의 로더가 그렇게 합니다). 'strict-dynamic'에서는 정책에 host를 적어도 효과가 없습니다. 신뢰된 스크립트가 그 뒤에 추가하는 것은 따로 적을 필요가 없습니다.",
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      An inline event handler attribute (<code>onclick="…"</code>) and a <code>javascript:</code> URL
                      have no hash or nonce form: move them into a component's handler.
                    </span>
                  ),
                  ko: (
                    <span>
                      인라인 이벤트 핸들러 속성 (<code>onclick="…"</code>)과 <code>javascript:</code> URL은 해시나
                      nonce로 허용할 수 없습니다: 컴포넌트의 핸들러로 옮기세요.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: "A script React inserts on a soft navigation is added by a script that already runs, so it needs neither.",
                  ko: "소프트 내비게이션에서 React가 넣는 스크립트는 이미 실행 중인 스크립트가 추가하므로 둘 다 필요 없습니다.",
                })}
              </li>
            </ul>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="reports" title={l.trans({ en: "Reports And Settings", ko: "보고와 설정" })}>
          <Docs.Title>{l.trans({ en: "Reports And Settings", ko: "보고와 설정" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: "A report-only violation shows in the browser console as a [Report Only] line that names the script and the hash that would allow it. To collect them from real visitors, point the header at an endpoint that accepts the browser's JSON report.",
                ko: "report-only 위반은 브라우저 콘솔에 [Report Only] 줄로 나타나고, 스크립트와 그것을 허용할 해시를 알려 줍니다. 실제 방문자의 보고를 모으려면 브라우저의 JSON 보고를 받는 endpoint를 헤더에 지정하세요.",
              })}
            </div>
            <Docs.OptionTable items={settingRows} />
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide
          id="framework-scripts"
          title={l.trans({ en: "The Framework's Scripts", ko: "프레임워크의 스크립트" })}
        >
          <Docs.Title>{l.trans({ en: "The Framework's Scripts", ko: "프레임워크의 스크립트" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: "Every inline script the framework writes, and why none of them is reported. Executable text is constant and named by hash; a value that differs per request is data a constant script reads.",
                ko: "프레임워크가 쓰는 모든 인라인 스크립트와, 어느 것도 보고되지 않는 이유입니다. 실행되는 텍스트는 고정되어 해시로 허용되고, 요청마다 달라지는 값은 고정된 스크립트가 읽는 데이터입니다.",
              })}
            </div>
            <Docs.Table columns={scriptColumns} rows={scriptRows} />
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="page-changes" title={l.trans({ en: "What Changes In A Page", ko: "페이지에서 달라지는 것" })}>
          <Docs.Title>{l.trans({ en: "What Changes In A Page", ko: "페이지에서 달라지는 것" })}</Docs.Title>
          <Docs.Description>
            <ul className={bulletList}>
              <li>
                {l.trans({
                  en: (
                    <span>
                      In the page source, the route state, the dictionary URL and each Flight chunk are{" "}
                      <code>{'<script type="application/json">'}</code> blocks where there was script text, and the
                      markup has no <code>{'<script type="module">'}</code> tag for the client entry: the bootstrap
                      script adds it once the document has arrived.
                    </span>
                  ),
                  ko: (
                    <span>
                      페이지 소스에서 route state, dictionary URL, Flight chunk는 스크립트 텍스트 대신{" "}
                      <code>{'<script type="application/json">'}</code> 블록이고, 마크업에는 클라이언트 entry의{" "}
                      <code>{'<script type="module">'}</code> 태그가 없습니다: 문서가 다 도착하면 bootstrap 스크립트가
                      추가합니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      A module a script adds does not hold the document's events back, so <code>DOMContentLoaded</code>{" "}
                      and <code>load</code> can fire before the client entry runs (on a cached docs page,{" "}
                      <code>load</code> at 31 ms and the entry at 63 ms). A listener for either that client code adds
                      afterwards is never called: check <code>document.readyState</code> first.
                    </span>
                  ),
                  ko: (
                    <span>
                      스크립트가 추가한 module은 문서의 이벤트를 붙잡지 않으므로, <code>DOMContentLoaded</code>와{" "}
                      <code>load</code>가 클라이언트 entry보다 먼저 발생할 수 있습니다 (캐시된 문서 페이지에서{" "}
                      <code>load</code> 31 ms, entry 63 ms). 클라이언트 코드가 그 뒤에 추가한 listener는 호출되지
                      않습니다: 먼저 <code>document.readyState</code>를 확인하세요.
                    </span>
                  ),
                })}
              </li>
            </ul>
          </Docs.Description>
          <Code.Snippet
            className="w-full"
            title="apps/myapp/webkit/useWindowLoad.tsx"
            code={`if (document.readyState === "complete") onLoad();
else window.addEventListener("load", onLoad, { once: true });`}
          />
          <Docs.Description>
            <ul className={bulletList}>
              <li>
                {l.trans({
                  en: (
                    <span>
                      For <code>DOMContentLoaded</code> the test is <code>document.readyState !== "loading"</code>.
                    </span>
                  ),
                  ko: (
                    <span>
                      <code>DOMContentLoaded</code>는 <code>document.readyState !== "loading"</code>으로 확인합니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      A browser test that clicks or types as soon as navigation reports <code>load</code> can meet a
                      page that has not hydrated, and the event is lost. Wait for something only the hydrated page does:
                      assert the result of the action and let the runner retry it, or wait for a marker a client
                      component sets in an effect, such as <code>document.documentElement.dataset.hydrated</code>.
                    </span>
                  ),
                  ko: (
                    <span>
                      내비게이션이 <code>load</code>를 알리자마자 클릭하거나 입력하는 브라우저 테스트는 아직 hydrate되지
                      않은 페이지를 만나 이벤트를 잃을 수 있습니다. hydrate된 페이지만 하는 일을 기다리세요: 동작의
                      결과를 단언하고 러너가 재시도하게 하거나, 클라이언트 컴포넌트가 effect에서 남기는 표시 (예:{" "}
                      <code>document.documentElement.dataset.hydrated</code>)를 기다립니다.
                    </span>
                  ),
                })}
              </li>
            </ul>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="enforcement" title={l.trans({ en: "What 3.5.0 Enforces", ko: "3.5.0이 강제하는 것" })}>
          <Docs.Title>{l.trans({ en: "What 3.5.0 Enforces", ko: "3.5.0이 강제하는 것" })}</Docs.Title>
          <Docs.Description>
            <ul className={bulletList}>
              <li>
                {l.trans({
                  en: "The script-src above joins the enforced Content-Security-Policy, so a script it does not name stops running instead of being reported.",
                  ko: "위의 script-src가 강제되는 Content-Security-Policy에 들어가, 허용되지 않은 스크립트는 보고되는 대신 실행되지 않습니다.",
                })}
              </li>
              <li>
                {l.trans({
                  en: "Before upgrading, load your pages on 3.4 with the console open (or collect reports for a release) until none is left.",
                  ko: "업그레이드 전에 3.4에서 콘솔을 열고 페이지를 불러 (또는 한 릴리스 동안 보고를 모아) 보고가 남지 않게 하세요.",
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <code>AKAN_CONTENT_SECURITY_POLICY</code> stays the override: a value replaces the enforced policy
                      whole, and <code>off</code> drops it.
                    </span>
                  ),
                  ko: (
                    <span>
                      <code>AKAN_CONTENT_SECURITY_POLICY</code>는 계속 override입니다: 값을 주면 강제 정책 전체를
                      대체하고 <code>off</code>면 보내지 않습니다.
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
