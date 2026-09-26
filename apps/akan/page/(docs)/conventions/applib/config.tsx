import { usePage } from "@apps/akan/client";
import { Code, Divider, Docs, DocsToc } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { page } from "akanjs/client";
import { Link } from "akanjs/ui";

export default page().render(() => {
  const { l } = usePage();

  const bullets = "my-4 list-disc space-y-2 pl-5";
  const inlineLink = "text-primary underline underline-offset-4 hover:no-underline";
  const appOnly = { app: true, lib: false };
  const appAndLib = { app: true, lib: true };

  const keyGroups = [
    {
      label: l.trans({ en: "Serving the web", ko: "웹 서비스" }),
      rows: [
        {
          name: "routes",
          desc: l.trans({
            en: "Which domains open the app, and which basePath each one maps to.",
            ko: "어떤 도메인이 앱을 열고, 각 도메인이 어느 basePath로 이어지는지 정합니다.",
          }),
          marks: appOnly,
        },
        {
          name: "web",
          desc: l.trans({
            en: "Which web surfaces the build produces: SSR pages, the CSR shell, or API only.",
            ko: "빌드가 만들 웹 표면을 정합니다. SSR 페이지, CSR 셸, 또는 API 전용입니다.",
          }),
          marks: appOnly,
        },
        {
          name: "api",
          desc: l.trans({
            en: "Where endpoints and the websocket are mounted. Defaults to `/api` and `/ws`.",
            ko: "엔드포인트와 웹소켓을 마운트할 경로입니다. 기본값은 `/api`와 `/ws`입니다.",
          }),
          marks: appOnly,
        },
        {
          name: "i18n",
          desc: l.trans({
            en: "The locales the app serves and the default one.",
            ko: "앱이 지원하는 locale 목록과 기본 locale입니다.",
          }),
          marks: appOnly,
        },
        {
          name: "images",
          desc: l.trans({
            en: "Sizes, formats and allowed sources for the image optimizer.",
            ko: "이미지 최적화의 크기, 포맷, 허용 출처입니다.",
          }),
          marks: appOnly,
        },
        {
          name: "syncPageLibs",
          desc: l.trans({
            en: "Which libraries' page folders this app serves as its own routes.",
            ko: "어떤 라이브러리의 page 폴더를 이 앱의 라우트로 서비스할지 정합니다.",
          }),
          marks: appOnly,
        },
      ],
    },
    {
      label: l.trans({ en: "Mobile, data and env", ko: "모바일, 데이터, 환경변수" }),
      rows: [
        {
          name: "mobile",
          desc: l.trans({
            en: "The native app's identity and one target per Capacitor package.",
            ko: "네이티브 앱 정보와 Capacitor 패키지별 target입니다.",
          }),
          marks: appOnly,
        },
        {
          name: "database",
          desc: l.trans({
            en: "The database modes the build can run in; a deployment picks one with `AKAN_DATABASE_MODE`.",
            ko: "빌드가 실행될 수 있는 데이터베이스 모드이며, 배포는 `AKAN_DATABASE_MODE`로 그중 하나를 고릅니다.",
          }),
          marks: appOnly,
        },
        {
          name: "publicEnv",
          desc: l.trans({
            en: "An allowlist of extra env names for browser code. The build does not read it yet.",
            ko: "브라우저 코드용 추가 env 이름의 허용 목록입니다. 아직 빌드가 읽지 않습니다.",
          }),
          marks: appOnly,
        },
        {
          name: "secrets",
          desc: l.trans({
            en: "Private files that ship with `akan upload-env` and stay out of git.",
            ko: "`akan upload-env`로 함께 올리고 git에서는 빠지는 비공개 파일입니다.",
          }),
          marks: appOnly,
        },
      ],
    },
    {
      label: l.trans({ en: "Build and image", ko: "빌드와 이미지" }),
      rows: [
        {
          name: "externalLibs",
          desc: l.trans({
            en: "Packages kept out of the bundle and installed in the production image.",
            ko: "번들에서 빼고 프로덕션 이미지에 따로 설치할 패키지입니다.",
          }),
          marks: appAndLib,
        },
        {
          name: "barrelImports",
          desc: l.trans({
            en: "Extra barrels whose imports the build rewrites to the exact file.",
            ko: "빌드가 정확한 파일 import로 바꿔 줄 추가 barrel입니다.",
          }),
          marks: appOnly,
        },
        {
          name: "optimizeImports",
          desc: l.trans({
            en: "Extra packages the browser build parses only as far as they are used.",
            ko: "브라우저 빌드가 실제로 쓰는 부분만 읽을 추가 패키지입니다.",
          }),
          marks: appOnly,
        },
        {
          name: "docker",
          desc: l.trans({
            en: "The production image. A library adds `preRuns` and `postRuns` only.",
            ko: "프로덕션 이미지입니다. 라이브러리는 `preRuns`와 `postRuns`만 더합니다.",
          }),
          marks: appAndLib,
        },
        {
          name: "assets",
          desc: l.trans({
            en: "Which fonts the build prunes from its `public/` copy. A library sets `keepFonts` only.",
            ko: "빌드가 `public/` 복사본에서 폰트를 덜어내는 방식입니다. 라이브러리는 `keepFonts`만 씁니다.",
          }),
          marks: appAndLib,
        },
        {
          name: "plugins",
          desc: l.trans({
            en: "Akan plugins the CLI reads for runtime packages, native setup and assets.",
            ko: "CLI가 런타임 패키지, 네이티브 설정, 에셋 생성에 쓰는 Akan 플러그인입니다.",
          }),
          marks: appAndLib,
        },
      ],
    },
  ];

  const surfaceRows = [
    {
      name: "API",
      desc: l.trans({
        en: "Signal endpoints and the websocket. Always served; `web` does not switch it.",
        ko: "signal 엔드포인트와 웹소켓입니다. 항상 서비스되며 `web`으로 끄지 않습니다.",
      }),
    },
    {
      name: "SSR",
      desc: l.trans({
        en: "Server-rendered pages: the route renderer, its pages and client bundles, and the RSC worker.",
        ko: "서버에서 그리는 페이지입니다. 라우트 렌더러, pages·client 번들, RSC worker를 포함합니다.",
      }),
    },
    {
      name: "CSR",
      desc: l.trans({
        en: "The single-file SPA shell that the Capacitor mobile build ships.",
        ko: "Capacitor 모바일 빌드가 싣고 나가는 단일 파일 SPA 셸입니다.",
      }),
    },
  ];

  const webGroups = [
    {
      label: l.trans({ en: "What each value builds", ko: "값마다 만드는 것" }),
      rows: [
        {
          name: "web: true",
          desc: l.trans({
            en: "The default. Pages and the mobile shell, for an app that also ships a native app.",
            ko: "기본값입니다. 페이지와 모바일 셸을 모두 만들며, 네이티브 앱도 내는 앱에 맞습니다.",
          }),
          marks: { api: true, ssr: true, csr: true },
        },
        {
          name: "web: { csr: false }",
          desc: l.trans({
            en: "Pages without the mobile shell, for a web-only app.",
            ko: "모바일 셸 없이 페이지만 만들며, 웹 전용 앱에 맞습니다.",
          }),
          marks: { api: true, ssr: true, csr: false },
        },
        {
          name: "web: false",
          desc: l.trans({
            en: "API only. Nothing under `page/` or `public/` is served, synced library routes included.",
            ko: "API 전용입니다. `page/`, `public/`, 동기화된 라이브러리 라우트를 모두 서비스하지 않습니다.",
          }),
          marks: { api: true, ssr: false, csr: false },
        },
      ],
    },
  ];

  const imageOptions = [
    {
      key: "remotePatterns",
      type: "{ protocol?, hostname?, port?, pathname?, search? }[]",
      default: "[]",
      desc: l.trans({
        en: "Remote sources the optimizer may fetch. A host not listed is refused.",
        ko: "최적화기가 가져올 수 있는 원격 출처입니다. 목록에 없는 호스트는 거부됩니다.",
      }),
    },
    {
      key: "localPatterns",
      type: "{ pathname?, search? }[]",
      default: '[{ pathname: "/**" }]',
      desc: l.trans({
        en: "Local `public/` paths it may serve.",
        ko: "제공할 수 있는 로컬 `public/` 경로입니다.",
      }),
    },
    {
      key: "deviceSizes",
      type: "number[]",
      default: "[640, 750, 828, 1080, 1200, 1920, 2048, 3840]",
      desc: l.trans({
        en: "Widths for full-width images. A width in neither size list is refused.",
        ko: "화면 너비 이미지용 폭입니다. 두 크기 목록 어디에도 없는 폭은 거부됩니다.",
      }),
    },
    {
      key: "imageSizes",
      type: "number[]",
      default: "[32, 48, 64, 96, 128, 256, 384]",
      desc: l.trans({
        en: "Widths for smaller, fixed-size images such as avatars and icons.",
        ko: "아바타나 아이콘처럼 작은 고정 크기 이미지용 폭입니다.",
      }),
    },
    {
      key: "formats",
      type: '("image/webp" | "image/avif")[]',
      default: '["image/webp"]',
      desc: l.trans({
        en: "Output formats in order of preference. The first one the browser accepts wins.",
        ko: "출력 포맷의 선호 순서입니다. 브라우저가 받는 첫 번째 포맷이 쓰입니다.",
      }),
    },
    {
      key: "qualities",
      type: "number[]",
      default: "[75]",
      desc: l.trans({
        en: "Allowed quality values. A request for any other quality is refused.",
        ko: "허용할 quality 값입니다. 그 밖의 quality 요청은 거부됩니다.",
      }),
    },
    {
      key: "minimumCacheTTL",
      type: "number",
      default: "14400",
      desc: l.trans({
        en: "Minimum cache lifetime in seconds, even when the source asks for less.",
        ko: "초 단위 최소 캐시 유지 시간입니다. 원본이 더 짧게 요구해도 이 값을 지킵니다.",
      }),
    },
    {
      key: "dangerouslyAllowSVG",
      type: "boolean",
      default: "false",
      desc: l.trans({
        en: "Serve SVG sources. Off by default because an SVG can carry script.",
        ko: "SVG 원본을 제공합니다. SVG에는 스크립트가 들어갈 수 있어 기본으로 꺼져 있습니다.",
      }),
    },
    {
      key: "maximumRedirects",
      type: "number",
      default: "3",
      desc: l.trans({
        en: "Redirects followed while fetching a remote source.",
        ko: "원격 원본을 가져올 때 따라갈 리다이렉트 횟수입니다.",
      }),
    },
    {
      key: "fetchTimeoutMs",
      type: "number",
      default: "7000",
      desc: l.trans({
        en: "Timeout for fetching a remote source, in milliseconds.",
        ko: "원격 원본을 가져오는 제한 시간이며 밀리초 단위입니다.",
      }),
    },
    {
      key: "maxRemoteBytes",
      type: "number",
      default: "26214400 (25 MB)",
      desc: l.trans({
        en: "The largest remote source it downloads.",
        ko: "내려받을 수 있는 원격 원본의 최대 크기입니다.",
      }),
    },
    {
      key: "maxConcurrency",
      type: "number",
      default: "0",
      desc: l.trans({
        en: "Images encoded at once. `0` uses half the CPUs of the serving machine, at least one.",
        ko: "동시에 인코딩할 이미지 수입니다. `0`이면 서비스하는 머신 CPU 수의 절반(최소 1)을 씁니다.",
      }),
    },
  ];

  const defaultOptimizedPackages = [
    "lucide-react",
    "date-fns",
    "lodash-es",
    "ramda",
    "antd",
    "react-bootstrap",
    "ahooks",
    "@ant-design/icons",
    "@headlessui/react",
    "@headlessui-float/react",
    "@heroicons/react/20/solid",
    "@heroicons/react/24/solid",
    "@heroicons/react/24/outline",
    "@visx/visx",
    "@tremor/react",
    "rxjs",
    "@mui/material",
    "@mui/icons-material",
    "recharts",
    "react-use",
    "@material-ui/core",
    "@material-ui/icons",
    "@tabler/icons-react",
    "mui-core",
    "react-icons/*",
  ];

  const dockerRunType = "(string | { amd64?, arm64? })[]";

  return (
    <Scroll>
      <Scroll.Slide
        id="akan-config-overview"
        title={l.trans({ en: "akan.config.ts Overview", ko: "akan.config.ts 개요" })}
      >
        <Docs.Title>{l.trans({ en: "akan.config.ts Overview", ko: "akan.config.ts 개요" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  Every app and library keeps one <code>akan.config.ts</code> at its root. It declares how that app is
                  served, built and packaged: domains, web surfaces, the mobile app, the database modes and the Docker
                  image.
                </span>
              ),
              ko: (
                <span>
                  모든 앱과 라이브러리는 루트에 <code>akan.config.ts</code>를 하나씩 둡니다. 이 파일에는 앱을 서비스하고
                  빌드하고 패키징하는 방법, 즉 도메인, 웹 표면, 모바일 앱, 데이터베이스 모드, Docker 이미지를 적습니다.
                </span>
              ),
            })}
          </div>
          <div>
            {l.trans({
              en: "Start from an empty object. Every key you leave out takes a framework default, so add a key only when the default stops fitting:",
              ko: "빈 객체로 시작하면 됩니다. 적지 않은 키는 모두 프레임워크 기본값을 쓰므로, 기본값이 맞지 않을 때만 키를 추가합니다:",
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/myapp/akan.config.ts"
            code={`import type { AppConfig } from "akanjs";

const config: AppConfig = {};

export default config;`}
          />
          <Docs.SubSubTitle>{l.trans({ en: "Every key at a glance", ko: "전체 키 한눈에 보기" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: (
                <span>
                  An app declares its config as <code>AppConfig</code> and a library as <code>LibConfig</code>. The
                  sections below cover each key; <code>api</code>, <code>assets</code> and <code>plugins</code> are in
                  the full reference.
                </span>
              ),
              ko: (
                <span>
                  앱은 <code>AppConfig</code>로, 라이브러리는 <code>LibConfig</code>로 설정을 선언합니다. 키마다 아래
                  섹션에서 다루며, <code>api</code>, <code>assets</code>, <code>plugins</code>는 전체 레퍼런스에
                  있습니다.
                </span>
              ),
            })}
          </div>
          <Docs.Matrix
            type={l.trans({ en: "Key", ko: "키" })}
            columns={[
              { key: "app", label: l.trans({ en: "App", ko: "앱" }), caption: "AppConfig" },
              { key: "lib", label: l.trans({ en: "Library", ko: "라이브러리" }), caption: "LibConfig" },
            ]}
            groups={keyGroups}
            markLabel={l.trans({ en: "Can be declared", ko: "선언할 수 있음" })}
            emptyLabel={l.trans({ en: "Not accepted", ko: "받지 않음" })}
          />
          <Docs.LinkGrid
            items={[
              {
                href: "/docs/core/config",
                title: l.trans({ en: "Config reference", ko: "설정 레퍼런스" }),
                desc: l.trans({
                  en: "Types and defaults for every key, including every mobile field.",
                  ko: "모든 키의 타입과 기본값, 모바일 필드 전체를 봅니다.",
                }),
              },
              {
                href: "/docs/core/multi-client",
                title: l.trans({ en: "Multi Client", ko: "다중 클라이언트" }),
                desc: l.trans({
                  en: "How routes and basePath split one app into several clients.",
                  ko: "routes와 basePath로 앱 하나를 여러 클라이언트로 나누는 법을 봅니다.",
                }),
              },
            ]}
          />
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="config-shape" title={l.trans({ en: "Config File Shape", ko: "설정 파일 형태" })}>
        <Docs.Title>{l.trans({ en: "Config File Shape", ko: "설정 파일 형태" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  <code>AppConfig</code> and <code>LibConfig</code> accept a plain object or a function that returns
                  one. Use an object unless a value depends on the app's own name:
                </span>
              ),
              ko: (
                <span>
                  <code>AppConfig</code>와 <code>LibConfig</code>는 일반 객체나, 객체를 돌려주는 함수를 받습니다. 값이
                  앱 이름에 따라 달라지는 경우가 아니면 객체를 씁니다:
                </span>
              ),
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/myapp/akan.config.ts"
            code={`import type { AppConfig } from "akanjs";

const config: AppConfig = {
  routes: [{ domains: { main: ["www.example.com"] }, basePath: "store" }],
};

export default config;`}
          />
          <div>
            {l.trans({
              en: (
                <span>
                  The function form receives <code>{"{ name, type }"}</code> of the app or library being loaded:
                </span>
              ),
              ko: (
                <span>
                  함수 형태는 읽고 있는 앱이나 라이브러리의 <code>{"{ name, type }"}</code>을 인자로 받습니다:
                </span>
              ),
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/myapp/akan.config.ts"
            code={`import type { AppConfig } from "akanjs";

const config: AppConfig = (app) => ({
  mobile: {
    appName: app.name,
    appId: \`com.koyo.\${app.name}\`,
  },
});

export default config;`}
          />
          <ul className={bullets}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Same keys.</strong> The function returns exactly what the object form would contain.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>키는 같습니다.</strong> 함수는 객체 형태에 적었을 내용을 그대로 돌려줍니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Name and type only.</strong> The argument is <code>AppConfigContext</code> (
                    <code>type: "app"</code>) or <code>LibConfigContext</code> (<code>type: "lib"</code>).
                  </span>
                ),
                ko: (
                  <span>
                    <strong>이름과 종류만 받습니다.</strong> 인자는 <code>AppConfigContext</code>(
                    <code>type: "app"</code>) 또는 <code>LibConfigContext</code>(<code>type: "lib"</code>)입니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Default export.</strong> Akan reads the file's <code>export default</code>; a named export
                    is ignored.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>default export로 내보냅니다.</strong> Akan은 파일의 <code>export default</code>만 읽으며,
                    이름 있는 export는 무시합니다.
                  </span>
                ),
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="routes" title="routes">
        <Docs.Title>routes</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  <code>routes</code> tells the server which domains open the app. Give each route a{" "}
                  <code>basePath</code> when one app serves several clients, such as a shop and its admin:
                </span>
              ),
              ko: (
                <span>
                  <code>routes</code>는 어떤 도메인이 앱을 여는지 서버에 알려 줍니다. 쇼핑몰과 관리자 화면처럼 앱 하나가
                  여러 클라이언트를 서비스한다면 route마다 <code>basePath</code>를 줍니다:
                </span>
              ),
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/shop/akan.config.ts"
            code={`import type { AppConfig } from "akanjs";

const config: AppConfig = {
  routes: [
    { domains: { main: ["shop.example.com"] }, basePath: "shop" },
    { domains: { main: ["admin.example.com"] }, basePath: "admin" },
  ],
};

export default config;`}
          />
          <Docs.OptionTable
            items={[
              {
                key: "basePath",
                type: "string",
                desc: l.trans({
                  en: "The client this route opens, with pages under `page/<basePath>`. Omit it for a single client.",
                  ko: "이 route가 여는 클라이언트이며 페이지는 `page/<basePath>` 아래에 둡니다. 클라이언트가 하나면 생략합니다.",
                }),
              },
              {
                key: "domains",
                type: "{ [branch]: string[] }",
                desc: l.trans({
                  en: "Hosts that open this route, keyed by branch: `debug`, `develop`, `main` or your own key.",
                  ko: "이 route를 여는 호스트이며 branch를 키로 씁니다. `debug`, `develop`, `main` 또는 직접 정한 키입니다.",
                }),
              },
            ]}
          />
          <ul className={bullets}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>The host picks the client.</strong> A request whose host is listed under a route is served
                    from that route's <code>basePath</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>호스트가 클라이언트를 고릅니다.</strong> 어떤 route에 적힌 호스트로 들어온 요청은 그 route의{" "}
                    <code>basePath</code>에서 응답합니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Every branch gets a default host.</strong> For <code>debug</code>, <code>develop</code>,{" "}
                    <code>main</code> and any branch key you add, each basePath also answers on{" "}
                    <code>{"<basePath>-<branch>.<AKAN_PUBLIC_SERVE_DOMAIN>"}</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>branch마다 기본 호스트가 생깁니다.</strong> <code>debug</code>, <code>develop</code>,{" "}
                    <code>main</code>과 직접 추가한 branch 키마다, 각 basePath는 적은 호스트 외에{" "}
                    <code>{"<basePath>-<branch>.<AKAN_PUBLIC_SERVE_DOMAIN>"}</code>에서도 응답합니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>No basePath, one client.</strong> Without any basePath the app answers on{" "}
                    <code>{"<app>-<branch>.<AKAN_PUBLIC_SERVE_DOMAIN>"}</code> and serves every page under{" "}
                    <code>page/</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>basePath가 없으면 클라이언트는 하나입니다.</strong> 이때 앱은{" "}
                    <code>{"<app>-<branch>.<AKAN_PUBLIC_SERVE_DOMAIN>"}</code>에서 응답하고 <code>page/</code> 아래
                    페이지를 모두 서비스합니다.
                  </span>
                ),
              })}
            </li>
          </ul>
          <Docs.Alert type="warning">
            {l.trans({
              en: (
                <span>
                  <strong>Declare a basePath here before a mobile target uses it.</strong> A target's{" "}
                  <code>basePath</code> must be one of the basePaths in <code>routes</code>.
                </span>
              ),
              ko: (
                <span>
                  <strong>mobile target이 쓰는 basePath는 먼저 여기에 선언합니다.</strong> target의{" "}
                  <code>basePath</code>는 <code>routes</code>에 있는 basePath 중 하나여야 합니다.
                </span>
              ),
            })}
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="mobile" title="mobile">
        <Docs.Title>mobile</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  <code>mobile</code> defines the native app Capacitor builds from this app's web surface: its name,
                  bundle id, version, and one target per package.
                </span>
              ),
              ko: (
                <span>
                  <code>mobile</code>은 Capacitor가 이 앱의 웹 화면으로 만드는 네이티브 앱을 정의합니다. 앱 이름, 번들
                  ID, 버전, 그리고 패키지별 target을 여기에 적습니다.
                </span>
              ),
            })}
          </div>
          <div>
            {l.trans({
              en: "Values at the mobile root are defaults for every target, and a target overrides only what it sets:",
              ko: "mobile 루트의 값은 모든 target의 기본값이고, target은 자기가 적은 값만 덮어씁니다:",
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/shop/akan.config.ts"
            code={`import type { AppConfig } from "akanjs";

const config: AppConfig = {
  routes: [{ domains: {}, basePath: "shop" }],
  mobile: {
    appName: "Shop",
    appId: "com.koyo.shop",
    version: "1.0.0",
    buildNum: 12,
    targets: {
      shop: {
        basePath: "shop",
        permissions: ["camera", "push"],
      },
    },
  },
};

export default config;`}
          />
          <Docs.OptionTable
            items={[
              {
                key: "appName",
                type: "string",
                default: l.trans({ en: "the app name", ko: "앱 이름" }),
                desc: l.trans({ en: "Display name of the native app.", ko: "네이티브 앱의 표시 이름입니다." }),
              },
              {
                key: "appId",
                type: "string",
                default: "com.<repo>.<app>",
                desc: l.trans({
                  en: "Android applicationId and iOS bundle id.",
                  ko: "Android applicationId이자 iOS bundle id입니다.",
                }),
              },
              {
                key: "version",
                type: "string",
                default: "0.0.1",
                desc: l.trans({
                  en: "User-facing version: Android versionName and the iOS marketing version.",
                  ko: "사용자에게 보이는 버전이며, Android versionName과 iOS 마케팅 버전에 들어갑니다.",
                }),
              },
              {
                key: "buildNum",
                type: "number",
                default: "1",
                desc: l.trans({
                  en: "Store build number: Android versionCode and the iOS build number.",
                  ko: "스토어 빌드 번호이며, Android versionCode와 iOS 빌드 번호에 들어갑니다.",
                }),
              },
              {
                key: "targets",
                type: "Record<string, Target>",
                default: l.trans({ en: "one target", ko: "target 하나" }),
                desc: l.trans({
                  en: "One entry per native package. The key is the target's name.",
                  ko: "네이티브 패키지마다 하나씩 둡니다. 키가 target의 이름이 됩니다.",
                }),
              },
              {
                key: "targets.*.basePath",
                type: "string",
                desc: l.trans({
                  en: "The client this package opens. It must be a basePath declared in `routes`.",
                  ko: "이 패키지가 여는 클라이언트입니다. `routes`에 선언된 basePath여야 합니다.",
                }),
              },
              {
                key: "targets.*.permissions",
                type: '("camera" | "contacts" | "location" | "push" | "speech")[]',
                default: "[]",
                desc: l.trans({
                  en: "Native permissions. Each one turns on the matching plugin's native setup.",
                  ko: "네이티브 권한입니다. 값마다 해당 플러그인의 네이티브 설정이 켜집니다.",
                }),
              },
            ]}
          />
          <ul className={bullets}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>More target fields.</strong> <code>indexPath</code>, <code>assets</code>,{" "}
                    <code>deepLinks</code>, <code>files</code> and the Capacitor passthrough keys are listed in the{" "}
                    <Link href="/docs/core/config#mobile" className={inlineLink}>
                      config reference
                    </Link>
                    .
                  </span>
                ),
                ko: (
                  <span>
                    <strong>target 필드는 더 있습니다.</strong> <code>indexPath</code>, <code>assets</code>,{" "}
                    <code>deepLinks</code>, <code>files</code>, Capacitor로 그대로 넘기는 키는{" "}
                    <Link href="/docs/core/config#mobile" className={inlineLink}>
                      설정 레퍼런스
                    </Link>
                    에 있습니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Pin a real appId before you ship.</strong> Placeholder ids such as{" "}
                    <code>com.example.*</code> are usually taken on Apple's portal, and <code>akan doctor --ios</code>{" "}
                    warns about them.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>출시 전에 실제 appId를 정합니다.</strong> <code>com.example.*</code> 같은 임시 id는 Apple
                    포털에서 대개 이미 선점되어 있고, <code>akan doctor --ios</code>가 경고합니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Keep the CSR shell on.</strong> The native app ships it, so a <code>mobile</code> section
                    cannot sit beside <code>{"web: { csr: false }"}</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>CSR 셸은 켜 둡니다.</strong> 네이티브 앱이 이 셸을 싣고 나가므로, <code>mobile</code> 섹션은{" "}
                    <code>{"web: { csr: false }"}</code>와 함께 쓸 수 없습니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Platform setup.</strong> Firebase files, signing and store builds are covered in{" "}
                    <Link href="/cheatsheet/mobile/setup" className={inlineLink}>
                      Mobile Setup
                    </Link>
                    .
                  </span>
                ),
                ko: (
                  <span>
                    <strong>플랫폼 설정.</strong> Firebase 파일, 서명, 스토어 빌드는{" "}
                    <Link href="/cheatsheet/mobile/setup" className={inlineLink}>
                      모바일 설정
                    </Link>
                    에서 다룹니다.
                  </span>
                ),
              })}
            </li>
          </ul>
          <Docs.Alert type="warning">
            {l.trans({
              en: (
                <span>
                  <strong>Keep signing secrets out of this file.</strong> Keystore paths and signing passwords are
                  machine-specific, so they belong in local-only files or deployment secrets.
                </span>
              ),
              ko: (
                <span>
                  <strong>서명용 비밀 값은 이 파일에 넣지 않습니다.</strong> keystore 경로와 서명 비밀번호는 머신마다
                  다르므로 로컬 전용 파일이나 배포 시크릿으로 관리합니다.
                </span>
              ),
            })}
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="default-database-mode" title="database">
        <Docs.Title>database</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  <code>database.modes</code> lists the database modes the app's build can run in. A mode picks the
                  engines behind storage, the queue and the cache; most apps leave the key out and run on{" "}
                  <code>single</code>:
                </span>
              ),
              ko: (
                <span>
                  <code>database.modes</code>는 앱의 빌드가 실행될 수 있는 데이터베이스 모드를 나열합니다. 모드는
                  저장소, 큐, 캐시를 맡을 엔진을 고르며, 대부분의 앱은 이 키를 생략하고 <code>single</code>로
                  동작합니다:
                </span>
              ),
            })}
          </div>
          <Docs.Table
            columns={[
              { key: "mode", label: l.trans({ en: "Mode", ko: "모드" }), code: true },
              {
                key: "engines",
                label: l.trans({ en: "Database, queue and cache", ko: "데이터베이스, 큐, 캐시" }),
              },
            ]}
            rows={[
              {
                mode: "single",
                engines: l.trans({
                  en: "SQLite for all three, so no extra server runs.",
                  ko: "셋 모두 SQLite라 별도 서버가 필요 없습니다.",
                }),
              },
              {
                mode: "multiple",
                engines: l.trans({
                  en: "One SQLite file on a host volume for data, Redis for the queue and cache.",
                  ko: "데이터는 호스트 볼륨의 SQLite 파일 하나, 큐와 캐시는 Redis가 맡습니다.",
                }),
              },
              {
                mode: "cluster",
                engines: l.trans({
                  en: "Postgres for data, Redis for the queue and cache.",
                  ko: "데이터는 Postgres, 큐와 캐시는 Redis가 맡습니다.",
                }),
              },
            ]}
          />
          <div>
            {l.trans({
              en: "Declare every mode a deployment of the app may use. The first one is the default:",
              ko: "앱의 배포가 쓸 수 있는 모드를 모두 선언합니다. 첫 번째가 기본값입니다:",
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/enterprise/akan.config.ts"
            code={`import type { AppConfig } from "akanjs";

const config: AppConfig = {
  database: { modes: ["single", "cluster"] },
};

export default config;`}
          />
          <ul className={bullets}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>A deployment names one of them.</strong> <code>AKAN_DATABASE_MODE</code> picks one of the
                    declared modes and no other. With one declared it may be left out; with several, every deployment
                    names one.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>배포는 그중 하나를 고릅니다.</strong> <code>AKAN_DATABASE_MODE</code>는 선언된 모드 중
                    하나만 고를 수 있습니다. 선언이 하나면 생략해도 되고, 여럿이면 배포마다 하나를 적어야 합니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>The CLI picks the same way.</strong> <code>akan start</code>, <code>akan build</code>,{" "}
                    <code>akan script</code> and <code>akan console</code> use the shell's{" "}
                    <code>AKAN_DATABASE_MODE</code> if set, otherwise the first declared mode.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>CLI도 같은 방식으로 고릅니다.</strong> <code>akan start</code>, <code>akan build</code>,{" "}
                    <code>akan script</code>, <code>akan console</code>은 셸에 <code>AKAN_DATABASE_MODE</code>가 있으면
                    그 모드를, 없으면 첫 번째로 선언한 모드를 씁니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Connection values come from the deployment.</strong> <code>SQLITE_DATABASE_PATH</code>,{" "}
                    <code>POSTGRES_URL</code> and the other{" "}
                    <Link href="/docs/core/runtime#env-database" className={inlineLink}>
                      connection variables
                    </Link>{" "}
                    win over the same values in <code>env.server.ts</code>, and <code>REDIS_URI</code> is read from the
                    environment only.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>연결 값은 배포 환경이 정합니다.</strong> <code>SQLITE_DATABASE_PATH</code>,{" "}
                    <code>POSTGRES_URL</code> 같은{" "}
                    <Link href="/docs/core/runtime#env-database" className={inlineLink}>
                      연결 환경변수
                    </Link>
                    는 <code>env.server.ts</code>에 적은 같은 값보다 우선하며, <code>REDIS_URI</code>는 환경변수에서만
                    읽습니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Drivers follow the declared modes.</strong> <code>akan build</code> puts every declared
                    mode's drivers in the production <code>package.json</code>: <code>multiple</code> adds{" "}
                    <code>bullmq</code> and <code>ioredis</code>, and <code>cluster</code> adds <code>postgres</code>{" "}
                    too. An app that applies <code>LibsqlDatabase</code> itself lists <code>@libsql/client</code> in{" "}
                    <code>externalLibs</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>드라이버는 선언한 모드를 따라갑니다.</strong> <code>akan build</code>는 선언한 모든 모드의
                    드라이버를 프로덕션 <code>package.json</code>에 넣으며, <code>multiple</code>은 <code>bullmq</code>
                    와 <code>ioredis</code>를, <code>cluster</code>는 <code>postgres</code>까지 더합니다.{" "}
                    <code>LibsqlDatabase</code>를 직접 적용하는 앱은 <code>@libsql/client</code>를{" "}
                    <code>externalLibs</code>에 적습니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Move up only for a real need.</strong> Locally, <code>multiple</code> needs Redis and{" "}
                    <code>cluster</code> needs Redis and Postgres; <code>akan start</code> starts them, and{" "}
                    <code>akan dbup</code> starts what your apps declare. When to switch is explained in{" "}
                    <Link href="/docs/arch/infra#database-mode" className={inlineLink}>
                      Database Mode
                    </Link>
                    .
                  </span>
                ),
                ko: (
                  <span>
                    <strong>실제로 필요할 때만 올립니다.</strong> 로컬에서 <code>multiple</code>은 Redis가,{" "}
                    <code>cluster</code>는 Redis와 Postgres가 필요하며, <code>akan start</code>가 이를 띄우고{" "}
                    <code>akan dbup</code>은 앱들이 선언한 것을 띄웁니다. 언제 바꿀지는{" "}
                    <Link href="/docs/arch/infra#database-mode" className={inlineLink}>
                      데이터베이스 모드
                    </Link>
                    를 참고하세요.
                  </span>
                ),
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="web" title="web">
        <Docs.Title>web</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  <code>web</code> decides which browser surfaces the build produces and the server mounts. The API is
                  always served; only the page surfaces switch.
                </span>
              ),
              ko: (
                <span>
                  <code>web</code>은 빌드가 만들고 서버가 마운트할 브라우저 표면을 정합니다. API는 항상 서비스되고,
                  페이지 표면만 켜고 끕니다.
                </span>
              ),
            })}
          </div>
          <Docs.IntroTable type={l.trans({ en: "Surface", ko: "표면" })} items={surfaceRows} />
          <Docs.Matrix
            type={l.trans({ en: "Value", ko: "값" })}
            columns={[
              { key: "api", label: "API" },
              { key: "ssr", label: "SSR" },
              { key: "csr", label: "CSR" },
            ]}
            groups={webGroups}
            markLabel={l.trans({ en: "Built and served", ko: "빌드하고 서비스함" })}
            emptyLabel={l.trans({ en: "Left out", ko: "빠짐" })}
          />
          <div>
            {l.trans({
              en: "A web-only app with no native build drops the mobile shell like this:",
              ko: "네이티브 빌드가 없는 웹 전용 앱은 이렇게 모바일 셸을 뺍니다:",
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/myapp/akan.config.ts"
            code={`import type { AppConfig } from "akanjs";

const config: AppConfig = {
  web: { csr: false },
};

export default config;`}
          />
          <ul className={bullets}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>No CSR-only option.</strong> The CSR shell inlines the stylesheet the SSR build compiles, so
                    CSR without SSR would ship an unstyled app.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>CSR만 켜는 옵션은 없습니다.</strong> CSR 셸은 SSR 빌드가 컴파일한 스타일시트를 인라인하므로,
                    SSR 없이는 스타일 없는 앱이 됩니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Env vars only narrow.</strong> <code>AKAN_SSR=false</code> or <code>AKAN_CSR=false</code>{" "}
                    turns a surface off for one deployment, but cannot turn on one the build left out.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>환경변수는 좁히기만 합니다.</strong> <code>AKAN_SSR=false</code>나{" "}
                    <code>AKAN_CSR=false</code>로 배포마다 표면을 끌 수 있지만, 빌드에서 빠진 표면을 다시 켤 수는
                    없습니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Dev keeps everything.</strong> <code>akan start</code> ignores <code>web</code> and serves
                    every surface.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>개발 서버는 전부 켭니다.</strong> <code>akan start</code>는 <code>web</code>을 무시하고 모든
                    표면을 서비스합니다.
                  </span>
                ),
              })}
            </li>
          </ul>
          <Docs.Alert type="warning">
            {l.trans({
              en: (
                <span>
                  <strong>A mobile app needs the CSR shell.</strong> Do not combine a <code>mobile</code> section with{" "}
                  <code>{"web: { csr: false }"}</code> or <code>web: false</code>; drop one of the two.
                </span>
              ),
              ko: (
                <span>
                  <strong>모바일 앱에는 CSR 셸이 필요합니다.</strong> <code>mobile</code> 섹션을{" "}
                  <code>{"web: { csr: false }"}</code>나 <code>web: false</code>와 함께 쓰지 말고, 둘 중 하나를 빼세요.
                </span>
              ),
            })}
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="images" title="images">
        <Docs.Title>images</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  <code>images</code> configures the built-in image optimizer: the widths, formats and qualities it
                  serves, and the sources it may fetch. Write only the fields you change:
                </span>
              ),
              ko: (
                <span>
                  <code>images</code>는 내장 이미지 최적화기를 설정합니다. 제공할 폭, 포맷, quality와 가져올 수 있는
                  출처를 정하며, 바꿀 필드만 적습니다:
                </span>
              ),
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/catalog/akan.config.ts"
            code={`import type { AppConfig } from "akanjs";

const config: AppConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.example.com",
        pathname: "/products/**",
      },
    ],
    formats: ["image/webp"],
    minimumCacheTTL: 86400,
    maxRemoteBytes: 10 * 1024 * 1024,
    maxConcurrency: 2,
  },
};

export default config;`}
          />
          <Docs.OptionTable items={imageOptions} />
          <ul className={bullets}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>A list replaces its default.</strong> Setting <code>formats</code> or{" "}
                    <code>remotePatterns</code> replaces that list; lists you leave out keep their defaults.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>목록은 기본값을 대체합니다.</strong> <code>formats</code>나 <code>remotePatterns</code>를
                    적으면 그 목록이 통째로 바뀌고, 적지 않은 목록은 기본값을 유지합니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Remote images are closed by default.</strong> <code>remotePatterns</code> starts empty, so
                    list every CDN the app shows images from.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>원격 이미지는 기본으로 막혀 있습니다.</strong> <code>remotePatterns</code>는 빈 목록에서
                    시작하므로, 앱이 이미지를 가져오는 CDN을 모두 적습니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>AVIF needs an OS codec.</strong> <code>image/avif</code> is encoded only on macOS and
                    Windows; on Linux the optimizer drops it and serves <code>image/webp</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>AVIF는 OS 코덱이 있어야 합니다.</strong> <code>image/avif</code>는 macOS와 Windows에서만
                    인코딩되며, Linux에서는 빠지고 <code>image/webp</code>로 제공됩니다.
                  </span>
                ),
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="i18n" title="i18n">
        <Docs.Title>i18n</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  <code>i18n</code> lists the languages the app serves. Every route sits under a locale segment such as{" "}
                  <code>/en/…</code>:
                </span>
              ),
              ko: (
                <span>
                  <code>i18n</code>은 앱이 지원할 언어를 적습니다. 모든 라우트는 <code>/ko/…</code> 같은 locale 경로
                  아래에 놓입니다:
                </span>
              ),
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/global/akan.config.ts"
            code={`import type { AppConfig } from "akanjs";

const config: AppConfig = {
  i18n: {
    defaultLocale: "ko",
    locales: ["ko", "en", "ja"],
  },
};

export default config;`}
          />
          <Docs.OptionTable
            items={[
              {
                key: "locales",
                type: "string[]",
                default: '["en", "ko"]',
                desc: l.trans({
                  en: "Locale segments the app serves. Each one prefixes every route.",
                  ko: "앱이 지원하는 locale 경로입니다. 각 값이 모든 라우트 앞에 붙습니다.",
                }),
              },
              {
                key: "defaultLocale",
                type: "string",
                default: '"en"',
                desc: l.trans({
                  en: "The fallback when none of the browser's languages match. Must be one of `locales`.",
                  ko: "브라우저 언어가 하나도 맞지 않을 때 쓰는 값입니다. `locales` 중 하나여야 합니다.",
                }),
              },
            ]}
          />
          <ul className={bullets}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>A bare path redirects.</strong> A URL without a locale goes to the best match for the
                    browser's <code>Accept-Language</code>, or to <code>defaultLocale</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>locale 없는 경로는 리다이렉트됩니다.</strong> 브라우저의 <code>Accept-Language</code>에 가장
                    맞는 locale로 보내고, 맞는 것이 없으면 <code>defaultLocale</code>로 보냅니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Only availability lives here.</strong> Translated copy stays in the dictionary or page that
                    owns the text.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>여기에는 지원 언어만 둡니다.</strong> 실제 번역 문구는 그 문구를 가진 dictionary나 page에
                    둡니다.
                  </span>
                ),
              })}
            </li>
          </ul>
          <Docs.Alert type="warning">
            {l.trans({
              en: (
                <span>
                  <strong>
                    <code>defaultLocale</code> must be one of <code>locales</code>.
                  </strong>{" "}
                  Setting <code>locales: ["ko", "ja"]</code> alone leaves the default at <code>en</code>, which is no
                  longer listed, so move <code>defaultLocale</code> with it.
                </span>
              ),
              ko: (
                <span>
                  <strong>
                    <code>defaultLocale</code>은 <code>locales</code> 안에 있어야 합니다.
                  </strong>{" "}
                  <code>locales: ["ko", "ja"]</code>만 적으면 기본값 <code>en</code>이 목록에서 빠지므로,{" "}
                  <code>defaultLocale</code>도 함께 바꿉니다.
                </span>
              ),
            })}
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="public-env" title="publicEnv">
        <Docs.Title>publicEnv</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  <code>publicEnv</code> is the allowlist of extra environment variable names that browser code may
                  read. Only the names live here; the values stay in the environment:
                </span>
              ),
              ko: (
                <span>
                  <code>publicEnv</code>는 브라우저 코드가 읽어도 되는 추가 환경변수 이름의 허용 목록입니다. 여기에는
                  이름만 적고, 값은 환경변수에 그대로 둡니다:
                </span>
              ),
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/landing/akan.config.ts"
            code={`import type { AppConfig } from "akanjs";

const config: AppConfig = {
  publicEnv: ["PUBLIC_ANALYTICS_KEY", "PUBLIC_FEATURE_PREVIEW"],
};

export default config;`}
          />
          <ul className={bullets}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      <code>AKAN_PUBLIC_*</code> is always public.
                    </strong>{" "}
                    Every variable with that prefix is inlined into browser bundles without being listed.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>AKAN_PUBLIC_*</code>는 항상 공개됩니다.
                    </strong>{" "}
                    이 접두사를 가진 변수는 목록에 적지 않아도 브라우저 번들에 인라인됩니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>The current build reads only that prefix.</strong> Names listed here are not inlined yet, so
                    give a browser-visible variable the <code>AKAN_PUBLIC_</code> prefix.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>현재 빌드는 그 접두사만 읽습니다.</strong> 여기에 적은 이름은 아직 인라인되지 않으므로,
                    브라우저에서 읽을 변수에는 <code>AKAN_PUBLIC_</code> 접두사를 붙입니다.
                  </span>
                ),
              })}
            </li>
          </ul>
          <Docs.Alert type="warning">
            {l.trans({
              en: (
                <span>
                  <strong>Never list a secret.</strong> Database URLs, private tokens and server credentials must never
                  reach browser code.
                </span>
              ),
              ko: (
                <span>
                  <strong>비밀 값은 절대 적지 않습니다.</strong> 데이터베이스 URL, 비공개 토큰, 서버 자격 증명은
                  브라우저 코드에 닿으면 안 됩니다.
                </span>
              ),
            })}
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="secrets" title="secrets">
        <Docs.Title>secrets</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  <code>secrets</code> lists private files that cannot live inside <code>env.server.*.ts</code>, such as
                  service-account JSON, certificates and key files. They travel with the env files and stay out of git:
                </span>
              ),
              ko: (
                <span>
                  <code>secrets</code>는 service-account JSON, 인증서, 키 파일처럼 <code>env.server.*.ts</code> 안에
                  담을 수 없는 비공개 파일을 적습니다. 이 파일들은 env 파일과 함께 전송되고 git에서는 빠집니다:
                </span>
              ),
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/api/akan.config.ts"
            code={`import type { AppConfig } from "akanjs";

const config: AppConfig = {
  secrets: ["secrets/**/*", "certs/*.pem"],
};

export default config;`}
          />
          <ul className={bullets}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Globs relative to the app.</strong> <code>{"secrets/**/*"}</code> means every file under{" "}
                    <code>{"apps/<app>/secrets/"}</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>앱 폴더 기준 glob입니다.</strong> <code>{"secrets/**/*"}</code>는{" "}
                    <code>{"apps/<app>/secrets/"}</code> 아래의 모든 파일입니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Shipped with the env files.</strong> <code>akan upload-env</code> archives every match
                    together with the default <code>env/env.client.*.ts</code> and <code>env/env.server.*.ts</code>{" "}
                    files, and <code>akan download-env</code> restores them to the same paths.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>env 파일과 함께 전송됩니다.</strong> <code>akan upload-env</code>는 매칭된 파일을 기본{" "}
                    <code>env/env.client.*.ts</code>, <code>env/env.server.*.ts</code> 파일과 함께 묶고,{" "}
                    <code>akan download-env</code>는 같은 경로로 되돌려 놓습니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Ignored by git on upload.</strong> Each <code>akan upload-env</code> writes these patterns
                    into a managed block of the workspace <code>.gitignore</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>업로드할 때 git에서 제외됩니다.</strong> <code>akan upload-env</code>를 실행할 때마다 이
                    패턴이 워크스페이스 <code>.gitignore</code>의 관리 블록에 기록됩니다.
                  </span>
                ),
              })}
            </li>
          </ul>
          <Docs.Alert type="warning">
            {l.trans({
              en: (
                <span>
                  <strong>Only the patterns belong in the config. Never commit the files.</strong> The{" "}
                  <code>.gitignore</code> block appears on the first <code>akan upload-env</code>, so check{" "}
                  <code>git status</code> before committing a new secret file.
                </span>
              ),
              ko: (
                <span>
                  <strong>config에는 패턴만 적고, 파일은 절대 commit하지 않습니다.</strong> <code>.gitignore</code>{" "}
                  블록은 첫 <code>akan upload-env</code> 때 생기므로, 새 비밀 파일을 추가했다면 commit 전에{" "}
                  <code>git status</code>를 확인합니다.
                </span>
              ),
            })}
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="sync-page-libs" title="syncPageLibs">
        <Docs.Title>syncPageLibs</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  <code>syncPageLibs</code> lets an app serve routes that a library ships in its own <code>page/</code>{" "}
                  folder. The library keeps the route files; the app only opts in.
                </span>
              ),
              ko: (
                <span>
                  <code>syncPageLibs</code>는 라이브러리가 자기 <code>page/</code> 폴더에 둔 라우트를 앱이 서비스하게
                  합니다. 라우트 파일은 라이브러리가 소유하고, 앱은 사용 여부만 정합니다.
                </span>
              ),
            })}
          </div>
          <Docs.Table
            columns={[
              { key: "value", label: l.trans({ en: "Value", ko: "값" }), code: true },
              { key: "result", label: l.trans({ en: "Routes the app serves", ko: "앱이 서비스하는 라우트" }) },
            ]}
            rows={[
              {
                value: "false",
                result: l.trans({
                  en: "The default. No library routes; links from an earlier sync are removed.",
                  ko: "기본값입니다. 라이브러리 라우트를 쓰지 않고, 이전 동기화로 생긴 링크도 지웁니다.",
                }),
              },
              {
                value: "true",
                result: l.trans({
                  en: "Every library dependency that ships a `page/` folder.",
                  ko: "`page/` 폴더가 있는 모든 의존 라이브러리의 라우트입니다.",
                }),
              },
              {
                value: '["shared"]',
                result: l.trans({ en: "Only the libraries listed.", ko: "나열한 라이브러리의 라우트만 가져옵니다." }),
              },
            ]}
          />
          <div>
            {l.trans({
              en: (
                <span>
                  To serve only the routes of <code>libs/shared</code>:
                </span>
              ),
              ko: (
                <span>
                  <code>libs/shared</code>의 라우트만 서비스하려면 이렇게 적습니다:
                </span>
              ),
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/myapp/akan.config.ts"
            code={`import type { AppConfig } from "akanjs";

const config: AppConfig = {
  syncPageLibs: ["shared"],
};

export default config;`}
          />
          <ul className={bullets}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Routes keep their own path.</strong> <code>libs/shared/page/login/_index.tsx</code> serves{" "}
                    <code>/login</code> in the app.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>라우트는 원래 경로를 그대로 씁니다.</strong> <code>libs/shared/page/login/_index.tsx</code>
                    는 앱에서 <code>/login</code>으로 서비스됩니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Edit the library, not the link.</strong> The app sees these routes through a generated,
                    git-ignored folder, so changes go in <code>{"libs/<lib>/page"}</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>링크가 아니라 라이브러리를 고칩니다.</strong> 앱은 생성되고 git에서 제외된 폴더를 통해 이
                    라우트를 보므로, 수정은 <code>{"libs/<lib>/page"}</code>에서 합니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>One path, one route.</strong> Two synced routes may not resolve to the same path.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>경로 하나에 라우트 하나입니다.</strong> 동기화된 두 라우트가 같은 경로로 풀리면 안 됩니다.
                  </span>
                ),
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="external-libs" title="externalLibs">
        <Docs.Title>externalLibs</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  <code>externalLibs</code> keeps a package out of the bundle and installs it as a real dependency of
                  the production build. Native and runtime-sensitive packages need this; plain TypeScript helpers do
                  not:
                </span>
              ),
              ko: (
                <span>
                  <code>externalLibs</code>는 패키지를 번들에서 빼고, 프로덕션 빌드의 실제 의존성으로 설치합니다.
                  네이티브 패키지나 런타임에 민감한 패키지에 필요하며, 일반 TypeScript 헬퍼에는 필요 없습니다:
                </span>
              ),
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/media/akan.config.ts"
            code={`import type { AppConfig } from "akanjs";

const config: AppConfig = {
  externalLibs: ["shiki"],
};

export default config;`}
          />
          <div>
            {l.trans({
              en: "A library declares the packages its own runtime needs the same way:",
              ko: "라이브러리도 자기 런타임에 필요한 패키지를 같은 방식으로 선언합니다:",
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="libs/report/akan.config.ts"
            code={`import type { LibConfig } from "akanjs";

const config: LibConfig = {
  externalLibs: ["puppeteer"],
};

export default config;`}
          />
          <ul className={bullets}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Merged across the workspace.</strong> The app's list comes first, then every library's,
                    without duplicates, so <code>apps/media</code> resolves to <code>["shiki", "puppeteer"]</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>워크스페이스 전체가 합쳐집니다.</strong> 앱 목록이 먼저 오고 모든 라이브러리 목록이 중복
                    없이 뒤에 붙으므로, <code>apps/media</code>는 <code>["shiki", "puppeteer"]</code>가 됩니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Every library counts.</strong> Not only the app's dependencies are read, so a library
                    declares its package once and no app repeats it.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>모든 라이브러리가 포함됩니다.</strong> 앱의 의존 라이브러리만 읽는 것이 아니므로,
                    라이브러리가 한 번 선언하면 어느 앱도 다시 적을 필요가 없습니다.
                  </span>
                ),
              })}
            </li>
          </ul>
          <Docs.Alert type="warning">
            {l.trans({
              en: (
                <span>
                  <strong>
                    List the package in the root <code>package.json</code> too.
                  </strong>{" "}
                  The production <code>package.json</code> installs the version pinned there.
                </span>
              ),
              ko: (
                <span>
                  <strong>
                    루트 <code>package.json</code>에도 패키지를 적어 둡니다.
                  </strong>{" "}
                  프로덕션 <code>package.json</code>은 그곳에 고정된 버전을 설치합니다.
                </span>
              ),
            })}
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="barrel-imports" title="barrelImports">
        <Docs.Title>barrelImports</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  A barrel is an index file that re-exports many files. When code imports <code>X</code> from a barrel
                  listed in <code>barrelImports</code>, the build points the import at the file that defines{" "}
                  <code>X</code>, so the rest of the barrel is never loaded.
                </span>
              ),
              ko: (
                <span>
                  barrel은 여러 파일을 다시 export하는 index 파일입니다. <code>barrelImports</code>에 있는 barrel에서{" "}
                  <code>X</code>를 import하면, 빌드가 그 import를 <code>X</code>를 정의한 파일로 바로 연결하므로
                  barrel의 나머지는 불러오지 않습니다.
                </span>
              ),
            })}
          </div>
          <Docs.IntroTable
            type={l.trans({ en: "Already included", ko: "기본 포함" })}
            items={[
              {
                name: ["akanjs/webkit", "akanjs/common", "akanjs/ui", "akanjs/server"],
                desc: l.trans({ en: "The framework facets.", ko: "프레임워크 facet입니다." }),
              },
              {
                name: "@apps/<app>/{ui,webkit,common,client,server}",
                desc: l.trans({ en: "This app's own facets.", ko: "이 앱 자신의 facet입니다." }),
              },
              {
                name: "@libs/<lib>/{ui,webkit,common,client,server}",
                desc: l.trans({
                  en: "The same facets of every library in the workspace.",
                  ko: "워크스페이스에 있는 모든 라이브러리의 같은 facet입니다.",
                }),
              },
            ]}
          />
          <div>
            {l.trans({
              en: "Add only a barrel outside those facets, such as a design-system package:",
              ko: "이 facet 밖의 barrel만 추가합니다. 예를 들면 디자인 시스템 패키지입니다:",
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/admin/akan.config.ts"
            code={`import type { AppConfig } from "akanjs";

const config: AppConfig = {
  barrelImports: ["@acme/ui"],
};

export default config;`}
          />
          <ul className={bullets}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Resolved like an import.</strong> The build looks the barrel up in the tsconfig{" "}
                    <code>paths</code> first, then in <code>node_modules</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>import처럼 찾습니다.</strong> 빌드는 barrel을 tsconfig <code>paths</code>에서 먼저 찾고, 그
                    다음 <code>node_modules</code>에서 찾습니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Appended, never replacing.</strong> Your entries are added after the defaults above.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>덧붙기만 합니다.</strong> 적은 값은 위 기본 목록 뒤에 더해집니다.
                  </span>
                ),
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="optimize-imports" title="optimizeImports">
        <Docs.Title>optimizeImports</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  <code>optimizeImports</code> names packages whose barrel the browser build parses only as far as you
                  use it. Importing one icon then loads that icon, not the whole set:
                </span>
              ),
              ko: (
                <span>
                  <code>optimizeImports</code>는 브라우저 빌드가 실제로 쓰는 부분만 읽을 패키지를 적습니다. 아이콘
                  하나를 import하면 아이콘 세트 전체가 아니라 그 아이콘만 불러옵니다:
                </span>
              ),
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/dashboard/akan.config.ts"
            code={`import type { AppConfig } from "akanjs";

const config: AppConfig = {
  optimizeImports: ["@phosphor-icons/react"],
};

export default config;`}
          />
          <Docs.SubSubTitle>{l.trans({ en: "Already included", ko: "기본 포함 패키지" })}</Docs.SubSubTitle>
          <div className="my-3 flex flex-wrap gap-1.5">
            {defaultOptimizedPackages.map((name) => (
              <code key={name} className="rounded-md bg-muted/60 px-2 py-1 font-mono text-xs">
                {name}
              </code>
            ))}
          </div>
          <ul className={bullets}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Merged with the defaults.</strong> Your entries are added to the list above.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>기본 목록에 더해집니다.</strong> 적은 값은 위 목록에 합쳐집니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      <code>sideEffects: false</code> needs no entry.
                    </strong>{" "}
                    A package whose <code>package.json</code> declares it is optimized automatically.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>sideEffects: false</code>면 적지 않아도 됩니다.
                    </strong>{" "}
                    <code>package.json</code>에 이 값을 선언한 패키지는 자동으로 최적화됩니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Keep your own barrels clean.</strong> One file per export makes the result easy to predict.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>직접 만든 barrel은 깔끔하게 유지합니다.</strong> 파일 하나에 export 하나를 지키면 결과를
                    예측하기 쉽습니다.
                  </span>
                ),
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="docker" title="docker">
        <Docs.Title>docker</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  <code>docker</code> shapes the production image that <code>akan build</code> writes. Declare it only
                  when the image needs a system package or a different start command.
                </span>
              ),
              ko: (
                <span>
                  <code>docker</code>는 <code>akan build</code>가 만드는 프로덕션 이미지를 조정합니다. 이미지에 시스템
                  패키지나 다른 시작 명령이 필요할 때만 선언합니다.
                </span>
              ),
            })}
          </div>
          <div>
            {l.trans({
              en: (
                <span>
                  The generated image installs <code>ca-certificates</code> and <code>tzdata</code> and nothing else, so{" "}
                  <code>ffmpeg</code>, a headless browser or a native toolchain goes into <code>preRuns</code>:
                </span>
              ),
              ko: (
                <span>
                  생성되는 이미지는 <code>ca-certificates</code>와 <code>tzdata</code>만 설치하므로, <code>ffmpeg</code>
                  , 헤드리스 브라우저, 네이티브 툴체인은 <code>preRuns</code>에 적습니다:
                </span>
              ),
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/worker/akan.config.ts"
            code={`import type { AppConfig } from "akanjs";

const config: AppConfig = {
  docker: {
    image: "oven/bun:1-slim",
    preRuns: [
      "apt-get update && apt-get install -y --no-install-recommends ffmpeg imagemagick",
    ],
    command: ["bun", "main.js"],
  },
};

export default config;`}
          />
          <Docs.OptionTable
            items={[
              {
                key: "image",
                type: "string | { amd64?, arm64? }",
                default: "oven/bun:1-slim",
                desc: l.trans({
                  en: "The base image. The object form picks one per architecture.",
                  ko: "베이스 이미지입니다. 객체 형태로 아키텍처마다 다른 이미지를 고릅니다.",
                }),
              },
              {
                key: "preRuns",
                type: dockerRunType,
                default: "[]",
                desc: l.trans({
                  en: "Steps run before `bun install --production`, so native builds find their tools.",
                  ko: "`bun install --production` 전에 실행하는 단계라, 네이티브 빌드가 필요한 도구를 찾을 수 있습니다.",
                }),
              },
              {
                key: "postRuns",
                type: dockerRunType,
                default: "[]",
                desc: l.trans({
                  en: "Steps run after the install, before the app files are copied.",
                  ko: "설치가 끝난 뒤, 앱 파일을 복사하기 전에 실행하는 단계입니다.",
                }),
              },
              {
                key: "command",
                type: "string[]",
                default: '["bun", "main.js"]',
                desc: l.trans({ en: "The container's `CMD`.", ko: "컨테이너의 `CMD`입니다." }),
              },
            ]}
          />
          <Docs.SubSubTitle>
            {l.trans({ en: "Order of the generated Dockerfile", ko: "생성되는 Dockerfile 순서" })}
          </Docs.SubSubTitle>
          <ol className="my-4 list-decimal space-y-2 pl-5">
            <li>
              {l.trans({
                en: (
                  <span>
                    <code>FROM</code> the image, then <code>ca-certificates</code>, <code>tzdata</code> and the
                    Asia/Seoul timezone.
                  </span>
                ),
                ko: (
                  <span>
                    이미지로 <code>FROM</code>한 뒤 <code>ca-certificates</code>, <code>tzdata</code>, Asia/Seoul
                    타임존을 설정합니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <code>preRuns</code>: the libraries' steps first, then the app's.
                  </span>
                ),
                ko: (
                  <span>
                    <code>preRuns</code>: 라이브러리 단계가 먼저, 앱 단계가 그다음입니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    Copy <code>package.json</code> and run <code>bun install --production</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <code>package.json</code>을 복사하고 <code>bun install --production</code>을 실행합니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <code>postRuns</code>, in the same order.
                  </span>
                ),
                ko: (
                  <span>
                    <code>postRuns</code>도 같은 순서로 실행합니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    Copy the app files, set <code>PORT</code>, <code>NODE_ENV</code>, the <code>AKAN_PUBLIC_*</code>{" "}
                    values and <code>AKAN_LOG_TO_FILE=0</code>, then <code>CMD</code>.
                  </span>
                ),
                ko: (
                  <span>
                    앱 파일을 복사하고 <code>PORT</code>, <code>NODE_ENV</code>, <code>AKAN_PUBLIC_*</code> 값과{" "}
                    <code>AKAN_LOG_TO_FILE=0</code>을 설정한 뒤 <code>CMD</code>를 둡니다.
                  </span>
                ),
              })}
            </li>
          </ol>
          <ul className={bullets}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Start with apt-get update.</strong> The base step clears the apt package lists, so each
                    install in <code>preRuns</code> refreshes them first.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>apt-get update로 시작합니다.</strong> 기본 단계가 apt 패키지 목록을 지우므로,{" "}
                    <code>preRuns</code>의 설치 명령은 목록부터 갱신합니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Per-architecture steps.</strong> A <code>{"{ amd64, arm64 }"}</code> entry runs each command
                    only on its own architecture of a multi-arch build.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>아키텍처별 단계.</strong> <code>{"{ amd64, arm64 }"}</code> 항목은 멀티 아키텍처 빌드에서 각
                    명령을 해당 아키텍처에서만 실행합니다.
                  </span>
                ),
              })}
            </li>
          </ul>
          <Docs.SubSubTitle>{l.trans({ en: "A whole Dockerfile", ko: "Dockerfile 전체 작성" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: "When the image must be fully under your control, write the whole Dockerfile as a string and keep the order above:",
              ko: "이미지를 완전히 직접 제어해야 한다면 Dockerfile 전체를 문자열로 쓰고, 위 순서를 그대로 지킵니다:",
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/custom-runtime/akan.config.ts"
            code={`import type { AppConfig } from "akanjs";

const config: AppConfig = {
  docker: [
    "FROM oven/bun:1-slim",
    "RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates tzdata ffmpeg imagemagick",
    "RUN ln -sf /usr/share/zoneinfo/Asia/Seoul /etc/localtime",
    "ARG TARGETARCH",
    "RUN mkdir -p /workspace",
    "WORKDIR /workspace",
    "COPY ./package.json ./package.json",
    "RUN bun install --production",
    "COPY . .",
    "ENV PORT=8282",
    "ENV NODE_ENV=production",
    "ENV AKAN_PUBLIC_REPO_NAME=akanjs",
    "ENV AKAN_PUBLIC_SERVE_DOMAIN=example.com",
    "ENV AKAN_PUBLIC_APP_NAME=custom-runtime",
    "ENV AKAN_PUBLIC_ENV=main",
    "ENV AKAN_PUBLIC_DEFAULT_LOCALE=ko",
    "ENV AKAN_PUBLIC_LOCALES=ko,en",
    "ENV AKAN_PUBLIC_API_PREFIX=/api",
    "ENV AKAN_PUBLIC_WS_PREFIX=/ws",
    "ENV AKAN_PUBLIC_OPERATION_MODE=cloud",
    "ENV AKAN_LOG_TO_FILE=0",
    'CMD ["bun","main.js"]',
  ].join("\\n"),
};

export default config;`}
          />
          <ul className={bullets}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Start from a generated one.</strong> <code>akan build</code> writes the Dockerfile it would
                    use to <code>{"dist/apps/<app>/Dockerfile"}</code>, with the <code>ENV</code> lines your config
                    produces.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>생성된 파일에서 시작합니다.</strong> <code>akan build</code>는 원래 쓸 Dockerfile을{" "}
                    <code>{"dist/apps/<app>/Dockerfile"}</code>에 쓰며, 여기에는 config에 맞는 <code>ENV</code> 줄이
                    들어 있습니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Some lines depend on the config.</strong> The generated file adds{" "}
                    <code>AKAN_PUBLIC_BASE_PATHS</code> when routes declare basePaths, and <code>AKAN_SSR=false</code> /{" "}
                    <code>AKAN_CSR=false</code> when <code>web</code> turns a surface off.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>config에 따라 달라지는 줄이 있습니다.</strong> 생성된 파일은 routes에 basePath가 있으면{" "}
                    <code>AKAN_PUBLIC_BASE_PATHS</code>를, <code>web</code>으로 표면을 껐다면{" "}
                    <code>AKAN_SSR=false</code> / <code>AKAN_CSR=false</code>를 추가합니다.
                  </span>
                ),
              })}
            </li>
          </ul>
          <Docs.Alert type="warning">
            {l.trans({
              en: (
                <span>
                  <strong>A string is used exactly as written.</strong> Nothing is merged into it, including the{" "}
                  <code>preRuns</code> and <code>postRuns</code> your libraries declare.
                </span>
              ),
              ko: (
                <span>
                  <strong>문자열은 적은 그대로 쓰입니다.</strong> 라이브러리가 선언한 <code>preRuns</code>와{" "}
                  <code>postRuns</code>를 포함해 아무것도 합쳐지지 않습니다.
                </span>
              ),
            })}
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide
        id="library-config-fields"
        title={l.trans({ en: "Library Config Fields", ko: "라이브러리 설정 필드" })}
      >
        <Docs.Title>{l.trans({ en: "Library Config Fields", ko: "라이브러리 설정 필드" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  A library's <code>akan.config.ts</code> takes the same object or function shape as an app's. What it
                  declares is added to the apps in the workspace, so no app repeats a library's needs:
                </span>
              ),
              ko: (
                <span>
                  라이브러리의 <code>akan.config.ts</code>도 앱과 같은 객체 또는 함수 형태입니다. 여기에 선언한 값은
                  워크스페이스의 앱에 더해지므로, 라이브러리가 필요로 하는 것을 앱마다 다시 적지 않아도 됩니다:
                </span>
              ),
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="libs/report/akan.config.ts"
            code={`import type { LibConfig } from "akanjs";

const config: LibConfig = {
  externalLibs: ["puppeteer"],
  docker: {
    preRuns: [
      "apt-get update && apt-get install -y --no-install-recommends chromium",
    ],
  },
};

export default config;`}
          />
          <Docs.Matrix
            type={l.trans({ en: "Key", ko: "키" })}
            columns={[
              { key: "deps", label: l.trans({ en: "Dependents", ko: "의존하는 앱" }) },
              { key: "others", label: l.trans({ en: "Other apps", ko: "나머지 앱" }) },
            ]}
            groups={[
              {
                label: l.trans({ en: "What a library adds", ko: "라이브러리가 더하는 값" }),
                rows: [
                  {
                    name: "externalLibs",
                    desc: l.trans({
                      en: "Appended after the app's own list, without duplicates.",
                      ko: "앱 자신의 목록 뒤에 중복 없이 붙습니다.",
                    }),
                    marks: { deps: true, others: true },
                  },
                  {
                    name: "docker.{preRuns,postRuns}",
                    desc: l.trans({
                      en: "Runs before the app's own steps, unless the app writes `docker` as a string.",
                      ko: "앱이 `docker`를 문자열로 쓰지 않았다면 앱 자신의 단계보다 먼저 실행됩니다.",
                    }),
                    marks: { deps: true, others: true },
                  },
                  {
                    name: "assets.keepFonts",
                    desc: l.trans({
                      en: "Globs against the library's own `public/` whose fonts survive pruning.",
                      ko: "정리 대상에서 빼 둘 폰트를 라이브러리 자신의 `public/` 기준 glob으로 적습니다.",
                    }),
                    marks: { deps: true, others: false },
                  },
                  {
                    name: "plugins",
                    desc: l.trans({
                      en: "Read by the CLI for runtime packages, native setup and assets.",
                      ko: "CLI가 런타임 패키지, 네이티브 설정, 에셋 생성에 씁니다.",
                    }),
                    marks: { deps: true, others: false },
                  },
                ],
              },
            ]}
            markLabel={l.trans({ en: "Applied", ko: "적용됨" })}
            emptyLabel={l.trans({ en: "Not applied", ko: "적용 안 됨" })}
          />
          <ul className={bullets}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>No image and no command.</strong> A library adds steps only; the base image and{" "}
                    <code>CMD</code> stay the app's decision.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>이미지와 명령은 정하지 않습니다.</strong> 라이브러리는 단계만 더하고, 베이스 이미지와{" "}
                    <code>CMD</code>는 앱이 정합니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>A real example.</strong> <code>libs/util</code> ships its mobile features this way:{" "}
                    <code>{"plugins: [pushNotificationPlugin, cameraPlugin, …]"}</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>실제 예시.</strong> <code>libs/util</code>은 모바일 기능을 이렇게 제공합니다:{" "}
                    <code>{"plugins: [pushNotificationPlugin, cameraPlugin, …]"}</code>.
                  </span>
                ),
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <DocsToc />
    </Scroll>
  );
});
