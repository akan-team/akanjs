import { usePage } from "@apps/akan/client";
import { Code, cardGridRecipe, Divider, Docs, DocsToc } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();
  return (
    <Scroll>
      <Scroll.Slide id="akan-config-overview" title={l.trans({ en: "Akan Config Overview", ko: "Akan Config 개요" })}>
        <Docs.Title>{l.trans({ en: "Akan Config Overview", ko: "Akan Config 개요" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "akan.config.ts is the app or library configuration entry point. Akan uses it to prepare server, web, mobile app, database, build, image, and environment behavior.",
              ko: "akan.config.ts는 앱 또는 라이브러리 설정의 진입점입니다. Akan은 이 파일을 기준으로 server, web, mobile app, database, build, image, environment 동작을 준비합니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "You can start with an empty config. Akan treats the file as partial settings and fills missing fields with framework defaults.",
              ko: "빈 config로 시작해도 됩니다. Akan은 이 파일을 partial settings로 다루고, 선언하지 않은 값은 framework 기본값으로 채웁니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/myapp/akan.config.ts"
          code={`import type { AppConfig } from "akanjs";

const config: AppConfig = {};

export default config;`}
        />
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="config-shape" title={l.trans({ en: "Config File Shape", ko: "설정 파일 형태" })}>
        <Docs.Title>{l.trans({ en: "Config File Shape", ko: "설정 파일 형태" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "AppConfig and LibConfig can be plain objects or functions. Use a plain object for most cases. Use a function when the config needs the app or library metadata while it is being loaded.",
              ko: "AppConfig와 LibConfig는 일반 객체 또는 함수가 될 수 있습니다. 대부분은 일반 객체로 충분합니다. config를 읽는 시점에 app 또는 library metadata가 필요할 때 함수 형태를 사용합니다.",
            })}
          </div>
        </Docs.Description>
        <div className={cardGridRecipe()}>
          <Code.Snippet
            className="w-full"
            title="object config"
            code={`import type { AppConfig } from "akanjs";

const config: AppConfig = {
  routes: [{ domains: { main: ["www.example.com"] }, basePath: "store" }],
};

export default config;`}
          />
          <Code.Snippet
            className="w-full"
            title="function config"
            code={`import type { AppConfig } from "akanjs";

const config: AppConfig = (app) => ({
  mobile: {
    appName: app.name,
    appId: \`com.\${app.name}.app\`,
  },
});

export default config;`}
          />
        </div>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="routes" title="routes">
        <Docs.Title>routes</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "routes connects domains and basePath values to one app. Use it when one Akan app needs to serve several brands, services, or entry paths.",
              ko: "routes는 domain과 basePath를 하나의 앱에 연결합니다. 하나의 Akan 앱이 여러 brand, service, entry path를 제공해야 할 때 사용합니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "Akan normalizes basePath values, collects domains, adds branch names, and creates default development domains when no explicit domain is provided.",
              ko: "Akan은 basePath를 정리하고, domain을 수집하며, branch 이름을 추가하고, 명시 domain이 없을 때 개발용 기본 domain을 생성합니다.",
            })}
          </div>
        </Docs.Description>
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
        <Docs.Alert type="info">
          {l.trans({
            en: "If mobile targets use basePath, define that basePath in routes first. Akan validates mobile target basePath values against the route list.",
            ko: "mobile target에서 basePath를 사용한다면 먼저 routes에 해당 basePath를 정의하세요. Akan은 mobile target의 basePath를 route 목록 기준으로 검증합니다.",
          })}
        </Docs.Alert>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="mobile" title="mobile">
        <Docs.Title>mobile</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "mobile defines the native app identity and target-specific packaging settings used when a web surface is shipped through Capacitor.",
              ko: "mobile은 웹 surface를 Capacitor로 native app에 담아 배포할 때 사용하는 app identity와 target별 packaging 설정입니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "Missing values fall back to app name, com.<app>.app, version 0.0.1, build number 1, and a default target. Target basePath must exist in routes.",
              ko: "빠진 값은 app name, com.<app>.app, version 0.0.1, build number 1, default target으로 채워집니다. target basePath는 routes에 존재해야 합니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/shop/akan.config.ts"
          code={`import type { AppConfig } from "akanjs";

const config: AppConfig = {
  routes: [{ domains: {}, basePath: "shop" }],
  mobile: {
    appName: "Shop",
    appId: "com.example.shop",
    version: "1.0.0",
    buildNum: 12,
    targets: {
      shop: {
        name: "shop",
        basePath: "shop",
        appName: "Shop",
        appId: "com.example.shop",
        version: "1.0.0",
        buildNum: 12,
        permissions: ["camera", "push"],
      },
    },
  },
};

export default config;`}
        />
        <Docs.Alert type="warning">
          {l.trans({
            en: "Keep local keystore paths and private signing values out of shared examples. Put machine-specific values in local-only files or deployment secrets.",
            ko: "로컬 keystore path와 private signing 값은 공유 예시에 넣지 마세요. machine-specific 값은 local-only file 또는 deployment secret으로 관리합니다.",
          })}
        </Docs.Alert>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="default-database-mode" title="defaultDatabaseMode">
        <Docs.Title>defaultDatabaseMode</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "defaultDatabaseMode chooses the app's default database operating model. Most apps can leave it empty and use the single database default.",
              ko: "defaultDatabaseMode는 앱의 기본 database operating model을 선택합니다. 대부분의 앱은 비워두고 single database 기본값을 사용하면 됩니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "Akan stores the resolved mode in the app scan result so database-related commands and runtime setup can share the same default.",
              ko: "Akan은 resolve된 mode를 app scan result에 저장해서 database 관련 command와 runtime setup이 같은 기본값을 공유하도록 합니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/enterprise/akan.config.ts"
          code={`import type { AppConfig } from "akanjs";

const config: AppConfig = {
  defaultDatabaseMode: "multiple",
};

export default config;`}
        />
        <Docs.Alert type="info">
          <span>
            {l.trans({
              en: "Only customize this when your deployment model really needs separated or clustered database behavior. For details, see ",
              ko: "배포 모델에서 database 분리 또는 cluster 동작이 실제로 필요할 때만 커스터마이징하세요. 자세한 내용은 ",
            })}
            <a
              href="/docs/arch/infra#database-mode"
              className="text-primary underline underline-offset-4 hover:no-underline"
            >
              {l.trans({ en: "Database Mode", ko: "Database Mode" })}
            </a>
            {l.trans({ en: ".", ko: "를 참고하세요." })}
          </span>
        </Docs.Alert>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="web" title="web">
        <Docs.Title>web</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "web declares which browser surfaces this app builds and serves, as true | false | { csr: boolean }. false is an api-only app; true, the default, is both surfaces; the object form keeps SSR and toggles only the CSR bundle. SSR is the RSC route renderer with its pages bundle, client bundles and RSC worker process; CSR is the single-file SPA bundle the Capacitor mobile build ships. The API is always served and is not part of this switch.",
              ko: "web은 이 앱이 빌드하고 서비스할 브라우저 surface를 true | false | { csr: boolean } 형태로 선언합니다. false는 api 전용 앱이고, 기본값 true는 두 surface 모두이며, 객체 형태는 SSR을 유지한 채 CSR bundle만 켜고 끕니다. SSR은 pages bundle, client bundle, RSC worker process를 포함한 RSC 라우트 렌더러이고, CSR은 Capacitor 모바일 빌드가 싣는 단일 파일 SPA bundle입니다. API는 항상 서비스되며 이 스위치의 대상이 아닙니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "Turning a surface off removes its build phase, so the deployment image never carries the artifact — and the runtime never mounts the routes that read it. There is no CSR-without-SSR option, by type: the CSR bundle inlines the stylesheet the SSR build compiles, so it would ship an unstyled app.",
              ko: "surface를 끄면 해당 빌드 단계가 사라져 배포 이미지에 산출물이 들어가지 않고, 런타임도 그 산출물을 읽는 라우트를 mount하지 않습니다. SSR 없이 CSR만 켜는 옵션은 타입상 존재하지 않습니다. CSR bundle이 SSR 빌드가 컴파일한 stylesheet를 인라인하므로 스타일 없는 앱이 나오기 때문입니다.",
            })}
          </div>
        </Docs.Description>
        <div className={cardGridRecipe()}>
          <Code.Snippet
            className="w-full"
            title="web without the mobile bundle"
            code={`import type { AppConfig } from "akanjs";

const config: AppConfig = {
  web: { csr: false },
};

export default config;`}
          />
          <Code.Snippet
            className="w-full"
            title="api-only deployment"
            code={`import type { AppConfig } from "akanjs";

const config: AppConfig = {
  web: false,
};

export default config;`}
          />
        </div>
        <Docs.Description>
          <div>
            {l.trans({
              en: "An api-only build writes no route artifact, skips the RSC worker entrypoint, and leaves public/ out of the image, because the web router's catch-all is its only reader. Nothing under page/ is served, including routes a library contributed through syncPageLibs.",
              ko: "api-only 빌드는 라우트 산출물을 쓰지 않고, RSC worker entrypoint를 건너뛰며, public/을 이미지에서 제외합니다. 이를 읽는 곳이 web router의 catch-all 하나뿐이기 때문입니다. page/ 아래의 어떤 것도 서비스되지 않으며, syncPageLibs로 들어온 라이브러리 라우트도 마찬가지입니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "AKAN_SSR and AKAN_CSR narrow the same two surfaces per deployment. They only narrow: a surface the build left out cannot be switched back on, and the boot log names what the process ended up serving. The generated Dockerfile writes the build's own answer as the image default.",
              ko: "AKAN_SSR과 AKAN_CSR은 같은 두 surface를 배포 단위로 좁힙니다. 좁히기만 합니다. 빌드에서 빠진 surface는 다시 켤 수 없고, 부팅 로그가 이 프로세스가 실제로 무엇을 서비스하는지 남깁니다. 생성된 Dockerfile에는 빌드가 내린 답이 이미지 기본값으로 기록됩니다.",
            })}
          </div>
        </Docs.Description>
        <Docs.Alert type="warning">
          {l.trans({
            en: "Turning CSR off is refused when the app declares mobile targets, because akan build-ios copies dist/apps/<app>/csr/<target>.html into the native project.",
            ko: "mobile target을 선언한 앱에서 CSR을 끄면 거부됩니다. akan build-ios가 dist/apps/<app>/csr/<target>.html을 네이티브 프로젝트로 복사하기 때문입니다.",
          })}
        </Docs.Alert>
        <Docs.Alert type="info">
          {l.trans({
            en: "akan start ignores web and keeps the whole dev surface: the incremental builder is also the file watcher, so switching it off would take server-code HMR with it. It warns once when the config and the dev server disagree.",
            ko: "akan start는 web을 무시하고 개발 surface 전체를 유지합니다. incremental builder가 파일 watcher를 겸하고 있어서, 끄면 서버 코드 HMR까지 함께 사라지기 때문입니다. config와 dev server가 어긋나면 한 번 경고합니다.",
          })}
        </Docs.Alert>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="images" title="images">
        <Docs.Title>images</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "images configures Akan's optimized image pipeline. It controls allowed image sizes, output formats, remote sources, local paths, redirects, timeout, and byte limits.",
              ko: "images는 Akan optimized image pipeline을 설정합니다. 허용 image size, output format, remote source, local path, redirect, timeout, byte limit을 제어합니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "Akan merges your image config with defaults. List fields such as deviceSizes, imageSizes, formats, remotePatterns, and localPatterns keep defaults unless you replace them.",
              ko: "Akan은 image config를 기본값과 merge합니다. deviceSizes, imageSizes, formats, remotePatterns, localPatterns 같은 list 필드는 직접 설정하지 않으면 기본값을 유지합니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/catalog/akan.config.ts"
          code={`import type { AppConfig } from "akanjs";

const config: AppConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "cdn.example.com", pathname: "/products/**" },
    ],
    formats: ["image/webp"],
    minimumCacheTTL: 86400,
    maxRemoteBytes: 10 * 1024 * 1024,
  },
};

export default config;`}
        />
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="i18n" title="i18n">
        <Docs.Title>i18n</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "i18n defines the locales your app supports and the default locale used when no user preference is resolved.",
              ko: "i18n은 앱이 지원하는 locale과 사용자 선호를 resolve하지 못했을 때 사용할 default locale을 정의합니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "Akan writes the resolved default locale and locale list to AKAN_PUBLIC_DEFAULT_LOCALE and AKAN_PUBLIC_LOCALES for build/runtime use.",
              ko: "Akan은 resolve된 default locale과 locale 목록을 build/runtime에서 사용할 수 있도록 AKAN_PUBLIC_DEFAULT_LOCALE, AKAN_PUBLIC_LOCALES에 기록합니다.",
            })}
          </div>
        </Docs.Description>
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
        <Docs.Alert type="info">
          {l.trans({
            en: "Keep i18n here for app-level language availability. Put actual translated copy in the page, dictionary, or localization layer that owns the text.",
            ko: "여기에는 app-level language availability만 둡니다. 실제 번역 문구는 해당 text를 소유한 page, dictionary, localization layer에 둡니다.",
          })}
        </Docs.Alert>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="public-env" title="publicEnv">
        <Docs.Title>publicEnv</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "publicEnv lists environment keys that are allowed to be exposed to browser code. Treat it as an allowlist for public-safe values.",
              ko: "publicEnv는 browser code에 노출해도 되는 environment key 목록입니다. 공개 가능한 값에 대한 allowlist로 다루세요.",
            })}
          </div>
          <div>
            {l.trans({
              en: "Akan keeps the list in resolved app config so build and runtime code know which env values may cross the server-to-browser boundary.",
              ko: "Akan은 해당 목록을 resolved app config에 저장해서 build와 runtime code가 server-to-browser boundary를 넘어갈 수 있는 env 값을 알 수 있게 합니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/landing/akan.config.ts"
          code={`import type { AppConfig } from "akanjs";

const config: AppConfig = {
  publicEnv: ["PUBLIC_ANALYTICS_KEY", "PUBLIC_FEATURE_PREVIEW"],
};

export default config;`}
        />
        <Docs.Alert type="warning">
          {l.trans({
            en: "Never include secrets, database URLs, private tokens, or server credentials in publicEnv.",
            ko: "secret, database URL, private token, server credential은 절대 publicEnv에 넣지 마세요.",
          })}
        </Docs.Alert>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="secrets" title="secrets">
        <Docs.Title>secrets</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "secrets lists glob patterns for private files that must ship to the cloud alongside the default env/ files. On `akan upload-env` Akan bundles every matched file into the env archive, and `akan download-env` restores them to the same paths.",
              ko: "secrets는 기본 env/ 파일과 함께 cloud로 전송해야 하는 private file의 glob pattern 목록입니다. `akan upload-env` 실행 시 Akan은 매칭된 파일을 env archive에 함께 담고, `akan download-env`는 동일 경로로 복원합니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "Patterns are resolved relative to the app directory. Akan also syncs them into a managed block in the workspace root .gitignore on upload-env, so declaring a pattern here is enough to both ship and git-ignore the files. You do not maintain .gitignore separately.",
              ko: "pattern은 app 디렉터리 기준으로 resolve됩니다. Akan은 upload-env 시 이 pattern들을 workspace root .gitignore의 managed block에 동기화하므로, 여기에 pattern을 선언하는 것만으로 파일 전송과 git-ignore가 함께 처리됩니다. .gitignore를 따로 관리하지 않아도 됩니다.",
            })}
          </div>
        </Docs.Description>
        <div className={cardGridRecipe()}>
          <Code.Snippet
            className="w-full"
            title="apps/api/akan.config.ts"
            code={`import type { AppConfig } from "akanjs";

const config: AppConfig = {
  secrets: ["secrets/**/*", "certs/*.pem"],
};

export default config;`}
          />
          <Code.Snippet
            className="w-full"
            title=".gitignore (auto-synced)"
            code={`# akan:secrets (managed by akan.config.ts — do not edit)
apps/api/certs/*.pem
apps/api/secrets/**/*
# akan:secrets:end`}
          />
        </div>
        <Docs.Alert type="info">
          {l.trans({
            en: "Use secrets for private key files, service-account JSON, or certificates that env.server.* cannot inline. The default env/env.(client|server).*.ts files are always included, so you only list extra paths here.",
            ko: "secrets는 env.server.*로 inline할 수 없는 private key 파일, service-account JSON, certificate에 사용합니다. 기본 env/env.(client|server).*.ts 파일은 항상 포함되므로 여기에는 추가 경로만 나열합니다.",
          })}
        </Docs.Alert>
        <Docs.Alert type="warning">
          {l.trans({
            en: "Only the glob patterns live in akan.config.ts. The matched files stay local and git-ignored — never commit their contents. Removing a pattern also removes it from the managed .gitignore block on the next upload-env.",
            ko: "akan.config.ts에는 glob pattern만 존재합니다. 매칭된 파일은 로컬에 남고 git-ignore되므로 내용을 절대 commit하지 마세요. pattern을 제거하면 다음 upload-env 때 managed .gitignore block에서도 함께 제거됩니다.",
          })}
        </Docs.Alert>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="sync-page-libs" title="syncPageLibs">
        <Docs.Title>syncPageLibs</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "syncPageLibs declares which library page folders this app serves. On akan sync, each selected library is linked into apps/<app>/page/(libs)/(<lib>), so the library keeps ownership of its routes and the app only opts in.",
              ko: "syncPageLibs는 이 앱이 어떤 라이브러리의 page 폴더를 서비스할지 선언합니다. akan sync를 실행하면 선택된 라이브러리가 apps/<app>/page/(libs)/(<lib>)로 링크되므로, 라우트의 소유권은 라이브러리에 남고 앱은 사용 여부만 선언합니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "true takes every library dependency that ships a page folder, an array takes exactly the libraries listed, and false (the default) syncs nothing and removes what an earlier sync created.",
              ko: "true는 page 폴더가 있는 모든 라이브러리 의존성을 가져오고, 배열은 나열한 라이브러리만 가져오며, 기본값인 false는 아무것도 동기화하지 않고 이전 sync가 만든 링크를 제거합니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title="apps/myapp/akan.config.ts"
          code={`import type { AppConfig } from "akanjs";

const config: AppConfig = {
  syncPageLibs: ["shared"],
};

export default config;`}
        />
        <Docs.Alert type="info">
          {l.trans({
            en: "The linked folder is generated and gitignored, so edit the library source instead. An explicit list fails the sync when a named library is not a dependency or has no page folder, while true simply skips libraries without one.",
            ko: "링크된 폴더는 생성물이고 gitignore 대상이므로 라이브러리 원본을 수정해야 합니다. 배열로 명시한 라이브러리가 의존성이 아니거나 page 폴더가 없으면 sync가 실패하고, true는 page 폴더가 없는 라이브러리를 그냥 건너뜁니다.",
          })}
        </Docs.Alert>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="external-libs" title="externalLibs">
        <Docs.Title>externalLibs</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "externalLibs marks dependencies that should not be bundled into app code. When declared here, Akan installs them as separate packages during the production build.",
              ko: "externalLibs는 app code bundle에 포함하지 않을 dependency를 표시합니다. 여기에 선언된 dependency는 production build 단계에서 별도 package로 설치됩니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "Akan includes externalLibs in the production package dependencies together with the required SSR runtime packages.",
              ko: "Akan은 externalLibs를 필수 SSR runtime package와 함께 production package dependencies에 포함합니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/media/akan.config.ts"
          code={`import type { AppConfig } from "akanjs";

const config: AppConfig = {
  externalLibs: ["puppeteer"],
};

export default config;`}
        />
        <Docs.Alert type="info">
          {l.trans({
            en: "Use this for native or runtime-sensitive packages. Normal TypeScript helpers usually do not need externalLibs.",
            ko: "native package나 runtime 처리에 민감한 package에 사용하세요. 일반 TypeScript helper는 보통 externalLibs가 필요하지 않습니다.",
          })}
        </Docs.Alert>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="barrel-imports" title="barrelImports">
        <Docs.Title>barrelImports</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "barrelImports adds import roots that should be treated as barrel folders. Akan already includes framework barrels and the standard barrel folders from each app and library.",
              ko: "barrelImports는 barrel folder로 다뤄야 하는 import root를 추가합니다. Akan은 framework barrel과 각 app/library의 standard barrel folder를 기본으로 포함합니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "Akan starts with framework defaults such as akanjs/webkit, akanjs/common, akanjs/ui, akanjs/client, and akanjs/server. It also adds @apps/<app>/{ui,webkit,common,client,server} and the same folders from every used @libs/<lib>. Your custom entries are appended after those defaults.",
              ko: "Akan은 akanjs/webkit, akanjs/common, akanjs/ui, akanjs/client, akanjs/server 같은 framework 기본값으로 시작합니다. 또한 @apps/<app>/{ui,webkit,common,client,server}와 사용 중인 모든 @libs/<lib>의 동일 폴더를 추가합니다. 사용자가 추가한 값은 이 기본값 뒤에 붙습니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/admin/akan.config.ts"
          code={`import type { AppConfig } from "akanjs";

const config: AppConfig = {
  barrelImports: ["@pkgs/mypkg/ui/icons"],
};

export default config;`}
        />
        <Docs.Alert type="info">
          {l.trans({
            en: "Most ui, webkit, common, client, and server folders are already covered. Add this only for a custom barrel outside the standard facets.",
            ko: "대부분의 ui, webkit, common, client, server 폴더는 이미 포함됩니다. standard facet 밖의 custom barrel에만 추가하세요.",
          })}
        </Docs.Alert>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="optimize-imports" title="optimizeImports">
        <Docs.Title>optimizeImports</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "optimizeImports tells Akan which packages or barrels should participate in optimized import handling so pages load only what they use. Akan already includes common UI, icon, chart, hook, and utility packages by default.",
              ko: "optimizeImports는 page가 실제 사용하는 것만 load하도록 optimized import handling에 참여할 package 또는 barrel을 지정합니다. Akan은 자주 쓰이는 UI, icon, chart, hook, utility package를 기본으로 포함합니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "Akan merges your entries with default optimized packages such as lucide-react, date-fns, lodash-es, ramda, antd, ahooks, Heroicons, MUI, Recharts, react-use, Tabler icons, and react-icons/*, then removes duplicates.",
              ko: "Akan은 사용자가 추가한 값을 lucide-react, date-fns, lodash-es, ramda, antd, ahooks, Heroicons, MUI, Recharts, react-use, Tabler icons, react-icons/* 같은 기본 optimized package 목록과 merge하고 중복을 제거합니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/dashboard/akan.config.ts"
          code={`import type { AppConfig } from "akanjs";

const config: AppConfig = {
  optimizeImports: ["barrel-library"],
};

export default config;`}
        />
        <Docs.Alert type="info">
          {l.trans({
            en: "Pair this with a clean barrel shape. One file per export makes optimized imports easier to reason about.",
            ko: "깔끔한 barrel 구조와 함께 사용하세요. 1 file = 1 export를 유지하면 optimized import 동작을 예측하기 쉽습니다.",
          })}
        </Docs.Alert>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="docker" title="docker">
        <Docs.Title>docker</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "docker customizes the production container Akan generates for an app. Use it only when deployment needs extra system packages or a different startup command.",
              ko: "docker는 Akan이 앱용으로 생성하는 production container를 커스터마이징합니다. 배포에 추가 system package나 다른 startup command가 필요할 때만 사용합니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "Akan builds Dockerfile content from the base image, your run scripts, app env values, base paths, locale values, and command. The generated image installs ca-certificates and tzdata and nothing else, so an app that needs a headless browser, ffmpeg, or a native toolchain declares it in preRuns.",
              ko: "Akan은 base image, 사용자 run script, app env 값, basePath, locale 값, command를 조합해 Dockerfile content를 생성합니다. 생성되는 이미지는 ca-certificates와 tzdata만 설치하므로, headless browser나 ffmpeg, native toolchain이 필요한 앱은 preRuns에 선언합니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "docker is either those parts or a whole Dockerfile written as a string. preRuns run before bun install --production, so build tools a native dependency needs are present for it; postRuns run after it, before app files are copied. image and each run entry also take a per-architecture object, which compiles to a TARGETARCH guard.",
              ko: "docker는 이 구성 요소들이거나, 문자열로 작성한 Dockerfile 전체입니다. preRuns는 bun install --production 이전에 실행되어 native dependency가 필요로 하는 build tool을 먼저 준비하고, postRuns는 그 이후 app file을 copy하기 전에 실행됩니다. image와 각 run 항목은 architecture별 object도 받으며, 이는 TARGETARCH 분기로 변환됩니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/worker/akan.config.ts"
          code={`import type { AppConfig } from "akanjs";

const config: AppConfig = {
  docker: {
    image: "oven/bun:1-slim",
    preRuns: ["apt-get update && apt-get install -y --no-install-recommends ffmpeg imagemagick"],
    command: ["bun", "main.js"],
  },
};

export default config;`}
        />
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
    "ENV AKAN_PUBLIC_OPERATION_MODE=cloud",
    "",
    'CMD ["bun","main.js"]',
  ].join("\\n"),
};

export default config;`}
        />
        <Docs.Alert type="info">
          {l.trans({
            en: "The string form is useful when the deployment image must be fully controlled. It is used exactly as written, so nothing is merged into it — including the preRuns a library contributes. Keep the default Dockerfile flow when possible: install runtime packages, install production dependencies, copy app files, set Akan public env values, then define CMD.",
            ko: "문자열 형태는 deployment image를 완전히 제어해야 할 때 유용합니다. 작성한 그대로 사용되므로 library가 기여한 preRuns를 포함해 어떤 것도 병합되지 않습니다. 가능하면 기본 Dockerfile 흐름을 유지하세요. runtime package 설치, production dependency 설치, app file copy, Akan public env 설정, CMD 선언 순서입니다.",
          })}
        </Docs.Alert>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide
        id="library-config-fields"
        title={l.trans({ en: "Library Config Fields", ko: "Library Config 필드" })}
      >
        <Docs.Title>{l.trans({ en: "Library Config Fields", ko: "Library Config 필드" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "LibConfig uses the same partial object or function shape, and its practical surface is externalLibs and docker. Use externalLibs when a shared library wraps a dependency that must be available in production runtime packaging.",
              ko: "LibConfig도 같은 partial object 또는 function 형태를 사용하며, 실전에서 다루는 표면은 externalLibs와 docker입니다. externalLibs는 shared library가 production runtime packaging에 포함되어야 하는 dependency를 감쌀 때 사용합니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "docker declares the image steps the library's own runtime needs, as preRuns and postRuns only — the base image and the command stay the app's decision. Library steps are emitted before the app's own, and a step declared on both sides becomes one layer.",
              ko: "docker는 해당 library의 runtime이 필요로 하는 image step을 preRuns와 postRuns로만 선언합니다. base image와 command는 app이 결정합니다. library step은 app 자신의 step보다 앞서 배치되며, 양쪽에서 같은 step을 선언하면 하나의 layer로 합쳐집니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "Akan resolves missing values to an empty list and merges every workspace library's externalLibs and docker steps into each app, so an app that uses the library does not repeat the declaration. An app whose docker is a whole Dockerfile string takes neither.",
              ko: "Akan은 빠진 값을 빈 목록으로 resolve하고, workspace의 모든 library externalLibs와 docker step을 각 app에 합칩니다. 따라서 해당 library를 쓰는 app이 같은 선언을 반복하지 않아도 됩니다. docker를 Dockerfile 문자열 전체로 선언한 app은 둘 다 받지 않습니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="libs/shared/akan.config.ts"
          code={`import type { LibConfig } from "akanjs";

const config: LibConfig = {
  externalLibs: ["puppeteer"],
  docker: {
    preRuns: ["apt-get update && apt-get install -y --no-install-recommends chromium"],
  },
};

export default config;`}
        />
      </Scroll.Slide>
      <Divider />

      <DocsToc />
    </Scroll>
  );
}
