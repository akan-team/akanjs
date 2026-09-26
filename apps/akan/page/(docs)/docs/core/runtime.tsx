import { usePage } from "@apps/akan/client";
import { Code, Divider, Docs, DocsToc, panelRecipe } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { page } from "akanjs/client";

export default page().render(() => {
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
            className="w-full"
            title="apps/myapp/main.ts"
            code={`import { AkanApp } from "akanjs/server/akanApp";

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
          <Docs.Figure
            title={l.trans({ en: "Runtime overview", ko: "런타임 개요" })}
            image="runtime-overview"
            prompt={`
              Application source at the far left labelled "App Code", with an arrow into a large process at the centre
              left labelled "Akan App". Inside it, a smaller server, its outline traced as the red accent, labelled
              "Akan Server". Four arrows leave the server to the right, fanning out to four shapes stacked top to
              bottom: a small clock labelled "Internal API" with a smaller second line "queue · timer"; a pair of
              opposing arrows labelled "API" with a smaller second line "http · websocket"; a browser labelled "SSR
              Pages"; a phone labelled "CSR Pages".
            `}
            alt={l.trans({
              en: "App code runs in the Akan App, which runs the Akan Server, and the server exposes an internal API for queues and timers, an HTTP and WebSocket API, SSR pages for the web and CSR pages for Android and iOS.",
              ko: "앱 코드는 Akan App에서 실행되고 Akan App이 Akan 서버를 실행합니다. 서버는 큐·타이머용 내부 API, HTTP·WebSocket API, 웹용 SSR 페이지, Android·iOS용 CSR 페이지를 제공합니다.",
            })}
          />

          <div>
            {l.trans({
              en: "AKAN_REPLICA decides how many server processes each role gets, and it defaults to 0,0,1 everywhere: one all server and nothing else. With a single traffic replica there is nothing to balance, so Akan App runs that server inside its own process instead of spawning it and proxying to it. The container holds one process, and every request skips a proxy hop.",
              ko: "AKAN_REPLICA는 역할별 서버 프로세스 개수를 정하며, 어디서나 기본값은 0,0,1입니다. all 서버 하나만 실행한다는 뜻입니다. 트래픽 replica가 하나면 분산할 대상이 없으므로, Akan App은 그 서버를 spawn해서 프록시하지 않고 자기 프로세스 안에서 직접 실행합니다. 컨테이너는 프로세스 하나만 갖고, 모든 요청이 프록시 홉을 건너뜁니다.",
            })}
          </div>
          <ul className="list-disc space-y-1 pl-6 md:pl-12">
            <li>
              {l.trans({
                en: "all: runs both federation and batch behavior in one server process. This is the default, and the shape almost every deployment ships.",
                ko: "all: 하나의 서버 프로세스에서 federation과 batch 역할을 함께 실행합니다. 기본값이며, 대부분의 배포가 이 형태로 나갑니다.",
              })}
            </li>
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
          </ul>
          <Docs.Figure
            title={l.trans({ en: "Default: one process, no gateway", ko: "기본값: 프로세스 하나, 게이트웨이 없음" })}
            image="runtime-solo"
            prompt={`
              One large container taking most of the frame, labelled "Container" at its top left. A browser labelled
              "Browser" outside it at the far left with an arrow into the large process. Inside the container, one large
              process spanning most of its width, its outline traced as the red accent, labelled "Akan App + Akan
              Server" on its top band, split into two halves by a vertical line: the left half holds a pair of opposing
              arrows labelled "Pages · API · WebSocket", the right half holds a small clock labelled "Queue · Timer ·
              Jobs". Below it, still inside the container, a smaller process labelled "RSC Worker", joined to the large
              process by a dashed line labelled "web only".
            `}
            alt={l.trans({
              en: "The browser reaches one process in the container where Akan App and Akan Server run together, serving pages, API and WebSocket and running queues, timers and jobs; a separate RSC worker process exists only for web.",
              ko: "브라우저는 컨테이너 안의 프로세스 하나에 닿고, 그 안에서 Akan 앱과 Akan 서버가 함께 페이지·API·웹소켓을 처리하고 큐·타이머·잡을 실행합니다. 별도의 RSC 워커 프로세스는 웹일 때만 있습니다.",
            })}
          />
          <div>
            {l.trans({
              en: "Five things bring the gateway back: two or more replicas, a batch-only replica that never listens, AKAN_SOLO=false, passing replica to new AkanApp(...), and akan start. Then Akan App spawns the servers and load-balances browser traffic across the ready federation and all processes.",
              ko: "gateway가 다시 사용되는 경우는 다섯 가지입니다. replica가 둘 이상일 때, listen하지 않는 batch 전용 replica가 있을 때, AKAN_SOLO=false일 때, new AkanApp(...)에 replica를 넘겼을 때, 그리고 akan start일 때입니다. 이때 Akan App은 서버들을 spawn하고 준비된 federation/all 프로세스로 브라우저 요청을 로드밸런싱합니다.",
            })}
          </div>
          <Docs.Figure
            title={l.trans({ en: "Replica and server modes", ko: "Replica와 server 모드" })}
            image="runtime-gateway"
            prompt={`
              One large container taking most of the frame, labelled "Container" at its top left. A browser labelled
              "Browser" outside it at the far left with an arrow into the gateway. Inside the container on the left, a
              process holding a small circle with four short spokes, its outline traced as the red accent, labelled
              "Akan App" with a smaller second line "gateway · load balancer". From it, three arrows fan right to three
              processes stacked vertically, each holding a pair of opposing arrows, labelled once "Federation Servers"
              with a smaller second line "pages · api · websocket". A fourth arrow reaches a process set apart at the
              bottom right, holding a small clock, labelled "Batch Server" with a smaller second line "queue · timer ·
              jobs".
            `}
            alt={l.trans({
              en: "The browser reaches the Akan App acting as gateway and load balancer inside the container; it spreads traffic over three federation servers for pages, API and WebSocket, and runs a batch server for queues, timers and jobs.",
              ko: "브라우저는 컨테이너 안에서 게이트웨이이자 로드 밸런서인 Akan 앱에 닿습니다. Akan 앱은 페이지·API·웹소켓 트래픽을 federation 서버 세 개로 나누고, 큐·타이머·잡을 위한 batch 서버를 실행합니다.",
            })}
          />
          <Docs.Alert type="info">
            {l.trans({
              en: "A single Akan App has built-in clustering. You can run multiple server replicas and let Akan App distribute traffic, without setting up separate local load-balancing tools such as nginx, docker compose, or pm2.",
              ko: "단일 Akan App은 clustering 기능을 기본으로 지원합니다. 여러 server replica를 실행하고 Akan App이 트래픽을 분산할 수 있으므로, nginx, docker compose, pm2 같은 별도 로컬 load-balancing 도구를 직접 구성하지 않아도 됩니다.",
            })}
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />
      <Scroll.Slide id="env-identity" title={l.trans({ en: "Identity And Environment", ko: "정체성과 환경" })}>
        <Docs.Title>{l.trans({ en: "Identity And Environment", ko: "정체성과 환경" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "The root .env file decides which organization, domain, environment, operation mode, and log level the app uses while it runs. Most projects keep these values stable, but changing them lets the same app behave like a local, debug, develop, or production-like service.",
              ko: "루트 .env 파일은 앱이 실행될 때 사용할 조직, 도메인, 환경, 동작 모드, 로그 수준을 정합니다. 대부분의 프로젝트에서는 이 값을 자주 바꾸지 않지만, 값을 바꾸면 같은 앱을 로컬용, 디버그용, 개발 서버용, 운영에 가까운 형태로 실행할 수 있습니다.",
            })}
          </div>
          <Code.Snippet
            className="w-full"
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
          <div>
            {l.trans({
              en: "Four of those names answer who this app is and where it runs, and the first two are required:",
              ko: "이 중 네 개는 이 앱이 누구이며 어디서 도는지에 답하며, 앞의 두 개는 필수입니다:",
            })}
          </div>
          <Docs.OptionTable
            items={[
              {
                key: "AKAN_PUBLIC_REPO_NAME",
                type: "string",
                tags: [l.trans({ en: "required", ko: "필수" })],
                desc: l.trans({
                  en: "Organization or repository namespace, usually fixed for the life of the project.",
                  ko: "조직 또는 저장소 네임스페이스이며, 보통 프로젝트 수명 내내 고정입니다.",
                }),
              },
              {
                key: "AKAN_PUBLIC_SERVE_DOMAIN",
                type: "string",
                tags: [l.trans({ en: "required", ko: "필수" })],
                desc: l.trans({
                  en: "The domain the app builds links, callbacks, and domain-based routes from.",
                  ko: "앱이 링크, 콜백, 도메인 기반 라우팅을 만들 때 쓰는 도메인입니다.",
                }),
              },
              {
                key: "AKAN_PUBLIC_ENV",
                type: "local | debug | develop | main | testing",
                default: "debug",
                desc: l.trans({
                  en: "Which data set the app runs against, from local test data up to production-like main.",
                  ko: "앱이 어떤 데이터 기준으로 도는지 정합니다. 로컬 테스트 데이터부터 운영에 가까운 main까지입니다.",
                }),
              },
              {
                key: "AKAN_PUBLIC_OPERATION_MODE",
                type: "local | edge | cloud | module",
                default: l.trans({ en: "local when ENV=local, else cloud", ko: "ENV=local이면 local, 아니면 cloud" }),
                desc: l.trans({
                  en: "Where clients connect: local runtime, cloud, or edge paths; module is only in the type.",
                  ko: "클라이언트가 연결할 곳입니다. 로컬 런타임, 클라우드, 엣지 경로 중 하나이며 module은 타입에만 있습니다.",
                }),
              },
            ]}
          />
          <div>
            {l.trans({
              en: "In practice you move two of them together. Build a feature with ENV=local and OPERATION_MODE=local, switch ENV to debug or develop when you need shared data or shared services, and deploy with ENV=main against whichever operation mode the cluster serves:",
              ko: "실제로는 두 개를 같이 움직입니다. 기능을 만들 때는 ENV=local, OPERATION_MODE=local로 작업하고, 공용 데이터나 공용 서비스가 필요해지면 ENV를 debug나 develop으로 바꾸며, 배포할 때는 클러스터가 제공하는 operation mode에 맞춰 ENV=main으로 올립니다:",
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title=".env"
            language="bash"
            code={`# Build a feature locally
AKAN_PUBLIC_ENV=local
AKAN_PUBLIC_OPERATION_MODE=local
AKAN_PUBLIC_LOG_LEVEL=debug

# Reproduce with shared test data
AKAN_PUBLIC_ENV=debug
AKAN_PUBLIC_OPERATION_MODE=local
AKAN_PUBLIC_LOG_LEVEL=debug

# Deploy production to a cloud server
AKAN_PUBLIC_ENV=main
AKAN_PUBLIC_OPERATION_MODE=cloud
AKAN_PUBLIC_LOG_LEVEL=info

# Deploy production to an edge server
AKAN_PUBLIC_ENV=main
AKAN_PUBLIC_OPERATION_MODE=edge
AKAN_PUBLIC_LOG_LEVEL=info`}
          />
        </Docs.Description>
      </Scroll.Slide>
      <Divider />
      <Scroll.Slide id="env-database" title={l.trans({ en: "Database Variables", ko: "데이터베이스 환경변수" })}>
        <Docs.Title>{l.trans({ en: "Database Variables", ko: "데이터베이스 환경변수" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  Which database mode a deployment runs and where its data lives are the deployment's to say. These
                  variables win over the same values in <code>env.server.ts</code>, so one image can serve several
                  deployments:
                </span>
              ),
              ko: (
                <span>
                  배포가 어떤 데이터베이스 모드로 돌고 데이터가 어디에 있는지는 배포가 정합니다. 아래 변수는{" "}
                  <code>env.server.ts</code>에 적은 같은 값보다 우선하므로, 이미지 하나로 여러 배포를 할 수 있습니다:
                </span>
              ),
            })}
          </div>
          <Docs.OptionTable
            items={[
              {
                key: "AKAN_DATABASE_MODE",
                type: "single | multiple | cluster",
                default: l.trans({ en: "the first declared mode", ko: "첫 번째로 선언한 모드" }),
                desc: l.trans({
                  en: "One of `database.modes`; a deployment of a build that declares several must set it.",
                  ko: "`database.modes` 중 하나이며, 여러 모드를 선언한 빌드의 배포는 반드시 설정합니다.",
                }),
              },
              {
                key: "AKAN_SQLITE_DIR",
                type: "string",
                default: l.trans({ en: "/workspace/sqlite in the image", ko: "이미지에서는 /workspace/sqlite" }),
                desc: l.trans({
                  en: "The folder for any SQLite file no path names: the database, and `single`'s cache and queue file.",
                  ko: "경로를 따로 정하지 않은 SQLite 파일을 둘 디렉터리이며, 데이터베이스 파일과 `single`의 캐시·큐 파일이 여기에 놓입니다.",
                }),
              },
              {
                key: "SQLITE_DATABASE_PATH",
                type: "string",
                desc: l.trans({
                  en: "Moves the database file alone, in `single` and `multiple`; it wins over `AKAN_SQLITE_DIR`.",
                  ko: "`single`과 `multiple`의 데이터베이스 파일 하나만 옮기며, `AKAN_SQLITE_DIR`보다 우선합니다.",
                }),
              },
              {
                key: "AKAN_SOLID_DB_PATH",
                type: "string",
                desc: l.trans({
                  en: "The SQLite file where `single` keeps its cache, queue and pubsub.",
                  ko: "`single`이 캐시, 큐, PubSub을 두는 SQLite 파일입니다.",
                }),
              },
              {
                key: "POSTGRES_URL",
                type: "string",
                desc: l.trans({
                  en: "The `cluster` database (alias `POSTGRES_URI`), with pool size and SSL in its query string.",
                  ko: "`cluster`의 데이터베이스이며(별칭 `POSTGRES_URI`), 풀 크기와 SSL은 쿼리 문자열에 적습니다.",
                }),
              },
              {
                key: "POSTGRES_HOST",
                type: "string",
                default: "localhost",
                desc: l.trans({
                  en: "The URL in parts, with `POSTGRES_PORT`, `POSTGRES_DATABASE`, `POSTGRES_USER`, `POSTGRES_PASSWORD`.",
                  ko: "같은 URL을 나눠 적으며, `POSTGRES_PORT`, `POSTGRES_DATABASE`, `POSTGRES_USER`, `POSTGRES_PASSWORD`와 함께 씁니다.",
                }),
              },
              {
                key: "POSTGRES_INSIGHT_URL",
                type: "string",
                desc: l.trans({
                  en: "Logs the SQL console in on `cluster`, as a role that may read base columns only.",
                  ko: "`cluster`에서 SQL 콘솔이 로그인할 URL이며, 기본 컬럼만 읽을 수 있는 role이어야 합니다.",
                }),
              },
              {
                key: "LIBSQL_URL",
                type: "string",
                desc: l.trans({
                  en: "Only for an app that applies `LibsqlDatabase` itself; `LIBSQL_AUTH_TOKEN` carries its token.",
                  ko: "앱이 `LibsqlDatabase`를 직접 적용할 때만 쓰며, 토큰은 `LIBSQL_AUTH_TOKEN`에 둡니다.",
                }),
              },
              {
                key: "REDIS_URI",
                type: "string",
                tags: [l.trans({ en: "required outside local", ko: "local 밖에서 필수" })],
                desc: l.trans({
                  en: "The one Redis every instance of `multiple` or `cluster` shares; `rediss://` turns on TLS.",
                  ko: "`multiple`과 `cluster`의 모든 인스턴스가 함께 쓰는 Redis이며, `rediss://`로 TLS를 켭니다.",
                }),
              },
              {
                key: "AKAN_STORAGE_SHARED",
                type: "true | 1",
                desc: l.trans({
                  en: "Every instance mounts one upload volume; disk uploads in `multiple` and `cluster` need it.",
                  ko: "모든 인스턴스가 같은 업로드 볼륨을 마운트한다는 뜻이며, `multiple`과 `cluster`의 디스크 업로드에 필요합니다.",
                }),
              },
            ]}
          />
          <div>
            {l.trans({
              en: (
                <span>
                  An app that declares <code>{'database: { modes: ["single", "cluster"] }'}</code> ships one image that
                  serves both of these:
                </span>
              ),
              ko: (
                <span>
                  <code>{'database: { modes: ["single", "cluster"] }'}</code>를 선언한 앱은 이미지 하나로 아래 두 배포를
                  모두 실행합니다:
                </span>
              ),
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title=".env"
            language="bash"
            showLineNumbers={false}
            code={`# An edge site: one container, its SQLite files on a volume
AKAN_PUBLIC_OPERATION_MODE=edge
AKAN_DATABASE_MODE=single
AKAN_SQLITE_DIR=/data

# The same image on a cloud cluster
AKAN_PUBLIC_OPERATION_MODE=cloud
AKAN_DATABASE_MODE=cluster
POSTGRES_URL=postgres://app:…@db.internal:5432/app?max=20&ssl=require
REDIS_URI=redis://redis.internal:6379`}
          />
          <ul className="my-4 list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      Only local development may skip <code>REDIS_URI</code>.
                    </strong>{" "}
                    A developer machine falls back to localhost, or to <code>REDIS_HOST</code> when{" "}
                    <code>akan start</code> runs against a shared environment.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>REDIS_URI</code>를 생략할 수 있는 곳은 로컬 개발뿐입니다.
                    </strong>{" "}
                    개발자 PC에서는 localhost를 쓰고, <code>akan start</code>가 공용 환경에 붙어 실행될 때는{" "}
                    <code>REDIS_HOST</code>를 씁니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Behind a PgBouncer in transaction mode,</strong> add <code>prepare=false</code> to{" "}
                    <code>POSTGRES_URL</code>; the driver reads every such setting from the query string.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>transaction 모드의 PgBouncer 뒤에서는</strong> <code>POSTGRES_URL</code>에{" "}
                    <code>prepare=false</code>를 붙입니다. 드라이버가 이런 설정을 모두 쿼리 문자열에서 읽습니다.
                  </span>
                ),
              })}
            </li>
          </ul>
          <Docs.Alert type="warning">
            {l.trans({
              en: (
                <span>
                  <strong>Uploads need storage every instance reads.</strong> A deployed <code>multiple</code> or{" "}
                  <code>cluster</code> app keeps them in object storage, or on one volume every instance mounts with{" "}
                  <code>AKAN_STORAGE_SHARED=true</code>. Outside development, an upload to a disk only one instance
                  reads is refused.
                </span>
              ),
              ko: (
                <span>
                  <strong>업로드는 모든 인스턴스가 읽는 곳에 둡니다.</strong> 배포된 <code>multiple</code>이나{" "}
                  <code>cluster</code> 앱은 업로드를 오브젝트 스토리지나, 모든 인스턴스가 마운트한 볼륨 하나에 두고{" "}
                  <code>AKAN_STORAGE_SHARED=true</code>를 설정합니다. 개발 환경 밖에서는 인스턴스 하나만 읽는 디스크로의
                  업로드가 거부됩니다.
                </span>
              ),
            })}
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />
      <Scroll.Slide id="env-search" title={l.trans({ en: "Text Search Variables", ko: "텍스트 검색 환경변수" })}>
        <Docs.Title>{l.trans({ en: "Text Search Variables", ko: "텍스트 검색 환경변수" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Full-text search is on unless you switch it off, and both of its variables are deployment-wide decisions rather than per-process ones, so give every process in one deployment the same pair.",
              ko: "전문 검색은 끄지 않는 한 켜져 있고, 두 변수 모두 프로세스별이 아니라 배포 전체의 결정이므로 한 배포의 모든 프로세스에 같은 값을 주세요.",
            })}
          </div>
          <Docs.OptionTable
            items={[
              {
                key: "AKAN_SEARCH_ENABLED",
                type: "0 | 1 | false | true",
                default: l.trans({ en: "unset means on", ko: "미설정이면 on" }),
                desc: l.trans({
                  en: "Turns the full-text index off, reversibly.",
                  ko: "전문 검색 색인을 끄며, 되돌릴 수 있습니다.",
                }),
              },
              {
                key: "AKAN_SEARCH_TOKENIZER",
                type: "string",
                default: "unicode61 remove_diacritics 2",
                desc: l.trans({
                  en: "fts5 tokenizer (Postgres: unicode61 or trigram); `database.search.tokenizer` in env.server.ts wins.",
                  ko: "색인에 쓰는 fts5 토크나이저이며(Postgres는 unicode61 또는 trigram), env.server.ts의 `database.search.tokenizer`가 우선합니다.",
                }),
              },
            ]}
          />
          <Docs.Alert type="warning">
            {l.trans({
              en: "Changing the tokenizer rebuilds the index from the mirror on the next boot. Of processes restarted at once, the first rebuilds and the rest wait for it; on SQLite a process waits only up to its busy timeout, so stagger the restart when the mirror is large.",
              ko: "토크나이저를 바꾸면 다음 부팅에서 미러로부터 색인을 다시 만듭니다. 한꺼번에 재시작하면 첫 프로세스가 다시 만들고 나머지는 기다립니다. SQLite에서는 busy timeout까지만 기다리므로, 미러가 크다면 재시작을 나눠서 하세요.",
            })}
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />
      <Scroll.Slide id="env-logging" title={l.trans({ en: "Logging Variables", ko: "로깅 환경변수" })}>
        <Docs.Title>{l.trans({ en: "Logging Variables", ko: "로깅 환경변수" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "The level ladder is trace, verbose, debug, info, warn, error, and three destinations read it independently: the container's stdout, the rotating log file, and any sink the app registered. Everything else here decides how much structure travels with a record and who is allowed to ask for more.",
              ko: "레벨 사다리는 trace, verbose, debug, info, warn, error이고, 세 목적지가 이를 각각 따로 읽습니다. 컨테이너 stdout, 회전 로그 파일, 그리고 앱이 등록한 sink입니다. 나머지 변수들은 레코드에 얼마나 많은 구조가 함께 실려 가는지, 그리고 누가 더 많은 것을 요구할 수 있는지를 정합니다.",
            })}
          </div>
          <Docs.OptionTable
            items={[
              {
                key: "AKAN_PUBLIC_LOG_LEVEL",
                type: "trace | verbose | debug | info | warn | error",
                default: "info",
                desc: l.trans({
                  en: "How much runtime output the console carries; the deprecated log means info.",
                  ko: "콘솔에 보낼 런타임 로그의 양입니다. 폐기된 log는 info를 뜻합니다.",
                }),
              },
              {
                key: "AKAN_LOG_STDOUT_LEVEL",
                type: "trace | verbose | debug | info | warn | error",
                default: "AKAN_PUBLIC_LOG_LEVEL",
                desc: l.trans({
                  en: "What goes to the container's stdout, in either format; info is the production pick.",
                  ko: "형식과 무관하게 컨테이너 stdout으로 나가는 레벨입니다. 운영 권장은 info입니다.",
                }),
              },
              {
                key: "AKAN_LOG_FILE_LEVEL",
                type: "trace | verbose | debug | info | warn | error",
                default: "trace",
                desc: l.trans({
                  en: "How much structured Logger output goes to files, independent of the console level.",
                  ko: "파일에 저장할 structured Logger 출력 범위이며, 터미널 로그 레벨과 별도로 동작합니다.",
                }),
              },
              {
                key: "AKAN_LOG_FORMAT",
                type: "text | ndjson | ndjson-only",
                default: "text",
                desc: l.trans({
                  en: "text for people; ndjson makes stdout one JSON record per line, ndjson-only the file too.",
                  ko: "text는 사람이 읽는 줄입니다. ndjson은 stdout을 한 줄에 JSON 레코드 하나로, ndjson-only는 회전 파일까지 JSON으로 씁니다.",
                }),
              },
              {
                key: "AKAN_LOG_TO_FILE",
                type: "0 | 1",
                default: "1",
                desc: l.trans({
                  en: "Writes gateway and child logs to runtime/logs; off in the production image.",
                  ko: "gateway와 child 로그를 runtime/logs에 씁니다. 프로덕션 이미지에서는 꺼져 있습니다.",
                }),
              },
              {
                key: "AKAN_LOG_DIR",
                type: "string",
                default: "runtime/logs",
                desc: l.trans({
                  en: "Where file logging writes, when the default directory is not where the volume is mounted.",
                  ko: "볼륨이 기본 디렉터리에 마운트되어 있지 않을 때, 파일 로그가 쓸 경로입니다.",
                }),
              },
              {
                key: "AKAN_LOG_MAX_SIZE_MB",
                type: "number",
                default: "50",
                desc: l.trans({
                  en: "Create the next sequence file when a process log reaches this size.",
                  ko: "프로세스별 로그 파일이 이 크기에 도달하면 다음 sequence 파일을 만듭니다.",
                }),
              },
              {
                key: "AKAN_LOG_MAX_FILES",
                type: "number",
                default: "100",
                desc: l.trans({
                  en: "Keep this many rotated files per process key, such as gateway or child-0.",
                  ko: "gateway 또는 child-0 같은 process key별로 보관할 회전 로그 파일 개수입니다.",
                }),
              },
              {
                key: "AKAN_LOG_CONTEXT",
                type: "0 | 1",
                default: "1",
                desc: l.trans({
                  en: "Tags each call's records with traceId, endpoint and origin; independent of AKAN_TRACE.",
                  ko: "각 호출의 레코드에 traceId, 엔드포인트, origin을 붙입니다. AKAN_TRACE와는 별개입니다.",
                }),
              },
              {
                key: "AKAN_LOG_STREAM",
                type: "0 | 1",
                default: "0",
                desc: l.trans({
                  en: "1 forwards child records to the gateway always, not only while akan logs or .tail listens.",
                  ko: "1이면 akan logs나 .tail이 구독하지 않아도 child가 항상 gateway로 레코드를 올립니다.",
                }),
              },
              {
                key: "AKAN_LOG_STREAM_TOKEN",
                type: "string",
                default: l.trans({ en: "unset — route absent", ko: "미설정 — 라우트 없음" }),
                desc: l.trans({
                  en: "Mounts GET /_akan/app/logs, an SSE stream of the ring buffer, for a matching bearer token.",
                  ko: "일치하는 bearer 토큰에게 링 버퍼를 SSE로 흘려 주는 GET /_akan/app/logs를 엽니다.",
                }),
              },
              {
                key: "AKAN_LOG_CANONICAL",
                type: "0 | 1 | all | slow",
                default: "0",
                desc: l.trans({
                  en: "One record per call at its end; 1 or all logs every call, slow only failed or slow ones.",
                  ko: "호출이 끝날 때 레코드 하나를 씁니다. 1·all은 모든 호출을, slow는 실패했거나 느린 호출만 씁니다.",
                }),
              },
              {
                key: "AKAN_LOG_FLIGHT",
                type: "0 | 1",
                default: "0",
                desc: l.trans({
                  en: "Buffers each call's last 64 sub-level records; promotes them if it failed or ran slow.",
                  ko: "호출마다 레벨 아래 레코드 최근 64건을 들고 있다가, 실패했거나 느리면 올립니다.",
                }),
              },
              {
                key: "AKAN_LOG_FLIGHT_MS",
                type: "number",
                default: "1000",
                desc: l.trans({
                  en: "A call at least this long is slow, for the flight recorder and the slow canonical mode.",
                  ko: "이 시간 이상 걸린 호출을 느린 호출로 봅니다. flight recorder와 canonical의 slow 모드가 함께 씁니다.",
                }),
              },
              {
                key: "AKAN_LOG_FLIGHT_MAX",
                type: "number",
                default: "65536",
                desc: l.trans({
                  en: "Caps the records the process holds at once; a call past the cap runs unrecorded.",
                  ko: "프로세스가 동시에 들고 있을 레코드 상한이고, 넘치면 그 호출은 기록 없이 진행합니다.",
                }),
              },
              {
                key: "AKAN_LOG_BUFFER",
                type: "number",
                default: "2000",
                desc: l.trans({
                  en: "How many records the in-memory hub keeps for akan logs and the SSE stream to replay.",
                  ko: "akan logs와 SSE 스트림이 되돌려 보낼 수 있도록 메모리 허브가 들고 있는 레코드 수입니다.",
                }),
              },
              {
                key: "AKAN_LOG_BUFFER_MB",
                type: "number",
                default: "4",
                desc: l.trans({
                  en: "The same buffer's byte ceiling; whichever limit is reached first applies.",
                  ko: "같은 버퍼의 바이트 상한이며, 둘 중 먼저 걸리는 쪽이 적용됩니다.",
                }),
              },
              {
                key: "AKAN_LOG_DEBUG_HEADER",
                type: "string",
                default: l.trans({ en: "unset — local only", ko: "미설정 — local에서만" }),
                desc: l.trans({
                  en: "The secret x-akan-debug must carry outside local to log that one request at trace.",
                  ko: "local 밖에서 x-akan-debug 헤더가 이 비밀값을 담아야 그 요청 하나를 trace로 기록합니다.",
                }),
              },
            ]}
          />
          <div>
            {l.trans({
              en: "The ring the gateway (or the solo replica) keeps for akan logs --replay and .trace holds AKAN_LOG_BUFFER records or AKAN_LOG_BUFFER_MB, 2,000 or 4 MB by default, whichever fills first, and the older record goes first.",
              ko: "gateway(또는 단독 replica)가 akan logs --replay와 .trace를 위해 유지하는 링은 AKAN_LOG_BUFFER건 또는 AKAN_LOG_BUFFER_MB(기본 2,000건, 4MB) 중 먼저 차는 쪽까지 보관하고, 오래된 레코드부터 밀려납니다.",
            })}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />
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
            className="w-full"
            title="Using getEnv()"
            code={`import { getEnv } from "akanjs/base";

const env = getEnv();

env.clientHttpUri; // app URL
env.serverHttpUri; // API URL
env.serverWsUri;   // WebSocket URL`}
          />
          <div className="space-y-1">
            <div className={panelRecipe()}>
              <div className="font-bold">{l.trans({ en: "Local mode", ko: "로컬 모드" })}</div>
              <div className="mt-2 text-foreground/70 text-sm leading-relaxed">
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
            <div className={panelRecipe()}>
              <div className="font-bold">{l.trans({ en: "Cloud / edge mode", ko: "클라우드 / 엣지 모드" })}</div>
              <div className="mt-2 text-foreground/70 text-sm leading-relaxed">
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
      <Divider />
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
            className="w-full"
            title="apps/myapp/main.ts"
            code={`import { AkanApp } from "akanjs/server/akanApp";

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
            className="w-full"
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
              <div key={title} className={panelRecipe()}>
                <div className="font-bold text-foreground">{title}</div>
                <div className="mt-2 text-foreground/70 text-sm leading-relaxed">{desc}</div>
                <div className="mt-3 break-all rounded bg-muted px-2 py-1 font-mono text-foreground/80 text-xs">
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
      <Divider />
      <Scroll.Slide id="module-selection" title={l.trans({ en: "Selective Module Boot", ko: "모듈 선택 실행" })}>
        <Docs.Title>{l.trans({ en: "Selective Module Boot", ko: "모듈 선택 실행" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "An app mounts every module its libraries declare. The modules option narrows that: name the modules a process should serve and Akan boots those plus the ones they depend on, leaving the rest out of the container entirely. A module left out has no service, no signal, no route, and no scheduled job. This is how one codebase runs as several small processes, such as a batch worker that only needs its own domain.",
              ko: "앱은 라이브러리가 선언한 모든 모듈을 마운트합니다. modules 옵션은 그 범위를 좁힙니다. 이 프로세스가 담당할 모듈을 지정하면 Akan은 그 모듈과 의존하는 모듈만 부팅하고 나머지는 컨테이너에 아예 올리지 않습니다. 빠진 모듈은 service, signal, route, 예약 작업이 모두 존재하지 않습니다. 하나의 코드베이스를 여러 개의 작은 프로세스로 나눠 실행하는 방법이며, 자기 도메인만 필요한 batch worker 같은 경우에 씁니다.",
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/myapp/main.ts"
            code={`import { AkanApp } from "akanjs/server/akanApp";

const run = async () => {
  await new AkanApp("./server", { modules: ["article"] }).start();
};
void run();`}
          />
          <div>
            {l.trans({
              en: "Dependencies are followed for you, so you list entry points instead of the whole graph. A named module pulls in every service and signal it injects, and every model its cascade removes.",
              ko: "의존성은 프레임워크가 따라가므로 전체 그래프가 아니라 진입점만 적으면 됩니다. 지정한 모듈은 자신이 주입하는 service와 signal, 그리고 cascade로 삭제하는 model을 함께 끌어옵니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "disableModules and disableLibs are the same idea from the other end: mount everything except what you name and whatever reaches it. disableModules takes module names, disableLibs takes the name of a library and stands for every module that library registered, so it does not drift as the library gains modules. Reach for either when the process serves most of the app and a library it depends on is one it does not use. Both are accepted in all three places modules is, as AKAN_DISABLE_MODULES and AKAN_DISABLE_LIBS in the environment. Naming a module in both modules and an exclusion leaves it out, because modules says what a process is for and the exclusions say what it must not run.",
              ko: "disableModules와 disableLibs는 같은 발상을 반대편에서 적용합니다. 지정한 대상과 그것을 참조하는 모듈만 빼고 나머지를 전부 마운트합니다. disableModules는 모듈 이름을, disableLibs는 라이브러리 이름을 받아 그 라이브러리가 등록한 모듈 전부를 뜻하므로 라이브러리에 모듈이 추가되어도 목록이 어긋나지 않습니다. 프로세스가 앱 대부분을 담당하는데 의존하는 라이브러리 중 쓰지 않는 것이 있을 때 씁니다. 둘 다 modules와 같은 세 곳에서 쓸 수 있고, 환경변수 이름은 AKAN_DISABLE_MODULES와 AKAN_DISABLE_LIBS입니다. modules와 제외 옵션에 같은 모듈을 적으면 빠집니다. modules는 이 프로세스가 무엇을 위한 것인지를, 제외 옵션은 무엇을 실행하면 안 되는지를 말하기 때문입니다.",
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/myapp/main.ts"
            code={`import { AkanApp } from "akanjs/server/akanApp";

const run = async () => {
  await new AkanApp("./server", { disableLibs: ["social"], disableModules: ["legacyImport"] }).start();
};
void run();`}
          />
          <div className="space-y-1">
            {[
              {
                title: l.trans({ en: "App option", ko: "앱 옵션" }),
                desc: l.trans({
                  en: "Use this when the entry point itself decides which modules the process serves. Every replica it spawns gets the same selection.",
                  ko: "이 엔트리 포인트가 담당할 모듈을 코드에서 정할 때 사용합니다. 여기서 생성되는 모든 replica가 같은 선택을 받습니다.",
                }),
                value: `new AkanApp("./server", { modules: ["article"] })`,
              },
              {
                title: l.trans({ en: "Environment variable", ko: "환경변수" }),
                desc: l.trans({
                  en: "Use this when deployment decides the split, so one image can run as different processes without a second entry point.",
                  ko: "배포 환경에서 분리 방식을 정할 때 사용합니다. 엔트리 포인트를 새로 만들지 않고 같은 이미지를 다른 프로세스로 실행할 수 있습니다.",
                }),
                value: "AKAN_MODULES=article,file",
              },
              {
                title: l.trans({ en: "Server option", ko: "서버 옵션" }),
                desc: l.trans({
                  en: "Use this when you start AkanServer directly instead of going through AkanApp.",
                  ko: "AkanApp을 거치지 않고 AkanServer를 직접 시작할 때 사용합니다.",
                }),
                value: `new AkanServer("myapp", env, "all", lib, { modules: ["article"] })`,
              },
            ].map(({ title, desc, value }) => (
              <div key={title} className={panelRecipe()}>
                <div className="font-bold text-foreground">{title}</div>
                <div className="mt-2 text-foreground/70 text-sm leading-relaxed">{desc}</div>
                <div className="mt-3 break-all rounded bg-muted px-2 py-1 font-mono text-foreground/80 text-xs">
                  {value}
                </div>
              </div>
            ))}
          </div>
          <Docs.Alert type="warning">
            {l.trans({
              en: "Selection narrows the enabled set rather than replacing it, so it never turns on a module whose service is disabled. A module that reaches a disabled one goes with it. Endpoints of a module left out do not exist, so a client that calls one gets a 404.",
              ko: "선택은 활성화된 모듈 집합을 좁힐 뿐이라 service가 비활성화된 모듈을 켜지는 않습니다. 빠진 모듈을 참조하는 모듈은 함께 빠집니다. 빠진 모듈의 endpoint는 존재하지 않으므로 클라이언트가 호출하면 404가 됩니다.",
            })}
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />
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
            <div className={panelRecipe({ padding: "row" })}>
              <div className="font-bold">{l.trans({ en: "Health", ko: "상태 확인" })}</div>
              <div className="mt-2 text-foreground/70 text-sm leading-relaxed">
                {l.trans({
                  en: "Use this to check whether the server processes are running and ready. A solo replica answers it itself, in the same shape the gateway uses, so a probe reads one contract either way.",
                  ko: "서버 프로세스가 실행 중이고 준비되었는지 확인할 때 사용합니다. solo replica는 gateway와 같은 형태로 직접 응답하므로, probe는 두 경우 모두 같은 형식을 읽습니다.",
                })}
              </div>
              <Code.Snippet
                className="w-full"
                title="health"
                language="bash"
                code={`curl http://localhost:8282/_akan/app/health`}
              />
            </div>
            <div className={panelRecipe({ padding: "row" })}>
              <div className="font-bold">{l.trans({ en: "Metrics", ko: "메트릭" })}</div>
              <div className="mt-2 text-foreground/70 text-sm leading-relaxed">
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
            <div className={panelRecipe({ padding: "row" })}>
              <div className="font-bold">{l.trans({ en: "Logs", ko: "로그" })}</div>
              <div className="mt-2 text-foreground/70 text-sm leading-relaxed">
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
              <div className="mt-2 text-foreground/70 text-sm leading-relaxed">
                {l.trans({
                  en: "File names include app name, environment, operation mode, local date, process key, and sequence. Direct console.log calls from child servers are captured through stdout/stderr pipes; direct gateway console.log calls are not part of Logger sink capture.",
                  ko: "파일명에는 app name, environment, operation mode, 로컬 날짜, process key, sequence가 포함됩니다. child server의 직접 console.log 호출은 stdout/stderr pipe를 통해 저장되지만, gateway process의 직접 console.log 호출은 Logger sink 캡처 대상이 아닙니다.",
                })}
              </div>
            </div>
          </div>
          <Docs.Flow
            title={l.trans({ en: "Runtime checks", ko: "런타임 점검" })}
            nodes={{
              developer: { label: l.trans({ en: "Developer", ko: "개발자" }) },
              gateway: {
                label: l.trans({ en: "Akan App", ko: "Akan 앱" }),
                lines: [l.trans({ en: "(gateway or solo)", ko: "(게이트웨이 또는 솔로)" })],
              },
              health: { label: "/_akan/app/health" },
              metrics: { label: "/_akan/app/metrics" },
              logs: { label: l.trans({ en: "Terminal Logs", ko: "터미널 로그" }) },
              status: { label: l.trans({ en: "Running / Ready", ko: "실행 중 / 준비 완료" }) },
              numbers: { label: l.trans({ en: "Requests, Sockets, Memory", ko: "요청, 소켓, 메모리" }) },
              details: { label: l.trans({ en: "Debug Details", ko: "디버그 상세" }) },
            }}
            edges={[
              ["developer", "gateway"],
              ["gateway", "health"],
              ["gateway", "metrics"],
              ["gateway", "logs"],
              ["health", "status"],
              ["metrics", "numbers"],
              ["logs", "details"],
            ]}
          />
          <Docs.Alert type="info">
            {l.trans({
              en: "Start with health when the app does not respond. Use metrics when the app responds but feels busy. Increase LOG_LEVEL or enable AKAN_MEMORY_LOG when you need more terminal detail.",
              ko: "앱이 응답하지 않으면 먼저 health를 확인하세요. 응답은 하지만 바빠 보이면 metrics를 확인합니다. 더 자세한 터미널 정보가 필요할 때는 LOG_LEVEL을 올리거나 AKAN_MEMORY_LOG를 켭니다.",
            })}
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <DocsToc />
    </Scroll>
  );
});
