import { usePage } from "@apps/akan/client";
import { Docs } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { Image } from "akanjs/ui";

export default function Page() {
  const { l } = usePage();
  return (
    <Scroll>
      <Scroll.Slide id="backend-overview" title={l.trans({ en: "Backend System", ko: "백엔드 시스템" })}>
        <Docs.Title>{l.trans({ en: "Backend System", ko: "백엔드 시스템" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: `The backend system is the foundation of your Akan.js application. Built on Nest.js, it provides a robust, scalable architecture for handling data storage, business logic, and API endpoints.`,
              ko: `백엔드 시스템은 Akan.js 애플리케이션의 기반입니다. Nest.js 위에 구축되어 데이터 저장, 비즈니스 로직, API 엔드포인트를 처리하기 위한 견고하고 확장 가능한 아키텍처를 제공합니다.`,
            })}
          </div>
          <div className="my-6 rounded-lg bg-primary/10 p-6">
            <div className="mb-3 font-bold text-lg text-primary">
              {l.trans({ en: "🏗️ Architecture Highlights", ko: "🏗️ 아키텍처 하이라이트" })}
            </div>
            <div className="text-base-content/80 text-sm">
              {l.trans({
                en: `Each function has one Nest module, and these modules combine to form a server. Multiple servers form a cluster that provides high availability and scalability for your services.`,
                ko: `각 기능별로 1개의 Nest 모듈이 만들어지며, 모듈들이 모여 1개의 서버를 구성합니다. 여러 서버가 모여 서비스의 고가용성과 확장성을 제공하는 클러스터를 형성합니다.`,
              })}
            </div>
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="module-structure" title={l.trans({ en: "Backend Module Structure", ko: "백엔드 모듈 구조" })}>
        <Docs.Title>{l.trans({ en: "Backend Module Structure", ko: "백엔드 모듈 구조" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: `Each data model in Akan.js has its own dedicated module. This modular approach ensures clean separation of concerns and makes your codebase easy to maintain and extend.`,
              ko: `Akan.js의 각 데이터 모델은 전용 모듈을 가집니다. 이러한 모듈식 접근 방식은 관심사의 깔끔한 분리를 보장하고 코드베이스를 유지보수하고 확장하기 쉽게 만듭니다.`,
            })}
          </div>
          <div className="my-6 rounded-lg bg-base-200 p-6">
            <Image src="/akanjsImage/back_0.png" width={1000} height={1000} className="w-full rounded-lg" />
          </div>
          <div>
            {l.trans({
              en: `Each module contains four key components that work together:`,
              ko: `각 모듈은 함께 작동하는 네 가지 핵심 구성 요소를 포함합니다:`,
            })}
          </div>
          <div className="my-4 space-y-3">
            <div className="rounded-lg border border-base-300 bg-base-200 p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/70 font-bold text-primary-content text-sm">
                  1
                </span>
                <strong className="text-base-content">Constant</strong>
              </div>
              <div className="ml-8 text-base-content/70 text-sm">
                {l.trans({
                  en: `Defines the data model schema, types, enums, and validation rules. This is the single source of truth shared between backend and frontend.`,
                  ko: `데이터 모델 스키마, 타입, 열거형, 검증 규칙을 정의합니다. 백엔드와 프론트엔드 간에 공유되는 단일 진실의 원천입니다.`,
                })}
              </div>
            </div>
            <div className="rounded-lg border border-base-300 bg-base-200 p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/70 font-bold text-primary-content text-sm">
                  2
                </span>
                <strong className="text-base-content">Document</strong>
              </div>
              <div className="ml-8 text-base-content/70 text-sm">
                {l.trans({
                  en: `Handles MongoDB operations including CRUD, queries, filters, and document methods. Includes middleware hooks for pre/post operations.`,
                  ko: `CRUD, 쿼리, 필터, 문서 메서드를 포함한 MongoDB 작업을 처리합니다. 작업 전/후 미들웨어 훅을 포함합니다.`,
                })}
              </div>
            </div>
            <div className="rounded-lg border border-base-300 bg-base-200 p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/70 font-bold text-primary-content text-sm">
                  3
                </span>
                <strong className="text-base-content">Service</strong>
              </div>
              <div className="ml-8 text-base-content/70 text-sm">
                {l.trans({
                  en: `Contains business logic and orchestrates operations. Supports dependency injection to access other services and external APIs.`,
                  ko: `비즈니스 로직을 포함하고 작업을 조율합니다. 다른 서비스와 외부 API에 접근하기 위한 의존성 주입을 지원합니다.`,
                })}
              </div>
            </div>
            <div className="rounded-lg border border-base-300 bg-base-200 p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/70 font-bold text-primary-content text-sm">
                  4
                </span>
                <strong className="text-base-content">Signal</strong>
              </div>
              <div className="ml-8 text-base-content/70 text-sm">
                {l.trans({
                  en: `Exposes GraphQL endpoints (Slices and Endpoints) with automatic type generation, authentication guards, and rate limiting.`,
                  ko: `자동 타입 생성, 인증 가드, 속도 제한과 함께 GraphQL 엔드포인트(슬라이스와 엔드포인트)를 노출합니다.`,
                })}
              </div>
            </div>
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="server-cluster" title={l.trans({ en: "Server Cluster Structure", ko: "서버 클러스터 구조" })}>
        <Docs.Title>{l.trans({ en: "Server Cluster Structure", ko: "서버 클러스터 구조" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: `Akan.js servers operate in a cluster configuration with two distinct modes, each optimized for different workloads:`,
              ko: `Akan.js 서버는 서로 다른 워크로드에 최적화된 두 가지 모드로 클러스터 구성에서 운영됩니다:`,
            })}
          </div>
          <div className="my-4 space-y-3">
            <div className="rounded-lg bg-base-200 p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-2xl">⚡</span>
                <strong className="text-base-content text-lg">
                  {l.trans({ en: "Federation Mode", ko: "페더레이션 모드" })}
                </strong>
              </div>
              <div className="text-base-content/70 text-sm">
                {l.trans({
                  en: `Handles incoming requests from the frontend with horizontal scaling capability. Multiple containers can be deployed to distribute the load, ensuring high availability and responsiveness.`,
                  ko: `수평 확장 기능으로 프론트엔드로부터 들어오는 요청을 처리합니다. 여러 컨테이너를 배포하여 부하를 분산할 수 있어 고가용성과 응답성을 보장합니다.`,
                })}
              </div>
            </div>
            <div className="rounded-lg bg-base-200 p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-2xl">🔄</span>
                <strong className="text-base-content text-lg">{l.trans({ en: "Batch Mode", ko: "배치 모드" })}</strong>
              </div>
              <div className="text-base-content/70 text-sm">
                {l.trans({
                  en: `Runs as a single container in the cluster for scheduled tasks, queue processing, and security operations. Ensures consistent execution without race conditions.`,
                  ko: `예약된 작업, 큐 처리, 보안 작업을 위해 클러스터에서 단일 컨테이너로 실행됩니다. 경쟁 조건 없이 일관된 실행을 보장합니다.`,
                })}
              </div>
            </div>
          </div>
          <div className="my-6 rounded-lg bg-base-200 p-6">
            <Image src="/akanjsImage/back_1.png" width={1000} height={1000} className="w-full rounded-lg" />
          </div>
          <div>
            {l.trans({
              en: `Both server modes connect to shared infrastructure:`,
              ko: `두 서버 모드는 공유 인프라에 연결됩니다:`,
            })}
          </div>
          <div className="my-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-lg bg-base-200 p-4">
              <div className="mb-2 font-bold text-base-content">🗄️ MongoDB</div>
              <div className="text-base-content/70 text-sm">
                {l.trans({
                  en: `Primary database for persistent data storage. Supports 1-3 database connections for sharding and replication.`,
                  ko: `영구 데이터 저장을 위한 주 데이터베이스. 샤딩과 복제를 위해 1-3개의 데이터베이스 연결을 지원합니다.`,
                })}
              </div>
            </div>
            <div className="rounded-lg bg-base-200 p-4">
              <div className="mb-2 font-bold text-base-content">⚡ Redis</div>
              <div className="text-base-content/70 text-sm">
                {l.trans({
                  en: `In-memory cache for session management, real-time subscriptions, and shared state between server instances.`,
                  ko: `세션 관리, 실시간 구독, 서버 인스턴스 간 공유 상태를 위한 인메모리 캐시.`,
                })}
              </div>
            </div>
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="request-handling" title={l.trans({ en: "Request Handling", ko: "요청 처리" })}>
        <Docs.Title>{l.trans({ en: "Request Handling", ko: "요청 처리" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: `Understanding how requests flow through the backend helps you build efficient applications:`,
              ko: `백엔드를 통해 요청이 어떻게 흐르는지 이해하면 효율적인 애플리케이션을 구축하는 데 도움이 됩니다:`,
            })}
          </div>
          <div className="my-4 space-y-2">
            <div className="flex items-start gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/70 font-bold text-primary-content text-xs">
                1
              </span>
              <div>
                <strong>{l.trans({ en: "Query/Mutation Operations", ko: "쿼리/뮤테이션 작업" })}</strong>:{" "}
                {l.trans({
                  en: "Standard CRUD and custom operations are handled by Federation mode servers for optimal load distribution.",
                  ko: "표준 CRUD 및 커스텀 작업은 최적의 부하 분산을 위해 페더레이션 모드 서버에서 처리됩니다.",
                })}
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/70 font-bold text-primary-content text-xs">
                2
              </span>
              <div>
                <strong>{l.trans({ en: "Queue/Batch Operations", ko: "큐/배치 작업" })}</strong>:{" "}
                {l.trans({
                  en: "Scheduled jobs, background processing, and queue tasks are handled by Batch mode for consistent execution.",
                  ko: "예약된 작업, 백그라운드 처리, 큐 작업은 일관된 실행을 위해 배치 모드에서 처리됩니다.",
                })}
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/70 font-bold text-primary-content text-xs">
                3
              </span>
              <div>
                <strong>{l.trans({ en: "Real-time Subscriptions", ko: "실시간 구독" })}</strong>:{" "}
                {l.trans({
                  en: "GraphQL subscriptions use Redis pub/sub to sync data across all Federation instances in real-time.",
                  ko: "GraphQL 구독은 Redis pub/sub을 사용하여 모든 페더레이션 인스턴스 간에 데이터를 실시간으로 동기화합니다.",
                })}
              </div>
            </div>
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.TitleNavigator className="fixed top-32 right-0 hidden w-[250px] flex-col gap-2 lg:flex" />
    </Scroll>
  );
}
