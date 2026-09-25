import { usePage } from "@apps/akan/client";
import { Code, Docs } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();
  return (
    <Scroll>
      <Scroll.Slide id="overview" title={l.trans({ en: "Environment Variables", ko: "환경변수" })}>
        <Docs.Title>{l.trans({ en: "Environment Variables", ko: "환경변수" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Akan.js provides a centralized environment configuration system through baseEnv and baseClientEnv. These objects contain essential runtime information that determines how your application operates across different environments (local, debug, develop, main) and contexts (server, client).",
              ko: "Akan.js는 baseEnv와 baseClientEnv를 통해 중앙화된 환경 설정 시스템을 제공합니다. 이 객체들은 애플리케이션이 다양한 환경(local, debug, develop, main)과 컨텍스트(server, client)에서 어떻게 동작하는지 결정하는 필수 런타임 정보를 포함합니다.",
            })}
          </div>
          <div className="my-4 space-y-3">
            <div className="rounded-lg bg-blue-50 p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-blue-600">🔧</span>
                <strong className="text-blue-800">baseEnv</strong>
              </div>
              <div className="text-blue-700 text-sm">
                {l.trans({
                  en: "Core environment variables shared across server and client. Contains app identity, environment type, operation mode, and network configuration.",
                  ko: "서버와 클라이언트 전반에서 공유되는 핵심 환경 변수. 앱 식별정보, 환경 타입, 운영 모드, 네트워크 설정을 포함합니다.",
                })}
              </div>
            </div>
            <div className="rounded-lg bg-green-50 p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-green-600">🌐</span>
                <strong className="text-green-800">baseClientEnv</strong>
              </div>
              <div className="text-green-700 text-sm">
                {l.trans({
                  en: "Extended environment for client-side operations. Includes all baseEnv properties plus client/server connection URIs, protocols, and render mode configuration.",
                  ko: "클라이언트 측 작업을 위한 확장 환경. baseEnv의 모든 속성과 클라이언트/서버 연결 URI, 프로토콜, 렌더 모드 설정을 포함합니다.",
                })}
              </div>
            </div>
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide
        id="root-env"
        title={l.trans({ en: "Root Environment Variables (.env)", ko: "루트 환경변수 (.env)" })}
      >
        <Docs.Title>{l.trans({ en: "Root Environment Variables (.env)", ko: "루트 환경변수 (.env)" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "You can configure environment variables in the .env file at the workspace root. These variables are accessible via process.env in Node.js environment and are used to initialize baseEnv and baseClientEnv.",
              ko: "워크스페이스 루트에 있는 .env 파일에서 환경변수를 설정할 수 있습니다. 이 변수들은 Node.js 환경에서 process.env를 통해 접근 가능하며, baseEnv와 baseClientEnv를 초기화하는데 사용됩니다.",
            })}
          </div>
          <Code.Snippet
            title=".env (Root)"
            code={`# Required - App Identity
NEXT_PUBLIC_APP_NAME=myapp
NEXT_PUBLIC_REPO_NAME=myrepo
NEXT_PUBLIC_SERVE_DOMAIN=example.com

# Environment Type (debug | develop | main | local | testing)
NEXT_PUBLIC_ENV=local

# Operation Mode (local | edge | cloud | module)
NEXT_PUBLIC_OPERATION_MODE=local

# Network Type (mainnet | testnet | debugnet)
NEXT_PUBLIC_NETWORK_TYPE=debugnet

# SSH Tunnel (for database connections)
SSH_TUNNEL_USERNAME=root
SSH_TUNNEL_PASSWORD=mypassword

# Server Configuration
SERVER_HOST=localhost
NEXT_PUBLIC_SERVER_PORT=8080
NEXT_PUBLIC_CLIENT_PORT=4200`}
          />
          <Docs.Alert>
            <div>
              {l.trans({
                en: "Variables prefixed with NEXT_PUBLIC_ are exposed to the browser. Never put sensitive data (API keys, passwords) in NEXT_PUBLIC_ variables.",
                ko: "NEXT_PUBLIC_ 접두사가 붙은 변수는 브라우저에 노출됩니다. 민감한 데이터(API 키, 비밀번호)를 NEXT_PUBLIC_ 변수에 넣지 마세요.",
              })}
            </div>
          </Docs.Alert>
          <div className="my-4 space-y-3">
            <div className="rounded-lg bg-yellow-50 p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-yellow-600">⚠️</span>
                <strong className="text-yellow-800">{l.trans({ en: "Required Variables", ko: "필수 변수" })}</strong>
              </div>
              <div className="text-sm text-yellow-700">
                {l.trans({
                  en: "NEXT_PUBLIC_APP_NAME, NEXT_PUBLIC_REPO_NAME, and NEXT_PUBLIC_SERVE_DOMAIN are required. The application will throw an error if these are not set.",
                  ko: "NEXT_PUBLIC_APP_NAME, NEXT_PUBLIC_REPO_NAME, NEXT_PUBLIC_SERVE_DOMAIN는 필수입니다. 설정되지 않으면 애플리케이션에서 에러가 발생합니다.",
                })}
              </div>
            </div>
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="base-env" title={l.trans({ en: "baseEnv", ko: "baseEnv" })}>
        <Docs.Title>{l.trans({ en: "baseEnv", ko: "baseEnv" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "baseEnv contains core environment variables that are shared across the entire application. It automatically reads from process.env and provides typed access to environment configuration.",
              ko: "baseEnv는 전체 애플리케이션에서 공유되는 핵심 환경 변수를 포함합니다. process.env에서 자동으로 읽어오며 환경 설정에 대한 타입 안전한 접근을 제공합니다.",
            })}
          </div>
          <Code.Snippet
            title="BaseEnv Interface"
            code={`import type { SshOptions } from "tunnel-ssh";

export type Environment = "testing" | "debug" | "develop" | "main" | "local";

export interface BaseEnv {
  repoName: string;              // Repository name (NEXT_PUBLIC_REPO_NAME)
  serveDomain: string;           // Serve domain (NEXT_PUBLIC_SERVE_DOMAIN)
  appName: string;               // Application name (NEXT_PUBLIC_APP_NAME)
  environment: Environment;      // Environment type (NEXT_PUBLIC_ENV)
  operationType: "server" | "client";  // Automatically detected
  operationMode: "local" | "edge" | "cloud" | "module";  // NEXT_PUBLIC_OPERATION_MODE
  networkType: "mainnet" | "testnet" | "debugnet";       // NEXT_PUBLIC_NETWORK_TYPE
  tunnelUsername: string;        // SSH tunnel username
  tunnelPassword: string;        // SSH tunnel password
}`}
          />
          <div className="my-4">
            <strong>{l.trans({ en: "Property Details:", ko: "속성 상세:" })}</strong>
          </div>
          <div className="my-4 space-y-3">
            <div className="rounded-lg bg-slate-50 p-3">
              <div className="mb-2 flex items-center gap-2">
                <code className="text-purple-600">environment</code>
              </div>
              <div className="text-slate-700 text-sm">
                <ul className="list-inside list-disc space-y-1">
                  <li>
                    <strong>local</strong>: {l.trans({ en: "Local development environment", ko: "로컬 개발 환경" })}
                  </li>
                  <li>
                    <strong>debug</strong>:{" "}
                    {l.trans({ en: "Debug server environment for testing", ko: "테스트용 디버그 서버 환경" })}
                  </li>
                  <li>
                    <strong>develop</strong>:{" "}
                    {l.trans({ en: "Development/staging environment", ko: "개발/스테이징 환경" })}
                  </li>
                  <li>
                    <strong>main</strong>: {l.trans({ en: "Production environment", ko: "프로덕션 환경" })}
                  </li>
                  <li>
                    <strong>testing</strong>:{" "}
                    {l.trans({ en: "Automated testing environment", ko: "자동화 테스트 환경" })}
                  </li>
                </ul>
              </div>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <div className="mb-2 flex items-center gap-2">
                <code className="text-purple-600">operationMode</code>
              </div>
              <div className="text-slate-700 text-sm">
                <ul className="list-inside list-disc space-y-1">
                  <li>
                    <strong>local</strong>:{" "}
                    {l.trans({ en: "Running locally with local services", ko: "로컬 서비스로 로컬에서 실행" })}
                  </li>
                  <li>
                    <strong>edge</strong>:{" "}
                    {l.trans({ en: "Edge deployment (Vercel Edge, etc.)", ko: "엣지 배포 (Vercel Edge 등)" })}
                  </li>
                  <li>
                    <strong>cloud</strong>:{" "}
                    {l.trans({ en: "Cloud/Kubernetes deployment", ko: "클라우드/쿠버네티스 배포" })}
                  </li>
                  <li>
                    <strong>module</strong>:{" "}
                    {l.trans({ en: "Running as a module/library", ko: "모듈/라이브러리로 실행" })}
                  </li>
                </ul>
              </div>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <div className="mb-2 flex items-center gap-2">
                <code className="text-purple-600">networkType</code>
              </div>
              <div className="text-slate-700 text-sm">
                <ul className="list-inside list-disc space-y-1">
                  <li>
                    <strong>mainnet</strong>:{" "}
                    {l.trans({
                      en: "Production network (auto-selected when environment is 'main')",
                      ko: "프로덕션 네트워크 (environment가 'main'일 때 자동 선택)",
                    })}
                  </li>
                  <li>
                    <strong>testnet</strong>:{" "}
                    {l.trans({
                      en: "Test network (auto-selected when environment is 'develop')",
                      ko: "테스트 네트워크 (environment가 'develop'일 때 자동 선택)",
                    })}
                  </li>
                  <li>
                    <strong>debugnet</strong>:{" "}
                    {l.trans({
                      en: "Debug network (default for other environments)",
                      ko: "디버그 네트워크 (다른 환경의 기본값)",
                    })}
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="base-client-env" title={l.trans({ en: "baseClientEnv", ko: "baseClientEnv" })}>
        <Docs.Title>{l.trans({ en: "baseClientEnv", ko: "baseClientEnv" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "baseClientEnv extends baseEnv with client-specific configuration. It provides automatic detection of client/server context and generates appropriate connection URIs.",
              ko: "baseClientEnv는 클라이언트 특화 설정으로 baseEnv를 확장합니다. 클라이언트/서버 컨텍스트를 자동 감지하고 적절한 연결 URI를 생성합니다.",
            })}
          </div>
          <Code.Snippet
            title="BaseClientEnv Interface"
            code={`export type BaseClientEnv = BaseEnv & {
  // Context Detection
  side: "server" | "client";       // Detected via typeof window
  renderMode: "ssr" | "csr";       // Server-side or Client-side rendering

  // Feature Flags
  websocket: boolean;              // WebSocket enabled (default: true)

  // Client Connection
  clientHost: string;              // Client hostname
  clientPort: number;              // Client port (4200 for SSR local, 4201 for CSR local, 443 for cloud)
  clientHttpProtocol: "http:" | "https:";
  clientHttpUri: string;           // Full client HTTP URI

  // Server Connection  
  serverHost: string;              // Backend server hostname
  serverPort: number;              // Backend server port (8080 for local, 443 for cloud)
  serverHttpProtocol: "http:" | "https:";
  serverHttpUri: string;           // Backend HTTP URI (/backend endpoint)
  serverGraphqlUri: string;        // GraphQL endpoint (/backend/graphql)
  serverWsProtocol: "ws:" | "wss:";
  serverWsUri: string;             // WebSocket URI
};`}
          />
          <div className="my-4">
            <strong>{l.trans({ en: "Auto-Generated URIs:", ko: "자동 생성 URI:" })}</strong>
          </div>
          <div className="my-4 space-y-3">
            <div className="rounded-lg bg-blue-50 p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-blue-600">🖥️</span>
                <strong className="text-blue-800">
                  {l.trans({ en: "Local Environment Example", ko: "로컬 환경 예시" })}
                </strong>
              </div>
              <div className="text-blue-700 text-sm">
                <code className="block rounded bg-blue-100 p-2">
                  {`clientHttpUri: "http://localhost:4200"
serverHttpUri: "http://localhost:8080/backend"
serverGraphqlUri: "http://localhost:8080/backend/graphql"
serverWsUri: "ws://localhost:8080"`}
                </code>
              </div>
            </div>
            <div className="rounded-lg bg-green-50 p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-green-600">☁️</span>
                <strong className="text-green-800">
                  {l.trans({ en: "Cloud Environment Example", ko: "클라우드 환경 예시" })}
                </strong>
              </div>
              <div className="text-green-700 text-sm">
                <code className="block rounded bg-green-100 p-2">
                  {`clientHttpUri: "https://myapp-debug.example.com"
serverHttpUri: "https://myapp-debug.example.com/backend"
serverGraphqlUri: "https://myapp-debug.example.com/backend/graphql"
serverWsUri: "wss://myapp-debug.example.com"`}
                </code>
              </div>
            </div>
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="usage-examples" title={l.trans({ en: "Usage Examples", ko: "사용 예시" })}>
        <Docs.Title>{l.trans({ en: "Usage Examples", ko: "사용 예시" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Here are practical examples of how baseEnv and baseClientEnv are used throughout the framework:",
              ko: "프레임워크 전반에서 baseEnv와 baseClientEnv가 사용되는 실제 예시입니다:",
            })}
          </div>

          <div className="mt-6 mb-4">
            <strong>{l.trans({ en: "Backend Server Configuration", ko: "백엔드 서버 설정" })}</strong>
          </div>
          <Code.Snippet
            title="boot.ts - Server Initialization"
            code={`import { BackendEnv, baseEnv } from "@akanjs/base";

// Use baseEnv to configure server behavior based on environment
export const createNestApp = async ({ env }: { env: BackendEnv }) => {
  // Enable GraphQL playground only in non-production
  GraphQLModule.forRootAsync({
    useFactory: () => ({
      playground: baseEnv.environment !== "main",
      introspection: baseEnv.environment !== "main",
    }),
  });

  // Enable auto-indexing only in non-production
  MongooseModule.forRootAsync({
    useFactory: () => ({ 
      uri: mongoUri, 
      autoIndex: baseEnv.environment !== "main" 
    }),
  });

  // Conditional module loading based on operation mode
  const modules = baseEnv.operationMode !== "edge" 
    ? [SearchDaemonModule] 
    : [];
};`}
          />

          <div className="mt-6 mb-4">
            <strong>{l.trans({ en: "Client API Connection", ko: "클라이언트 API 연결" })}</strong>
          </div>
          <Code.Snippet
            title="client.ts - API Client Setup"
            code={`import { baseClientEnv, baseEnv } from "@akanjs/base";

class Client {
  // Use auto-generated URIs for API connections
  uri = baseClientEnv.serverGraphqlUri;
  ws = baseClientEnv.serverWsUri;

  async getJwt(): Promise<string | null> {
    // Check if running on Next.js server (SSR)
    const isNextServer = baseClientEnv.side === "server" 
      && baseEnv.operationType === "client";
    
    if (isNextServer) {
      // Use Next.js cookies on server-side
      const nextHeaders = require("next/headers");
      return (await nextHeaders.cookies?.())?.get("jwt")?.value ?? null;
    }
    return Client.tokenStore.get(this) ?? null;
  }

  async waitUntilWebSocketConnected() {
    // Skip WebSocket wait on server side
    if (baseClientEnv.side === "server") return true;
    while (!this.getIo().socket.connected) {
      await sleep(300);
    }
  }
}`}
          />

          <div className="mt-6 mb-4">
            <strong>{l.trans({ en: "Router with SSR/CSR Detection", ko: "SSR/CSR 감지가 포함된 라우터" })}</strong>
          </div>
          <Code.Snippet
            title="router.ts - Navigation with Context Detection"
            code={`import { baseClientEnv } from "@akanjs/base";

class Router {
  push(href: string) {
    // Use server-side redirect for SSR
    if (baseClientEnv.side === "server") {
      redirect(fullHref);
    }
  }

  back() {
    // back() is only available on client side
    if (baseClientEnv.side === "server") {
      throw new Error("back is only available in client side");
    }
    this.#instance.back();
  }

  setLang(lang: string) {
    // Language change only works on client
    if (baseClientEnv.side === "server") {
      throw new Error("setLang is only available in client side");
    }
    this.#instance.replace(\`/\${lang}\${path}\`);
  }
}`}
          />
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="app-env-config" title={l.trans({ en: "Environment Config", ko: "환경 설정" })}>
        <Docs.Title>{l.trans({ en: "Environment Config", ko: "환경 설정" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Each application extends baseEnv/baseClientEnv with app-specific configuration. The env folder contains environment-specific files that are selected based on NEXT_PUBLIC_ENV.",
              ko: "각 애플리케이션은 앱별 설정으로 baseEnv/baseClientEnv를 확장합니다. env 폴더에는 NEXT_PUBLIC_ENV에 따라 선택되는 환경별 파일이 포함됩니다.",
            })}
          </div>
          <Code.Snippet
            title="env/env.client.ts - Client Environment Router"
            code={`import { env as debug } from "./env.client.debug";
import { env as develop } from "./env.client.develop";
import { env as local } from "./env.client.local";
import { env as main } from "./env.client.main";
import { env as testing } from "./env.client.testing";

const envConfigs = { debug, testing, develop, main, local };
const currentEnv = process.env.NEXT_PUBLIC_ENV ?? "local";
if (!(currentEnv in envConfigs)) throw new Error(\`Unknown environment: \${currentEnv}\`);

export const env = envConfigs[currentEnv as keyof typeof envConfigs];`}
          />
          <Code.Snippet
            title="env/env.client.local.ts - Local Client Config"
            code={`import { baseClientEnv } from "@akanjs/base";
import { AppClientEnv } from "./env.client.type";

export const env: AppClientEnv = {
  ...baseClientEnv,
  // Add app-specific client configurations here
} as const;`}
          />
          <Code.Snippet
            title="env/env.server.local.ts - Local Server Config"
            code={`import { baseEnv } from "@akanjs/base";
import type { ModulesOptions } from "../lib/option";

export const env: ModulesOptions = {
  ...baseEnv,
  hostname: null,
  security: {
    verifies: [["password", "phone", "naver", "kakao"]],
    sso: {
      google: {
        clientID: "...",
        clientSecret: "...",
      },
    },
  },
  objectStorage: {
    service: "r2",
    bucket: "myapp-debug",
    // ... other storage config
  },
  rootAdminInfo: { 
    accountId: "admin@example.com", 
    password: "admin1234" 
  },
};`}
          />
          <div className="my-4 space-y-3">
            <div className="rounded-lg bg-purple-50 p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-purple-600">📁</span>
                <strong className="text-purple-800">
                  {l.trans({ en: "Environment File Structure", ko: "환경 파일 구조" })}
                </strong>
              </div>
              <div className="text-purple-700 text-sm">
                <code className="block whitespace-pre rounded bg-purple-100 p-2">
                  {`apps/myapp/env/
├── env.client.ts          # Client env router
├── env.client.type.ts     # Client env type
├── env.client.local.ts    # Local client config
├── env.client.debug.ts    # Debug client config
├── env.client.develop.ts  # Develop client config
├── env.client.main.ts     # Production client config
├── env.server.ts          # Server env router
├── env.server.type.ts     # Server env type
├── env.server.local.ts    # Local server config
├── env.server.debug.ts    # Debug server config
├── env.server.develop.ts  # Develop server config
└── env.server.main.ts     # Production server config`}
                </code>
              </div>
            </div>
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide
        id="best-practices"
        title={l.trans({ en: "Environment Best Practices", ko: "환경 설정 모범 사례" })}
      >
        <Docs.Title>{l.trans({ en: "Environment Best Practices", ko: "환경 설정 모범 사례" })}</Docs.Title>
        <Docs.Description>
          <div className="my-4 space-y-4">
            <div className="rounded-lg bg-blue-50 p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-blue-600">1️⃣</span>
                <strong className="text-blue-800">
                  {l.trans({ en: "Use Environment Checks", ko: "환경 체크 사용" })}
                </strong>
              </div>
              <div className="text-blue-700 text-sm">
                {l.trans({
                  en: "Use baseEnv.environment to conditionally enable features. Disable introspection, verbose logging, and debug tools in production (main).",
                  ko: "baseEnv.environment를 사용하여 조건부로 기능을 활성화합니다. 프로덕션(main)에서는 인트로스펙션, 상세 로깅, 디버그 도구를 비활성화합니다.",
                })}
              </div>
            </div>
            <div className="rounded-lg bg-green-50 p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-green-600">2️⃣</span>
                <strong className="text-green-800">
                  {l.trans({ en: "Check Side Before DOM Operations", ko: "DOM 작업 전 side 확인" })}
                </strong>
              </div>
              <div className="text-green-700 text-sm">
                {l.trans({
                  en: 'Always check baseClientEnv.side before accessing window, document, or browser-only APIs. Use baseClientEnv.side === "client" guard.',
                  ko: 'window, document 또는 브라우저 전용 API에 접근하기 전에 항상 baseClientEnv.side를 확인하세요. baseClientEnv.side === "client" 가드를 사용합니다.',
                })}
              </div>
            </div>
            <div className="rounded-lg bg-purple-50 p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-purple-600">3️⃣</span>
                <strong className="text-purple-800">
                  {l.trans({ en: "Separate Sensitive Config", ko: "민감한 설정 분리" })}
                </strong>
              </div>
              <div className="text-purple-700 text-sm">
                {l.trans({
                  en: "Put API keys, passwords, and secrets only in env.server.*.ts files. Never include sensitive data in env.client.*.ts or NEXT_PUBLIC_ variables.",
                  ko: "API 키, 비밀번호, 시크릿은 env.server.*.ts 파일에만 넣습니다. 민감한 데이터를 env.client.*.ts나 NEXT_PUBLIC_ 변수에 포함하지 마세요.",
                })}
              </div>
            </div>
            <div className="rounded-lg bg-yellow-50 p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-yellow-600">4️⃣</span>
                <strong className="text-yellow-800">
                  {l.trans({ en: "Use Auto-Generated URIs", ko: "자동 생성 URI 사용" })}
                </strong>
              </div>
              <div className="text-sm text-yellow-700">
                {l.trans({
                  en: "Prefer baseClientEnv.serverHttpUri and serverGraphqlUri over hardcoding URLs. They automatically adjust based on environment and deployment context.",
                  ko: "URL을 하드코딩하는 대신 baseClientEnv.serverHttpUri와 serverGraphqlUri를 사용하세요. 환경과 배포 컨텍스트에 따라 자동으로 조정됩니다.",
                })}
              </div>
            </div>
          </div>
          <div className="my-6 rounded-lg bg-gradient-to-r from-purple-100 to-pink-100 p-6">
            <div className="mb-3 font-bold text-lg text-purple-800">
              {l.trans({ en: "🎉 What You've Learned:", ko: "🎉 학습한 내용:" })}
            </div>
            <ul className="space-y-2 text-purple-700 text-sm">
              <li>
                ✓{" "}
                {l.trans({
                  en: "Root .env file configuration for Node.js process.env",
                  ko: "Node.js process.env를 위한 루트 .env 파일 설정",
                })}
              </li>
              <li>
                ✓{" "}
                {l.trans({
                  en: "baseEnv for core environment variables (appName, environment, operationMode, networkType)",
                  ko: "핵심 환경 변수를 위한 baseEnv (appName, environment, operationMode, networkType)",
                })}
              </li>
              <li>
                ✓{" "}
                {l.trans({
                  en: "baseClientEnv for client/server context detection and auto-generated connection URIs",
                  ko: "클라이언트/서버 컨텍스트 감지와 자동 생성 연결 URI를 위한 baseClientEnv",
                })}
              </li>
              <li>
                ✓{" "}
                {l.trans({
                  en: "Application-specific env configuration with environment-based file selection",
                  ko: "환경 기반 파일 선택을 통한 애플리케이션별 env 설정",
                })}
              </li>
              <li>
                ✓{" "}
                {l.trans({
                  en: "Best practices for secure and context-aware environment usage",
                  ko: "안전하고 컨텍스트 인식 환경 사용을 위한 모범 사례",
                })}
              </li>
            </ul>
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.TitleNavigator className="fixed top-32 right-0 hidden w-[250px] flex-col gap-2 lg:flex" />
    </Scroll>
  );
}
