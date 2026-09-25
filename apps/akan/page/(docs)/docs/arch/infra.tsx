import { usePage } from "@apps/akan/client";
import { Code, Docs } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();
  return (
    <Scroll>
      <Scroll.Slide id="infra-overview" title={l.trans({ en: "Infra Architecture", ko: "인프라 아키텍처" })}>
        <Docs.Title>{l.trans({ en: "Infra Architecture", ko: "인프라 아키텍처" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Akan apps can run locally, in a cloud cluster, or near users and devices through edge servers. The same application code can be packaged for different environments, while infrastructure decides where traffic enters, where services run, and how data or deployment operations are managed.",
              ko: "Akan 앱은 로컬, 클라우드 클러스터, 또는 사용자와 장비 가까이에 있는 엣지 서버에서 실행될 수 있습니다. 같은 애플리케이션 코드를 여러 환경에 맞게 패키징할 수 있고, 인프라는 트래픽이 어디로 들어오고 서비스가 어디서 실행되며 데이터와 배포 작업이 어떻게 관리되는지를 결정합니다.",
            })}
          </div>
          <div className="space-y-1">
            {[
              {
                title: "Local",
                desc: l.trans({
                  en: "Developer machine for fast iteration. Good for MVP screens, feature prototypes, and local debugging.",
                  ko: "빠르게 개발하고 확인하는 개발자 PC 환경입니다. MVP 화면, 기능 프로토타입, 로컬 디버깅에 적합합니다.",
                }),
              },
              {
                title: "Cloud Cluster",
                desc: l.trans({
                  en: "Kubernetes-based runtime for shared team environments and production-like workloads.",
                  ko: "팀 공용 환경과 운영에 가까운 워크로드를 위한 Kubernetes 기반 실행 환경입니다.",
                }),
              },
              {
                title: "Edge",
                desc: l.trans({
                  en: "Near-site server for stores, kiosks, robots, factories, buildings, or local device networks.",
                  ko: "매장, 키오스크, 로봇, 공장, 건물, 로컬 장비망 가까이에서 실행되는 현장 서버입니다.",
                }),
              },
              {
                title: "Master",
                desc: l.trans({
                  en: "Deployment control area for CI/CD, environment files, secrets, and release automation.",
                  ko: "CI/CD, 환경 파일, 비밀값, 릴리스 자동화를 관리하는 배포 제어 영역입니다.",
                }),
              },
            ].map(({ title, desc }) => (
              <div key={title} className="rounded-xl border border-base-300 bg-base-100 px-4 py-0">
                <span className="font-mono font-semibold text-primary">{title}: </span>

                <span className="text-base-content/70 text-sm">{desc}</span>
              </div>
            ))}
          </div>
          <Docs.Mermaid
            title="Infrastructure shape"
            chart={`flowchart LR
  developer["Developer"] --> master["Master Infra"]
  master --> cluster["Cloud Cluster"]
  master --> edge["Edge Server"]
  cluster --> app["Application Runtime"]
  edge --> app
  app --> users["Users And Devices"]`}
          />
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide
        id="choose-option"
        title={l.trans({ en: "Which Option Should I Use?", ko: "어떤 구성을 선택할까?" })}
      >
        <Docs.Title>{l.trans({ en: "Which Option Should I Use?", ko: "어떤 구성을 선택할까?" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Start from the product situation, not from the infrastructure name. A small internal tool, a team QA environment, a store kiosk, and a production service need different levels of infrastructure.",
              ko: "인프라 이름보다 제품 상황에서 먼저 출발하세요. 작은 내부 도구, 팀 QA 환경, 매장 키오스크, 운영 서비스는 서로 다른 수준의 인프라가 필요합니다.",
            })}
          </div>
          <div className="space-y-1">
            {[
              {
                title: l.trans({ en: "MVP or feature prototype", ko: "MVP 또는 기능 프로토타입" }),
                desc: l.trans({
                  en: "Use local development first. Keep the setup small until the product needs shared data, shared testing, or deployment automation.",
                  ko: "먼저 로컬 개발을 사용합니다. 제품에 공용 데이터, 팀 테스트, 배포 자동화가 필요해질 때까지 구성을 작게 유지합니다.",
                }),
              },
              {
                title: l.trans({ en: "Team QA or staging", ko: "팀 QA 또는 스테이징" }),
                desc: l.trans({
                  en: "Use cloud deployment with debug or develop environments so the team can test the same service together.",
                  ko: "debug 또는 develop 환경의 클라우드 배포를 사용해 팀이 같은 서비스를 함께 검증할 수 있게 합니다.",
                }),
              },
              {
                title: l.trans({ en: "Physical site or device network", ko: "물리 현장 또는 장비망" }),
                desc: l.trans({
                  en: "Use edge when the service is close to stores, kiosks, factories, buildings, robots, or private device networks.",
                  ko: "서비스가 매장, 키오스크, 공장, 건물, 로봇, 사설 장비망 가까이에서 동작해야 한다면 edge를 사용합니다.",
                }),
              },
              {
                title: l.trans({ en: "Headquarters plus branches", ko: "본사와 지점 구조" }),
                desc: l.trans({
                  en: "Use a hybrid shape: cloud cluster as the main service and edge servers for nearby execution, proxying, or cache-like responsibilities.",
                  ko: "하이브리드 구성을 사용합니다. 클라우드 클러스터를 메인 서비스로 두고, 엣지 서버는 현장 실행, 프록시, 캐시성 역할을 담당합니다.",
                }),
              },
            ].map(({ title, desc }) => (
              <div key={title} className="rounded-xl border border-base-300 bg-base-100 px-4 py-0">
                <span className="font-bold text-base-content">{title}: </span>

                <span className="text-base-content/70 text-sm">{desc}</span>
              </div>
            ))}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="traffic-flow" title={l.trans({ en: "How Traffic Moves", ko: "트래픽 흐름" })}>
        <Docs.Title>{l.trans({ en: "How Traffic Moves", ko: "트래픽 흐름" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Infrastructure does not change the business code inside your app. It decides how a request reaches the Akan runtime. The path is simple on your laptop, more structured in a cloud cluster, and sometimes site-specific when edge servers are involved.",
              ko: "인프라는 앱 내부의 비즈니스 코드를 바꾸지 않습니다. 대신 요청이 어떤 경로로 Akan 런타임에 도착할지를 결정합니다. 내 PC에서는 경로가 단순하고, 클라우드 클러스터에서는 구조화된 계층을 거치며, 엣지 서버가 있으면 현장별 경로가 추가될 수 있습니다.",
            })}
          </div>
          <Docs.Mermaid
            title="Request paths"
            chart={`flowchart LR
  browser["Browser Or Device"] --> domain["Domain Or Local Address"]
  domain --> local["Local Dev Server"]
  domain --> ingress["Cloud Ingress"]
  domain --> edgeProxy["Edge Proxy Or Tunnel"]
  local --> runtime["Akan App Runtime"]
  ingress --> service["Kubernetes Service"]
  service --> runtime
  edgeProxy --> edgeRuntime["Edge Runtime"]
  edgeRuntime --> runtime
  runtime --> response["Page API WebSocket Asset"]`}
          />
          <div className="space-y-1">
            {[
              {
                title: l.trans({ en: "Local path", ko: "로컬 경로" }),
                desc: l.trans({
                  en: "A developer opens localhost and talks almost directly to the Akan dev runtime. This is the fastest path for building screens and checking business flows.",
                  ko: "개발자는 localhost로 접속하고 Akan 개발 런타임에 거의 직접 연결됩니다. 화면을 만들고 비즈니스 흐름을 확인하기에 가장 빠른 경로입니다.",
                }),
              },
              {
                title: l.trans({ en: "Cloud path", ko: "클라우드 경로" }),
                desc: l.trans({
                  en: "A user enters through a public domain. Kubernetes Ingress receives the request, Service finds the right app pod, and the Akan runtime handles the actual page or API response.",
                  ko: "사용자는 공개 도메인으로 들어옵니다. Kubernetes Ingress가 요청을 받고, Service가 적절한 앱 pod를 찾은 뒤, Akan 런타임이 실제 페이지나 API 응답을 처리합니다.",
                }),
              },
              {
                title: l.trans({ en: "Edge path", ko: "엣지 경로" }),
                desc: l.trans({
                  en: "A store, kiosk, robot, or local device network can reach an edge proxy first. The edge side may serve nearby runtime work or forward traffic to the cloud service.",
                  ko: "매장, 키오스크, 로봇, 로컬 장비망은 먼저 엣지 프록시에 연결될 수 있습니다. 엣지 쪽은 가까운 런타임 작업을 처리하거나 클라우드 서비스로 트래픽을 전달할 수 있습니다.",
                }),
              },
            ].map(({ title, desc }) => (
              <div key={title} className="rounded-xl border border-base-300 bg-base-100 px-4 py-0">
                <span className="font-bold text-base-content">{title}: </span>

                <span className="text-base-content/70 text-sm">{desc}</span>
              </div>
            ))}
          </div>
          <div>
            {l.trans({
              en: "After the request reaches Akan App Runtime, the runtime classifies what kind of work it is. A page request renders a web page, an API request runs signal/service logic, a WebSocket request keeps a realtime channel open, and static assets are served as files.",
              ko: "요청이 Akan App Runtime에 도착하면 런타임은 어떤 종류의 작업인지 분류합니다. 페이지 요청은 웹 페이지를 렌더링하고, API 요청은 signal/service 로직을 실행하며, 웹소켓 요청은 실시간 채널을 유지하고, 정적 파일은 파일로 응답합니다.",
            })}
          </div>
          <div className="space-y-1">
            {[
              {
                title: "Page",
                desc: l.trans({
                  en: "SSR or CSR page response for browser users.",
                  ko: "브라우저 사용자를 위한 SSR 또는 CSR 페이지 응답입니다.",
                }),
              },
              {
                title: "API",
                desc: l.trans({
                  en: "Business operations through signal and service logic.",
                  ko: "signal과 service 로직을 통한 비즈니스 작업입니다.",
                }),
              },
              {
                title: "WebSocket",
                desc: l.trans({
                  en: "Realtime updates and long-lived client connections.",
                  ko: "실시간 업데이트와 오래 유지되는 클라이언트 연결입니다.",
                }),
              },
              {
                title: "Asset",
                desc: l.trans({
                  en: "Static files, client bundles, images, and generated output.",
                  ko: "정적 파일, 클라이언트 번들, 이미지, 생성 산출물입니다.",
                }),
              },
            ].map(({ title, desc }) => (
              <div key={title} className="rounded-xl border border-base-300 bg-base-100 px-4 py-0">
                <span className="font-mono font-semibold text-primary">{title}: </span>

                <span className="text-base-content/70 text-sm">{desc}</span>
              </div>
            ))}
          </div>
          <Docs.Alert type="info">
            {l.trans({
              en: "Key idea: infrastructure chooses the route into the app, not the business behavior inside the app. Local, cloud, and edge paths can look different, but they all eventually hand work to the Akan runtime.",
              ko: "핵심은 이렇습니다. 인프라는 앱 안의 비즈니스 동작을 바꾸는 것이 아니라 앱으로 들어오는 경로를 선택합니다. 로컬, 클라우드, 엣지 경로는 서로 다르게 보일 수 있지만 결국 모두 Akan 런타임에 작업을 전달합니다.",
            })}
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="database-mode" title={l.trans({ en: "Database Mode", ko: "데이터베이스 모드" })}>
        <Docs.Title>{l.trans({ en: "Database Mode", ko: "데이터베이스 모드" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Start with single mode first. Most services do not need a separate database cluster on day one. When real performance limits, queue needs, or multi-instance operation appear, you can move up to multiple or cluster mode without changing the business shape of the app.",
              ko: "처음에는 single 모드로 시작하세요. 대부분의 서비스는 첫날부터 별도 데이터베이스 클러스터가 필요하지 않습니다. 실제 성능 한계, 큐 처리, 다중 인스턴스 운영 요구가 생기면 앱의 비즈니스 구조를 바꾸지 않고 multiple 또는 cluster 모드로 올리면 됩니다.",
            })}
          </div>
          <Docs.Alert type="info">
            {l.trans({
              en: "SQLite is the default database in single mode, but that does not mean it is only for toys. With WAL mode, SQLite has very strong practical performance. For many ordinary services under about 10,000 DAU, single mode is usually enough until real usage data proves otherwise.",
              ko: "single 모드의 기본 데이터베이스는 SQLite이지만, 그렇다고 장난감 서비스용이라는 뜻은 아닙니다. WAL 모드를 기본 지원하기 때문에 SQLite의 실제 성능은 상당히 좋습니다. DAU 1만 명 이하의 웬만한 일반 서비스는 실제 사용 데이터가 병목을 증명하기 전까지 single 모드로도 충분한 경우가 많습니다.",
            })}
          </Docs.Alert>
          <div className="space-y-1">
            {[
              {
                title: "single",
                desc: l.trans({
                  en: "Best starting point for MVPs, early internal tools, admin screens, content sites, and many small-to-medium services.",
                  ko: "MVP, 초기 내부 도구, 관리자 화면, 콘텐츠 사이트, 많은 중소규모 서비스의 출발점으로 가장 적합합니다.",
                }),
                database: "SQLite",
                queue: l.trans({
                  en: "SQLite based, Bun IPC accelerated processing",
                  ko: "SQLite기반, Bun IPC 가속 처리",
                }),
                cache: l.trans({ en: "SQLite based key-value cache", ko: "SQLite 기반 키-값 캐시" }),
                performance: l.trans({
                  en: "High enough for most products under roughly 10k DAU, especially with WAL mode.",
                  ko: "WAL 모드 기준으로 DAU 약 1만 명 이하의 웬만한 제품에는 충분한 성능을 기대할 수 있습니다.",
                }),
              },
              {
                title: "multiple",
                desc: l.trans({
                  en: "Use this when the product starts needing a separated cache, pub/sub, queue-like behavior, or more realistic local service boundaries.",
                  ko: "제품에 분리된 캐시, pub/sub, 큐성 작업, 더 현실적인 로컬 서비스 경계가 필요해질 때 사용합니다.",
                }),
                database: "libsql",
                queue: "Redis",
                cache: "Redis",
                performance: l.trans({
                  en: "Better separation for cache and background work while staying lighter than full cluster-style storage.",
                  ko: "전체 클러스터형 저장소보다 가볍게 유지하면서 캐시와 백그라운드 작업을 분리할 수 있습니다.",
                }),
              },
              {
                title: "cluster",
                desc: l.trans({
                  en: "Use this when the team wants local behavior to resemble a production cluster before release or when heavier relational persistence is needed.",
                  ko: "릴리스 전에 로컬 동작을 운영 클러스터와 비슷하게 맞추고 싶거나 더 무거운 관계형 영속성이 필요할 때 사용합니다.",
                }),
                database: "Postgres",
                queue: "Redis",
                cache: "Redis",
                performance: l.trans({
                  en: "Most production-like local mode. Better for heavier concurrent workloads and cluster-oriented validation.",
                  ko: "가장 운영 환경에 가까운 로컬 모드입니다. 더 무거운 동시 처리와 클러스터 지향 검증에 적합합니다.",
                }),
              },
            ].map(({ title, desc, database, queue, cache, performance }) => (
              <div key={title} className="rounded-xl border border-base-300 bg-base-100 px-4 py-0">
                <div className="font-mono font-semibold text-primary">{title}</div>
                <div className="mt-2 text-base-content/70 text-sm">{desc}</div>
                <div className="mt-3 space-y-1 text-sm">
                  <div className="rounded-lg bg-base-200 px-3 py-2">
                    <span className="font-semibold">{l.trans({ en: "Database", ko: "데이터베이스" })}: </span>
                    <span className="font-mono">{database}</span>
                  </div>
                  <div className="rounded-lg bg-base-200 px-3 py-2">
                    <span className="font-semibold">{l.trans({ en: "Queue / PubSub", ko: "큐 / PubSub" })}: </span>
                    {queue}
                  </div>
                  <div className="rounded-lg bg-base-200 px-3 py-2">
                    <span className="font-semibold">{l.trans({ en: "Cache", ko: "캐시" })}: </span>
                    {cache}
                  </div>
                  <div className="rounded-lg bg-base-200 px-3 py-2">
                    <span className="font-semibold">{l.trans({ en: "Performance", ko: "성능" })}: </span>
                    {performance}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="space-y-1">
            <Code.Snippet
              className="w-full"
              title="akan.config.ts"
              code={`const config: AppConfig = {
  defaultDatabaseMode: "single",
};`}
            />
            <Code.Snippet
              className="w-full"
              title="Local database commands"
              language="bash"
              code={`akan dbup --mode multiple
akan dbup --mode cluster`}
            />
          </div>
          <Docs.Alert>
            {l.trans({
              en: "A practical rule: do not upgrade database mode because it feels safer. Stay on single until you see real needs such as Redis-backed pub/sub, separate queue/cache behavior, heavier concurrent writes, or a deployment shape that must resemble production.",
              ko: "실용적인 기준은 이렇습니다. 막연히 더 안전해 보인다는 이유로 데이터베이스 모드를 올리지 마세요. Redis 기반 pub/sub, 분리된 큐/캐시 동작, 더 무거운 동시 쓰기, 운영과 비슷한 배포 검증이 실제로 필요해질 때까지 single을 유지하면 됩니다.",
            })}
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="growth-stage" title={l.trans({ en: "Growth Stages", ko: "성장 단계" })}>
        <Docs.Title>{l.trans({ en: "Growth Stages", ko: "성장 단계" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Infrastructure does not need to start big. A business can begin with one server and one container, then grow step by step as traffic, reliability requirements, and physical site needs increase.",
              ko: "인프라는 처음부터 크게 시작할 필요가 없습니다. 비즈니스는 서버 하나와 컨테이너 하나로 시작하고, 트래픽과 안정성 요구, 현장 운영 요구가 커질 때 단계적으로 확장하면 됩니다.",
            })}
          </div>
          <Docs.Mermaid
            title="Infrastructure growth"
            chart={`flowchart LR
  stage1["1. Solo Dev<br/>Single Server<br/>Single Container"] --> stage2["2. More Users<br/>Single Server<br/>Multiple Containers"]
  stage2 --> stage3["3. Cloud Scale<br/>Multiple Servers<br/>Multiple Containers"]
  stage3 --> stage4["4. Large Service<br/>Cloud Cluster<br/>Distributed Edge Servers"]`}
          />
          <div className="space-y-1">
            <div className="gap-2 rounded-xl border border-base-300 bg-base-100 p-4 lg:grid">
              <div className="space-y-1">
                <div className="font-bold text-base-content">
                  {l.trans({ en: "1. Single server", ko: "1. 싱글 서버" })}
                </div>
                <div className="text-base-content/70 text-sm">
                  {l.trans({
                    en: "A small product, MVP, internal tool, or early admin page can run as a single server with a single Akan container. single database mode is usually enough.",
                    ko: "작은 제품, MVP, 내부 도구, 초기 관리자 화면은 서버 하나와 Akan 컨테이너 하나로 충분히 운영할 수 있습니다. 데이터베이스도 보통 single 모드면 충분합니다.",
                  })}
                </div>
                <div className="rounded-lg bg-base-200 px-3 py-2 font-mono text-base-content/80 text-xs">
                  single server / single container / single mode
                </div>
                <Docs.Alert type="info">
                  {l.trans({
                    en: "Akan runtime's single container uses about 0.05 CPU/200MB RAM at boot, and about 0.5 CPU/0.5GB RAM in use. It handles all database, api server, web server, CSR page, image optimization, cache, queue, etc., isn't it amazing?",
                    ko: "Akan 런타임의 싱글 컨테이너는 부팅 시 0.05 cpu/200MB RAM 사용하며, 실사용 시 0.5 cpu/0.5GB RAM 정도를 사용합니다. 데이터베이스, api서버, 웹서버, CSR페이지, 이미지 최적화, 캐시, 큐, 멀티스레드, 로드밸런싱 등을 모두 처리하는데, 놀랍지 않나요?",
                  })}
                </Docs.Alert>
              </div>
              <Docs.Mermaid
                className="col-span-2"
                title={l.trans({ en: "1. Single server", ko: "1. 싱글 서버" })}
                chart={`flowchart TB
  user["User"] --> server["Single Server"]
  server --> runtime["Akan Runtime Container"]
  runtime --> sqlite["SQLite WAL Storage"]
  runtime --> localCache["Local Cache"]
  runtime --> localQueue["Local Queue"]`}
              />
            </div>

            <div className="gap-2 rounded-xl border border-base-300 bg-base-100 p-4 lg:grid">
              <div className="space-y-1">
                <div className="font-bold text-base-content">
                  {l.trans({ en: "2. Single server, multiple containers", ko: "2. 싱글 서버 다중 컨테이너" })}
                </div>
                <div className="text-base-content/70 text-sm">
                  {l.trans({
                    en: "When traffic grows but one machine is still enough, run multiple containers on the same server. This is vertical scaling: stronger server, more containers, and multiple or cluster database mode.",
                    ko: "트래픽은 늘었지만 서버 한 대로 아직 충분하다면 같은 서버 안에서 여러 컨테이너를 실행합니다. 더 강한 서버, 더 많은 컨테이너, multiple 또는 cluster 데이터베이스 모드로 올리는 수직 확장 단계입니다.",
                  })}
                </div>
                <div className="rounded-lg bg-base-200 px-3 py-2 font-mono text-base-content/80 text-xs">
                  single server / multiple containers / multiple or cluster mode
                </div>
                <Docs.Alert type="info">
                  {l.trans({
                    en: "Akan Runtime runs multiple child servers based on the AKAN_REPLICA environment variable setting to perform load balancing. There is no need to run multiple runtimes for load balancing purposes, and if stability improvement is needed, multiple runtimes can be run.",
                    ko: "Akan Runtime은 AKAN_REPLICA 환경변수 설정에 따라 여러 child 서버를 실행해 로드밸런싱을 진행합니다. 로드밸런싱 목적으로는 여러 런타임을 실행할 필요가 없고, 안정성 향상이 필요하다면 여러 런타임을 실행하면 됩니다.",
                  })}
                </Docs.Alert>
              </div>
              <Docs.Mermaid
                className="col-span-2"
                title={l.trans({ en: "2. Single server, multiple containers", ko: "2. 싱글 서버 다중 컨테이너" })}
                chart={`flowchart TB
  user["Users"] --> proxy["Reverse Proxy"]
  proxy --> server["Single Large Server"]
  server --> runtime1["Akan Runtime Container A"]
  server --> runtime2["Akan Runtime Container B"]
  server --> runtime3["Akan Runtime Container C"]
  runtime1 --> redis["Redis Cache PubSub Queue"]
  runtime2 --> redis
  runtime3 --> redis
  runtime1 --> database["libsql Or Postgres"]
  runtime2 --> database
  runtime3 --> database`}
              />
            </div>

            <div className="gap-2 rounded-xl border border-base-300 bg-base-100 p-4 lg:grid">
              <div className="space-y-1">
                <div className="font-bold text-base-content">
                  {l.trans({ en: "3. Cloud cluster scale", ko: "3. 클라우드 클러스터 확장" })}
                </div>
                <div className="text-base-content/70 text-sm">
                  {l.trans({
                    en: "When one server is no longer enough, move to a cloud cluster. Multiple servers run multiple containers, and cluster mode keeps the database/cache layer closer to production operation.",
                    ko: "서버 한 대로 부족해지면 클라우드 클러스터로 이동합니다. 여러 서버에서 여러 컨테이너가 실행되고, cluster 모드로 데이터베이스/캐시 계층도 운영에 가까운 형태가 됩니다.",
                  })}
                </div>
                <div className="rounded-lg bg-base-200 px-3 py-2 font-mono text-base-content/80 text-xs">
                  multiple servers / multiple containers / cluster mode
                </div>
              </div>
              <Docs.Mermaid
                className="col-span-2"
                title={l.trans({ en: "3. Cloud cluster scale", ko: "3. 클라우드 클러스터 확장" })}
                chart={`flowchart TB
  user["Users"] --> ingress["Kubernetes Ingress"]
  ingress --> service["Kubernetes Service"]
  service --> node1["Cloud Node A"]
  service --> node2["Cloud Node B"]
  service --> node3["Cloud Node C"]
  node1 --> runtime1["Akan Runtime Pod"]
  node2 --> runtime2["Akan Runtime Pod"]
  node3 --> runtime3["Akan Runtime Pod"]
  runtime1 --> redis["Redis Cluster"]
  runtime2 --> redis
  runtime3 --> redis
  runtime1 --> postgres["Postgres Database"]
  runtime2 --> postgres
  runtime3 --> postgres`}
              />
            </div>

            <div className="gap-2 rounded-xl border border-base-300 bg-base-100 p-4 lg:grid">
              <div className="space-y-1">
                <div className="font-bold text-base-content">
                  {l.trans({ en: "4. Cloud plus distributed edge", ko: "4. 클라우드와 분산 엣지" })}
                </div>
                <div className="text-base-content/70 text-sm">
                  {l.trans({
                    en: "Very large services can keep the cloud cluster from stage 3 and add edge servers below it. Each edge server has its own Akan runtime and local database, so stores, factories, robots, or local networks can compute and store nearby data like a distributed cache layer.",
                    ko: "초대형 서비스는 3번 단계의 클라우드 클러스터를 유지한 채 그 아래에 엣지 서버들을 추가할 수 있습니다. 각 엣지 서버는 자체 Akan 런타임과 로컬 데이터베이스를 가지므로 매장, 공장, 로봇, 로컬 네트워크가 가까운 곳에서 데이터를 계산하고 저장하는 분산 캐시 계층처럼 동작할 수 있습니다.",
                  })}
                </div>
                <div className="rounded-lg bg-base-200 px-3 py-2 font-mono text-base-content/80 text-xs">
                  cloud cluster / edge runtime per site / database per edge
                </div>
              </div>
              <Docs.Mermaid
                className="col-span-2"
                title={l.trans({ en: "4. Cloud plus distributed edge", ko: "4. 클라우드와 분산 엣지" })}
                chart={`flowchart TB
  cloudIngress["Cloud Ingress"] --> cloudRuntime["Cloud Akan Runtime Pods"]
  cloudRuntime --> redis["Redis Cluster"]
  cloudRuntime --> postgres["Cloud Postgres Database"]
  cloudRuntime --> edge1["Store Edge Server"]
  cloudRuntime --> edge2["Factory Edge Server"]
  cloudRuntime --> edge3["Robot Edge Server"]
  users["Users And Devices"] --> cloudIngress
  users["Users And Devices"] --> edge1
  users --> edge2
  users --> edge3
  edge1 --> edgeRuntime1["Edge Akan Runtime"]
  edge2 --> edgeRuntime2["Edge Akan Runtime"]
  edge3 --> edgeRuntime3["Edge Akan Runtime"]
  edgeRuntime1 --> edgeDb1["Store Edge Database"]
  edgeRuntime2 --> edgeDb2["Factory Edge Database"]
  edgeRuntime3 --> edgeDb3["Robot Edge Database"]
  edgeRuntime1 --> edgeCache1["Store Cache"]
  edgeRuntime2 --> edgeCache2["Factory Cache"]
  edgeRuntime3 --> edgeCache3["Robot Cache"]`}
              />
            </div>
          </div>
          <Docs.Alert type="info">
            {l.trans({
              en: "The practical rule is to grow only when the business asks for it. Start small, measure real usage, then move from single server to multi-container, cloud cluster, and finally cloud plus edge.",
              ko: "실용적인 기준은 비즈니스가 요구할 때만 확장하는 것입니다. 작게 시작하고 실제 사용량을 측정한 뒤, 싱글 서버에서 다중 컨테이너, 클라우드 클러스터, 마지막으로 클라우드와 엣지 조합으로 이동하면 됩니다.",
            })}
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.TitleNavigator className="fixed top-32 right-0 hidden w-[250px] flex-col gap-2 lg:flex" />
    </Scroll>
  );
}
