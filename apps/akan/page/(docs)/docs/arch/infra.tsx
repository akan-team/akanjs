import { usePage } from "@apps/akan/client";
import { badgeRecipe, Code, cardGridRecipe, Divider, Docs, DocsToc, panelRecipe } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { page } from "akanjs/client";

export default page().render(() => {
  const { l } = usePage();

  const chip = "rounded-md bg-muted/60 px-2 py-0.5 font-mono text-foreground/80 text-xs";

  const areaRows = [
    {
      name: "Local",
      desc: l.trans({
        en: "Your own machine, for fast iteration: MVP screens, feature prototypes and debugging.",
        ko: "내 PC입니다. MVP 화면, 기능 프로토타입, 디버깅처럼 빠르게 만들고 확인할 때 씁니다.",
      }),
    },
    {
      name: "Cloud Cluster",
      desc: l.trans({
        en: "A Kubernetes runtime for shared team environments and production-like workloads.",
        ko: "팀 공용 환경과 운영에 가까운 워크로드를 위한 Kubernetes 기반 실행 환경입니다.",
      }),
    },
    {
      name: "Master",
      desc: l.trans({
        en: "The deployment control area: CI/CD, environment files, secrets and release automation.",
        ko: "배포 제어 영역입니다. CI/CD, 환경 파일, 비밀값, 릴리스 자동화를 관리합니다.",
      }),
    },
  ];

  const termRows = [
    {
      name: "container",
      desc: l.trans({
        en: "The app packaged with everything it needs, so it starts the same way on any server.",
        ko: "앱과 실행에 필요한 것을 한 묶음으로 포장한 것입니다. 어느 서버에서나 같은 방식으로 실행됩니다.",
      }),
    },
    {
      name: "pod",
      desc: l.trans({
        en: "Kubernetes's unit of running: one or more containers placed together on one server (a node).",
        ko: "Kubernetes가 실행하는 단위입니다. 서버(node) 하나에 함께 올라가는 컨테이너 한 개 이상의 묶음입니다.",
      }),
    },
    {
      name: "Ingress",
      desc: l.trans({
        en: "The cluster's front door. It takes outside traffic for a domain and routes it inward.",
        ko: "클러스터의 정문입니다. 도메인으로 들어온 외부 트래픽을 받아 안쪽으로 보냅니다.",
      }),
    },
    {
      name: "Service",
      desc: l.trans({
        en: "A stable address inside the cluster that forwards to whichever pods run the app.",
        ko: "클러스터 안의 고정 주소입니다. 앱을 실행 중인 pod로 요청을 넘겨 줍니다.",
      }),
    },
    {
      name: "chart",
      desc: l.trans({
        en: "A Helm package of Kubernetes manifests. The one Akan ships lives in infra/app.",
        ko: "Kubernetes 매니페스트를 묶은 Helm 패키지입니다. Akan이 제공하는 차트는 infra/app에 있습니다.",
      }),
    },
    {
      name: "Secret",
      desc: l.trans({
        en: "A Kubernetes object that hands private values, such as database URLs, to pods as env vars.",
        ko: "데이터베이스 URL 같은 비공개 값을 pod에 환경변수로 넘겨 주는 Kubernetes 객체입니다.",
      }),
    },
    {
      name: ["ReadWriteOnce", "ReadWriteMany"],
      desc: l.trans({
        en: "Volume access modes: one node mounts the first, pods on many nodes share the second.",
        ko: "볼륨 접근 모드입니다. 앞의 것은 노드 하나만 마운트하고, 뒤의 것은 여러 노드의 pod가 함께 씁니다.",
      }),
    },
    {
      name: "WAL",
      desc: l.trans({
        en: "SQLite's write-ahead log mode, which lets reads keep going while a write is in progress.",
        ko: "SQLite의 write-ahead log 모드입니다. 쓰기가 진행되는 동안에도 읽기가 계속될 수 있게 합니다.",
      }),
    },
  ];

  const situations = [
    {
      title: l.trans({ en: "MVP or feature prototype", ko: "MVP 또는 기능 프로토타입" }),
      pick: l.trans({ en: "Local", ko: "로컬" }),
      desc: l.trans({
        en: "Use local development first. Keep the setup small until the product needs shared data, shared testing, or deployment automation.",
        ko: "먼저 로컬 개발을 사용합니다. 제품에 공용 데이터, 팀 테스트, 배포 자동화가 필요해질 때까지 구성을 작게 유지합니다.",
      }),
    },
    {
      title: l.trans({ en: "Team QA or staging", ko: "팀 QA 또는 스테이징" }),
      pick: l.trans({ en: "Cloud · debug / develop", ko: "클라우드 · debug / develop" }),
      desc: l.trans({
        en: "Use cloud deployment with debug or develop environments so the team can test the same service together.",
        ko: "debug 또는 develop 환경의 클라우드 배포를 사용해 팀이 같은 서비스를 함께 검증할 수 있게 합니다.",
      }),
    },
    {
      title: l.trans({ en: "Production service", ko: "운영 서비스" }),
      pick: l.trans({ en: "Cloud · main", ko: "클라우드 · main" }),
      desc: l.trans({
        en: "Use the main branch of the same cloud deployment. The chart runs one pod in single mode; before traffic outgrows it, move that branch to cluster mode with your own Postgres and Redis.",
        ko: "같은 클라우드 배포의 main branch를 사용합니다. 차트는 single 모드에서 pod 하나를 실행하므로, 트래픽이 그 한계를 넘기 전에 직접 준비한 Postgres와 Redis로 그 branch를 cluster 모드로 옮깁니다.",
      }),
    },
  ];

  const requestRows = [
    {
      name: "Page",
      desc: l.trans({
        en: "An SSR or CSR page response for browser users.",
        ko: "브라우저 사용자를 위한 SSR 또는 CSR 페이지 응답입니다.",
      }),
    },
    {
      name: "API",
      desc: l.trans({
        en: "A business operation, run through signal and service logic.",
        ko: "signal과 service 로직을 거치는 비즈니스 작업입니다.",
      }),
    },
    {
      name: "WebSocket",
      desc: l.trans({
        en: "Realtime updates over a client connection that stays open.",
        ko: "계속 열려 있는 클라이언트 연결로 주고받는 실시간 업데이트입니다.",
      }),
    },
    {
      name: "Asset",
      desc: l.trans({
        en: "Static files, client bundles, images and generated output, served as files.",
        ko: "정적 파일, 클라이언트 번들, 이미지, 생성 산출물을 파일 그대로 응답합니다.",
      }),
    },
  ];

  const modeColumns = [
    { key: "mode", label: l.trans({ en: "Mode", ko: "모드" }), code: true },
    { key: "database", label: l.trans({ en: "Database", ko: "데이터베이스" }) },
    { key: "runs", label: l.trans({ en: "Where it runs", ko: "실행 위치" }) },
    { key: "queue", label: l.trans({ en: "Cache · queue · pubsub", ko: "캐시 · 큐 · PubSub" }) },
  ];
  const modeRows = [
    {
      mode: "single",
      database: l.trans({ en: "One SQLite file", ko: "SQLite 파일 하나" }),
      queue: l.trans({
        en: "SQLite files: a key-value cache, and a queue and pubsub sped up by Bun IPC",
        ko: "SQLite 파일 기반의 키-값 캐시, 그리고 Bun IPC로 가속한 큐와 PubSub",
      }),
      runs: l.trans({ en: "One container", ko: "컨테이너 하나" }),
    },
    {
      mode: "multiple",
      database: l.trans({
        en: "One SQLite file (WAL) on a host volume that every container opens",
        ko: "모든 컨테이너가 여는, 호스트 볼륨의 SQLite 파일(WAL) 하나",
      }),
      queue: "Redis",
      runs: l.trans({ en: "Several containers on one host", ko: "호스트 한 대의 여러 컨테이너" }),
    },
    {
      mode: "cluster",
      database: "Postgres",
      queue: "Redis",
      runs: l.trans({ en: "Several servers", ko: "여러 서버" }),
    },
  ];
  const modeUseRows = [
    {
      name: "single",
      desc: (
        <>
          <div>
            {l.trans({
              en: "The best start for MVPs, internal tools, admin pages, content sites and small-to-medium services.",
              ko: "MVP, 초기 내부 도구, 관리자 화면, 콘텐츠 사이트, 많은 중소규모 서비스의 출발점으로 가장 적합합니다.",
            })}
          </div>
          <div className="font-medium text-foreground">
            →{" "}
            {l.trans({
              en: "Enough for most products under roughly 10k DAU, especially with WAL mode.",
              ko: "WAL 모드 기준으로 DAU 약 1만 명 이하의 웬만한 제품에는 충분한 성능입니다.",
            })}
          </div>
        </>
      ),
    },
    {
      name: "multiple",
      desc: (
        <>
          <div>
            {l.trans({
              en: "When one host runs several containers that need a shared cache, pub/sub and queue.",
              ko: "호스트 한 대에서 캐시, pub/sub, 큐를 함께 써야 하는 여러 컨테이너를 실행할 때 씁니다.",
            })}
          </div>
          <div className="font-medium text-foreground">
            →{" "}
            {l.trans({
              en: "Lighter than cluster: cache and background work move to Redis, the data stays in one SQLite file.",
              ko: "cluster보다 가볍습니다. 캐시와 백그라운드 작업은 Redis로 옮기고, 데이터는 SQLite 파일 하나에 그대로 둡니다.",
            })}
          </div>
        </>
      ),
    },
    {
      name: "cluster",
      desc: (
        <>
          <div>
            {l.trans({
              en: "For several servers, local runs that match production, or heavier relational storage.",
              ko: "앱이 여러 서버에 걸치거나, 로컬 동작을 운영 클러스터와 맞추고 싶거나, 더 무거운 관계형 영속성이 필요할 때 씁니다.",
            })}
          </div>
          <div className="font-medium text-foreground">
            →{" "}
            {l.trans({
              en: "The most production-like mode, for heavier concurrent work and cluster validation.",
              ko: "가장 운영에 가까운 모드입니다. 무거운 동시 처리와 클러스터 지향 검증에 맞습니다.",
            })}
          </div>
        </>
      ),
    },
  ];

  const stableBadge = (
    <span className={badgeRecipe({ variant: "success", size: "sm" })}>{l.trans({ en: "Stable", ko: "안정" })}</span>
  );
  const experimentalBadge = (
    <span className={badgeRecipe({ variant: "warning", size: "sm" })}>
      {l.trans({ en: "Experimental", ko: "실험적" })}
    </span>
  );

  const stageColumns = [
    { key: "stage", label: l.trans({ en: "Stage", ko: "단계" }) },
    { key: "servers", label: l.trans({ en: "Servers", ko: "서버" }) },
    { key: "containers", label: l.trans({ en: "Containers", ko: "컨테이너" }) },
    { key: "mode", label: l.trans({ en: "Database mode", ko: "데이터베이스 모드" }), code: true },
  ];
  const stageRows = [
    {
      stage: (
        <span className="flex flex-wrap items-center gap-2">
          {l.trans({ en: "1. Single server", ko: "1. 싱글 서버" })}
          {stableBadge}
        </span>
      ),
      servers: l.trans({ en: "one", ko: "1대" }),
      containers: l.trans({ en: "one", ko: "1개" }),
      mode: "single",
    },
    {
      stage: (
        <span className="flex flex-wrap items-center gap-2">
          {l.trans({ en: "2. Multiple containers", ko: "2. 다중 컨테이너" })}
          {experimentalBadge}
        </span>
      ),
      servers: l.trans({ en: "one", ko: "1대" }),
      containers: l.trans({ en: "several", ko: "여러 개" }),
      mode: "multiple / cluster",
    },
    {
      stage: (
        <span className="flex flex-wrap items-center gap-2">
          {l.trans({ en: "3. Cloud cluster", ko: "3. 클라우드 클러스터" })}
          {experimentalBadge}
        </span>
      ),
      servers: l.trans({ en: "several", ko: "여러 대" }),
      containers: l.trans({ en: "several", ko: "여러 개" }),
      mode: "cluster",
    },
  ];

  return (
    <Scroll>
      <Scroll.Slide id="infra-overview" title={l.trans({ en: "Infra Architecture", ko: "인프라 아키텍처" })}>
        <Docs.Title>{l.trans({ en: "Infra Architecture", ko: "인프라 아키텍처" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "The business code you write is the same wherever it runs. What changes between a laptop and a cloud is everything around it: where traffic enters, where the app runs, and how data and deployments are managed. That surrounding layer is what this page calls infrastructure.",
              ko: "내가 쓴 비즈니스 코드는 어디서 실행되든 똑같습니다. 내 PC와 클라우드 사이에서 달라지는 것은 그 둘레입니다. 트래픽이 어디로 들어오는지, 앱이 어디서 실행되는지, 데이터와 배포를 어떻게 관리하는지요. 이 페이지는 그 둘레를 인프라라고 부릅니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "Akan apps run on a developer machine or in a cloud cluster, and the same application code is packaged for both. The infrastructure falls into three areas:",
              ko: "Akan 앱은 개발자 PC 또는 클라우드 클러스터에서 실행되고, 같은 애플리케이션 코드를 두 환경에 맞게 패키징합니다. 인프라는 세 영역으로 나뉩니다:",
            })}
          </div>
          <Docs.IntroTable type={l.trans({ en: "Area", ko: "영역" })} items={areaRows} />
          <Docs.Figure
            title={l.trans({ en: "Infrastructure shape", ko: "인프라 형태" })}
            image="infra-shape"
            prompt={`
              Left to right, joined by long arrows. A person seated behind a laptop at the far left, labelled
              "Developer". A small square box holding a gear and a small key, left of centre, labelled "Master" with a
              smaller second line "ci/cd · env · secrets". A large cloud outline spanning the middle and right of the
              frame, labelled "Cloud Cluster". Inside the cloud, three containers side by side, their outlines traced as
              the red accent, labelled once "Akan App Runtime". At the right edge, just outside the cloud, a browser and
              a phone standing together, labelled once "Users". Arrows run from the developer to the master box, from
              the master box into the cloud, and from the cloud out to the browser and phone.
            `}
            alt={l.trans({
              en: "A developer ships through the master infra — CI/CD, environment files and secrets — into a cloud cluster, where the Akan app runtime serves users and their devices.",
              ko: "개발자가 마스터 인프라(CI/CD, 환경 파일, 비밀값)를 거쳐 클라우드 클러스터로 배포하고, 그 안의 Akan 앱 런타임이 사용자와 기기를 응대합니다.",
            })}
          />
          <Docs.SubSubTitle>{l.trans({ en: "Words used on this page", ko: "이 페이지에서 쓰는 말" })}</Docs.SubSubTitle>
          <Docs.IntroTable type={l.trans({ en: "Term", ko: "용어" })} items={termRows} />
          <Docs.Alert type="info">
            {l.trans({
              en: (
                <span>
                  <strong>There is no edge infrastructure to set up.</strong> infra/ carries the cluster chart and the
                  deployment control area only, so an edge site is one container you run yourself: set{" "}
                  <code>AKAN_PUBLIC_OPERATION_MODE=edge</code> and <code>AKAN_DATABASE_MODE=single</code>, and point{" "}
                  <code>AKAN_SQLITE_DIR</code> at a volume, which then holds its database and its cache and queue file.
                  The operation mode is independent of the database mode, and only an <code>internal</code> job can be
                  scoped to it (<code>{'operationMode: ["cloud"]'}</code>), never an endpoint.
                </span>
              ),
              ko: (
                <span>
                  <strong>따로 준비된 엣지 인프라는 없습니다.</strong> infra/에는 클러스터 차트와 배포 제어 영역만
                  있으므로, 엣지 사이트는 직접 실행하는 컨테이너 하나입니다.{" "}
                  <code>AKAN_PUBLIC_OPERATION_MODE=edge</code>와 <code>AKAN_DATABASE_MODE=single</code>을 설정하고,{" "}
                  <code>AKAN_SQLITE_DIR</code>이 볼륨을 가리키게 하면 데이터베이스 파일과 캐시·큐 파일이 모두 그 볼륨에
                  놓입니다. operation mode는 데이터베이스 모드와 별개이며, 이 모드로 한정할 수 있는 것은 endpoint가
                  아니라 <code>internal</code> 작업뿐입니다(
                  <code>{'operationMode: ["cloud"]'}</code>).
                </span>
              ),
            })}
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide
        id="choose-option"
        title={l.trans({ en: "Which Option Should I Use?", ko: "어떤 구성을 선택할까?" })}
      >
        <Docs.Title>{l.trans({ en: "Which Option Should I Use?", ko: "어떤 구성을 선택할까?" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Start from the product situation, not from the infrastructure name. A small internal tool, a team QA environment and a production service need different levels of infrastructure, so start from the one that describes where you are today:",
              ko: "인프라 이름보다 제품 상황에서 먼저 출발하세요. 작은 내부 도구, 팀 QA 환경, 운영 서비스는 서로 다른 수준의 인프라가 필요합니다. 지금 내 상황에 맞는 칸을 찾으면 됩니다:",
            })}
          </div>
          <div className="my-4 space-y-3">
            {situations.map(({ title, pick, desc }) => (
              <div key={title} className={panelRecipe({ radius: "lg", padding: "sm" })}>
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-primary">{title}</span>
                  <span className={chip}>→ {pick}</span>
                </div>
                <div className="text-foreground/70 text-sm">{desc}</div>
              </div>
            ))}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="traffic-flow" title={l.trans({ en: "How Traffic Moves", ko: "트래픽 흐름" })}>
        <Docs.Title>{l.trans({ en: "How Traffic Moves", ko: "트래픽 흐름" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Infrastructure does not change the business code inside your app. It decides how a request reaches the Akan runtime. The path is simple on your laptop and goes through a structured layer in a cloud cluster.",
              ko: "인프라는 앱 내부의 비즈니스 코드를 바꾸지 않습니다. 대신 요청이 어떤 경로로 Akan 런타임에 도착할지를 결정합니다. 내 PC에서는 경로가 단순하고, 클라우드 클러스터에서는 구조화된 계층을 거칩니다.",
            })}
          </div>
          <Docs.Flow
            title={l.trans({ en: "Request paths", ko: "요청 경로" })}
            direction="TB"
            nodes={{
              browser: { label: l.trans({ en: "Browser Or Device", ko: "브라우저 또는 기기" }) },
              domain: { label: l.trans({ en: "Domain Or Local Address", ko: "도메인 또는 로컬 주소" }) },
              local: { label: l.trans({ en: "Local Dev Server", ko: "로컬 개발 서버" }) },
              ingress: { label: l.trans({ en: "Cloud Ingress", ko: "클라우드 Ingress" }) },
              service: { label: l.trans({ en: "Kubernetes Service", ko: "Kubernetes Service" }) },
              runtime: { label: l.trans({ en: "Akan App Runtime", ko: "Akan 앱 런타임" }) },
              response: {
                label: l.trans({ en: "Page · API · WebSocket · Asset", ko: "페이지 · API · 웹소켓 · 에셋" }),
              },
            }}
            edges={[
              ["browser", "domain"],
              ["domain", "local"],
              ["domain", "ingress"],
              ["local", "runtime"],
              ["ingress", "service"],
              ["service", "runtime"],
              ["runtime", "response"],
            ]}
          />
          <div className={cardGridRecipe({ cols: "mdTwo" }, "my-4")}>
            <div className={panelRecipe({ radius: "lg", padding: "sm" })}>
              <div className="mb-1 font-semibold text-primary">{l.trans({ en: "Local path", ko: "로컬 경로" })}</div>
              <div className="text-foreground/70 text-sm">
                {l.trans({
                  en: "A developer opens localhost and talks almost directly to the Akan dev runtime. This is the fastest path for building screens and checking business flows.",
                  ko: "개발자는 localhost로 접속하고 Akan 개발 런타임에 거의 직접 연결됩니다. 화면을 만들고 비즈니스 흐름을 확인하기에 가장 빠른 경로입니다.",
                })}
              </div>
            </div>
            <div className={panelRecipe({ radius: "lg", padding: "sm" })}>
              <div className="mb-1 font-semibold text-primary">
                {l.trans({ en: "Cloud path", ko: "클라우드 경로" })}
              </div>
              <div className="text-foreground/70 text-sm">
                {l.trans({
                  en: "A user enters through a public domain. Kubernetes Ingress receives the request, Service finds the right app pod, and the Akan runtime handles the actual page or API response.",
                  ko: "사용자는 공개 도메인으로 들어옵니다. Kubernetes Ingress가 요청을 받고, Service가 적절한 앱 pod를 찾은 뒤, Akan 런타임이 실제 페이지나 API 응답을 처리합니다.",
                })}
              </div>
            </div>
          </div>
          <div>
            {l.trans({
              en: "Once a request reaches the Akan App Runtime, the runtime sorts it by kind of work. Each kind gets its own kind of answer:",
              ko: "요청이 Akan App Runtime에 도착하면 런타임은 어떤 종류의 작업인지 분류합니다. 종류마다 응답하는 방식이 다릅니다:",
            })}
          </div>
          <Docs.IntroTable type={l.trans({ en: "Request", ko: "요청 종류" })} items={requestRows} />
          <Docs.Alert type="info">
            {l.trans({
              en: (
                <span>
                  <strong>Key idea:</strong> infrastructure chooses the route into the app, not the business behavior
                  inside the app. The local and cloud paths look different, but both eventually hand work to the same
                  Akan runtime.
                </span>
              ),
              ko: (
                <span>
                  <strong>핵심:</strong> 인프라는 앱 안의 비즈니스 동작을 바꾸는 것이 아니라 앱으로 들어오는 경로를
                  선택합니다. 로컬 경로와 클라우드 경로는 서로 다르게 보이지만 결국 같은 Akan 런타임에 작업을
                  전달합니다.
                </span>
              ),
            })}
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="database-mode" title={l.trans({ en: "Database Mode", ko: "데이터베이스 모드" })}>
        <Docs.Title>{l.trans({ en: "Database Mode", ko: "데이터베이스 모드" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Besides the app itself, a service needs somewhere to keep data, a queue for background work and a cache. The database mode decides which engine fills each of those three roles.",
              ko: "앱 말고도 서비스에는 데이터를 저장할 곳, 백그라운드 작업을 위한 큐, 그리고 캐시가 필요합니다. 데이터베이스 모드는 이 세 역할을 각각 어떤 엔진이 맡을지 정합니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "Start with single mode. Most services do not need a separate database cluster on day one. When real performance limits, queue needs or multi-instance operation appear, move up to multiple or cluster mode without changing the business shape of the app.",
              ko: "처음에는 single 모드로 시작하세요. 대부분의 서비스는 첫날부터 별도 데이터베이스 클러스터가 필요하지 않습니다. 실제 성능 한계, 큐 처리, 다중 인스턴스 운영 요구가 생기면 앱의 비즈니스 구조를 바꾸지 않고 multiple 또는 cluster 모드로 올리면 됩니다.",
            })}
          </div>
          <Docs.Table columns={modeColumns} rows={modeRows} stacked />
          <Docs.Alert type="info">
            {l.trans({
              en: (
                <span>
                  <strong>SQLite is not only for toys.</strong> It is the default database in single mode, and with WAL
                  mode its practical performance is very strong. For many ordinary services under about 10,000 DAU,
                  single mode is usually enough until real usage data proves otherwise.
                </span>
              ),
              ko: (
                <span>
                  <strong>SQLite는 장난감 서비스용이 아닙니다.</strong> single 모드의 기본 데이터베이스는 SQLite이고,
                  WAL 모드를 기본 지원하기 때문에 실제 성능은 상당히 좋습니다. DAU 1만 명 이하의 웬만한 일반 서비스는
                  실제 사용 데이터가 병목을 증명하기 전까지 single 모드로도 충분한 경우가 많습니다.
                </span>
              ),
            })}
          </Docs.Alert>
          <Docs.SubSubTitle>{l.trans({ en: "When to pick each mode", ko: "모드마다 언제 고르는가" })}</Docs.SubSubTitle>
          <Docs.IntroTable
            type={l.trans({ en: "Mode", ko: "모드" })}
            descLabel={l.trans({ en: "When → what you get", ko: "언제 → 얻는 것" })}
            items={modeUseRows}
          />
          <Docs.SubSubTitle>{l.trans({ en: "Declaring the modes", ko: "모드 선언하기" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: (
                <span>
                  An app lists in <code>akan.config.ts</code> every mode a deployment of it may run in, and the first is
                  the default:
                </span>
              ),
              ko: (
                <span>
                  앱은 자기 배포가 쓸 수 있는 모드를 모두 <code>akan.config.ts</code>에 나열하고, 그중 첫 번째가
                  기본값입니다:
                </span>
              ),
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/myapp/akan.config.ts"
            code={`import type { AppConfig } from "akanjs";

const config: AppConfig = {
  database: { modes: ["single", "cluster"] },
};

export default config;`}
          />
          <ul className="my-4 list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>A deployment names one of them.</strong> <code>AKAN_DATABASE_MODE</code> picks a declared
                    mode; with one declared it may be left out, with several every deployment sets it.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>배포는 그중 하나를 고릅니다.</strong> <code>AKAN_DATABASE_MODE</code>로 선언된 모드 하나를
                    고르며, 선언이 하나면 생략해도 되고 여럿이면 배포마다 적어야 합니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>One image serves every declared mode.</strong> The build carries each mode's drivers, so the
                    same image runs an edge site in <code>single</code> and a cloud cluster in <code>cluster</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>이미지 하나가 선언한 모든 모드를 실행합니다.</strong> 빌드가 모드마다 드라이버를 싣기
                    때문에, 같은 이미지로 엣지 사이트는 <code>single</code>로, 클라우드 클러스터는 <code>cluster</code>
                    로 실행합니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Your machine runs the first.</strong> <code>akan start</code> uses it unless the shell sets{" "}
                    <code>AKAN_DATABASE_MODE</code> to another declared mode.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>내 PC에서는 첫 번째 모드로 실행합니다.</strong> 셸의 <code>AKAN_DATABASE_MODE</code>가
                    선언된 다른 모드를 가리키지 않으면 <code>akan start</code>는 첫 번째 모드를 씁니다.
                  </span>
                ),
              })}
            </li>
          </ul>

          <Docs.SubSubTitle>{l.trans({ en: "Local services", ko: "로컬 서비스" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: (
                <span>
                  On your machine, <code>multiple</code> needs Redis beside the app and <code>cluster</code> needs Redis
                  and Postgres. <code>akan start</code> starts them for the mode it runs, and <code>akan dbup</code>{" "}
                  starts them on their own:
                </span>
              ),
              ko: (
                <span>
                  내 PC에서 <code>multiple</code>은 앱 옆에 Redis가, <code>cluster</code>는 Redis와 Postgres가 떠 있어야
                  합니다. <code>akan start</code>는 실행하는 모드에 맞춰 이들을 띄우고, <code>akan dbup</code>은 따로
                  띄웁니다:
                </span>
              ),
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="Terminal"
            language="bash"
            code={`akan dbup                  # every mode the workspace's apps declare
akan dbup --mode multiple  # Redis
akan dbup --mode cluster   # Redis and Postgres 18`}
          />
          <div>
            {l.trans({
              en: (
                <span>
                  The first run writes <code>local/docker-compose.yaml</code>, which is yours from then on. If an older
                  file lacks a service, add it, or move the file aside so the next <code>akan dbup</code> writes the
                  current one.
                </span>
              ),
              ko: (
                <span>
                  처음 실행할 때 <code>local/docker-compose.yaml</code>을 만들고, 그 뒤로는 이 파일을 직접 관리합니다.
                  예전 파일에 서비스가 빠져 있다면 직접 추가하거나, 파일을 다른 곳으로 옮겨 두면 다음{" "}
                  <code>akan dbup</code>이 지금의 템플릿으로 다시 만듭니다.
                </span>
              ),
            })}
          </div>
          <Docs.Alert>
            {l.trans({
              en: (
                <span>
                  <strong>Do not upgrade just because it feels safer.</strong> Stay on single until you see real needs
                  such as Redis-backed pub/sub, separate queue/cache behavior, heavier concurrent writes, or a
                  deployment shape that must resemble production.
                </span>
              ),
              ko: (
                <span>
                  <strong>막연히 더 안전해 보인다는 이유로 올리지 마세요.</strong> Redis 기반 pub/sub, 분리된 큐/캐시
                  동작, 더 무거운 동시 쓰기, 운영과 비슷한 배포 검증이 실제로 필요해질 때까지 single을 유지하면 됩니다.
                </span>
              ),
            })}
          </Docs.Alert>

          <Docs.SubSubTitle>
            {l.trans({
              en: "Deploying multiple: docker compose on one host",
              ko: "multiple 배포: 호스트 한 대의 docker compose",
            })}
          </Docs.SubSubTitle>
          <div>
            {l.trans({
              en: (
                <span>
                  <code>multiple</code> is not a chart mode; it runs on one host with docker compose. Every replica
                  opens the same SQLite file on a host volume and shares one Redis, and a reverse proxy in front
                  balances them:
                </span>
              ),
              ko: (
                <span>
                  <code>multiple</code>은 차트 모드가 아니며, 호스트 한 대에서 docker compose로 실행합니다. 모든
                  replica가 호스트 볼륨의 같은 SQLite 파일을 열고 Redis 하나를 함께 쓰며, 앞단의 리버스 프록시가
                  replica들에 요청을 나눕니다:
                </span>
              ),
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="docker-compose.yaml"
            language="yaml"
            code={`services:
  redis:
    image: redis:8
  app:
    image: <registry>/<repo>/<app>:<tag>
    deploy:
      replicas: 3
    environment:
      AKAN_DATABASE_MODE: multiple
      REDIS_URI: redis://redis:6379
      SQLITE_DATABASE_PATH: /data/app.db
      AKAN_STORAGE_SHARED: "true"
    volumes:
      - app-data:/data
      - app-files:/workspace/local
volumes:
  app-data:
  app-files:`}
          />
          <ul className="my-4 list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>The app's build declares multiple.</strong> With <code>multiple</code> in{" "}
                    <code>database.modes</code>, the image carries the Redis drivers it needs.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>앱의 빌드가 multiple을 선언합니다.</strong> <code>database.modes</code>에{" "}
                    <code>multiple</code>이 있어야 이미지에 필요한 Redis 드라이버가 실립니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Keep the SQLite file on the host's local disk.</strong> The <code>app-data</code> volume
                    must live on the host's own filesystem, not on NFS.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>SQLite 파일은 호스트의 로컬 디스크에 둡니다.</strong> <code>app-data</code> 볼륨은 NFS가
                    아니라 호스트 자체 파일시스템에 있어야 합니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Uploads share a volume too.</strong> <code>app-files</code> is mounted at{" "}
                    <code>/workspace/local</code> in every replica, which <code>AKAN_STORAGE_SHARED</code> declares.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>업로드도 볼륨을 함께 씁니다.</strong> <code>app-files</code>는 모든 replica의{" "}
                    <code>/workspace/local</code>에 마운트되며, <code>AKAN_STORAGE_SHARED</code>가 그 사실을 알립니다.
                  </span>
                ),
              })}
            </li>
          </ul>

          <Docs.SubSubTitle>
            {l.trans({ en: "Deploying cluster: the Kubernetes chart", ko: "cluster 배포: Kubernetes 차트" })}
          </Docs.SubSubTitle>
          <div>
            {l.trans({
              en: (
                <span>
                  The chart in <code>infra/app</code> runs a branch in <code>cluster</code> when that branch's values
                  say so. Postgres and Redis are yours to run, and the chart reads their URLs from a Secret you create:
                </span>
              ),
              ko: (
                <span>
                  <code>infra/app</code>의 차트는 branch 값에 적으면 그 branch를 <code>cluster</code>로 실행합니다.
                  Postgres와 Redis는 직접 운영하고, 차트는 직접 만든 Secret에서 두 URL을 읽습니다:
                </span>
              ),
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="infra/app/values/myapp-values.yaml"
            language="yaml"
            code={`main:
  database:
    mode: cluster # single (default) or cluster
    # A Secret holding POSTGRES_URL, REDIS_URI and, optionally,
    # POSTGRES_INSIGHT_URL
    secretName: app-database
  app:
    pods: 3 # cluster only; default 2
  storage:
    # Optional: a ReadWriteMany claim mounted at /workspace/local
    sharedClaim: uploads`}
          />
          <ul className="my-4 list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>single is unchanged.</strong> It always runs one pod on its SQLite volume, because that
                    ReadWriteOnce volume cannot be mounted by a second pod.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>single은 그대로입니다.</strong> 항상 SQLite 볼륨 위의 pod 하나로 실행합니다. 그
                    ReadWriteOnce 볼륨은 두 번째 pod가 마운트할 수 없기 때문입니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Tune Postgres in its URL.</strong> Pool size, SSL and prepared statements ride the query
                    string: <code>{"?max=20&ssl=require"}</code>, and <code>prepare=false</code> behind a PgBouncer in
                    transaction mode.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>Postgres 설정은 URL에 적습니다.</strong> 풀 크기, SSL, prepared statement는 쿼리 문자열로
                    넘깁니다. <code>{"?max=20&ssl=require"}</code>처럼 쓰고, transaction 모드의 PgBouncer 뒤에서는{" "}
                    <code>prepare=false</code>를 붙입니다.
                  </span>
                ),
              })}
            </li>
          </ul>

          <Docs.SubSubTitle>{l.trans({ en: "Uploaded files", ko: "업로드한 파일" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: "A deployed multiple or cluster app runs several instances, and each must read the files the others wrote. Keep uploads in one of two places:",
              ko: "배포된 multiple이나 cluster 앱은 인스턴스가 여럿이고, 각 인스턴스는 다른 인스턴스가 쓴 파일을 읽을 수 있어야 합니다. 업로드는 둘 중 한 곳에 둡니다:",
            })}
          </div>
          <ul className="my-4 list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Object storage.</strong> With <code>libs/util</code>, set <code>objectStorage</code> in the
                    server env, and every instance reads the same bucket.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>오브젝트 스토리지.</strong> <code>libs/util</code>을 쓴다면 서버 env에{" "}
                    <code>objectStorage</code>를 설정하고, 모든 인스턴스가 같은 버킷을 읽습니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>One shared volume.</strong> Mount it at <code>/workspace/local</code> on every instance and
                    set <code>AKAN_STORAGE_SHARED=true</code>; the compose file and the chart's <code>sharedClaim</code>{" "}
                    above do both.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>공유 볼륨 하나.</strong> 모든 인스턴스의 <code>/workspace/local</code>에 마운트하고{" "}
                    <code>AKAN_STORAGE_SHARED=true</code>를 설정합니다. 위의 compose 파일과 차트의{" "}
                    <code>sharedClaim</code>이 둘 다 해 줍니다.
                  </span>
                ),
              })}
            </li>
          </ul>
          <div>
            {l.trans({
              en: "Outside development, an upload to a local disk that only one instance can read is refused.",
              ko: "개발 환경 밖에서는 인스턴스 하나만 읽을 수 있는 로컬 디스크로의 업로드가 거부됩니다.",
            })}
          </div>

          <Docs.SubSubTitle>
            {l.trans({ en: "Moving data between modes", ko: "모드 사이에서 데이터 옮기기" })}
          </Docs.SubSubTitle>
          <div>
            {l.trans({
              en: (
                <span>
                  <code>akan db-export</code> writes each model table to its own NDJSON file (one JSON row per line),
                  and <code>akan db-import</code> reads them back into a database. Both run in the mode the shell's{" "}
                  <code>AKAN_DATABASE_MODE</code> names, the app's first declared mode by default, and the app must
                  declare it:
                </span>
              ),
              ko: (
                <span>
                  <code>akan db-export</code>는 모델 테이블마다 NDJSON 파일(한 줄에 JSON 행 하나) 하나씩을 쓰고,{" "}
                  <code>akan db-import</code>는 그 파일을 데이터베이스로 다시 읽어 들입니다. 둘 다 셸의{" "}
                  <code>AKAN_DATABASE_MODE</code>가 가리키는 모드(기본값은 앱이 선언한 첫 번째 모드)로 실행하며, 앱이 그
                  모드를 선언해 두어야 합니다:
                </span>
              ),
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="Terminal"
            language="bash"
            code={`akan db-export myapp
AKAN_DATABASE_MODE=cluster POSTGRES_URL=postgres://… REDIS_URI=redis://… \\
  akan db-import myapp`}
          />
          <ul className="my-4 list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Rows move exactly as stored.</strong> Removed rows come too, and a row whose id already
                    exists is replaced, so an import can be rerun; text search is rebuilt afterwards.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>행은 저장된 그대로 옮겨집니다.</strong> 삭제된 행도 함께 가고, 이미 있는 id의 행은
                    교체되므로 import를 다시 실행해도 됩니다. 텍스트 검색은 import 뒤에 다시 만들어집니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Sessions, queued jobs and files stay behind.</strong> Sessions and jobs live in the cache
                    and the queue, so users sign in again; copy <code>local/</code> to the shared volume or object
                    storage yourself.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>세션, 대기 중인 작업, 파일은 옮겨지지 않습니다.</strong> 세션과 작업은 캐시와 큐에 있으므로
                    사용자는 다시 로그인합니다. 업로드한 파일은 <code>local/</code>을 공유 볼륨이나 오브젝트 스토리지로
                    직접 복사합니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>From a deployed single app,</strong> copy its SQLite file, point{" "}
                    <code>SQLITE_DATABASE_PATH</code> at the copy, and run <code>db-export</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>배포된 single 앱에서 옮길 때는</strong> SQLite 파일을 복사하고,{" "}
                    <code>SQLITE_DATABASE_PATH</code>가 그 복사본을 가리키게 한 뒤 <code>db-export</code>를 실행합니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Nothing else runs.</strong> Both boot the app without listening and without cron or init
                    jobs, and use <code>local/transfer</code> unless <code>--dir</code> names another directory.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>다른 일은 하지 않습니다.</strong> 두 명령 모두 요청을 받지 않고 cron과 init 작업도 돌리지
                    않은 채 앱을 띄우며, <code>--dir</code>로 다른 디렉터리를 주지 않으면 <code>local/transfer</code>를
                    씁니다.
                  </span>
                ),
              })}
            </li>
          </ul>

          <Docs.SubSubTitle>{l.trans({ en: "The SQL console on cluster", ko: "cluster의 SQL 콘솔" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: (
                <span>
                  The SQL console (<code>runAdminSql</code>) needs no setup on SQLite. On Postgres it reads as its own
                  login role, one that may read base columns and nothing else:
                </span>
              ),
              ko: (
                <span>
                  SQL 콘솔(<code>runAdminSql</code>)은 SQLite에서는 설정할 것이 없습니다. Postgres에서는 기본 컬럼만
                  읽을 수 있고 그 밖에는 아무것도 못 하는 전용 로그인 role로 읽습니다:
                </span>
              ),
            })}
          </div>
          <ol className="my-4 list-decimal space-y-2 pl-5">
            <li>
              {l.trans({
                en: (
                  <span>
                    Create the role with <code>{"CREATE ROLE <name> LOGIN PASSWORD '…';"}</code> and grant it no other
                    role.
                  </span>
                ),
                ko: (
                  <span>
                    <code>{"CREATE ROLE <name> LOGIN PASSWORD '…';"}</code>로 role을 만들고, 다른 role은 부여하지
                    않습니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    Set <code>POSTGRES_INSIGHT_URL</code> (or <code>database.postgres.insightUrl</code>) to a URL that
                    logs in as it.
                  </span>
                ),
                ko: (
                  <span>
                    <code>POSTGRES_INSIGHT_URL</code>(또는 <code>database.postgres.insightUrl</code>)에 그 role로
                    로그인하는 URL을 설정합니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    Each model table grants it its base columns at boot. If the app does not own its schema, the DBA
                    runs <code>{"GRANT USAGE ON SCHEMA <schema> TO <name>"}</code>.
                  </span>
                ),
                ko: (
                  <span>
                    모델 테이블마다 부팅할 때 기본 컬럼 권한을 이 role에 줍니다. 앱이 스키마의 소유자가 아니라면 DBA가{" "}
                    <code>{"GRANT USAGE ON SCHEMA <schema> TO <name>"}</code>을 실행합니다.
                  </span>
                ),
              })}
            </li>
          </ol>
          <div>
            {l.trans({
              en: (
                <span>
                  Without the role the console refuses on cluster. <code>SELECT *</code> returns the base columns, and{" "}
                  <code>_doc</code>, which holds every model field including secrets, is never readable.
                </span>
              ),
              ko: (
                <span>
                  이 role이 없으면 cluster에서 콘솔은 실행을 거부합니다. <code>SELECT *</code>는 기본 컬럼을 돌려주며,
                  secret을 포함한 모든 모델 필드가 담긴 <code>_doc</code>은 절대 읽을 수 없습니다.
                </span>
              ),
            })}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="growth-stage" title={l.trans({ en: "Growth Stages", ko: "성장 단계" })}>
        <Docs.Title>{l.trans({ en: "Growth Stages", ko: "성장 단계" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Infrastructure does not need to start big. A business can begin with one server and one container, then grow step by step as traffic and reliability requirements increase. The three stages at a glance:",
              ko: "인프라는 처음부터 크게 시작할 필요가 없습니다. 비즈니스는 서버 하나와 컨테이너 하나로 시작하고, 트래픽과 안정성 요구가 커질 때 단계적으로 확장하면 됩니다. 세 단계를 한눈에 보면 이렇습니다:",
            })}
          </div>
          <Docs.Table columns={stageColumns} rows={stageRows} />
          <div>
            {l.trans({
              en: "Stage 1 is stable, and stages 2 and 3 are experimental. Both have a recipe under Database Mode above: docker compose on one host for stage 2, the chart's cluster mode for stage 3.",
              ko: "1단계는 안정화되어 있고, 2, 3단계는 실험적입니다. 두 단계의 구성 방법은 위 데이터베이스 모드에 있습니다. 2단계는 호스트 한 대의 docker compose, 3단계는 차트의 cluster 모드입니다.",
            })}
          </div>
          <div className="my-4 space-y-3">
            <div className={panelRecipe({}, "gap-2 lg:grid")}>
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2 font-bold text-foreground">
                  {l.trans({ en: "1. Single server", ko: "1. 싱글 서버" })}
                  {stableBadge}
                </div>
                <div className="text-foreground/70 text-sm">
                  {l.trans({
                    en: "A small product, MVP, internal tool or early admin page runs on one server with one Akan container. That single container serves the database, API, web, CSR, image optimization, cache and queue, and single database mode is usually enough.",
                    ko: "작은 제품, MVP, 내부 도구, 초기 관리자 화면은 서버 하나와 Akan 컨테이너 하나로 충분히 운영할 수 있습니다. 컨테이너 하나가 데이터베이스, API, 웹, CSR, 이미지 최적화, 캐시, 큐를 모두 처리하고, 데이터베이스도 보통 single 모드면 충분합니다.",
                  })}
                </div>
                <div className="text-foreground/70 text-sm">
                  {l.trans({
                    en: "The chart asks a debug or develop pod for 0.05 CPU and 250M, capped at 0.5 CPU and 1G.",
                    ko: "차트는 debug/develop pod에 0.05 CPU와 250M을 요청하고, 상한을 0.5 CPU, 1G로 둡니다.",
                  })}
                </div>
              </div>
              <Docs.Figure
                className="col-span-2"
                title={l.trans({ en: "1. Single server", ko: "1. 싱글 서버" })}
                image="infra-stage-single"
                prompt={`
                  A person at the far left labelled "Users", with one arrow into one server drawn large in the centre,
                  about two thirds of the frame tall, labelled "Single Server". Inside the server, one container drawn
                  as a big square, its outline traced as the red accent, labelled "Akan Runtime Container". Inside the
                  container, three small shapes in a row, not joined to each other: a database cylinder labelled "SQLite
                  WAL", a cache labelled "Local Cache", a queue labelled "Local Queue".
                `}
                alt={l.trans({
                  en: "Users reach one server that holds one Akan runtime container, and SQLite WAL storage, the local cache and the local queue all live inside that container.",
                  ko: "사용자는 서버 한 대에 닿고, 그 서버에는 Akan 런타임 컨테이너 하나가 있으며 SQLite WAL 스토리지, 로컬 캐시, 로컬 큐가 모두 그 컨테이너 안에 있습니다.",
                })}
              />
            </div>

            <div className={panelRecipe({}, "gap-2 lg:grid")}>
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2 font-bold text-foreground">
                  {l.trans({ en: "2. Single server, multiple containers", ko: "2. 싱글 서버 다중 컨테이너" })}
                  {experimentalBadge}
                </div>
                <div className="text-foreground/70 text-sm">
                  {l.trans({
                    en: "When traffic grows but one machine is still enough, run multiple containers on the same server. This is vertical scaling: a stronger server, more containers, and multiple or cluster database mode.",
                    ko: "트래픽은 늘었지만 서버 한 대로 아직 충분하다면 같은 서버 안에서 여러 컨테이너를 실행합니다. 더 강한 서버, 더 많은 컨테이너, multiple 또는 cluster 데이터베이스 모드로 올리는 수직 확장 단계입니다.",
                  })}
                </div>
                <Docs.Alert type="info">
                  {l.trans({
                    en: (
                      <span>
                        <strong>You do not need several runtimes for load balancing.</strong> One Akan Runtime starts
                        several child servers, as many as the AKAN_REPLICA environment variable sets, and balances load
                        across them. Run several runtimes when you need better stability.
                      </span>
                    ),
                    ko: (
                      <span>
                        <strong>로드밸런싱 때문에 런타임을 여러 개 띄울 필요는 없습니다.</strong> Akan Runtime 하나가
                        AKAN_REPLICA 환경변수 설정에 따라 여러 child 서버를 실행해 로드밸런싱을 합니다. 안정성 향상이
                        필요하다면 그때 여러 런타임을 실행하면 됩니다.
                      </span>
                    ),
                  })}
                </Docs.Alert>
              </div>
              <Docs.Figure
                className="col-span-2"
                title={l.trans({ en: "2. Single server, multiple containers", ko: "2. 싱글 서버 다중 컨테이너" })}
                image="infra-stage-containers"
                prompt={`
                  A person at the far left labelled "Users", with an arrow into a small square labelled "Reverse Proxy".
                  One server drawn wide across the middle and right, labelled "Single Large Server" at its top. In the
                  left half of the server, three containers stacked vertically, lettered "A", "B" and "C" inside. A thin
                  rounded outline traced as the red accent surrounds the three containers, with the red label "Akan
                  Runtime Containers" written above that outline; nothing stands between the proxy and the containers.
                  Three separate arrows start at the right edge of the proxy, and each one ends at its own container:
                  one at "A", one at "B", one at "C". In the right half of the server, a cache labelled "Redis" with a
                  smaller second line
                  "cache · pubsub · queue" above a database cylinder labelled "SQLite / Postgres"; a thin line joins
                  every container to both.
                `}
                alt={l.trans({
                  en: "Users pass a reverse proxy into one large server running Akan runtime containers A, B and C, and every container shares one Redis for cache, pubsub and queue plus one database on the same server: a SQLite file every container opens, or Postgres.",
                  ko: "사용자는 리버스 프록시를 거쳐 대형 서버 한 대로 들어오고, 그 안의 Akan 런타임 컨테이너 A, B, C가 같은 서버의 Redis(캐시, PubSub, 큐) 하나와 데이터베이스 하나를 함께 씁니다. 데이터베이스는 모든 컨테이너가 여는 SQLite 파일이거나 Postgres입니다.",
                })}
              />
            </div>

            <div className={panelRecipe({}, "gap-2 lg:grid")}>
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2 font-bold text-foreground">
                  {l.trans({ en: "3. Cloud cluster scale", ko: "3. 클라우드 클러스터 확장" })}
                  {experimentalBadge}
                </div>
                <div className="text-foreground/70 text-sm">
                  {l.trans({
                    en: "When one server is no longer enough, move to a cloud cluster. Multiple servers run multiple containers, and cluster mode keeps the database/cache layer closer to production operation.",
                    ko: "서버 한 대로 부족해지면 클라우드 클러스터로 이동합니다. 여러 서버에서 여러 컨테이너가 실행되고, cluster 모드로 데이터베이스/캐시 계층도 운영에 가까운 형태가 됩니다.",
                  })}
                </div>
                <Docs.Alert type="warning">
                  {l.trans({
                    en: (
                      <span>
                        <strong>Postgres and Redis are yours to run.</strong> The chart in infra/app reaches this stage
                        when a branch sets <code>database.mode: cluster</code>, and reads both URLs from a Secret; there
                        is no Redis or Postgres manifest under infra/. In single mode it keeps one pod, because a
                        ReadWriteOnce volume cannot be mounted by a second pod.
                      </span>
                    ),
                    ko: (
                      <span>
                        <strong>Postgres와 Redis는 직접 운영합니다.</strong> infra/app의 차트는 branch에{" "}
                        <code>database.mode: cluster</code>를 설정하면 이 단계까지 가고, 두 URL은 Secret에서 읽습니다.
                        infra/ 아래에 Redis나 Postgres 매니페스트는 없습니다. single 모드에서는 pod를 하나로 유지합니다.
                        ReadWriteOnce 볼륨은 두 번째 pod가 마운트할 수 없기 때문입니다.
                      </span>
                    ),
                  })}
                </Docs.Alert>
              </div>
              <Docs.Figure
                className="col-span-2"
                title={l.trans({ en: "3. Cloud cluster scale", ko: "3. 클라우드 클러스터 확장" })}
                image="infra-cluster-scale"
                prompt={`
                  A large cloud outline filling most of the frame. A person at the far left, outside the cloud, labelled
                  "Users", with an arrow entering the cloud. Inside the cloud near the top: a small archway labelled
                  "Ingress", then a small circle with three short spokes labelled "Service". Three arrows fan down from
                  the circle to three servers standing side by side, their outlines traced as the red accent, labelled
                  "Node A", "Node B" and "Node C". Inside each server one container lettered "Pod". Below the cloud,
                  outside it, a cache labelled "Redis" and a database cylinder labelled "Postgres"; each server has a
                  thin line down to both.
                `}
                alt={l.trans({
                  en: "Inside a cloud cluster, users enter through a Kubernetes Ingress and Service that fan out to cloud nodes A, B and C, each running one Akan runtime pod against one shared Redis and one Postgres database.",
                  ko: "클라우드 클러스터 안에서 사용자는 Kubernetes Ingress와 Service를 거쳐 클라우드 노드 A, B, C로 분산되고, 각 노드의 Akan 런타임 Pod가 함께 쓰는 Redis 하나와 Postgres 데이터베이스 하나를 씁니다.",
                })}
              />
            </div>
          </div>
          <Docs.Alert type="info">
            {l.trans({
              en: (
                <span>
                  <strong>Grow only when the business asks for it.</strong> Start small, measure real usage, then move
                  from single server to multiple containers and on to a cloud cluster.
                </span>
              ),
              ko: (
                <span>
                  <strong>비즈니스가 요구할 때만 확장하세요.</strong> 작게 시작하고 실제 사용량을 측정한 뒤, 싱글
                  서버에서 다중 컨테이너로, 그리고 클라우드 클러스터로 이동하면 됩니다.
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
