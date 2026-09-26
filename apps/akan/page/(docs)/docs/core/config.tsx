import { usePage } from "@apps/akan/client";
import { Code, Divider, Docs, DocsToc } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { page } from "akanjs/client";
import { Link } from "akanjs/ui";

const configKeys = [
  {
    key: "routes",
    type: "AkanRouteConfig[]",
    en: "Public domains for the app, optionally split per client with basePath.",
    ko: "앱이 사용할 공개 도메인이며, basePath로 클라이언트를 나눌 수 있습니다.",
  },
  {
    key: "api",
    type: "{ prefix, websocketPrefix }",
    default: "/api, /ws",
    en: "Where signal endpoints and the websocket upgrade are mounted. Baked into every client bundle.",
    ko: "signal 엔드포인트와 웹소켓 업그레이드가 마운트될 경로입니다. 모든 클라이언트 번들에 구워집니다.",
  },
  {
    key: "web",
    type: "boolean | { csr: boolean }",
    default: "true",
    en: "Which web surfaces the build produces and the app mounts at boot.",
    ko: "빌드가 만들고 앱이 부팅 때 마운트하는 웹 표면을 정합니다.",
  },
  {
    key: "i18n",
    type: "{ defaultLocale, locales }",
    default: 'en, ["en", "ko"]',
    en: "The locale segment every route sits under. defaultLocale must be one of locales.",
    ko: "모든 라우트가 놓이는 locale 세그먼트입니다. defaultLocale은 locales 안에 있어야 합니다.",
  },
  {
    key: "mobile",
    type: "AkanMobileConfig",
    en: "Native app identity plus one entry per mobile package that Android and iOS commands read.",
    ko: "Android·iOS 명령이 읽는 네이티브 앱 정보와 모바일 패키지별 target 정의입니다.",
  },
  {
    key: "images",
    type: "AkanImageConfig",
    default: "webp, quality 75",
    en: "Allow-list, sizes, and limits for the image optimizer. A remote host not listed is refused.",
    ko: "이미지 최적화의 허용 목록·크기·제한입니다. 목록에 없는 원격 호스트는 거부됩니다.",
  },
  {
    key: "publicEnv",
    type: "string[]",
    default: "[]",
    en: "Extra process.env names the browser build may inline, beyond the built-in AKAN_PUBLIC_* pattern.",
    ko: "기본 AKAN_PUBLIC_* 패턴 외에 브라우저 빌드가 인라인해도 되는 process.env 이름입니다.",
  },
  {
    key: "secrets",
    type: "string[]",
    default: "[]",
    en: "Globs for files that cannot live inside env.server.*.ts. Shipped by upload-env and git-ignored.",
    ko: "env.server.*.ts 안에 담을 수 없는 파일의 glob입니다. upload-env가 함께 보내고 git-ignore됩니다.",
  },
  {
    key: "assets",
    type: "{ pruneFonts, keepFonts }",
    default: "true, []",
    en: "How akan build trims the public/ copy it ships. Source trees are never touched.",
    ko: "akan build가 배포용 public/ 복사본을 어떻게 줄일지 정합니다. 원본 트리는 건드리지 않습니다.",
  },
  {
    key: "syncPageLibs",
    type: "string[] | boolean",
    default: "false",
    en: "Which library page folders this app mounts as its own routes.",
    ko: "이 앱이 자기 라우트로 마운트할 라이브러리 page 폴더를 정합니다.",
  },
  {
    key: "plugins",
    type: "AkanPlugin[]",
    default: "[]",
    en: "Akan plugins this app contributes, read live by the CLI.",
    ko: "이 앱이 등록하는 Akan 플러그인이며, CLI가 실행 시점에 읽습니다.",
  },
  {
    key: "docker",
    type: "string | DockerImageConfig",
    default: "oven/bun:1-slim",
    en: "A whole Dockerfile as a string, or the parts akan build assembles one from.",
    ko: "Dockerfile 전체 문자열이거나, akan build가 Dockerfile을 조립할 재료입니다.",
  },
  {
    key: "database",
    type: "{ modes: DatabaseMode[] }",
    default: '{ modes: ["single"] }',
    en: "The modes the build can run in; each deployment picks one with AKAN_DATABASE_MODE.",
    ko: "빌드가 실행될 수 있는 모드 목록이며, 배포마다 AKAN_DATABASE_MODE로 그중 하나를 고릅니다.",
  },
  {
    key: "externalLibs",
    type: "string[]",
    default: "[]",
    en: "Packages kept as production runtime dependencies instead of being bundled.",
    ko: "번들에 넣지 않고 프로덕션 런타임 의존성으로 유지할 패키지입니다.",
  },
  {
    key: "barrelImports",
    type: "string[]",
    default: "akanjs + workspace",
    en: "Barrel paths Akan flattens while scanning and bundling.",
    ko: "스캔과 번들링에서 Akan이 펼치는 barrel 경로입니다.",
  },
  {
    key: "optimizeImports",
    type: "string[]",
    default: "built-in list",
    en: "Extra packages whose imports the client build rewrites to the exact source file.",
    ko: "클라이언트 빌드가 정확한 원본 파일 import로 바꿔 줄 추가 패키지입니다.",
  },
];

const mobileFields = [
  {
    key: "appName",
    type: "string",
    default: "the app name",
    en: "Display name of the native app.",
    ko: "네이티브 앱 표시 이름입니다.",
  },
  {
    key: "appId",
    type: "string",
    default: "com.<repo>.<app>",
    en: "Native package identifier: Android applicationId and iOS bundle id.",
    ko: "네이티브 패키지 식별자이며, Android applicationId와 iOS bundle id로 쓰입니다.",
  },
  {
    key: "version",
    type: "string",
    default: "0.0.1",
    en: "User-facing app version, written to Android versionName and iOS MARKETING_VERSION.",
    ko: "사용자에게 보이는 앱 버전이며, Android versionName과 iOS MARKETING_VERSION에 기록됩니다.",
  },
  {
    key: "buildNum",
    type: "number",
    default: "1",
    en: "Store build number, written to Android versionCode and iOS CURRENT_PROJECT_VERSION.",
    ko: "스토어 제출 빌드 번호이며, Android versionCode와 iOS CURRENT_PROJECT_VERSION에 기록됩니다.",
  },
  {
    key: "targets",
    type: "Record<string, Target>",
    default: "one target",
    en: "Named mobile packages built from the same Akan app.",
    ko: "같은 Akan 앱에서 만드는 이름 있는 모바일 패키지입니다.",
  },
  {
    key: "targets.*.basePath",
    type: "string",
    en: "The client this native package opens; it must be a basePath declared in routes.",
    ko: "이 네이티브 패키지가 여는 클라이언트이며, routes에 선언된 basePath여야 합니다.",
  },
  {
    key: "targets.*.indexPath",
    type: "string",
    en: "Start and fallback CSR path: app startup, deep-link stack recovery, back-button fallback.",
    ko: "시작·fallback CSR 경로이며, 모바일 시작, 딥링크 스택 복원, 뒤로가기 fallback에 씁니다.",
  },
  {
    key: "targets.*.permissions",
    type: "camera | contacts | location | push | speech",
    default: "[]",
    en: "Native permission hints; each activates the matching plugin's native configuration.",
    ko: "네이티브 권한 힌트이며, 각 값이 해당 플러그인의 네이티브 설정을 켭니다.",
  },
  {
    key: "targets.*.assets",
    type: "{ icon, splash }",
    en: "App icon and splash source paths, relative to the app root.",
    ko: "앱 루트 기준의 앱 아이콘·splash 이미지 경로입니다.",
  },
  {
    key: "targets.*.files",
    type: "{ ios, android }",
    en: "Native file copy map from a path in the generated project to an app-relative source file.",
    ko: "생성된 네이티브 프로젝트 안의 경로를 앱 기준 원본 파일에 매핑하는 복사 맵입니다.",
  },
  {
    key: "targets.*.deepLinks",
    type: "AkanMobileTargetDeepLinks",
    en: "Native URL schemes and verified HTTPS app links for this target.",
    ko: "이 target이 받을 네이티브 URL scheme과 검증된 HTTPS 앱 링크입니다.",
  },
  {
    key: "deepLinks.schemes",
    type: "string[]",
    en: "Custom URL schemes such as example://.",
    ko: "example:// 같은 커스텀 URL scheme입니다.",
  },
  {
    key: "deepLinks.domains",
    type: "string[]",
    en: "App-link and universal-link hosts, normalized to the bare host.",
    ko: "app link·universal link 호스트이며, 호스트만 남도록 정규화됩니다.",
  },
  {
    key: "deepLinks.ios.teamId",
    type: "string",
    en: "Apple Developer Team ID for apple-app-site-association; universal links need it.",
    ko: "apple-app-site-association에 쓰는 Apple Developer Team ID이며, universal link에 필요합니다.",
  },
  {
    key: "deepLinks.android.sha256CertFingerprints",
    type: "string[]",
    en: "assetlinks.json signing fingerprints: debug for a local build, release for Play Store.",
    ko: "assetlinks.json에 쓰는 서명 인증서 fingerprint이며, debug는 로컬 빌드, release는 Play Store 빌드용입니다.",
  },
  {
    key: "plugins",
    type: "Record<string, unknown>",
    en: "Passthrough Capacitor plugins config, merged target over root.",
    ko: "Capacitor plugins config로 그대로 전달되며, root 위에 target을 얹어 병합합니다.",
  },
  {
    key: "android",
    type: "Record<string, unknown>",
    en: "Passthrough Capacitor android config, merged target over root.",
    ko: "Capacitor android config로 그대로 전달되며, root 위에 target을 얹어 병합합니다.",
  },
  {
    key: "ios",
    type: "Record<string, unknown>",
    en: "Passthrough Capacitor ios config, merged target over root.",
    ko: "Capacitor ios config로 그대로 전달되며, root 위에 target을 얹어 병합합니다.",
  },
];

const buildFields = [
  {
    key: "externalLibs",
    type: "string[]",
    default: "[]",
    en: "Unbundled packages, installed in production at the workspace-pinned version.",
    ko: "번들하지 않는 패키지이며, 프로덕션에서 워크스페이스가 고정한 버전으로 설치됩니다.",
  },
  {
    key: "optimizeImports",
    type: "string[]",
    default: "built-in list",
    en: "Extra packages the client build imports by exact file, so an icon set does not ship whole.",
    ko: "클라이언트 빌드가 정확한 원본 파일로 import할 추가 패키지이며, 아이콘 세트를 통째로 싣지 않게 합니다.",
  },
  {
    key: "barrelImports",
    type: "string[]",
    default: "akanjs + workspace",
    en: "Extra barrels to flatten while scanning and bundling, for ones outside the workspace.",
    ko: "스캔과 번들링에서 펼칠 추가 barrel 경로이며, 워크스페이스 밖의 barrel에만 씁니다.",
  },
  {
    key: "database.modes",
    type: '("single" | "multiple" | "cluster")[]',
    default: '["single"]',
    en: "Every declared mode's drivers ship: multiple adds bullmq and ioredis, cluster also postgres.",
    ko: "선언한 모든 모드의 드라이버가 함께 설치됩니다. multiple은 bullmq·ioredis를, cluster는 postgres까지 더합니다.",
  },
  {
    key: "assets.pruneFonts",
    type: "boolean",
    default: "true",
    en: "Drops unreferenced fonts from dist's public/ copy; an optimize-on font's source goes too.",
    ko: "참조되지 않는 폰트를 dist의 public/ 복사본에서 제거합니다. optimize가 켜진 폰트의 원본도 제거됩니다.",
  },
  {
    key: "assets.keepFonts",
    type: "string[]",
    default: "[]",
    en: "Font globs kept whatever the scan concludes, such as a URL assembled at runtime.",
    ko: "스캔 결과와 무관하게 남길 폰트 glob이며, 런타임에 조립되는 URL 같은 경우에 씁니다.",
  },
  {
    key: "syncPageLibs",
    type: "string[] | boolean",
    default: "false",
    en: "true mounts every dependency lib with a page folder, an array only those; false unlinks all.",
    ko: "true는 page 폴더가 있는 모든 의존 라이브러리를, 배열은 적은 것만 마운트하고, false는 기존 링크를 모두 제거합니다.",
  },
  {
    key: "plugins",
    type: "AkanPlugin[]",
    default: "[]",
    en: "Read live by the CLI for runtime packages, native project setup, and public/ assets.",
    ko: "CLI가 실행 시점에 읽어 런타임 패키지, 네이티브 프로젝트 설정, public/ 에셋을 처리합니다.",
  },
  {
    key: "docker",
    type: "string | DockerImageConfig",
    default: "oven/bun:1-slim",
    en: "A whole Dockerfile, or its parts: image, preRuns and postRuns around bun install, command.",
    ko: "Dockerfile 전체이거나 그 재료입니다. image, bun install 앞뒤의 preRuns·postRuns, command입니다.",
  },
];

export default page().render(() => {
  const { l } = usePage();
  return (
    <Scroll>
      <Scroll.Slide id="app-config" title={l.trans({ en: "App Config", ko: "앱 설정" })}>
        <Docs.Title>{l.trans({ en: "App Config", ko: "앱 설정" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "akan.config.ts is the app-level settings file. You do not need to understand every option on day one. Start with an empty file, then add only the fields your app actually needs.",
              ko: "akan.config.ts는 앱 단위 설정 파일입니다. 처음부터 모든 옵션을 이해할 필요는 없습니다. 빈 파일로 시작하고, 앱에 필요한 필드만 하나씩 추가하면 됩니다.",
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/minimal/akan.config.ts"
            code={`import type { AppConfig } from "akanjs";

const config: AppConfig = {};

export default config;`}
          />
          <div>
            {l.trans({
              en: "This is the whole key set. Every one of them has a default that a working app can live with, and the slides below cover the ones you are most likely to change:",
              ko: "설정 가능한 키는 아래가 전부입니다. 모두 앱이 그대로 동작하는 기본값을 갖고 있으며, 그중 자주 바꾸게 되는 것들을 이어지는 슬라이드에서 다룹니다:",
            })}
          </div>
          <Docs.OptionTable
            items={configKeys.map(({ key, type, default: fallback, en, ko }) => ({
              key,
              type,
              default: fallback,
              desc: l.trans({ en, ko }),
            }))}
          />
          <div className="space-y-1 pl-2">
            {[
              {
                title: l.trans({ en: "Start small", ko: "작게 시작" }),
                desc: l.trans({
                  en: "Most defaults are already prepared, so an empty config is valid.",
                  ko: "대부분의 기본값은 준비되어 있으므로 빈 config도 유효합니다.",
                }),
              },
              {
                title: l.trans({ en: "Add only what changes", ko: "필요한 것만 추가" }),
                desc: l.trans({
                  en: "Define only the parts your app actually needs to customize.",
                  ko: "앱에서 실제로 바꿔야 하는 부분만 선언하면 됩니다.",
                }),
              },
              {
                title: l.trans({ en: "One source of truth", ko: "하나의 기준점" }),
                desc: l.trans({
                  en: "CLI commands, production builds, and mobile commands all read this file.",
                  ko: "CLI 명령, 프로덕션 빌드, 모바일 명령이 모두 이 파일을 기준으로 동작합니다.",
                }),
              },
            ].map(({ title, desc }) => (
              <div key={title}>
                <span className="font-bold text-foreground">{title}: </span>
                <span className="text-foreground/70 text-sm">{desc}</span>
              </div>
            ))}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="config-shape" title={l.trans({ en: "Config Shape", ko: "설정 파일 형태" })}>
        <Docs.Title>{l.trans({ en: "Config Shape", ko: "설정 파일 형태" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "The default export can be a plain object or a function. Use an object for most apps. Use a function only when the config needs app metadata while it is being loaded.",
              ko: "default export는 일반 객체이거나 함수일 수 있습니다. 대부분의 앱은 객체로 충분합니다. config를 읽는 시점에 앱 메타데이터가 필요할 때만 함수를 사용합니다.",
            })}
          </div>
        </Docs.Description>
        <div className="space-y-1">
          <Code.Snippet
            className="w-full"
            title={l.trans({ en: "Object config", ko: "객체 설정" })}
            code={`import type { AppConfig } from "akanjs";

const config: AppConfig = {
  routes: [{ domains: { main: ["www.example.com"] }, basePath: "store" }],
};

export default config;`}
          />
          <Code.Snippet
            className="w-full"
            title={l.trans({ en: "Function config", ko: "함수 설정" })}
            code={`import type { AppConfig } from "akanjs";

const config: AppConfig = (app) => ({
  mobile: {
    appName: app.name,
    appId: "com.example.app",
  },
});

export default config;`}
          />
        </div>
        <Docs.Alert type="info">
          {l.trans({
            en: "Akan treats config as partial settings. Missing fields are filled with framework defaults.",
            ko: "Akan은 config를 부분 설정으로 다룹니다. 선언하지 않은 값은 프레임워크 기본값으로 채워집니다.",
          })}
        </Docs.Alert>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="app-env" title={l.trans({ en: "Application Env", ko: "애플리케이션 환경설정" })}>
        <Docs.Title>{l.trans({ en: "Application Env", ko: "애플리케이션 환경설정" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "akan.config.ts describes how the app is built and routed. The env/ folder describes the actual values the app uses at runtime, such as public client keys, server-only options, and environment-specific service settings.",
              ko: "akan.config.ts가 앱을 어떻게 빌드하고 라우팅할지 설명한다면, env/ 폴더는 앱이 실행 중 사용할 실제 값을 설명합니다. 공개 가능한 클라이언트 키, 서버 전용 옵션, 환경별 서비스 설정 같은 값이 여기에 들어갑니다.",
            })}
          </div>
        </Docs.Description>
        <div className="space-y-1">
          <Code.Snippet
            className="w-full"
            title="env/env.client.local.ts"
            code={`import type { AppClientEnv } from "./env.client.type";

export const env: AppClientEnv = {
  google: {
    mapKey: "local-map-key",
  },
} as const;`}
          />
          <Code.Snippet
            className="w-full"
            title="env/env.server.local.ts"
            code={`import type { ModulesOptions } from "../lib/option";
import { libEnv } from "./env.server.type";

export const env: ModulesOptions = {
  ...libEnv,
  hostname: null,
  security: {
    verifies: [["password", "phone"]],
    sso: {},
  },
};`}
          />
        </div>
        <Docs.IntroTable
          type={l.trans({ en: "File", ko: "파일" })}
          items={[
            {
              name: "env.client.*",
              desc: l.trans({
                en: "Public-safe values for client code, such as map keys, site keys, or feature switches.",
                ko: "클라이언트 코드가 쓰는 공개 가능한 값입니다. 지도 키, 사이트 키, 기능 스위치 같은 값입니다.",
              }),
            },
            {
              name: "env.server.*",
              desc: l.trans({
                en: "Server-only values: server options, connection settings, private service configuration.",
                ko: "서버 모듈에서만 쓰는 값입니다. 서버 옵션, 연결 설정, 비공개 서비스 설정을 둡니다.",
              }),
            },
            {
              name: ["local", "testing", "debug", "develop", "main"],
              desc: l.trans({
                en: "Suffixes chosen by AKAN_PUBLIC_ENV: your machine, tests, two shared stages, production.",
                ko: "AKAN_PUBLIC_ENV로 고르는 suffix이며, 순서대로 내 PC, 테스트, 공유 개발 단계 둘, 운영 환경입니다.",
              }),
            },
            {
              name: "env.*.type.ts",
              desc: l.trans({
                en: "The shape of env values, so a missing or misspelled setting is caught while coding.",
                ko: "env 값의 형태를 정의해, 빠지거나 이름이 틀린 설정을 코딩 중에 잡습니다.",
              }),
            },
          ]}
        />
        <Docs.Alert type="warning">
          {l.trans({
            en: "Client env and publicEnv are different. env.client.* stores app values for each environment, while publicEnv only allows selected process.env names to be exposed to browser builds.",
            ko: "client env와 publicEnv는 다릅니다. env.client.*는 환경별 앱 값을 저장하고, publicEnv는 process.env 중 어떤 이름을 브라우저 빌드에 노출할지 허용하는 목록입니다.",
          })}
        </Docs.Alert>
        <Docs.Alert type="info">
          {l.trans({
            en: "Server env can also include options from shared libraries through env.server.type.ts. This lets an app keep one final server env object while reusing library-level defaults.",
            ko: "server env는 env.server.type.ts를 통해 shared library의 옵션을 함께 포함할 수 있습니다. 덕분에 앱은 라이브러리 기본값을 재사용하면서 최종 서버 env 객체 하나를 유지할 수 있습니다.",
          })}
        </Docs.Alert>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="server-option" title={l.trans({ en: "Server Option", ko: "서버 옵션" })}>
        <Docs.Title>{l.trans({ en: "Server Option", ko: "서버 옵션" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "lib/option.ts is where the app configures its server. env/ holds the values, akan.config.ts holds the build, and this file wires them into the runtime: use objects, signal middleware, adaptor overrides, web proxies, the MCP server, the agent relay's access policy, and the LLM that relay speaks to. Every library the app depends on brings its own option.ts, read in mount order with the app's last — so an app tightens what a library declared without restating it.",
              ko: "lib/option.ts는 앱이 서버를 설정하는 자리입니다. env/는 값을, akan.config.ts는 빌드를 담고, 이 파일은 그것을 런타임에 연결합니다. use 객체, signal middleware, adaptor override, web proxy에 더해 MCP 서버, agent relay 접근 정책, 그 relay가 말을 거는 LLM까지 여기서 정합니다. 앱이 의존하는 모든 라이브러리도 각자 option.ts를 가지며, 마운트 순서대로 읽고 앱의 것을 마지막에 얹습니다. 그래서 앱은 라이브러리가 선언한 값을 다시 쓰지 않고 조일 수 있습니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="lib/option.ts"
          code={`import { AkanOption } from "akanjs/server";
import type { LlmOption } from "akanjs/service";

import { SignedIn } from "../srvkit";
import type { LibOptions } from "./srv";

export type ModulesOptions = LibOptions & {
  llm?: LlmOption;
};

export const option = new AkanOption<ModulesOptions>()
  .setLlm((options) => options.llm ?? {})
  .setAgentAccess(SignedIn)
  .setMcp({ instructions: "Domain tools for the app. Start from taskInTodo." });`}
        />
        <Docs.IntroTable
          type={l.trans({ en: "Stage", ko: "단계" })}
          items={[
            {
              name: "setLlm",
              desc: l.trans({
                en: "apiKey, model, and host for whichever adaptor holds LlmAdaptorRole.",
                ko: "LlmAdaptorRole을 차지한 어댑터가 쓸 apiKey·model·host입니다.",
              }),
            },
            {
              name: "setAgentAccess",
              desc: l.trans({
                en: "Guards (ANDed) for spending the LLM key via runAgentTurn; with none, every call is refused.",
                ko: "runAgentTurn으로 LLM 키를 쓰려면 통과해야 할 가드이며 AND로 묶입니다. 없으면 모든 호출이 거절됩니다.",
              }),
            },
            {
              name: "setMcp",
              desc: l.trans({
                en: "MCP server settings such as instructions, readOnly, and auth.",
                ko: "instructions·readOnly·auth 같은 MCP 서버 설정입니다.",
              }),
            },
            {
              name: ["use", "applyMiddleware", "applyAdaptor", "applyWebProxy"],
              desc: l.trans({
                en: "Register env-derived use<T>() singletons, signal middleware, adaptor overrides, web proxies.",
                ko: "service가 use<T>()로 잡는 env 기반 싱글턴, signal middleware, adaptor override, web proxy를 등록합니다.",
              }),
            },
          ]}
        />
        <Docs.Alert type="warning">
          {l.trans({
            en: "Read the LLM key from the env object, never write it in option.ts: env.server.* is gitignored, this file is not.",
            ko: "LLM 키는 option.ts에 적지 말고 env 객체에서 읽으세요. env.server.*는 gitignore 대상이지만 이 파일은 아닙니다.",
          })}
        </Docs.Alert>
        <Docs.Alert type="info">
          {l.trans({
            en: "Each of these has an env spelling too (AKAN_MCP_*, AKAN_AGENT), for a deployment that must configure what the source does not. A value written in option.ts wins over the env of the same name.",
            ko: "이 설정들에는 env 이름도 하나씩 있습니다(AKAN_MCP_*, AKAN_AGENT). 소스에 없는 값을 배포 시점에 정해야 할 때를 위한 것이며, option.ts에 쓴 값이 같은 이름의 env를 이깁니다.",
          })}
        </Docs.Alert>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="routes" title={l.trans({ en: "Routes and Domains", ko: "Route와 Domain" })}>
        <Docs.Title>{l.trans({ en: "Routes and Domains", ko: "Route와 Domain" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "routes is where you list the public domains for the app. If your app has several clients, each route can also name the client with basePath. The multi-client page explains that structure in detail; here we focus on the config fields.",
              ko: "routes는 앱에서 사용할 공개 도메인을 적는 곳입니다. 앱에 여러 클라이언트가 있다면 각 route에 basePath로 클라이언트 이름도 적을 수 있습니다. 다중 클라이언트 구조 자체는 Multi Client 페이지에서 자세히 다루고, 여기서는 설정 필드에 집중합니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/myapp/akan.config.ts"
          code={`import type { AppConfig } from "akanjs";

const config: AppConfig = {
  externalLibs: ["shiki"],
  routes: [
    { domains: { main: ["www.akanjs.com", "akanjs.com"] }, basePath: "akanjs" },
    { domains: { main: ["soft.akanjs.com"] }, basePath: "soft" },
    { domains: { main: ["office.akanjs.com"] }, basePath: "office" },
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
                en: "The client this route opens and its first page folder; without one, the route is the app.",
                ko: "이 route가 여는 클라이언트이자 첫 page 폴더입니다. basePath가 없는 route는 앱 자체입니다.",
              }),
            },
            {
              key: "domains",
              type: "Record<branch, string[]>",
              default: "{}",
              desc: l.trans({
                en: "Hosts that open this route, keyed by branch: debug, develop, main, or any key you add.",
                ko: "이 route를 여는 호스트이며 branch를 키로 씁니다. debug·develop·main은 항상 있고, 다른 키는 branch를 추가합니다.",
              }),
            },
          ]}
        />
        <Docs.Alert type="warning">
          {l.trans({
            en: "If you declare basePath, the page folder must follow the same name. See Multi Client for the full page layout rule.",
            ko: "basePath를 선언했다면 page 폴더도 같은 이름을 따라야 합니다. 자세한 page 배치 규칙은 Multi Client 페이지를 참고하세요.",
          })}
        </Docs.Alert>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="web-surfaces" title={l.trans({ en: "Web Surfaces And Prefixes", ko: "웹 표면과 경로 접두사" })}>
        <Docs.Title>{l.trans({ en: "Web Surfaces And Prefixes", ko: "웹 표면과 경로 접두사" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "web decides which web surfaces the build produces, and api decides where the server mounts its endpoints. Both are declared here rather than only in main.ts, because both are baked into the client bundles: a prebuilt CSR shell or a mobile package never reaches a server that could tell it otherwise.",
              ko: "web은 빌드가 어떤 웹 표면을 만들지 정하고, api는 서버가 엔드포인트를 어디에 마운트할지 정합니다. 둘 다 main.ts만이 아니라 여기에 선언합니다. 두 값 모두 클라이언트 번들에 구워지며, 미리 빌드된 CSR 셸이나 모바일 패키지는 이를 알려 줄 서버에 닿지 못하기 때문입니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/myapp/akan.config.ts"
          code={`import type { AppConfig } from "akanjs";

const config: AppConfig = {
  web: { csr: false },
  api: { prefix: "/backend", websocketPrefix: "/socket" },
};

export default config;`}
        />
        <Docs.OptionTable
          items={[
            {
              key: "web",
              type: "boolean | { csr: boolean }",
              default: "true",
              desc: l.trans({
                en: "true builds SSR and CSR, false is API-only, and { csr: false } drops only the CSR shell.",
                ko: "true는 SSR과 CSR을 모두 빌드하고, false는 API 전용이며, { csr: false }는 CSR 셸만 뺍니다.",
              }),
            },
            {
              key: "api.prefix",
              type: "string",
              default: "/api",
              desc: l.trans({
                en: "Where signal endpoints are mounted; read it back with getApiPrefix() from akanjs/base.",
                ko: "signal 엔드포인트가 마운트될 경로이며, akanjs/base의 getApiPrefix()로 읽습니다.",
              }),
            },
            {
              key: "api.websocketPrefix",
              type: "string",
              default: "/ws",
              desc: l.trans({
                en: "Where the websocket upgrade sits; read it back with getWsPrefix().",
                ko: "웹소켓 업그레이드가 놓이는 경로이며, getWsPrefix()로 읽습니다.",
              }),
            },
          ]}
        />
        <div>
          {l.trans({
            en: "Never write either prefix as a literal; new AkanApp({ prefix, websocketPrefix }) still overrides both for the server and every page it renders.",
            ko: "두 접두사를 문자열로 직접 적지 마세요. new AkanApp({ prefix, websocketPrefix })는 서버와 그 서버가 렌더링하는 모든 페이지에서 두 값을 여전히 덮어씁니다.",
          })}
        </div>
        <div>
          {l.trans({
            en: "AKAN_SSR and AKAN_CSR narrow the same choice at boot, and can only narrow it: a deployment cannot switch on a surface the build left out. akan start ignores web entirely, so the dev surface stays whole.",
            ko: "AKAN_SSR과 AKAN_CSR은 같은 선택을 부팅 시점에 좁히며, 좁히기만 합니다. 빌드가 빼놓은 표면을 배포가 다시 켤 수는 없습니다. akan start는 web을 무시하므로 개발 화면은 그대로 유지됩니다.",
          })}
        </div>
        <Docs.Alert type="warning">
          {l.trans({
            en: "A mobile app ships the CSR shell, so web: { csr: false } and a mobile section do not go together — drop the mobile section or leave CSR on.",
            ko: "모바일 앱은 CSR 셸을 싣고 나가므로 web: { csr: false }와 mobile 섹션은 함께 쓸 수 없습니다. mobile 섹션을 빼거나 CSR을 켠 채로 두세요.",
          })}
        </Docs.Alert>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="mobile" title={l.trans({ en: "Mobile Metadata", ko: "모바일 메타데이터" })}>
        <Docs.Title>{l.trans({ en: "Mobile Metadata", ko: "모바일 메타데이터" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "mobile describes the native app identity used by Android and iOS commands. Think of it as the name, package id, and version information that will appear in native app projects. Values at the mobile root are defaults; a target overrides the ones it names.",
              ko: "mobile은 Android와 iOS 명령에서 사용할 네이티브 앱 정보를 설명합니다. 네이티브 앱 프로젝트에 들어갈 이름, 패키지 ID, 버전 정보를 적는 곳이라고 생각하면 됩니다. mobile 루트의 값은 기본값이고, target이 적은 값이 그 위를 덮습니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="Mobile config"
          code={`const config: AppConfig = {
  mobile: {
    appName: "Example",
    appId: "com.example.app",
    version: "1.0.0",
    buildNum: 1,
    targets: {
      default: {
        basePath: "store",
        indexPath: "/explore",
        permissions: ["camera", "push"],
        assets: {
          icon: "public/icon.png",
          splash: "public/splash.png",
        },
        files: {
          android: {
            "app/google-services.json": "public/google-services.json",
          },
          ios: {
            "App/App/GoogleService-Info.plist": "public/GoogleService-Info.plist",
          },
        },
        deepLinks: {
          schemes: ["example"],
          domains: ["example.com"],
          ios: {
            teamId: "TEAMID",
          },
          android: {
            sha256CertFingerprints: [
              "00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00",
            ],
          },
        },
      },
    },
    android: {
      buildOptions: {
        releaseType: "APK",
      },
    },
  },
};`}
        />
        <Docs.OptionTable
          items={mobileFields.map(({ key, type, default: fallback, en, ko }) => ({
            key,
            type,
            default: fallback,
            desc: l.trans({ en, ko }),
          }))}
        />
        <Docs.Alert type="warning">
          {l.trans({
            en: "indexPath is read per target only, so one written at the mobile root is dropped. Firebase app registration must use the same appId.",
            ko: "indexPath는 target 안에서만 읽히므로, mobile 루트에 쓴 값은 버려집니다. Firebase 앱 등록도 같은 appId를 써야 합니다.",
          })}
        </Docs.Alert>
        <Docs.Alert type="info">
          <span>
            {l.trans({
              en: "files maps native target paths to app-relative source files. It is useful for Firebase push config files such as google-services.json and GoogleService-Info.plist. Keep server service account JSON out of client/native file mappings. For platform setup steps, see ",
              ko: "files는 네이티브 target path를 앱 기준 source file에 매핑합니다. google-services.json, GoogleService-Info.plist 같은 Firebase push 설정 파일에 유용합니다. 서버 service account JSON은 client/native file mapping에 넣지 마세요. 플랫폼별 설정 절차는 ",
            })}
          </span>
          <Link
            href="/cheatsheet/mobile/setup"
            className="text-primary underline underline-offset-4 hover:no-underline"
          >
            {l.trans({ en: "Mobile Development", ko: "모바일 개발" })}
          </Link>
          <span>{l.trans({ en: ".", ko: " 문서를 참고하세요." })}</span>
        </Docs.Alert>
        <Docs.Alert type="info">
          {l.trans({
            en: "When a multi-client app needs separate mobile apps per client, define mobile targets with basePath. The Multi Client page shows that pattern.",
            ko: "다중 클라이언트 앱에서 클라이언트별 모바일 앱이 필요하다면 basePath가 있는 mobile target을 정의합니다. 이 패턴은 Multi Client 페이지에서 다룹니다.",
          })}
        </Docs.Alert>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="images-env" title={l.trans({ en: "Images And Public Env", ko: "이미지와 공개 환경변수" })}>
        <Docs.Title>{l.trans({ en: "Images And Public Env", ko: "이미지와 공개 환경변수" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "images controls the allow-list for optimized remote images. publicEnv is an allow-list for extra browser-visible environment variables beyond the built-in AKAN_PUBLIC_* pattern.",
              ko: "images는 최적화할 수 있는 원격 이미지의 허용 목록을 정합니다. publicEnv는 기본 AKAN_PUBLIC_* 패턴 외에 브라우저에 노출할 환경변수 패턴을 추가하는 허용 목록입니다.",
            })}
          </div>
        </Docs.Description>
        <div className="space-y-1">
          <Code.Snippet
            className="w-full"
            title="images"
            code={`const config: AppConfig = {
  images: {
    remotePatterns: [{ protocol: "https", hostname: "asset.example.com" }],
    qualities: [75, 90],
    dangerouslyAllowSVG: false,
  },
};`}
          />
          <Code.Snippet
            className="w-full"
            title="publicEnv"
            code={`const config: AppConfig = {
  publicEnv: ["AKAN_PUBLIC_FEATURE", "BUN_PUBLIC_*"],
};`}
          />
        </div>
        <Docs.Alert type="warning">
          {l.trans({
            en: "publicEnv does not store values. It only says which environment variable names are safe to expose to browser builds.",
            ko: "publicEnv는 값을 저장하는 곳이 아닙니다. 어떤 환경변수 이름을 브라우저 빌드에 노출해도 되는지 정하는 목록입니다.",
          })}
        </Docs.Alert>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="secret-files" title={l.trans({ en: "Secret Files", ko: "시크릿 파일" })}>
        <Docs.Title>{l.trans({ en: "Secret Files", ko: "시크릿 파일" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Some private values cannot live inside env.server.*.ts, such as service-account JSON, TLS certificates, or private key files. The secrets field lists glob patterns for these files so Akan ships them together with the env/ folder.",
              ko: "service-account JSON, TLS 인증서, private key 파일처럼 env.server.*.ts 안에 담을 수 없는 비공개 값이 있습니다. secrets 필드는 이런 파일의 glob 패턴을 나열해 Akan이 env/ 폴더와 함께 전송하도록 합니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "akan upload-env archives every matched file, and akan download-env restores them. Patterns are resolved relative to the app directory, and one declaration both deploys and git-ignores the files.",
              ko: "akan upload-env는 매칭된 모든 파일을 아카이브하고, akan download-env는 이를 복원합니다. 패턴은 앱 디렉터리 기준으로 resolve되며, 한 번의 선언으로 배포와 git-ignore가 함께 처리됩니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="secrets"
          code={`const config: AppConfig = {
  secrets: ["secrets/**/*", "certs/*.pem"],
};`}
        />
        <Docs.Alert type="warning">
          {l.trans({
            en: "publicEnv exposes variable names to the browser; secrets does the opposite. Only glob patterns live in config — the matched files stay local and git-ignored, so never commit their contents.",
            ko: "publicEnv는 변수 이름을 브라우저에 노출하지만, secrets는 그 반대입니다. config에는 glob 패턴만 존재하며, 매칭된 파일은 로컬에 남고 git-ignore되므로 내용을 절대 commit하지 마세요.",
          })}
        </Docs.Alert>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="build-runtime" title={l.trans({ en: "Build And Runtime", ko: "빌드와 런타임" })}>
        <Docs.Title>{l.trans({ en: "Build And Runtime", ko: "빌드와 런타임" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "The rest of the config is for the build system and the production image. Most apps never touch it, but it is where a package stays external, a font survives pruning, a library's routes join the app, and the image gains a system dependency.",
              ko: "나머지 설정은 빌드 시스템과 프로덕션 이미지를 위한 것입니다. 대부분의 앱은 건드릴 일이 없지만, 특정 패키지를 외부 의존성으로 남기거나, 폰트를 정리 대상에서 빼거나, 라이브러리 라우트를 앱에 합치거나, 이미지에 시스템 의존성을 더할 때 사용합니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="Build and runtime fields"
          code={`import { pushNotificationPlugin } from "./plugin/pushNotification.plugin";

const config: AppConfig = {
  externalLibs: ["shiki"],
  optimizeImports: ["custom-icons"],
  barrelImports: ["@acme/ui"],
  database: { modes: ["single", "cluster"] },
  assets: { pruneFonts: true, keepFonts: ["fonts/Assistant-*.woff2"] },
  syncPageLibs: ["shared"],
  plugins: [pushNotificationPlugin],
  docker: {
    image: { amd64: "oven/bun:amd64", arm64: "oven/bun:arm64" },
    preRuns: ["apt-get install -y ffmpeg"],
    postRuns: ["echo after"],
    command: ["bun", "main.js"],
  },
};`}
        />
        <Docs.OptionTable
          items={buildFields.map(({ key, type, default: fallback, en, ko }) => ({
            key,
            type,
            default: fallback,
            desc: l.trans({ en, ko }),
          }))}
        />
        <div>
          {l.trans({
            en: "A library contributes to three of these: its own externalLibs, docker.preRuns and docker.postRuns, and assets.keepFonts carry into every app that mounts it. The generated image installs ca-certificates and tzdata and nothing else, which is why an app that needs ffmpeg or a headless browser declares it.",
            ko: "라이브러리가 이 중 셋에 값을 더합니다. 라이브러리 자신의 externalLibs, docker.preRuns·docker.postRuns, assets.keepFonts는 그 라이브러리를 마운트하는 모든 앱에 함께 적용됩니다. 생성되는 이미지에는 ca-certificates와 tzdata만 설치되므로, ffmpeg나 헤드리스 브라우저가 필요한 앱은 직접 선언해야 합니다.",
          })}
        </div>
        <ul className="my-4 list-disc space-y-2 pl-5">
          <li>
            {l.trans({
              en: (
                <span>
                  <strong>One image, several deployments.</strong> With <code>{'["single", "cluster"]'}</code> the same
                  image runs an edge site and a cloud cluster, and each deployment names its mode with{" "}
                  <code>AKAN_DATABASE_MODE</code>.
                </span>
              ),
              ko: (
                <span>
                  <strong>이미지 하나로 여러 배포를 합니다.</strong> <code>{'["single", "cluster"]'}</code>로 선언하면
                  같은 이미지가 엣지 사이트와 클라우드 클러스터를 모두 실행하고, 배포마다{" "}
                  <code>AKAN_DATABASE_MODE</code>로 모드를 정합니다.
                </span>
              ),
            })}
          </li>
          <li>
            {l.trans({
              en: (
                <span>
                  <strong>libSQL is opt-in.</strong> No mode ships <code>@libsql/client</code>, so an app that applies{" "}
                  <code>LibsqlDatabase</code> itself lists it in <code>externalLibs</code>.
                </span>
              ),
              ko: (
                <span>
                  <strong>libSQL은 직접 켭니다.</strong> 어느 모드도 <code>@libsql/client</code>를 싣지 않으므로,{" "}
                  <code>LibsqlDatabase</code>를 직접 적용하는 앱은 이를 <code>externalLibs</code>에 적습니다.
                </span>
              ),
            })}
          </li>
        </ul>
        <Docs.Alert type="warning">
          {l.trans({
            en: "A docker written as a string is the whole Dockerfile, taken verbatim. Nothing is merged into it — including the preRuns and postRuns your libraries declared, which are silently dropped rather than silently unapplied.",
            ko: "docker를 문자열로 쓰면 그것이 Dockerfile 전체이며 그대로 사용됩니다. 아무것도 병합되지 않습니다. 라이브러리가 선언한 preRuns와 postRuns도 포함이며, 적용되지 않은 채 남지 않고 아예 버려집니다.",
          })}
        </Docs.Alert>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="defaults" title={l.trans({ en: "Defaults And Rules", ko: "기본값과 규칙" })}>
        <Docs.Title>{l.trans({ en: "Defaults And Rules", ko: "기본값과 규칙" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Akan resolves the final app config by merging your file with framework defaults. For a first app, keep these rules in mind before adding advanced options.",
              ko: "Akan은 사용자가 작성한 파일과 프레임워크 기본값을 합쳐 최종 앱 설정을 만듭니다. 처음 앱을 만들 때는 고급 옵션을 추가하기 전에 아래 규칙만 기억하면 됩니다.",
            })}
          </div>
        </Docs.Description>
        <div className="space-y-1 pl-2">
          {[
            {
              title: l.trans({ en: "Environment values", ko: "환경별 값" }),
              desc: l.trans({
                en: "Put runtime values in env/ before adding config fields. Use client env for public values and server env for private server options.",
                ko: "config 필드를 추가하기 전에 런타임 값은 env/에 둡니다. 공개 값은 client env에, 서버 전용 비공개 옵션은 server env에 둡니다.",
              }),
            },
            {
              title: l.trans({ en: "Routes", ko: "라우트" }),
              desc: l.trans({
                en: "Skip routes until you need custom domains or multiple clients.",
                ko: "커스텀 도메인이나 여러 클라이언트가 필요해지기 전까지는 routes를 생략해도 됩니다.",
              }),
            },
            {
              title: l.trans({ en: "Mobile", ko: "모바일" }),
              desc: l.trans({
                en: "appName defaults to the app name, appId defaults to com.<repoName>.<appName>, version defaults to 0.0.1, and buildNum defaults to 1. Pin a real reverse-DNS appId before you ship: a placeholder such as com.example.app has almost always been claimed in Apple's portal already.",
                ko: "appName은 앱 이름, appId는 com.<repoName>.<appName>, version은 0.0.1, buildNum은 1이 기본값입니다. 출시 전에는 조직의 실제 reverse-DNS appId를 지정해야 합니다. com.example.app 같은 placeholder id는 Apple 포털에서 이미 선점되어 있는 경우가 대부분입니다.",
              }),
            },
            {
              title: l.trans({ en: "Images", ko: "이미지" }),
              desc: l.trans({
                en: "Remote images are blocked unless remotePatterns allow them. WebP and quality 75 are used by default.",
                ko: "remotePatterns가 허용하지 않은 원격 이미지는 차단됩니다. 기본 포맷은 WebP이고 기본 quality는 75입니다.",
              }),
            },
            {
              title: l.trans({ en: "i18n", ko: "다국어" }),
              desc: l.trans({
                en: "Locales default to en and ko with en first. Change it only to move the default locale or to serve a different set — defaultLocale must be one of locales.",
                ko: "locale 기본값은 en과 ko이며 기본 locale은 en입니다. 기본 locale을 옮기거나 다른 목록을 제공할 때만 바꿉니다. defaultLocale은 locales 안에 있어야 합니다.",
              }),
            },
          ].map(({ title, desc }) => (
            <div key={title}>
              <span className="font-bold text-foreground">{title}: </span>
              <span className="text-foreground/70 text-sm">{desc}</span>
            </div>
          ))}
        </div>
        <Docs.Alert type="info">
          {l.trans({
            en: "Recommended order: start with an empty config, fill env/ values as the app needs them, add routes when domains are needed, add mobile when native apps are needed, and add advanced build options only after the default build is not enough.",
            ko: "추천 순서: 빈 config로 시작하고, 앱에 필요한 env/ 값을 채운 뒤, 도메인이 필요할 때 routes를 추가하고, 네이티브 앱이 필요할 때 mobile을 추가하고, 기본 빌드로 부족할 때만 고급 빌드 옵션을 추가하세요.",
          })}
        </Docs.Alert>
      </Scroll.Slide>
      <DocsToc />
    </Scroll>
  );
});
