import { usePage } from "@apps/akan/client";
import { Code, Divider, Docs, DocsToc } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { page } from "akanjs/client";

export default page().render(() => {
  const { l } = usePage();

  const imageDefaultRows = [
    {
      name: "PORT=8282",
      desc: l.trans({
        en: "The app listens on 8282, so publish `8282:8282`.",
        ko: "앱이 8282 포트에서 요청을 받으므로 `8282:8282`로 게시합니다.",
      }),
    },
    {
      name: "/workspace/sqlite",
      desc: l.trans({
        en: "The sqlite files land here, so mount a volume on it to survive restarts.",
        ko: "sqlite 파일이 여기 놓이므로, 재시작해도 남도록 볼륨을 마운트합니다.",
      }),
    },
    {
      name: "AKAN_LOG_TO_FILE=0",
      desc: l.trans({
        en: "File logging is off, so collect stdout or set it to 1 and mount a log volume.",
        ko: "파일 로깅이 꺼져 있으므로, stdout을 수집하거나 1로 켜고 로그 볼륨을 마운트합니다.",
      }),
    },
    {
      name: ["ca-certificates", "tzdata"],
      desc: l.trans({
        en: "The only packages installed, so declare ffmpeg or Chromium in `docker.preRuns`.",
        ko: "설치되는 패키지는 이 둘뿐이므로, ffmpeg이나 Chromium은 `docker.preRuns`에 적습니다.",
      }),
    },
    {
      name: "console.js",
      desc: l.trans({
        en: "It ships next to `main.js`, so you open an operator console with `docker exec`.",
        ko: "`main.js` 옆에 들어 있으므로 `docker exec`로 운영 콘솔을 엽니다.",
      }),
    },
  ];

  const requiredEnvRows = [
    {
      key: "AKAN_PUBLIC_APP_NAME",
      type: "string",
      default: l.trans({ en: "from the build", ko: "빌드 값" }),
      desc: l.trans({ en: "The app's codename.", ko: "앱의 코드네임입니다." }),
    },
    {
      key: "AKAN_PUBLIC_REPO_NAME",
      type: "string",
      default: l.trans({ en: "from the build", ko: "빌드 값" }),
      desc: l.trans({ en: "The workspace name.", ko: "workspace 이름입니다." }),
    },
    {
      key: "AKAN_PUBLIC_SERVE_DOMAIN",
      type: "string",
      default: l.trans({ en: "from the build", ko: "빌드 값" }),
      desc: l.trans({
        en: "The base domain the app derives its own origins from.",
        ko: "앱이 자기 origin을 만들어 내는 기준 도메인입니다.",
      }),
    },
  ];

  const runtimeEnvRows = [
    {
      key: "AKAN_PUBLIC_ENV",
      type: "local | testing | debug | develop | main",
      default: l.trans({ en: "from the build (debug)", ko: "빌드 값 (debug)" }),
      desc: l.trans({
        en: "Which deployment this is. The Helm chart sets it per namespace.",
        ko: "어느 배포인지입니다. Helm chart는 네임스페이스마다 이 값을 넣습니다.",
      }),
    },
    {
      key: "AKAN_PUBLIC_OPERATION_MODE",
      type: "local | edge | cloud | module",
      default: l.trans({ en: "cloud in the image", ko: "이미지에서는 cloud" }),
      desc: l.trans({
        en: "Where it runs. The on-premise box in this page's example is `edge`.",
        ko: "어디서 도는지입니다. 이 페이지 예시의 온프레미스 기기는 `edge`입니다.",
      }),
    },
    {
      key: "AKAN_DATABASE_MODE",
      type: "single | multiple | cluster",
      default: l.trans({ en: "the app's only declared mode", ko: "앱이 선언한 유일한 모드" }),
      desc: l.trans({
        en: "Picks one of the modes `database.modes` declares. Required when the app declares several.",
        ko: "`database.modes`에 선언한 모드 중 하나를 고릅니다. 앱이 여러 모드를 선언했다면 꼭 줘야 합니다.",
      }),
    },
    {
      key: "PORT",
      type: "number",
      default: "8282",
      desc: l.trans({
        en: "The port the gateway or the solo process binds.",
        ko: "gateway 또는 단독(solo) 프로세스가 바인딩하는 포트입니다.",
      }),
    },
    {
      key: "AKAN_SQLITE_DIR",
      type: "string",
      default: l.trans({ en: "/workspace/sqlite in the image", ko: "이미지에서는 /workspace/sqlite" }),
      desc: l.trans({
        en: "Where the sqlite files go. Point it at a mounted volume.",
        ko: "sqlite 파일이 놓이는 곳입니다. 마운트한 볼륨을 가리키게 하세요.",
      }),
    },
    {
      key: "AKAN_LOG_TO_FILE",
      type: "0 | 1",
      default: l.trans({ en: "0 in the image", ko: "이미지에서는 0" }),
      desc: l.trans({
        en: "Rotating log files. Set 1 and mount `AKAN_LOG_DIR` to get them back.",
        ko: "순환 로그 파일입니다. 1로 두고 `AKAN_LOG_DIR`을 마운트하면 다시 켜집니다.",
      }),
    },
    {
      key: "AKAN_LOG_DIR",
      type: "string",
      default: l.trans({ en: "/workspace/runtime/logs in the image", ko: "이미지에서는 /workspace/runtime/logs" }),
      desc: l.trans({
        en: "Where the rotating log files go when file logging is on.",
        ko: "파일 로깅을 켰을 때 순환 로그 파일이 놓이는 곳입니다.",
      }),
    },
    {
      key: "AKAN_CONSOLE",
      type: "1",
      default: l.trans({ en: "unset", ko: "미설정" }),
      desc: l.trans({
        en: "Required to open `console.js` in a production-like environment.",
        ko: "production 계열 환경에서 `console.js`를 열 때 필요합니다.",
      }),
    },
  ];

  const dataEnvRows = [
    {
      key: "SQLITE_DATABASE_PATH",
      type: "string",
      default: "<AKAN_SQLITE_DIR>/<app>-<env>.db",
      tags: ["single · multiple"],
      desc: l.trans({
        en: "The SQLite database file. In `multiple`, every container on the host opens this one file.",
        ko: "SQLite 데이터베이스 파일입니다. `multiple`에서는 호스트의 모든 컨테이너가 이 파일 하나를 엽니다.",
      }),
    },
    {
      key: "AKAN_SOLID_DB_PATH",
      type: "string",
      default: "<AKAN_SQLITE_DIR>/<app>-<env>_solid.db",
      tags: ["single"],
      desc: l.trans({
        en: "The SQLite file that holds the cache, queue and pubsub.",
        ko: "캐시, 큐, pubsub을 담는 SQLite 파일입니다.",
      }),
    },
    {
      key: "REDIS_URI",
      type: "string",
      tags: ["multiple · cluster"],
      desc: l.trans({
        en: "The Redis for the cache, queue and pubsub. Required; `rediss://` connects over TLS.",
        ko: "캐시, 큐, pubsub을 맡는 Redis입니다. 꼭 필요하며, `rediss://`로 쓰면 TLS로 연결합니다.",
      }),
    },
    {
      key: "POSTGRES_URL",
      type: "string",
      tags: ["cluster"],
      desc: l.trans({
        en: "The Postgres database. Pool size, SSL and prepared statements ride its query string.",
        ko: "Postgres 데이터베이스입니다. 커넥션 풀 크기, SSL, prepared statement는 쿼리 문자열로 정합니다.",
      }),
      example: "postgres://app:secret@db:5432/app?max=20&ssl=require",
    },
    {
      key: "AKAN_STORAGE_SHARED",
      type: "true",
      tags: ["multiple · cluster"],
      desc: l.trans({
        en: "Says `/workspace/local`, where uploads land, is one volume every instance mounts.",
        ko: "업로드가 쌓이는 `/workspace/local`이 모든 인스턴스가 함께 마운트한 볼륨 하나라고 알립니다.",
      }),
    },
  ];

  const modeColumns = [
    { key: "mode", label: l.trans({ en: "Mode", ko: "모드" }), code: true },
    { key: "database", label: l.trans({ en: "Database", ko: "데이터베이스" }) },
    { key: "services", label: l.trans({ en: "Cache · queue · pubsub", ko: "캐시 · 큐 · pubsub" }) },
    { key: "runs", label: l.trans({ en: "Runs on", ko: "도는 곳" }) },
  ];
  const modeRows = [
    {
      mode: "single",
      database: l.trans({ en: "A SQLite file", ko: "SQLite 파일" }),
      services: l.trans({ en: "SQLite files", ko: "SQLite 파일" }),
      runs: l.trans({ en: "One container", ko: "컨테이너 하나" }),
    },
    {
      mode: "multiple",
      database: l.trans({ en: "One SQLite file on a host volume", ko: "호스트 볼륨의 SQLite 파일 하나" }),
      services: "Redis",
      runs: l.trans({ en: "Several containers on one host", ko: "호스트 하나의 여러 컨테이너" }),
    },
    {
      mode: "cluster",
      database: "Postgres",
      services: "Redis",
      runs: l.trans({ en: "Several servers", ko: "여러 서버" }),
    },
  ];

  const replicaTermRows = [
    {
      name: "replica",
      desc: l.trans({
        en: "One server process that serves requests, runs background work, or both.",
        ko: "요청을 처리하거나, 백그라운드 작업을 돌리거나, 둘 다 하는 서버 프로세스 하나입니다.",
      }),
    },
    {
      name: "gateway",
      desc: l.trans({
        en: "A front process that binds PORT and spreads traffic across the replicas.",
        ko: "PORT를 잡고 들어온 트래픽을 replica들에 나눠 주는 앞단 프로세스입니다.",
      }),
    },
    {
      name: "solo",
      desc: l.trans({
        en: "One replica running as the container's only process, with no gateway.",
        ko: "gateway 없이 replica 하나가 컨테이너의 유일한 프로세스로 도는 상태입니다.",
      }),
    },
    {
      name: "internal",
      desc: l.trans({
        en: "Background work a signal declares, such as cron, interval and queue jobs.",
        ko: "시그널이 선언하는 백그라운드 작업입니다. cron, interval, 큐 작업 등이 있습니다.",
      }),
    },
    {
      name: "RSC worker",
      desc: l.trans({
        en: "The separate process that renders pages, one per web-serving replica.",
        ko: "페이지를 렌더링하는 별도 프로세스입니다. 웹을 서빙하는 replica마다 하나씩 붙습니다.",
      }),
    },
  ];

  const replicaSlotRows = [
    {
      slot: "1",
      role: "federation",
      default: "0",
      desc: l.trans({
        en: 'Serves requests. Skips internals pinned to `serverMode: "batch"`.',
        ko: '요청을 처리합니다. `serverMode: "batch"`로 고정한 internal은 돌리지 않습니다.',
      }),
    },
    {
      slot: "2",
      role: "batch",
      default: "0",
      desc: l.trans({
        en: "Runs internals and never listens. Asking for one always keeps the gateway.",
        ko: "internal만 돌리고 요청은 받지 않습니다. 하나라도 있으면 gateway가 반드시 남습니다.",
      }),
    },
    {
      slot: "3",
      role: "all",
      default: "1",
      desc: l.trans({
        en: "Serves requests and runs every internal.",
        ko: "요청 처리와 internal을 모두 맡는 범용 replica입니다.",
      }),
    },
  ];

  const replicaExampleColumns = [
    { key: "serves", label: l.trans({ en: "Requests", ko: "요청 처리" }) },
    {
      key: "batchWork",
      label: l.trans({ en: "batch internals", ko: "batch internal" }),
      caption: 'serverMode: "batch"',
    },
  ];
  const replicaExampleGroups = [
    {
      label: l.trans({ en: "Solo — one process, no gateway", ko: "solo — 프로세스 하나, gateway 없음" }),
      rows: [
        {
          name: <span className="font-sans">{l.trans({ en: "(unset)", ko: "(미설정)" })}</span>,
          desc: l.trans({
            en: 'Same as `"0,0,1"`: one all-purpose replica.',
            ko: '`"0,0,1"`과 같습니다. 범용 replica 하나입니다.',
          }),
          marks: { serves: true, batchWork: true },
        },
        {
          name: '"1,0,0"',
          desc: l.trans({ en: "One federation replica.", ko: "federation replica 하나입니다." }),
          marks: { serves: true, batchWork: false },
        },
        {
          name: '"0,0,0"',
          desc: l.trans({
            en: "Becomes one all-purpose replica. You can never ask for none.",
            ko: "범용 replica 하나로 바뀝니다. 0개를 요청할 수는 없습니다.",
          }),
          marks: { serves: true, batchWork: true },
        },
      ],
    },
    {
      label: l.trans({ en: "Gateway in front", ko: "gateway가 앞에 있음" }),
      rows: [
        {
          name: '"2"',
          desc: l.trans({
            en: "Two federation replicas. Missing slots count as zero.",
            ko: "federation replica 두 개입니다. 빠진 자리는 0으로 칩니다.",
          }),
          marks: { serves: true, batchWork: false },
        },
        {
          name: '"0,1,0"',
          desc: l.trans({
            en: "One batch replica. The gateway stays to answer health checks.",
            ko: "batch replica 하나입니다. health check에 응답하도록 gateway가 남습니다.",
          }),
          marks: { serves: false, batchWork: true },
        },
      ],
    },
  ];

  const bothSurfaces = { ssr: true, csr: true };
  const ssrOnly = { ssr: true, csr: false };
  const noSurface = { ssr: false, csr: false };
  const webSurfaceGroups = [
    {
      label: l.trans({
        en: "akan.config.ts — what the build puts in the image",
        ko: "akan.config.ts — 빌드가 이미지에 넣는 것",
      }),
      rows: [
        {
          name: "web: true",
          desc: l.trans({
            en: "The default. Both surfaces are built.",
            ko: "기본값입니다. 두 가지를 모두 빌드합니다.",
          }),
          marks: bothSurfaces,
        },
        {
          name: "web: { csr: false }",
          desc: l.trans({
            en: "Drops the mobile SPA bundle and keeps SSR.",
            ko: "모바일 SPA 번들만 빼고 SSR은 남깁니다.",
          }),
          marks: ssrOnly,
        },
        {
          name: "web: false",
          desc: l.trans({
            en: "API only: no route artifact, CSR bundle, RSC worker entrypoint or `public/`.",
            ko: "API 전용입니다. 라우트 산출물, CSR 번들, RSC worker 진입점, `public/`이 모두 빠집니다.",
          }),
          marks: noSurface,
        },
      ],
    },
    {
      label: l.trans({ en: "Container env — narrows at boot", ko: "컨테이너 env — 부팅 때 좁히기" }),
      rows: [
        {
          name: "AKAN_CSR=false",
          desc: l.trans({ en: "Takes down only the mobile SPA bundle.", ko: "모바일 SPA 번들만 내립니다." }),
          marks: ssrOnly,
        },
        {
          name: "AKAN_SSR=false",
          desc: l.trans({
            en: "Takes down the RSC worker and the render routes, and CSR with them.",
            ko: "RSC worker와 렌더 라우트를 내리고, CSR도 함께 내립니다.",
          }),
          marks: noSurface,
        },
      ],
    },
  ];

  const dockerOptionRows = [
    {
      key: "image",
      type: "string | { amd64?, arm64? }",
      default: "oven/bun:1-slim",
      desc: l.trans({
        en: "The base image. The object form picks one per architecture; a missing one uses the default.",
        ko: "베이스 이미지입니다. 객체 형태는 아키텍처마다 고르고, 빠진 아키텍처는 기본값을 씁니다.",
      }),
    },
    {
      key: "preRuns",
      type: "(string | { amd64?, arm64? })[]",
      default: "[]",
      desc: l.trans({
        en: "Commands run before `bun install`, such as a system package a native dependency needs.",
        ko: "`bun install` 전에 실행할 명령입니다. 네이티브 의존성에 필요한 시스템 패키지 설치 등이 들어갑니다.",
      }),
    },
    {
      key: "postRuns",
      type: "(string | { amd64?, arm64? })[]",
      default: "[]",
      desc: l.trans({
        en: "Commands run after `bun install`, before the app files are copied.",
        ko: "`bun install` 뒤, 앱 파일을 복사하기 전에 실행할 명령입니다.",
      }),
    },
    {
      key: "command",
      type: "string[]",
      default: '["bun", "main.js"]',
      desc: l.trans({ en: "The container's `CMD`.", ko: "컨테이너의 `CMD`입니다." }),
    },
  ];

  const nextReads = [
    {
      href: "/docs/core/runtime",
      title: l.trans({ en: "Akan Runtime", ko: "Akan 런타임" }),
      desc: l.trans({
        en: "The runtime environment variables in depth, including the logging ones.",
        ko: "로깅을 포함한 런타임 환경변수를 자세히 봅니다.",
      }),
    },
    {
      href: "/cheatsheet/dev/k8s",
      title: l.trans({ en: "Kubernetes", ko: "Kubernetes" }),
      desc: l.trans({
        en: "The same image on a cluster, with the Helm chart and its probes.",
        ko: "같은 이미지를 Helm chart와 probe로 클러스터에 올립니다.",
      }),
    },
    {
      href: "/references/cli/application#db-export",
      title: l.trans({ en: "Move Data Between Modes", ko: "모드 사이에 데이터 옮기기" }),
      desc: l.trans({
        en: "Copy an app's data from one database mode into another with `db-export` and `db-import`.",
        ko: "`db-export`와 `db-import`로 앱의 데이터를 한 데이터베이스 모드에서 다른 모드로 옮깁니다.",
      }),
    },
    {
      href: "/cheatsheet/dev/console",
      title: l.trans({ en: "Server Console", ko: "서버 콘솔" }),
      desc: l.trans({
        en: "What you can do once the console is open.",
        ko: "콘솔을 연 뒤에 할 수 있는 일을 봅니다.",
      }),
    },
    {
      href: "/cheatsheet/observability/logging",
      title: l.trans({ en: "Logging", ko: "로깅" }),
      desc: l.trans({
        en: "Reading and filtering the logs a container writes.",
        ko: "컨테이너가 남긴 로그를 읽고 거르는 방법입니다.",
      }),
    },
  ];

  return (
    <Scroll>
      <Scroll.Slide id="overview" title={l.trans({ en: "Docker", ko: "Docker" })}>
        <Docs.Title>{l.trans({ en: "Docker", ko: "Docker" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Say you have a built app and a small machine at the edge of a factory floor. It has to come back after a power cut with its data intact, and you need to see why it fell over.",
              ko: "빌드된 앱 하나와, 공장 한쪽에 놓인 작은 기기가 있다고 해 봅시다. 정전 뒤에도 데이터를 그대로 지닌 채 다시 올라와야 하고, 왜 멈췄는지도 볼 수 있어야 합니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "For a small edge server, start with one Akan app container. Plan around these image defaults:",
              ko: "이런 작은 edge 서버는 Akan 앱 컨테이너 하나로 시작합니다. 이미지의 기본값은 다음과 같습니다.",
            })}
          </div>
          <Docs.IntroTable
            type={l.trans({ en: "Image default", ko: "이미지 기본값" })}
            descLabel={l.trans({ en: "What it means for you", ko: "그래서 할 일" })}
            items={imageDefaultRows}
          />
          <div>
            {l.trans({
              en: (
                <span>
                  <strong>Why file logging is off:</strong> a container's writable layer is thrown away with the
                  container, so the files would only fill the disk. stdout is the collection path.
                </span>
              ),
              ko: (
                <span>
                  <strong>파일 로깅을 끈 이유:</strong> 컨테이너의 쓰기 레이어는 컨테이너와 함께 사라지므로, 파일은
                  디스크만 채웁니다. 로그는 stdout으로 수집합니다.
                </span>
              ),
            })}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="compose" title={l.trans({ en: "Minimal Compose", ko: "최소 compose 파일" })}>
        <Docs.Title>{l.trans({ en: "Minimal Compose", ko: "최소 compose 파일" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  A simplified compose file for one app. Replace <code>myapp</code> and the image name with your own:
                </span>
              ),
              ko: (
                <span>
                  앱 하나를 위한 단순한 compose 파일입니다. <code>myapp</code>과 이미지 이름을 자기 앱에 맞게 바꾸세요.
                </span>
              ),
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="docker-compose.yaml"
            code={`services:
  myapp:
    image: registry.mydomain.com/myorg/myapp:latest
    container_name: myapp
    restart: unless-stopped
    ports:
      - "8282:8282"
    environment:
      AKAN_PUBLIC_APP_NAME: myapp
      AKAN_PUBLIC_REPO_NAME: myorg
      AKAN_PUBLIC_SERVE_DOMAIN: example.com
      AKAN_PUBLIC_ENV: main
      AKAN_PUBLIC_OPERATION_MODE: edge
      AKAN_DATABASE_MODE: single
      AKAN_REPLICA: "0,0,1"
      AKAN_SQLITE_DIR: /workspace/sqlite
      AKAN_LOG_TO_FILE: "1"
      AKAN_LOG_DIR: /workspace/logs
    volumes:
      - ./sqlite:/workspace/sqlite
      - ./logs:/workspace/logs`}
          />
          <ul className="my-4 list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      <code>restart: unless-stopped</code>
                    </strong>{" "}
                    brings the container back after a power cut or a reboot.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>restart: unless-stopped</code>
                    </strong>
                    는 정전이나 재부팅 뒤에 컨테이너를 다시 띄웁니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Two volumes</strong> keep the sqlite files and the log files on the host.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>볼륨 두 개</strong>가 sqlite 파일과 로그 파일을 호스트에 남깁니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      <code>AKAN_PUBLIC_OPERATION_MODE: edge</code>
                    </strong>{" "}
                    marks an on-premise box. The image default is <code>cloud</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>AKAN_PUBLIC_OPERATION_MODE: edge</code>
                    </strong>
                    는 온프레미스 기기라는 표시입니다. 이미지 기본값은 <code>cloud</code>입니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      <code>AKAN_DATABASE_MODE: single</code>
                    </strong>{" "}
                    keeps every piece of data in the SQLite files on the volume. You may leave it out when the app
                    declares only <code>single</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>AKAN_DATABASE_MODE: single</code>
                    </strong>
                    은 모든 데이터를 볼륨의 SQLite 파일에 둡니다. 앱이 <code>single</code>만 선언했다면 빼도 됩니다.
                  </span>
                ),
              })}
            </li>
          </ul>
          <Docs.Alert type="warning">
            {l.trans({
              en: (
                <span>
                  <strong>The container side of the port is 8282, not 80.</strong> Nothing in the image listens on 80,
                  because <code>AkanApp</code> binds <code>PORT</code>. Map <code>"8282:8282"</code>, or set{" "}
                  <code>PORT: 80</code> as well.
                </span>
              ),
              ko: (
                <span>
                  <strong>포트의 컨테이너 쪽은 80이 아니라 8282입니다.</strong> <code>AkanApp</code>은 <code>PORT</code>
                  에 바인딩하므로 이미지 안에서 80 포트로 요청을 받는 프로세스는 없습니다. <code>"8282:8282"</code>로
                  매핑하거나 <code>PORT: 80</code>을 함께 주세요.
                </span>
              ),
            })}
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="env" title={l.trans({ en: "Container Env", ko: "컨테이너 환경변수" })}>
        <Docs.Title>{l.trans({ en: "Container Env", ko: "컨테이너 환경변수" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "The image already carries the build's values, so a container sets only the ones that differ.",
              ko: "이미지에는 빌드 때의 값이 이미 들어 있습니다. 그래서 컨테이너에는 달라지는 값만 주면 됩니다.",
            })}
          </div>
          <Docs.SubSubTitle>
            {l.trans({ en: "Required — set by the build", ko: "필수 — 빌드가 채워 둠" })}
          </Docs.SubSubTitle>
          <div>
            {l.trans({
              en: "The app does not start without these three.",
              ko: "이 셋이 없으면 앱이 뜨지 않습니다.",
            })}
          </div>
          <Docs.OptionTable items={requiredEnvRows} />
          <Docs.SubSubTitle>{l.trans({ en: "Commonly changed", ko: "자주 바꾸는 값" })}</Docs.SubSubTitle>
          <Docs.OptionTable items={runtimeEnvRows} />
          <Docs.SubSubTitle>{l.trans({ en: "Where the data lives", ko: "데이터가 있는 곳" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: (
                <span>
                  These say where the data and the uploads live. Set on the container, each wins over the same value
                  bundled from <code>env.server.ts</code>, so one image serves every deployment.
                </span>
              ),
              ko: (
                <span>
                  데이터와 업로드 파일이 어디 있는지 정합니다. 컨테이너에 주면 <code>env.server.ts</code>에서 번들된
                  같은 값보다 우선하므로, 이미지 하나로 모든 배포를 돌릴 수 있습니다.
                </span>
              ),
            })}
          </div>
          <Docs.OptionTable items={dataEnvRows} />
          <ul className="my-4 list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      Behind PgBouncer in transaction mode, also add <code>&amp;prepare=false</code>
                    </strong>{" "}
                    to that query string.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      transaction 모드의 PgBouncer 뒤에서는 <code>&amp;prepare=false</code>
                    </strong>
                    도 그 쿼리 문자열에 더합니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Postgres also takes separate parts.</strong> Without a URL it reads{" "}
                    <code>POSTGRES_HOST</code>, <code>POSTGRES_PORT</code>, <code>POSTGRES_DATABASE</code> (or{" "}
                    <code>POSTGRES_DB</code>), <code>POSTGRES_USER</code> and <code>POSTGRES_PASSWORD</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>Postgres는 값을 나눠서 줄 수도 있습니다.</strong> URL이 없으면 <code>POSTGRES_HOST</code>,{" "}
                    <code>POSTGRES_PORT</code>, <code>POSTGRES_DATABASE</code>(또는 <code>POSTGRES_DB</code>),{" "}
                    <code>POSTGRES_USER</code>, <code>POSTGRES_PASSWORD</code>를 읽습니다.
                  </span>
                ),
              })}
            </li>
          </ul>
          <Docs.Alert type="info">
            {l.trans({
              en: (
                <span>
                  <strong>
                    <code>USE_AKANJS_PKGS</code> is not a container variable.
                  </strong>{" "}
                  It is a workspace-development flag the CLI reads, and setting it in a deployment does nothing.
                </span>
              ),
              ko: (
                <span>
                  <strong>
                    <code>USE_AKANJS_PKGS</code>는 컨테이너 변수가 아닙니다.
                  </strong>{" "}
                  CLI가 읽는 workspace 개발용 플래그라서, 배포에 설정해도 아무 일도 일어나지 않습니다.
                </span>
              ),
            })}
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="replica" title={l.trans({ en: "Scale With AKAN_REPLICA", ko: "AKAN_REPLICA로 확장" })}>
        <Docs.Title>{l.trans({ en: "Scale With AKAN_REPLICA", ko: "AKAN_REPLICA로 확장" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  <code>AKAN_REPLICA</code> is three counts separated by commas, and each position is a role. It decides
                  how many processes run and whether a gateway sits in front of them.
                </span>
              ),
              ko: (
                <span>
                  <code>AKAN_REPLICA</code>는 쉼표로 구분한 세 개의 수이고, 자리마다 역할이 정해져 있습니다. 프로세스를
                  몇 개 띄울지, 그 앞에 gateway를 둘지를 함께 정합니다.
                </span>
              ),
            })}
          </div>
          <Docs.SubSubTitle>{l.trans({ en: "Words used on this page", ko: "이 페이지에서 쓰는 말" })}</Docs.SubSubTitle>
          <Docs.IntroTable type={l.trans({ en: "Term", ko: "용어" })} items={replicaTermRows} />
          <Docs.SubSubTitle>{l.trans({ en: "The three slots", ko: "세 자리" })}</Docs.SubSubTitle>
          <Docs.Table
            columns={[
              { key: "slot", label: l.trans({ en: "Slot", ko: "자리" }), code: true },
              { key: "role", label: l.trans({ en: "Role", ko: "역할" }), code: true },
              { key: "default", label: l.trans({ en: "Default", ko: "기본값" }), code: true },
              { key: "desc", label: l.trans({ en: "What it does", ko: "하는 일" }) },
            ]}
            rows={replicaSlotRows}
            stacked
          />
          <Docs.SubSubTitle>{l.trans({ en: "Value examples", ko: "값 예시" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: (
                <span>
                  Whether the container answers requests, and whether an internal pinned to{" "}
                  <code>serverMode: "batch"</code> runs in it:
                </span>
              ),
              ko: (
                <span>
                  컨테이너가 요청을 처리하는지, <code>serverMode: "batch"</code>로 고정한 internal이 도는지를 값별로
                  정리했습니다.
                </span>
              ),
            })}
          </div>
          <Docs.Matrix
            type="AKAN_REPLICA"
            columns={replicaExampleColumns}
            groups={replicaExampleGroups}
            markLabel={l.trans({ en: "handled", ko: "처리함" })}
            emptyLabel={l.trans({ en: "not handled", ko: "처리 안 함" })}
          />
          <Docs.SubSubTitle>{l.trans({ en: "Solo or gateway", ko: "solo 또는 gateway" })}</Docs.SubSubTitle>
          <Docs.Flow
            title={l.trans({
              en: "One process, or a gateway and its children",
              ko: "프로세스 하나, 또는 gateway와 자식 프로세스",
            })}
            direction="TB"
            nodes={{
              decide: {
                label: l.trans({ en: "total = 1 and batch = 0?", ko: "total = 1이고 batch = 0?" }),
                tone: "info",
              },
              solo: {
                label: l.trans({ en: "Solo: the container's only process", ko: "Solo: 컨테이너의 유일한 프로세스" }),
                lines: [l.trans({ en: "binds PORT", ko: "PORT에 바인딩" })],
              },
              gateway: { label: l.trans({ en: "Gateway: binds PORT and proxies", ko: "Gateway: PORT를 잡고 프록시" }) },
              soloRsc: { label: l.trans({ en: "RSC worker", ko: "RSC worker" }) },
              federation: {
                label: l.trans({ en: "federation child", ko: "federation 자식" }),
                lines: ["unix socket"],
              },
              batch: {
                label: l.trans({ en: "batch child", ko: "batch 자식" }),
                lines: [l.trans({ en: "never listens", ko: "요청을 받지 않음" })],
              },
              gatewayRsc: { label: l.trans({ en: "RSC worker", ko: "RSC worker" }) },
            }}
            edges={[
              ["decide", "solo", { label: l.trans({ en: "yes", ko: "예" }) }],
              [
                "decide",
                "gateway",
                {
                  label: l.trans({
                    en: "no · AKAN_SOLO=false · akan start",
                    ko: "아니오 · AKAN_SOLO=false · akan start",
                  }),
                },
              ],
              ["solo", "soloRsc"],
              ["gateway", "federation"],
              ["gateway", "batch"],
              ["federation", "gatewayRsc"],
            ]}
            emphasis={["solo"]}
          />
          <ul className="my-4 list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Solo skips the gateway.</strong> With one request-serving replica there is nothing to
                    balance, so the replica runs in the container's only process with no proxy hop.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>solo는 gateway를 건너뜁니다.</strong> 요청 처리 replica가 하나면 나눌 대상이 없으므로, 그
                    replica가 프록시 홉 없이 컨테이너의 유일한 프로세스로 돕니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Bringing the gateway back.</strong> Set <code>AKAN_SOLO=false</code> (or <code>0</code>
                    ); <code>true</code> does nothing. <code>akan start</code> and a <code>replica</code> passed to{" "}
                    <code>new AkanApp(...)</code> keep it too.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>gateway 되살리기.</strong> <code>AKAN_SOLO=false</code>(또는 <code>0</code>)를 주세요.{" "}
                    <code>true</code>는 아무 효과가 없습니다. <code>akan start</code>와, <code>new AkanApp(...)</code>에{" "}
                    <code>replica</code>를 넘긴 경우에도 gateway가 남습니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Solo answers probes itself.</strong> <code>/_akan/app/health</code>,{" "}
                    <code>/_akan/app/metrics</code> and <code>/_akan/bench/ping</code> come back in the gateway's shape.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>solo는 probe에 직접 응답합니다.</strong> <code>/_akan/app/health</code>,{" "}
                    <code>/_akan/app/metrics</code>, <code>/_akan/bench/ping</code>이 gateway와 같은 형태로 돌아옵니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Nothing supervises a solo process</strong> but the orchestrator's probes.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>solo 프로세스를 감시하는 것</strong>은 오케스트레이터의 probe뿐입니다.
                  </span>
                ),
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide
        id="multiple-host"
        title={l.trans({ en: "Several Containers On One Host", ko: "한 호스트에 컨테이너 여러 개" })}
      >
        <Docs.Title>{l.trans({ en: "Several Containers On One Host", ko: "한 호스트에 컨테이너 여러 개" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  When one container is not enough, run several copies on the same host in the <code>multiple</code>{" "}
                  database mode. They open one SQLite file on a host volume and share one Redis for the cache, queue and
                  pubsub.
                </span>
              ),
              ko: (
                <span>
                  컨테이너 하나로 모자라면 같은 호스트에서 여러 개를 <code>multiple</code> 데이터베이스 모드로 띄웁니다.
                  호스트 볼륨의 SQLite 파일 하나를 함께 열고, 캐시·큐·pubsub은 Redis 하나를 같이 씁니다.
                </span>
              ),
            })}
          </div>
          <Docs.Table columns={modeColumns} rows={modeRows} stacked />
          <div>
            {l.trans({
              en: (
                <span>
                  The app's build has to declare the mode, as in <code>{'database: { modes: ["multiple"] }'}</code> in{" "}
                  <code>akan.config.ts</code>. Then run the image with a compose file like this:
                </span>
              ),
              ko: (
                <span>
                  앱의 빌드가 이 모드를 선언해야 합니다. 예를 들어 <code>akan.config.ts</code>에{" "}
                  <code>{'database: { modes: ["multiple"] }'}</code>를 적습니다. 그다음 이런 compose 파일로 이미지를
                  띄웁니다:
                </span>
              ),
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="docker-compose.yaml"
          code={`services:
  redis:
    image: redis:8
  myapp:
    image: registry.mydomain.com/myorg/myapp:latest
    deploy:
      replicas: 3
    environment:
      AKAN_DATABASE_MODE: multiple
      REDIS_URI: redis://redis:6379
      SQLITE_DATABASE_PATH: /data/myapp.db
      AKAN_STORAGE_SHARED: "true"
    volumes:
      - app-data:/data
      - app-files:/workspace/local
volumes:
  app-data:
  app-files:`}
        />
        <Docs.Description>
          <ul className="my-4 list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>One database file for every replica.</strong> <code>SQLITE_DATABASE_PATH</code> points each
                    container at the same file on the <code>app-data</code> volume.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>모든 replica가 데이터베이스 파일 하나를 씁니다.</strong> <code>SQLITE_DATABASE_PATH</code>가
                    컨테이너마다 <code>app-data</code> 볼륨의 같은 파일을 가리킵니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      <code>REDIS_URI</code> is required.
                    </strong>{" "}
                    The cache, queue and pubsub live in that Redis, and a deployed app has no fallback for it.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>REDIS_URI</code>는 꼭 필요합니다.
                    </strong>{" "}
                    캐시, 큐, pubsub이 그 Redis에 있고, 배포된 앱에는 대신 쓸 기본값이 없습니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Uploads go on a volume every replica mounts.</strong> <code>app-files</code> sits on{" "}
                    <code>/workspace/local</code>, and <code>AKAN_STORAGE_SHARED</code> says so. Without it or object
                    storage, the app refuses to keep files on one container's disk.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>업로드 파일은 모든 replica가 마운트한 볼륨에 둡니다.</strong> <code>app-files</code>를{" "}
                    <code>/workspace/local</code>에 붙이고 <code>AKAN_STORAGE_SHARED</code>로 알립니다. 이것도 오브젝트
                    스토리지도 없으면 앱은 컨테이너 하나의 디스크에 파일을 두기를 거부합니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>A reverse proxy in front balances the replicas.</strong> They publish no port of their own.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>앞단의 리버스 프록시가 replica들에 요청을 나눕니다.</strong> replica는 따로 포트를 게시하지
                    않습니다.
                  </span>
                ),
              })}
            </li>
          </ul>
          <Docs.Alert type="warning">
            {l.trans({
              en: (
                <span>
                  <strong>Keep the SQLite file on the host's own disk.</strong> Containers on one host share it through
                  a named volume or a bind mount, but not over NFS or another network filesystem. Several hosts need{" "}
                  <code>cluster</code>.
                </span>
              ),
              ko: (
                <span>
                  <strong>SQLite 파일은 호스트 자신의 디스크에 둡니다.</strong> 같은 호스트의 컨테이너는 named
                  volume이나 bind mount로 이 파일을 함께 쓸 수 있지만, NFS 같은 네트워크 파일시스템으로는 안 됩니다.
                  호스트가 여럿이면 <code>cluster</code>를 씁니다.
                </span>
              ),
            })}
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="web-surface" title={l.trans({ en: "Trim The Web Surface", ko: "웹 기능 덜어내기" })}>
        <Docs.Title>{l.trans({ en: "Trim The Web Surface", ko: "웹 기능 덜어내기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "A deployment that only answers API calls does not need the web half. Leave it out of the build to shrink the image, or turn it off at boot to shrink the processes.",
              ko: "API만 응답하는 배포에는 웹 절반이 필요 없습니다. 빌드에서 빼면 이미지가 줄고, 부팅 때 끄면 프로세스가 줄어듭니다.",
            })}
          </div>
          <Docs.Matrix
            type={l.trans({ en: "Setting", ko: "설정" })}
            columns={[
              { key: "ssr", label: "SSR" },
              { key: "csr", label: "CSR" },
            ]}
            groups={webSurfaceGroups}
            markLabel={l.trans({ en: "served", ko: "제공" })}
            emptyLabel={l.trans({ en: "off", ko: "꺼짐" })}
          />
          <ul className="my-4 list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>The env only narrows.</strong> <code>false</code> or <code>0</code> turns a surface off, and
                    nothing turns back on a surface the build left out.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>env는 좁히기만 합니다.</strong> <code>false</code>나 <code>0</code>으로 끌 수는 있지만,
                    빌드에서 뺀 것을 다시 켤 수는 없습니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>There is no CSR without SSR.</strong> The CSR bundle inlines the stylesheet the SSR build
                    compiles, so <code>AKAN_SSR=false</code> takes CSR down whatever <code>AKAN_CSR</code> says.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>SSR 없는 CSR은 없습니다.</strong> CSR 번들은 SSR 빌드가 만든 스타일시트를 품고 있으므로,{" "}
                    <code>AKAN_CSR</code>이 무엇이든 <code>AKAN_SSR=false</code>는 CSR까지 내립니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      <code>web: false</code> shrinks the image.
                    </strong>{" "}
                    Measured on this docs app, the image went from 86MB to 6.2MB.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>web: false</code>는 이미지를 줄입니다.
                    </strong>{" "}
                    이 문서 앱에서 재 보니 86MB가 6.2MB로 줄었습니다.
                  </span>
                ),
              })}
            </li>
          </ul>
          <div>
            {l.trans({
              en: "An API-only container with one request-serving replica:",
              ko: "요청 처리 replica 하나만 도는 API 전용 컨테이너는 이렇게 띄웁니다.",
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="Terminal"
            language="bash"
            code={`docker run -e AKAN_SSR=false -e AKAN_REPLICA="1,0,0" -p 8282:8282 myapp`}
          />
          <ul className="my-4 list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      <code>AKAN_SSR=false</code> drops the RSC worker process.
                    </strong>{" "}
                    On this docs app, 350MB across three processes became 120MB across two.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>AKAN_SSR=false</code>는 RSC worker 프로세스를 없앱니다.
                    </strong>{" "}
                    이 문서 앱에서는 프로세스 3개 350MB가 2개 120MB로 줄었습니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      <code>"1,0,0"</code> is one federation replica,
                    </strong>{" "}
                    so an internal pinned to <code>serverMode: "batch"</code> does not run in this container.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>"1,0,0"</code>은 federation replica 하나입니다.
                    </strong>{" "}
                    <code>serverMode: "batch"</code>로 고정한 internal은 이 컨테이너에서 돌지 않습니다.
                  </span>
                ),
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="dockerfile" title={l.trans({ en: "Customize The Image", ko: "이미지 구성하기" })}>
        <Docs.Title>{l.trans({ en: "Customize The Image", ko: "이미지 구성하기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  You do not write a Dockerfile; the <code>docker</code> key in <code>akan.config.ts</code> shapes the
                  image. The image installs only <code>ca-certificates</code> and <code>tzdata</code>, so an app that
                  needs ffmpeg or Chromium has to say so.
                </span>
              ),
              ko: (
                <span>
                  Dockerfile은 직접 쓰지 않습니다. <code>akan.config.ts</code>의 <code>docker</code> 키로 이미지를
                  정합니다. 이미지가 설치하는 것은 <code>ca-certificates</code>와 <code>tzdata</code>뿐이라서,
                  ffmpeg이나 Chromium이 필요한 앱은 직접 적어야 합니다.
                </span>
              ),
            })}
          </div>
          <Docs.OptionTable items={dockerOptionRows} />
          <div>
            {l.trans({
              en: "An app that needs ffmpeg, plus one step that runs only on arm64:",
              ko: "ffmpeg이 필요하고, arm64에서만 도는 단계가 하나 있는 앱의 예시입니다.",
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/myapp/akan.config.ts"
            code={`import type { AppConfig } from "akanjs";

const config: AppConfig = {
  docker: {
    preRuns: ["apt-get update && apt-get install -y --no-install-recommends ffmpeg"],
    postRuns: [{ arm64: "echo aarch64 image" }],
  },
  assets: {
    pruneFonts: true,
    keepFonts: ["fonts/Assistant-*.woff2"],
  },
};

export default config;`}
          />
          <ul className="my-4 list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      Write the command, not <code>RUN</code>.
                    </strong>{" "}
                    Akan adds <code>RUN</code> to each step, and the object form runs only on the matching{" "}
                    <code>TARGETARCH</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>RUN</code> 없이 명령만 적습니다.
                    </strong>{" "}
                    Akan이 단계마다 <code>RUN</code>을 붙이고, 객체 형태는 <code>TARGETARCH</code>가 맞을 때만
                    실행합니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Libs add their own steps.</strong> Every app that mounts a lib gets its steps first, with
                    duplicates removed. A lib never picks the base image or the command.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>lib도 자기 단계를 보탭니다.</strong> lib을 마운트한 앱은 그 단계를 앞쪽에 중복 없이
                    물려받습니다. lib이 베이스 이미지나 command를 고르지는 않습니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Unused fonts are trimmed.</strong> <code>assets.pruneFonts</code> is on by default and trims
                    them from the <code>dist</code> copy of <code>public/</code>; source trees are never touched.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>안 쓰는 폰트는 덜어냅니다.</strong> <code>assets.pruneFonts</code>는 기본으로 켜져 있고,{" "}
                    <code>dist</code>에 복사된 <code>public/</code>에서만 덜어냅니다. 원본 트리는 건드리지 않습니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      <code>keepFonts</code> is relative to its own <code>public/</code>.
                    </strong>{" "}
                    The glob is read against the declaring app's or lib's folder. Under <code>assets</code>, a lib may
                    set only this key.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>keepFonts</code>는 자기 <code>public/</code> 기준입니다.
                    </strong>{" "}
                    glob은 그것을 선언한 앱이나 lib의 폴더 기준입니다. lib은 <code>assets</code> 중 이 키만 정할 수
                    있습니다.
                  </span>
                ),
              })}
            </li>
          </ul>
          <Docs.Alert type="warning">
            {l.trans({
              en: (
                <span>
                  <strong>A Dockerfile string drops every lib step.</strong> Writing <code>docker</code> as a whole
                  Dockerfile string uses it verbatim, and the steps libs contributed silently disappear. Use the object
                  form unless you really need the whole file.
                </span>
              ),
              ko: (
                <span>
                  <strong>Dockerfile 문자열은 lib 단계를 모두 버립니다.</strong> <code>docker</code>에 Dockerfile 전체를
                  문자열로 쓰면 그대로 쓰이고, lib이 보탠 단계는 조용히 사라집니다. 파일 전체가 꼭 필요한 게 아니라면
                  객체 형태를 쓰세요.
                </span>
              ),
            })}
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="console" title={l.trans({ en: "Open Console", ko: "콘솔 열기" })}>
        <Docs.Title>{l.trans({ en: "Open Console", ko: "콘솔 열기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  The image ships <code>console.js</code> next to <code>main.js</code>, so you can open an operator
                  console without creating files in the container. Set <code>AKAN_CONSOLE=1</code> on the exec command
                  only:
                </span>
              ),
              ko: (
                <span>
                  이미지에는 <code>main.js</code> 옆에 <code>console.js</code>가 들어 있어서, 컨테이너 안에 파일을
                  만들지 않고도 운영 콘솔을 열 수 있습니다. <code>AKAN_CONSOLE=1</code>은 exec 명령에만 주세요.
                </span>
              ),
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="Terminal"
            language="bash"
            code="docker exec -it myapp sh -lc 'AKAN_CONSOLE=1 bun console.js'"
          />
          <ul className="my-4 list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Why the flag.</strong> The console refuses to open when <code>AKAN_PUBLIC_ENV</code> is{" "}
                    <code>main</code>, the operation mode is <code>cloud</code> or <code>edge</code>, or{" "}
                    <code>NODE_ENV</code> is <code>production</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>플래그가 필요한 이유.</strong> <code>AKAN_PUBLIC_ENV</code>가 <code>main</code>이거나, 운영
                    모드가 <code>cloud</code>·<code>edge</code>이거나, <code>NODE_ENV</code>가 <code>production</code>
                    이면 콘솔이 열리지 않습니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>So the image always needs it,</strong> since the image sets <code>NODE_ENV=production</code>{" "}
                    and <code>AKAN_PUBLIC_OPERATION_MODE=cloud</code>. Keep it out of the compose file so only the exec
                    opens a console.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>그래서 이미지에서는 늘 필요합니다.</strong> 이미지가 <code>NODE_ENV=production</code>과{" "}
                    <code>AKAN_PUBLIC_OPERATION_MODE=cloud</code>를 넣어 두기 때문입니다. compose 파일에는 넣지 말고,
                    exec 한 번에만 콘솔이 열리게 하세요.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>It does not double the app's background work.</strong> The console process starts services
                    but runs no internal jobs or queue workers, so the running container keeps them.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>앱의 백그라운드 작업을 두 번 돌리지 않습니다.</strong> 콘솔 프로세스는 서비스는 띄우지만
                    internal 작업과 큐 worker는 돌리지 않으므로, 그 일은 실행 중인 컨테이너가 계속 맡습니다.
                  </span>
                ),
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="tips" title={l.trans({ en: "Tips", ko: "꿀팁" })}>
        <Docs.Title>{l.trans({ en: "Tips", ko: "꿀팁" })}</Docs.Title>
        <Docs.Description>
          <ul className="my-4 list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Keep the first compose file boring.</strong> Add services only when the app really needs
                    them.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>처음 compose 파일은 단순하게.</strong> 앱이 정말 필요로 할 때만 서비스를 더하세요.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Back up the sqlite volume before replacing edge hardware.</strong> It holds{" "}
                    <code>{"<app>-<env>.db"}</code> and <code>{"<app>-<env>_solid.db"}</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>edge 장비를 바꾸기 전에 sqlite 볼륨을 백업하세요.</strong> 그 안에{" "}
                    <code>{"<app>-<env>.db"}</code>와 <code>{"<app>-<env>_solid.db"}</code>가 있습니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>A restart loop shows up in stdout.</strong> Read <code>docker logs myapp</code>, not the
                    mounted folder: file logging is off in the image unless you turned it back on.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>재시작이 반복되면 stdout을 보세요.</strong> 마운트한 폴더가 아니라{" "}
                    <code>docker logs myapp</code>을 읽으세요. 직접 켜지 않았다면 이미지의 파일 로깅은 꺼져 있습니다.
                  </span>
                ),
              })}
            </li>
          </ul>
          <Docs.SubSubTitle>{l.trans({ en: "Read next", ko: "이어서 읽기" })}</Docs.SubSubTitle>
          <Docs.LinkGrid items={nextReads} />
        </Docs.Description>
      </Scroll.Slide>
      <DocsToc />
    </Scroll>
  );
});
