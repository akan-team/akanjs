import { usePage } from "@apps/akan/client";
import { Code, Docs } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { Link } from "akanjs/ui";

export default function Page() {
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
        </Docs.Description>
        <div className="grid grid-cols-2 gap-1 p-2 md:grid-cols-3 lg:grid-cols-6">
          {[
            { name: "routes", desc: l.trans({ en: "Domains", ko: "도메인" }) },
            { name: "mobile", desc: l.trans({ en: "App identity", ko: "앱 정보" }) },
            { name: "env/", desc: l.trans({ en: "Env values", ko: "환경별 값" }) },
            { name: "images", desc: l.trans({ en: "Image rules", ko: "이미지 규칙" }) },
            { name: "publicEnv", desc: l.trans({ en: "Browser env", ko: "브라우저 환경변수" }) },
            { name: "secrets", desc: l.trans({ en: "Secret files", ko: "시크릿 파일" }) },
            { name: "advanced", desc: l.trans({ en: "Build options", ko: "빌드 옵션" }) },
          ].map(({ name, desc }) => (
            <div key={name} className="rounded-xl border border-base-300 bg-base-100 px-4 py-0">
              <div className="font-mono font-semibold text-primary">{name}</div>
              <div className="mt-2 text-base-content/70 text-sm">{desc}</div>
            </div>
          ))}
        </div>
        <div className="space-y-1">
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
            <div key={title} className="rounded-xl border border-base-300 bg-base-100 px-4 py-0">
              <span className="font-bold text-base-content">{title}: </span>

              <span className="text-base-content/70 text-sm">{desc}</span>
            </div>
          ))}
        </div>
        <Code.Snippet
          title="apps/minimal/akan.config.ts"
          code={`import type { AppConfig } from "akanjs";

const config: AppConfig = {};

export default config;`}
        />
      </Scroll.Slide>
      <div className="divider" />

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
      <div className="divider" />

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
            code={`import { getEnv } from "akanjs/base";

import type { AppClientEnv } from "./env.client.type";

export const env: AppClientEnv = {
  ...getEnv(),
  google: {
    mapKey: "local-map-key",
  },
} as const;`}
          />
          <Code.Snippet
            className="w-full"
            title="env/env.server.local.ts"
            code={`import { getEnv } from "akanjs/base";

import type { ModulesOptions } from "../lib/option";

export const env: ModulesOptions = {
  ...getEnv(),
  hostname: null,
  security: {
    verifies: [["password", "phone"]],
    sso: {},
  },
};`}
          />
        </div>
        <div className="space-y-1">
          {[
            {
              title: "env.client.*",
              desc: l.trans({
                en: "Values used by browser or client-side code. Keep only public-safe values here, such as map keys, site keys, or feature switches.",
                ko: "브라우저나 클라이언트 코드에서 사용하는 값입니다. 지도 키, 사이트 키, 기능 스위치처럼 공개되어도 되는 값만 둡니다.",
              }),
            },
            {
              title: "env.server.*",
              desc: l.trans({
                en: "Values used only by server-side modules. Put server options, connection settings, and private service configuration here.",
                ko: "서버 모듈에서만 사용하는 값입니다. 서버 옵션, 연결 설정, 비공개 서비스 설정을 여기에 둡니다.",
              }),
            },
            {
              title: "local·testing·debug·develop·main",

              desc: l.trans({
                en: "Each suffix is selected by AKAN_PUBLIC_ENV. Use local for your machine, testing for tests, debug/develop for shared stages, and main for production.",
                ko: "각 suffix는 AKAN_PUBLIC_ENV 값으로 선택됩니다. local은 내 PC, testing은 테스트, debug/develop은 공유 개발 단계, main은 운영 환경에 사용합니다.",
              }),
            },
            {
              title: "env.*.type.ts",
              desc: l.trans({
                en: "Type files define the shape of env values, so missing or misspelled settings can be caught while coding.",
                ko: "type 파일은 env 값의 형태를 정의합니다. 필요한 값이 빠지거나 이름이 틀린 설정을 코딩 중에 잡을 수 있습니다.",
              }),
            },
          ].map(({ title, desc }) => (
            <div key={title} className="rounded-xl border border-base-300 bg-base-100 px-4 py-0">
              <span className="font-mono font-semibold text-primary">{title}: </span>

              <span className="text-base-content/70 text-sm">{desc}</span>
            </div>
          ))}
        </div>
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
      <div className="divider" />

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
        <div className="space-y-1">
          <div className="rounded-xl border border-base-300 bg-base-100 p-4">
            <div className="font-mono font-semibold text-primary">basePath</div>
            <div className="mt-2 text-base-content/70 text-sm">
              {l.trans({
                en: "Optional client name for this route. Akan normalizes /store/ to store.",
                ko: "이 route가 열 클라이언트 이름입니다. Akan은 /store/처럼 적은 값을 store로 정리합니다.",
              })}
            </div>
          </div>
          <div className="rounded-xl border border-base-300 bg-base-100 p-4">
            <div className="font-mono font-semibold text-primary">domains</div>
            <div className="mt-2 text-base-content/70 text-sm">
              {l.trans({
                en: "A map of environment names to domains. debug, develop, and main exist by default, and custom branches such as qa can be added.",
                ko: "환경 이름별 도메인 목록입니다. debug, develop, main은 기본으로 있고, qa 같은 커스텀 브랜치도 추가할 수 있습니다.",
              })}
            </div>
          </div>
        </div>
        <Docs.Alert type="warning">
          {l.trans({
            en: "If you declare basePath, the page folder must follow the same name. See Multi Client for the full page layout rule.",
            ko: "basePath를 선언했다면 page 폴더도 같은 이름을 따라야 합니다. 자세한 page 배치 규칙은 Multi Client 페이지를 참고하세요.",
          })}
        </Docs.Alert>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="mobile" title={l.trans({ en: "Mobile Metadata", ko: "모바일 메타데이터" })}>
        <Docs.Title>{l.trans({ en: "Mobile Metadata", ko: "모바일 메타데이터" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "mobile describes the native app identity used by Android and iOS commands. Think of it as the name, package id, and version information that will appear in native app projects.",
              ko: "mobile은 Android와 iOS 명령에서 사용할 네이티브 앱 정보를 설명합니다. 네이티브 앱 프로젝트에 들어갈 이름, 패키지 ID, 버전 정보를 적는 곳이라고 생각하면 됩니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
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
            "App/GoogleService-Info.plist": "public/GoogleService-Info.plist",
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
        <div className="space-y-1">
          {[
            {
              title: "appName",
              desc: l.trans({
                en: "Display name used for the native app. At the mobile root it becomes the default for every target; inside a target it overrides the display name for that package.",
                ko: "네이티브 앱 표시 이름입니다. mobile root에서는 모든 target의 기본값이 되고, target 내부에서는 해당 패키지 표시 이름을 override합니다.",
              }),
            },
            {
              title: "appId",
              desc: l.trans({
                en: "Native package identifier, such as com.example.app. Android uses it as applicationId/package name and iOS uses it as bundle id. Firebase Android/iOS app registration must use the same value.",
                ko: "com.example.app 같은 네이티브 패키지 식별자입니다. Android는 applicationId/package name으로, iOS는 bundle id로 사용합니다. Firebase Android/iOS 앱 등록도 같은 값을 써야 합니다.",
              }),
            },
            {
              title: "version",
              desc: l.trans({
                en: "User-facing native app version, mapped to Android versionName and iOS MARKETING_VERSION. Target value overrides the mobile root value.",
                ko: "사용자에게 보이는 네이티브 앱 버전입니다. Android versionName과 iOS MARKETING_VERSION에 반영됩니다. target 값은 mobile root 값을 override합니다.",
              }),
            },
            {
              title: "buildNum",
              desc: l.trans({
                en: "Store build number, mapped to Android versionCode and iOS CURRENT_PROJECT_VERSION. Increase it for each native store release.",
                ko: "스토어 제출용 빌드 번호입니다. Android versionCode와 iOS CURRENT_PROJECT_VERSION에 반영됩니다. 네이티브 스토어 릴리즈마다 증가시키세요.",
              }),
            },
            {
              title: "targets",
              desc: l.trans({
                en: "Named mobile packages built from the same Akan app. Each target can select a basePath, fallback indexPath, identity overrides, permissions, files, assets, and deepLinks.",
                ko: "하나의 Akan 앱에서 만드는 이름 있는 모바일 패키지들입니다. 각 target은 basePath, fallback indexPath, 앱 식별 정보 override, permissions, files, assets, deepLinks를 가질 수 있습니다.",
              }),
            },
            {
              title: "target.basePath",
              desc: l.trans({
                en: "Client/basePath opened by this native package. Use it when one Akan app ships separate customer/admin/partner mobile apps. It should match a configured route basePath.",
                ko: "이 네이티브 패키지가 여는 client/basePath입니다. 하나의 Akan 앱에서 고객/관리자/파트너 모바일 앱을 나눌 때 사용합니다. 설정된 route basePath와 맞아야 합니다.",
              }),
            },
            {
              title: "target.indexPath",
              desc: l.trans({
                en: "Initial or fallback CSR path for the target. Akan uses it for mobile startup, deep link stack recovery, and back-button fallback.",
                ko: "target의 초기 또는 fallback CSR path입니다. 모바일 시작 경로, 딥링크 stack 복원, back 버튼 fallback에 사용합니다.",
              }),
            },
            {
              title: "target.permissions",
              desc: l.trans({
                en: "Native permission hints used by devkit. Supported values are camera, contacts, location, and push. Declare push before using usePushNotification on native apps.",
                ko: "devkit이 사용하는 네이티브 권한 힌트입니다. 지원 값은 camera, contacts, location, push입니다. 네이티브에서 usePushNotification을 쓰려면 push를 선언하세요.",
              }),
            },
            {
              title: "target.assets",
              desc: l.trans({
                en: "Optional app icon and splash image source paths, relative to the app root. Use icon and splash when the native package needs custom branding.",
                ko: "앱 루트 기준의 선택적 앱 아이콘/splash 이미지 source path입니다. 네이티브 패키지 브랜딩이 필요할 때 icon과 splash를 사용합니다.",
              }),
            },
            {
              title: "target.files",
              desc: l.trans({
                en: "Native file copy map. Keys are generated native project paths and values are app-relative source paths. Use it for google-services.json, GoogleService-Info.plist, or other native config files.",
                ko: "네이티브 파일 복사 매핑입니다. key는 생성된 네이티브 프로젝트의 대상 경로이고 value는 앱 기준 source path입니다. google-services.json, GoogleService-Info.plist 같은 네이티브 설정 파일에 사용합니다.",
              }),
            },
            {
              title: "deepLinks",
              desc: l.trans({
                en: "Native URL schemes and verified HTTPS app links for a mobile target. iOS app links require teamId; Android app links require SHA-256 certificate fingerprints for release verification.",
                ko: "모바일 target에 사용할 네이티브 URL scheme과 검증된 HTTPS 앱 링크입니다. iOS app link에는 teamId가 필요하고, Android app link에는 릴리즈 검증용 SHA-256 인증서 fingerprint가 필요합니다.",
              }),
            },
            {
              title: "deepLinks.schemes",
              desc: l.trans({
                en: "Custom URL schemes such as example://. Use simple lower-case app schemes and avoid schemes owned by other apps.",
                ko: "example:// 같은 커스텀 URL scheme입니다. 단순한 소문자 앱 scheme을 사용하고 다른 앱이 소유한 scheme은 피하세요.",
              }),
            },
            {
              title: "deepLinks.domains",
              desc: l.trans({
                en: "HTTPS app-link/universal-link domains. Akan can serve association files, but iOS still needs teamId and Android release verification needs SHA-256 fingerprints.",
                ko: "HTTPS app link/universal link 도메인입니다. Akan이 association file을 서빙할 수 있지만, iOS에는 teamId가 필요하고 Android 릴리즈 검증에는 SHA-256 fingerprint가 필요합니다.",
              }),
            },
            {
              title: "deepLinks.ios.teamId",
              desc: l.trans({
                en: "Apple Developer Team ID used for apple-app-site-association. Required for universal links on real iOS apps.",
                ko: "apple-app-site-association에 사용하는 Apple Developer Team ID입니다. 실제 iOS 앱의 universal link에 필요합니다.",
              }),
            },
            {
              title: "deepLinks.android.sha256CertFingerprints",
              desc: l.trans({
                en: "Signing certificate SHA-256 fingerprints used by assetlinks.json. Use debug fingerprints for local testing and release fingerprints for Play Store builds.",
                ko: "assetlinks.json에 사용하는 서명 인증서 SHA-256 fingerprint입니다. 로컬 테스트에는 debug fingerprint, Play Store 빌드에는 release fingerprint를 사용하세요.",
              }),
            },
            {
              title: "mobile.plugins / android / ios",
              desc: l.trans({
                en: "Passthrough Capacitor config fields. Use them only when a Capacitor plugin requires native configuration not covered by Akan's higher-level fields.",
                ko: "Capacitor config로 그대로 전달되는 필드입니다. Akan의 상위 설정으로 표현되지 않는 네이티브 플러그인 설정이 필요할 때만 사용하세요.",
              }),
            },
          ].map(({ title, desc }) => (
            <div key={title} className="rounded-xl border border-base-300 bg-base-100 px-4 py-0">
              <span className="font-mono font-semibold text-primary">{title}: </span>

              <span className="text-base-content/70 text-sm">{desc}</span>
            </div>
          ))}
        </div>
        <Code.Snippet
          className="w-full"
          title="mobile target files"
          code={`const config: AppConfig = {
  mobile: {
    appName: "Shop",
    appId: "com.example.shop",
    targets: {
      default: {
        permissions: ["push"],
        files: {
          android: {
            "app/google-services.json": "public/google-services.json",
          },
          ios: {
            "App/GoogleService-Info.plist": "public/GoogleService-Info.plist",
          },
        },
      },
    },
  },
};`}
        />
        <Docs.Alert type="info">
          <span>
            {l.trans({
              en: "files maps native target paths to app-relative source files. It is useful for Firebase push config files such as google-services.json and GoogleService-Info.plist. Keep server service account JSON out of client/native file mappings. For platform setup steps, see ",
              ko: "files는 네이티브 target path를 앱 기준 source file에 매핑합니다. google-services.json, GoogleService-Info.plist 같은 Firebase push 설정 파일에 유용합니다. 서버 service account JSON은 client/native file mapping에 넣지 마세요. 플랫폼별 설정 절차는 ",
            })}
          </span>
          <Link href="/cheatsheet/dev/mobile" className="link link-primary">
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
      <div className="divider" />

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
      <div className="divider" />

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
              en: "akan upload-env archives every matched file, and akan download-env restores them. Patterns are resolved relative to the app directory, and Akan syncs them into a managed block in the root .gitignore, so one declaration both deploys and git-ignores the files.",
              ko: "akan upload-env는 매칭된 모든 파일을 아카이브하고, akan download-env는 이를 복원합니다. 패턴은 앱 디렉터리 기준으로 resolve되며, Akan이 root .gitignore의 managed block에 동기화하므로 한 번의 선언으로 배포와 git-ignore가 함께 처리됩니다.",
            })}
          </div>
        </Docs.Description>
        <div className="space-y-1">
          <Code.Snippet
            className="w-full"
            title="secrets"
            code={`const config: AppConfig = {
  secrets: ["secrets/**/*", "certs/*.pem"],
};`}
          />
          <Code.Snippet
            className="w-full"
            title=".gitignore (auto-synced on upload-env)"
            code={`# akan:secrets (managed by akan.config.ts — do not edit)
apps/api/certs/*.pem
apps/api/secrets/**/*
# akan:secrets:end`}
          />
        </div>
        <Docs.Alert type="warning">
          {l.trans({
            en: "publicEnv exposes variable names to the browser; secrets does the opposite. Only glob patterns live in config — the matched files stay local and git-ignored, so never commit their contents.",
            ko: "publicEnv는 변수 이름을 브라우저에 노출하지만, secrets는 그 반대입니다. config에는 glob 패턴만 존재하며, 매칭된 파일은 로컬에 남고 git-ignore되므로 내용을 절대 commit하지 마세요.",
          })}
        </Docs.Alert>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="build-runtime" title={l.trans({ en: "Build And Runtime", ko: "빌드와 런타임" })}>
        <Docs.Title>{l.trans({ en: "Build And Runtime", ko: "빌드와 런타임" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Some config fields are mainly for the build system and production runtime. Most apps do not need to touch them, but they are useful when a package must stay external, imports need optimization, or the Docker image needs customization.",
              ko: "일부 config 필드는 주로 빌드 시스템과 프로덕션 런타임을 위한 설정입니다. 대부분의 앱은 건드릴 필요가 없지만, 특정 패키지를 런타임 의존성으로 유지하거나 import 최적화, Docker 이미지 커스터마이징이 필요할 때 사용합니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title="Build and runtime fields"
          code={`const config: AppConfig = {
  externalLibs: ["shiki"],
  optimizeImports: ["custom-icons"],
  barrelImports: ["@acme/ui"],
  defaultDatabaseMode: "single",
  docker: {
    image: { amd64: "oven/bun:amd64", arm64: "oven/bun:arm64" },
    preRuns: ["echo before"],
    postRuns: ["echo after"],
    command: ["bun", "main.js"],
  },
};`}
        />
        <div className="space-y-1">
          {[
            {
              title: "externalLibs",
              desc: l.trans({
                en: "Packages kept as production runtime dependencies instead of only being bundled.",
                ko: "번들에만 포함하지 않고 프로덕션 런타임 의존성으로 유지할 패키지입니다.",
              }),
            },
            {
              title: "optimizeImports",
              desc: l.trans({
                en: "Extra packages whose imports should be optimized by the client build.",
                ko: "클라이언트 빌드에서 import 최적화를 적용할 추가 패키지입니다.",
              }),
            },
            {
              title: "barrelImports",
              desc: l.trans({
                en: "Barrel import paths that Akan can flatten while scanning and bundling.",
                ko: "스캔과 번들링 중 Akan이 펼쳐서 처리할 barrel import 경로입니다.",
              }),
            },
            {
              title: "defaultDatabaseMode",
              desc: l.trans({
                en: "Fallback database mode for commands that do not receive AKAN_DATABASE_MODE from the environment.",
                ko: "환경변수 AKAN_DATABASE_MODE가 주어지지 않은 명령에서 사용할 기본 데이터베이스 모드입니다.",
              }),
            },
          ].map(({ title, desc }) => (
            <div key={title} className="rounded-xl border border-base-300 bg-base-100 px-4 py-0">
              <span className="font-mono font-semibold text-primary">{title}: </span>

              <span className="text-base-content/70 text-sm">{desc}</span>
            </div>
          ))}
        </div>
      </Scroll.Slide>
      <div className="divider" />

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
        <div className="space-y-1">
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
                en: "appName defaults to the app name, appId defaults to com.appName.app, version defaults to 0.0.1, and buildNum defaults to 1.",
                ko: "appName은 앱 이름, appId는 com.appName.app, version은 0.0.1, buildNum은 1이 기본값입니다.",
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
                en: "Only configure i18n when your app needs to change the default locale behavior.",
                ko: "기본 locale 동작을 바꿔야 할 때만 i18n을 설정하면 됩니다.",
              }),
            },
          ].map(({ title, desc }) => (
            <div key={title} className="rounded-xl border border-base-300 bg-base-100 px-4 py-0">
              <span className="font-bold text-base-content">{title}: </span>

              <span className="text-base-content/70 text-sm">{desc}</span>
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
      <Scroll.TitleNavigator className="fixed top-32 right-0 hidden w-[250px] flex-col gap-2 lg:flex" />
    </Scroll>
  );
}
