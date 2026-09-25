import { usePage } from "@apps/akan/client";
import { Code, Docs } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();
  return (
    <Scroll>
      <Scroll.Slide id="akan-runtime" title={l.trans({ en: "Akan Runtime", ko: "Akan 런타임" })}>
        <Docs.Title>{l.trans({ en: "Akan Runtime", ko: "Akan 런타임" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Akan applications run on a Bun-based runtime that connects app code, generated artifacts, server routes, and pages. The app entry point (main.ts) starts the runtime, and Akan handles the server shape behind it.",
              ko: "Akan 애플리케이션은 앱 코드, 생성 산출물, 서버 라우트, 페이지를 연결하는 Bun 기반 런타임 위에서 실행됩니다. 앱 엔트리 포인트(main.ts)는 런타임을 시작하고, 그 뒤의 서버 구성은 Akan이 담당합니다.",
            })}
          </div>
          <Code.Snippet
            title="apps/myapp/main.ts"
            code={`import { AkanApp } from "akanjs/server";

const run = async () => {
  await new AkanApp().start();
};
void run();`}
          />
          <div>
            {l.trans({
              en: "When Akan App starts, Akan Server prepares everything the app can serve. In practice, the runtime exposes four kinds of work.",
              ko: "Akan App이 실행되면 Akan Server가 앱이 제공할 기능들을 준비합니다. 실제 런타임은 크게 네 가지 작업을 제공합니다.",
            })}
          </div>
          <ul className="list-disc space-y-1 pl-6 md:pl-12">
            <li>
              {l.trans({
                en: "Internal API (Queue, Timer, etc.): internal work that runs without a browser request.",
                ko: "Internal API (Queue, Timer, etc.): 브라우저 요청 없이 내부에서 실행되는 큐, 타이머 같은 작업입니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "API (HTTP, WebSocket): public communication for data requests and realtime updates.",
                ko: "API (HTTP, WebSocket): 데이터 요청과 실시간 업데이트를 처리하는 HTTP, 웹소켓 통신 경로입니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "SSR Pages (Web): web pages rendered by the server and sent to the browser.",
                ko: "SSR Pages (Web): 서버가 렌더링해서 브라우저로 보내는 웹 페이지입니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "CSR Page (Android, iOS): client-rendered pages used by mobile targets.",
                ko: "CSR Page (Android, iOS): Android, iOS 같은 모바일 대상에서 사용하는 클라이언트 렌더링 페이지입니다.",
              })}
            </li>
          </ul>
          <Docs.Mermaid
            title="Runtime overview"
            chart={`flowchart LR
  appCode[App Code] --> app[Akan App]
  app --> server[Akan Server]
  server --> internalApi["Internal API (Queue, Timer, etc.)"]
  server --> api["API (HTTP, WebSocket)"]
  server --> ssr["SSR Pages (Web)"]
  server --> csr["CSR Page (Android, iOS)"]`}
          />

          <div>
            {l.trans({
              en: "One Akan App can run one or more Akan Server processes. AKAN_REPLICA controls how many server processes are started for each role, so the same app can scale web traffic and background work separately. For browser traffic, Akan App also load-balances requests across ready federation and all servers.",
              ko: "하나의 Akan App은 하나 이상의 Akan Server 프로세스를 실행할 수 있습니다. AKAN_REPLICA는 역할별 서버 프로세스 개수를 제어하므로, 같은 앱 안에서 웹 트래픽과 백그라운드 작업을 나누어 확장할 수 있습니다. 브라우저 요청은 Akan App이 준비된 federation/all 서버로 로드밸런싱합니다.",
            })}
          </div>
          <ul className="list-disc space-y-1 pl-6 md:pl-12">
            <li>
              {l.trans({
                en: "federation: serves browser traffic such as pages, API calls, and WebSocket connections.",
                ko: "federation: 페이지, API 호출, 웹소켓 연결 같은 브라우저 요청을 처리합니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "batch: runs background work such as queues, timers, and scheduled jobs.",
                ko: "batch: 큐, 타이머, 예약 작업 같은 백그라운드 작업을 실행합니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "all: runs both federation and batch behavior in one server process. This is the simple local default.",
                ko: "all: 하나의 서버 프로세스에서 federation과 batch 역할을 함께 실행합니다. 로컬 개발에서 사용하는 단순한 기본 형태입니다.",
              })}
            </li>
          </ul>
          <Docs.Mermaid
            title="Replica and server modes"
            highlightNodes={["app"]}
            chart={`flowchart LR
  browser[Browser] --> app["Akan App<br/>(Gateway, Load Balancer)"]
  app -->|"traffic"| federation1["Akan Server (federation)"]
  app -->|"traffic"| federation2["Akan Server (federation)"]
  app -->|"traffic"| federation3["Akan Server (federation)"]
  app --> batch["Akan Server (batch)"]
  federation1 --> webTraffic["Pages, API, WebSocket"]
  federation2 --> webTraffic
  federation3 --> webTraffic
  batch --> background["Queue, Timer, Jobs"]`}
          />
          <Docs.Alert type="info">
            {l.trans({
              en: "A single Akan App has built-in clustering. You can run multiple server replicas and let Akan App distribute traffic, without setting up separate local load-balancing tools such as nginx, docker compose, or pm2.",
              ko: "단일 Akan App은 clustering 기능을 기본으로 지원합니다. 여러 server replica를 실행하고 Akan App이 트래픽을 분산할 수 있으므로, nginx, docker compose, pm2 같은 별도 로컬 load-balancing 도구를 직접 구성하지 않아도 됩니다.",
            })}
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />
      <Scroll.Slide id="dev-prod" title={l.trans({ en: "Root-level Env Variables", ko: "루트 환경변수" })}>
        <Docs.Title>{l.trans({ en: "Root-level Env Variables", ko: "루트 환경변수" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "The root .env file decides which organization, domain, environment, operation mode, and log level the app uses while it runs. Most projects keep these values stable, but changing them lets the same app behave like a local, debug, develop, or production-like service.",
              ko: "루트 .env 파일은 앱이 실행될 때 사용할 조직, 도메인, 환경, 동작 모드, 로그 수준을 정합니다. 대부분의 프로젝트에서는 이 값을 자주 바꾸지 않지만, 값을 바꾸면 같은 앱을 로컬용, 디버그용, 개발 서버용, 운영에 가까운 형태로 실행할 수 있습니다.",
            })}
          </div>
          <Code.Snippet
            title=".env"
            language="bash"
            code={`AKAN_PUBLIC_REPO_NAME=myorg
AKAN_PUBLIC_SERVE_DOMAIN="mydomain.com"
AKAN_PUBLIC_ENV=local
AKAN_PUBLIC_OPERATION_MODE=local
AKAN_PUBLIC_LOG_LEVEL=debug
AKAN_SEARCH_ENABLED=1
AKAN_SEARCH_TOKENIZER="unicode61 remove_diacritics 2"`}
          />
          <Docs.Alert type="warning">
            {l.trans({
              en: "Environment variables prefixed with AKAN_PUBLIC_ are public. They can be read by browser code, so never store secrets, private tokens, or credentials in them.",
              ko: "AKAN_PUBLIC_ 접두사가 붙은 환경변수는 공개 값입니다. 브라우저 코드에서도 읽을 수 있으므로 비밀키, 개인 토큰, 인증 정보는 절대 넣지 마세요.",
            })}
          </Docs.Alert>
          <div className="space-y-1">
            {[
              [
                "AKAN_PUBLIC_REPO_NAME",
                l.trans({ en: "Project owner", ko: "프로젝트 소유자" }),
                l.trans({
                  en: "Organization or repository namespace. Usually fixed for the project.",
                  ko: "조직 또는 저장소 네임스페이스입니다. 보통 프로젝트 값으로 고정합니다.",
                }),
                "myorg",
              ],
              [
                "AKAN_PUBLIC_SERVE_DOMAIN",
                l.trans({ en: "Public domain", ko: "공개 도메인" }),
                l.trans({
                  en: "Used when the app creates links, callbacks, and domain-based routes.",
                  ko: "앱이 링크, 콜백, 도메인 기반 라우팅을 만들 때 사용하는 도메인입니다.",
                }),
                '"mydomain.com"',
              ],
              [
                "AKAN_PUBLIC_ENV",
                l.trans({ en: "Data environment", ko: "데이터 환경" }),
                l.trans({
                  en: "Choose local, debug, develop, or main depending on which data set you want to use.",
                  ko: "사용할 데이터 기준에 따라 local, debug, develop, main 중에서 선택합니다.",
                }),
                "local | debug | develop | main",
              ],
              [
                "AKAN_PUBLIC_OPERATION_MODE",
                l.trans({ en: "Connection target", ko: "연결 대상" }),
                l.trans({
                  en: "Choose whether clients connect to local runtime, edge paths, or cloud services.",
                  ko: "클라이언트가 로컬 런타임, 엣지 경로, 클라우드 서비스 중 어디에 연결될지 정합니다.",
                }),
                "local | edge | cloud",
              ],
              [
                "AKAN_PUBLIC_LOG_LEVEL",
                l.trans({ en: "Log detail", ko: "로그 상세도" }),
                l.trans({
                  en: "Choose how much runtime output you want to see in the terminal.",
                  ko: "터미널에 어느 정도 자세한 런타임 로그를 볼지 정합니다.",
                }),
                "trace | debug | info | warn | error",
              ],
              [
                "AKAN_SEARCH_ENABLED",
                l.trans({ en: "Text search index", ko: "텍스트 검색 색인" }),
                l.trans({
                  en: "Unset means on. Set 0 to switch the full-text index off; indexed data is kept and re-enabling reconciles every model. Give every process in a deployment the same value, because a process cannot clean up triggers for models it does not mount.",
                  ko: "값을 주지 않으면 켜져 있습니다. 0으로 두면 전문 검색 색인을 끄며, 색인된 데이터는 유지되고 다시 켜면 모든 모델을 재정합합니다. 프로세스는 자신이 마운트하지 않은 모델의 trigger를 정리할 수 없으므로 한 배포의 모든 프로세스에 같은 값을 주세요.",
                }),
                "0 | 1",
              ],
              [
                "AKAN_SEARCH_TOKENIZER",
                l.trans({ en: "Search tokenizer", ko: "검색 토크나이저" }),
                l.trans({
                  en: "The fts5 tokenizer the index is built with. Defaults to unicode61 remove_diacritics 2. Changing it rebuilds the index from the mirror on the next boot, so no data is re-read from the model tables. The rebuild takes no cross-process claim, so a fleet restarted at once repeats it in every process; stagger the restart when the mirror is large. database.search.tokenizer in the app config takes precedence. A value this SQLite build cannot provide fails the boot and names the fix, rather than starting a server whose every search would raise. That boot failure leaves writes alone: the index is dropped but nothing else is, so the models on that database keep accepting writes and the next healthy boot recovers the index in full.",
                  ko: "색인을 만들 때 쓰는 fts5 토크나이저입니다. 기본값은 unicode61 remove_diacritics 2입니다. 값을 바꾸면 다음 부팅에서 미러로부터 색인을 다시 만들며, 모델 테이블을 다시 읽지는 않습니다. 이 재생성에는 프로세스 간 클레임이 없어서, 한 번에 재시작한 여러 프로세스가 각자 다시 만듭니다. 미러가 크다면 재시작을 나눠서 하세요. 앱 설정의 database.search.tokenizer가 우선합니다. 이 SQLite 빌드가 제공할 수 없는 값이면, 모든 검색이 에러를 내는 서버를 띄우는 대신 부팅을 실패시키고 고칠 방법을 알려줍니다. 이때 쓰기는 그대로 살아 있습니다. 색인만 없어지고 다른 것은 건드리지 않으므로 해당 데이터베이스의 모델은 계속 쓰기를 받고, 다음 정상 부팅이 색인을 온전히 복구합니다.",
                }),
                "unicode61 remove_diacritics 2 | trigram | porter unicode61",
              ],
              [
                "AKAN_LOG_FILE_LEVEL",
                l.trans({ en: "File log detail", ko: "파일 로그 상세도" }),
                l.trans({
                  en: "Choose how much structured Logger output is written to files. Defaults to trace, independent from terminal log level.",
                  ko: "파일에 저장할 structured Logger 출력 범위를 정합니다. 기본값은 trace이며 터미널 로그 레벨과 별도로 동작합니다.",
                }),
                "trace | debug | info | warn | error",
              ],
              [
                "AKAN_LOG_TO_FILE",
                l.trans({ en: "File logging", ko: "파일 로그" }),
                l.trans({
                  en: "AkanApp writes gateway and child process logs to runtime/logs by default. Set this to 0 to disable file logging.",
                  ko: "AkanApp은 기본적으로 gateway와 child process 로그를 runtime/logs에 저장합니다. 파일 로그를 끄려면 0으로 설정합니다.",
                }),
                "0 | 1",
              ],
              [
                "AKAN_LOG_DIR",
                l.trans({ en: "Log directory", ko: "로그 디렉터리" }),
                l.trans({
                  en: "Override the default runtime/logs directory used by file logging.",
                  ko: "파일 로그가 사용하는 기본 runtime/logs 디렉터리를 다른 경로로 바꿉니다.",
                }),
                "/var/log/akan",
              ],
              [
                "AKAN_LOG_MAX_SIZE_MB",
                l.trans({ en: "Log rotation size", ko: "로그 회전 크기" }),
                l.trans({
                  en: "Create the next sequence file when a process log reaches this size.",
                  ko: "프로세스별 로그 파일이 이 크기에 도달하면 다음 sequence 파일을 만듭니다.",
                }),
                "50",
              ],
              [
                "AKAN_LOG_MAX_FILES",
                l.trans({ en: "Log retention", ko: "로그 보관 개수" }),
                l.trans({
                  en: "Keep this many rotated files per process key, such as gateway or child-0.",
                  ko: "gateway 또는 child-0 같은 process key별로 보관할 회전 로그 파일 개수입니다.",
                }),
                "100",
              ],
            ].map(([name, label, desc, values]) => (
              <div key={name} className="rounded-xl border border-primary/10 bg-base-100 p-3">
                <div className="break-all font-mono font-semibold text-primary text-sm">{name}</div>
                <div className="mt-1 font-bold text-base-content">{label}</div>
                <div className="mt-2 text-base-content/70 text-sm leading-relaxed">{desc}</div>
                <div className="mt-3 break-all rounded bg-base-200 px-2 py-1 font-mono text-base-content/80 text-xs">
                  ex) {values}
                </div>
              </div>
            ))}
          </div>
          <div className="space-y-1">
            <div className="rounded-xl border border-base-300 bg-base-100 p-4">
              <div className="font-bold">{l.trans({ en: "AKAN_PUBLIC_ENV modes", ko: "AKAN_PUBLIC_ENV 모드" })}</div>
              <div className="mt-3 space-y-1">
                {[
                  ["local", l.trans({ en: "My machine, my test data.", ko: "내 컴퓨터와 로컬 테스트 데이터" })],
                  [
                    "debug",
                    l.trans({ en: "Shared test data for reproduction.", ko: "재현을 위한 공용 테스트 데이터" }),
                  ],
                  ["develop", l.trans({ en: "Team integration checks.", ko: "팀 통합 상태 확인" })],
                  ["main", l.trans({ en: "Production-like behavior.", ko: "운영에 가까운 동작 확인" })],
                ].map(([mode, desc]) => (
                  <div key={mode} className="rounded-lg bg-base-200 p-3">
                    <div className="font-mono font-semibold text-sm">{mode}</div>
                    <div className="mt-1 text-base-content/70 text-sm">{desc}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-base-300 bg-base-100 p-4">
              <div className="font-bold">
                {l.trans({ en: "AKAN_PUBLIC_OPERATION_MODE modes", ko: "AKAN_PUBLIC_OPERATION_MODE 모드" })}
              </div>
              <div className="mt-3 space-y-1">
                {[
                  ["local", l.trans({ en: "Client talks to local runtime.", ko: "클라이언트가 로컬 런타임에 연결" })],
                  [
                    "cloud",
                    l.trans({ en: "Client talks to cloud services.", ko: "클라이언트가 클라우드 서비스에 연결" }),
                  ],
                  ["edge", l.trans({ en: "Client uses edge-facing paths.", ko: "클라이언트가 엣지 경로 사용" })],
                ].map(([mode, desc]) => (
                  <div key={mode} className="rounded-lg bg-base-200 p-3">
                    <div className="font-mono font-semibold text-sm">{mode}</div>
                    <div className="mt-1 text-base-content/70 text-sm">{desc}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div>
            <div className="font-bold">{l.trans({ en: "Common setup scenarios", ko: "자주 쓰는 설정 예시" })}</div>
            <div className="space-y-1">
              <Code.Snippet
                className="w-full"
                title={l.trans({ en: "Build a feature locally", ko: "로컬에서 기능 개발" })}
                language="bash"
                code={`AKAN_PUBLIC_ENV=local
AKAN_PUBLIC_OPERATION_MODE=local
AKAN_PUBLIC_LOG_LEVEL=debug`}
              />
              <Code.Snippet
                className="w-full"
                title={l.trans({ en: "Reproduce with shared test data", ko: "공용 테스트 데이터로 재현" })}
                language="bash"
                code={`AKAN_PUBLIC_ENV=debug
AKAN_PUBLIC_OPERATION_MODE=local
AKAN_PUBLIC_LOG_LEVEL=debug`}
              />
              <Code.Snippet
                className="w-full"
                title={l.trans({ en: "Deploy production to cloud server", ko: "클라우드 서버에 프로덕션 배포" })}
                language="bash"
                code={`AKAN_PUBLIC_ENV=main
AKAN_PUBLIC_OPERATION_MODE=cloud
AKAN_PUBLIC_LOG_LEVEL=info`}
              />
              <Code.Snippet
                className="w-full"
                title={l.trans({ en: "Deploy production to edge server", ko: "엣지 서버에 프로덕션 배포" })}
                language="bash"
                code={`AKAN_PUBLIC_ENV=main
AKAN_PUBLIC_OPERATION_MODE=edge
AKAN_PUBLIC_LOG_LEVEL=info`}
              />
            </div>
          </div>
          <Docs.Alert type="info">
            {l.trans({
              en: "A common setup is ENV=local and OPERATION_MODE=local while building features, then switching ENV to debug or develop when you need to test with shared data or shared services.",
              ko: "일반적으로 기능을 만들 때는 ENV=local, OPERATION_MODE=local로 작업합니다. 데이터베이스 마이그레이션이나 서비스를 확인해야 할 때는 ENV를 debug 또는 develop으로 바꿔 테스트합니다.",
            })}
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />
      <Scroll.Slide id="get-env" title={l.trans({ en: "getEnv()", ko: "getEnv()" })}>
        <Docs.Title>{l.trans({ en: "getEnv()", ko: "getEnv()" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "getEnv() is the runtime helper that turns .env values into the information your app actually uses. Instead of hand-writing API URLs or WebSocket URLs, app code can read the prepared values from getEnv().",
              ko: "getEnv()는 .env 값을 앱이 실제로 사용할 런타임 정보로 정리해 주는 helper입니다. API URL이나 웹소켓 URL을 직접 조합하지 않고, 앱 코드에서는 getEnv()가 준비한 값을 읽어 사용할 수 있습니다.",
            })}
          </div>
          <Code.Snippet
            title="Using getEnv()"
            code={`import { getEnv } from "akanjs/base";

const env = getEnv();

env.clientHttpUri; // app URL
env.serverHttpUri; // API URL
env.serverWsUri;   // WebSocket URL`}
          />
          <div className="space-y-1">
            <div className="rounded-xl border border-base-300 bg-base-100 p-4">
              <div className="font-bold">{l.trans({ en: "Local mode", ko: "로컬 모드" })}</div>
              <div className="mt-2 text-base-content/70 text-sm leading-relaxed">
                {l.trans({
                  en: "When OPERATION_MODE is local, getEnv() points the browser and API client to your local Akan runtime, usually localhost:8282.",
                  ko: "OPERATION_MODE가 local이면 getEnv()는 브라우저와 API 클라이언트가 내 로컬 Akan 런타임을 바라보도록 합니다. 보통 localhost:8282를 사용합니다.",
                })}
              </div>
              <Code.Snippet
                className="w-full"
                title="local"
                language="bash"
                code={`AKAN_PUBLIC_OPERATION_MODE=local
clientHttpUri=http://localhost:8282
serverHttpUri=http://localhost:8282/api
serverWsUri=ws://localhost:8282`}
              />
            </div>
            <div className="rounded-xl border border-base-300 bg-base-100 p-4">
              <div className="font-bold">{l.trans({ en: "Cloud / edge mode", ko: "클라우드 / 엣지 모드" })}</div>
              <div className="mt-2 text-base-content/70 text-sm leading-relaxed">
                {l.trans({
                  en: "When OPERATION_MODE is cloud or edge, getEnv() builds service URLs from the app name, environment, and serve domain.",
                  ko: "OPERATION_MODE가 cloud 또는 edge이면 getEnv()는 앱 이름, 환경, 서비스 도메인을 조합해 서비스 URL을 만듭니다.",
                })}
              </div>
              <Code.Snippet
                className="w-full"
                title="cloud / edge"
                language="bash"
                code={`AKAN_PUBLIC_APP_NAME=myapp
AKAN_PUBLIC_ENV=main
AKAN_PUBLIC_SERVE_DOMAIN=akanjs.com

serverHttpUri=https://myapp-main.mydomain.com/api
serverWsUri=wss://myapp-main.mydomain.com`}
              />
            </div>
          </div>
          <Docs.Alert type="info">
            {l.trans({
              en: "Use getEnv() when application code needs runtime addresses or environment identity. It keeps URL decisions in one place and makes local, cloud, and edge modes easier to switch.",
              ko: "앱 코드에서 런타임 주소나 환경 식별 정보가 필요할 때는 getEnv()를 사용하세요. URL 결정이 한곳에 모이기 때문에 local, cloud, edge 모드를 더 쉽게 전환할 수 있습니다.",
            })}
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />
      <Scroll.Slide id="openapi-json" title={l.trans({ en: "OpenAPI JSON", ko: "OpenAPI JSON" })}>
        <Docs.Title>{l.trans({ en: "OpenAPI JSON", ko: "OpenAPI JSON" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Akan can expose the HTTP query and mutation surface declared in signal files as an OpenAPI 3.1 document. This is useful when you want to connect Swagger, Redoc, external clients, or SDK generation tools to the same API shape Akan already uses.",
              ko: "Akan은 signal 파일에 선언된 HTTP query/mutation 표면을 OpenAPI 3.1 문서로 노출할 수 있습니다. Swagger, Redoc, 외부 클라이언트, SDK 생성 도구를 Akan이 이미 사용하는 API 형태에 연결할 때 유용합니다.",
            })}
          </div>
          <Code.Snippet
            title="apps/myapp/main.ts"
            code={`import { AkanApp } from "akanjs/server";

const run = async () => {
  await new AkanApp("./server", { openapi: true }).start();
};
void run();`}
          />
          <div>
            {l.trans({
              en: "After enabling it, request /openapi.json from the app origin. In local mode, the document is usually available at localhost:8282/openapi.json. The normal API prefix stays at /api; OpenAPI JSON is served as a framework metadata route.",
              ko: "활성화한 뒤 앱 origin에서 /openapi.json을 요청하면 됩니다. 로컬 모드에서는 보통 localhost:8282/openapi.json에서 확인할 수 있습니다. 일반 API prefix는 /api를 유지하고, OpenAPI JSON은 프레임워크 메타데이터 route로 제공됩니다.",
            })}
          </div>
          <Code.Snippet
            title="Read the OpenAPI document"
            language="bash"
            code={`curl http://localhost:8282/openapi.json`}
          />
          <div className="space-y-1">
            {[
              {
                title: l.trans({ en: "App option", ko: "앱 옵션" }),
                desc: l.trans({
                  en: "Use this when the app should always expose OpenAPI JSON in that entry point.",
                  ko: "해당 앱 엔트리 포인트에서 항상 OpenAPI JSON을 노출해야 할 때 사용합니다.",
                }),
                value: `new AkanApp("./server", { openapi: true })`,
              },
              {
                title: l.trans({ en: "Environment variable", ko: "환경변수" }),
                desc: l.trans({
                  en: "Use this when deployment or local scripts should decide whether the endpoint is available.",
                  ko: "배포 환경이나 로컬 스크립트에서 endpoint 노출 여부를 결정해야 할 때 사용합니다.",
                }),
                value: "AKAN_OPENAPI=true",
              },
              {
                title: l.trans({ en: "Server option", ko: "서버 옵션" }),
                desc: l.trans({
                  en: "Use this when you start AkanServer directly instead of going through AkanApp.",
                  ko: "AkanApp을 거치지 않고 AkanServer를 직접 시작할 때 사용합니다.",
                }),
                value: `new AkanServer("myapp", env, "all", lib, { openapi: true })`,
              },
            ].map(({ title, desc, value }) => (
              <div key={title} className="rounded-xl border border-base-300 bg-base-100 p-4">
                <div className="font-bold text-base-content">{title}</div>
                <div className="mt-2 text-base-content/70 text-sm leading-relaxed">{desc}</div>
                <div className="mt-3 break-all rounded bg-base-200 px-2 py-1 font-mono text-base-content/80 text-xs">
                  {value}
                </div>
              </div>
            ))}
          </div>
          <Docs.Alert type="warning">
            {l.trans({
              en: "OpenAPI JSON is opt-in. Enable it only for environments where exposing API structure is acceptable, because it describes routes, request fields, response schemas, and guard metadata.",
              ko: "OpenAPI JSON은 명시적으로 켜야 노출됩니다. route, 요청 필드, 응답 schema, guard 메타데이터를 설명하므로 API 구조 노출이 허용되는 환경에서만 켜세요.",
            })}
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />
      <Scroll.Slide
        id="health-metrics-logs"
        title={l.trans({ en: "Health, Metrics, Logs", ko: "상태 확인, 메트릭, 로그" })}
      >
        <Docs.Title>{l.trans({ en: "Health, Metrics, Logs", ko: "상태 확인, 메트릭, 로그" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Akan runtime exposes simple ways to check whether the app is alive, how busy it is, and what it is doing. In local development, these are mostly useful when a page does not load or a background job seems stuck.",
              ko: "Akan 런타임은 앱이 살아있는지, 얼마나 바쁜지, 지금 무엇을 하고 있는지 확인할 수 있는 간단한 방법을 제공합니다. 로컬 개발에서는 페이지가 열리지 않거나 백그라운드 작업이 멈춘 것처럼 보일 때 유용합니다.",
            })}
          </div>
          <div className="space-y-1">
            <div className="rounded-xl border border-base-300 bg-base-100 px-4">
              <div className="font-bold">{l.trans({ en: "Health", ko: "상태 확인" })}</div>
              <div className="mt-2 text-base-content/70 text-sm leading-relaxed">
                {l.trans({
                  en: "Use this to check whether the gateway and server processes are running and ready.",
                  ko: "게이트웨이와 서버 프로세스가 실행 중이고 준비되었는지 확인할 때 사용합니다.",
                })}
              </div>
              <Code.Snippet
                className="w-full"
                title="health"
                language="bash"
                code={`curl http://localhost:8282/_akan/app/health`}
              />
            </div>
            <div className="rounded-xl border border-base-300 bg-base-100 px-4">
              <div className="font-bold">{l.trans({ en: "Metrics", ko: "메트릭" })}</div>
              <div className="mt-2 text-base-content/70 text-sm leading-relaxed">
                {l.trans({
                  en: "Use this to see runtime counts such as active requests, WebSocket connections, rooms, and process metrics.",
                  ko: "활성 요청, 웹소켓 연결, room, 프로세스 지표 같은 런타임 수치를 확인할 때 사용합니다.",
                })}
              </div>
              <Code.Snippet
                className="w-full"
                title="metrics"
                language="bash"
                code={`curl http://localhost:8282/_akan/app/metrics`}
              />
            </div>
            <div className="rounded-xl border border-base-300 bg-base-100 px-4">
              <div className="font-bold">{l.trans({ en: "Logs", ko: "로그" })}</div>
              <div className="mt-2 text-base-content/70 text-sm leading-relaxed">
                {l.trans({
                  en: "Use AKAN_PUBLIC_LOG_LEVEL to choose how much detail appears in the terminal. AkanApp also stores gateway and child process output in runtime/logs by default, using AKAN_LOG_FILE_LEVEL for structured Logger output and rotating files by date and size.",
                  ko: "터미널에 어느 정도 자세한 로그를 볼지는 AKAN_PUBLIC_LOG_LEVEL로 조절합니다. AkanApp은 기본적으로 gateway와 child process 출력을 runtime/logs에 저장하며, structured Logger 출력은 AKAN_LOG_FILE_LEVEL 기준으로 저장하고 날짜와 크기 기준으로 파일을 회전합니다.",
                })}
              </div>
              <Code.Snippet
                className="w-full"
                title="logs"
                language="bash"
                code={`AKAN_PUBLIC_LOG_LEVEL=debug
AKAN_LOG_FILE_LEVEL=trace
AKAN_MEMORY_LOG=1
AKAN_LOG_MAX_SIZE_MB=50
AKAN_LOG_MAX_FILES=100`}
              />
              <div className="mt-2 text-base-content/70 text-sm leading-relaxed">
                {l.trans({
                  en: "File names include app name, environment, operation mode, local date, process key, and sequence. Direct console.log calls from child servers are captured through stdout/stderr pipes; direct gateway console.log calls are not part of Logger sink capture.",
                  ko: "파일명에는 app name, environment, operation mode, 로컬 날짜, process key, sequence가 포함됩니다. child server의 직접 console.log 호출은 stdout/stderr pipe를 통해 저장되지만, gateway process의 직접 console.log 호출은 Logger sink 캡처 대상이 아닙니다.",
                })}
              </div>
            </div>
          </div>
          <Docs.Mermaid
            title="Runtime checks"
            chart={`flowchart LR
  developer[Developer] --> gateway[Akan App Gateway]
  gateway --> health["/_akan/app/health"]
  gateway --> metrics["/_akan/app/metrics"]
  gateway --> logs["Terminal Logs"]
  health --> status["Running / Ready"]
  metrics --> numbers["Requests, Sockets, Memory"]
  logs --> details["Debug Details"]`}
          />
          <Docs.Alert type="info">
            {l.trans({
              en: "Start with health when the app does not respond. Use metrics when the app responds but feels busy. Increase LOG_LEVEL or enable AKAN_MEMORY_LOG when you need more terminal detail.",
              ko: "앱이 응답하지 않으면 먼저 health를 확인하세요. 응답은 하지만 바빠 보이면 metrics를 확인합니다. 더 자세한 터미널 정보가 필요할 때는 LOG_LEVEL을 올리거나 AKAN_MEMORY_LOG를 켭니다.",
            })}
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <Scroll.TitleNavigator className="fixed top-32 right-0 hidden w-[250px] flex-col gap-2 lg:flex" />
    </Scroll>
  );
}
