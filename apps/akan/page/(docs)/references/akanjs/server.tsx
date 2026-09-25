import { usePage } from "@apps/akan/client";
import { Code, Divider, Docs, DocsToc } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();
  const symbols = [
    {
      name: "AkanApp",
      desc: l.trans({
        en: "Gateway/orchestrator used by app `main.ts` files. It starts child server replicas, proxies HTTP and WebSocket traffic, reports metrics, and handles shutdown for local and production runs.",
        ko: "app `main.ts` 파일에서 사용하는 gateway/orchestrator입니다. child server replica를 시작하고 HTTP/WebSocket traffic을 proxy하며 metrics 보고와 local/production 실행의 shutdown을 처리합니다.",
      }),
      code: `import { AkanApp } from "akanjs/server";

const app = new AkanApp("./server", {
  replica: "0,0,1",
  port: 8282,
});

await app.start();`,
    },
    {
      name: "AkanAppOptions",
      desc: l.trans({
        en: "Constructor option type for `AkanApp`. It configures replica layout, server path, runtime directory, HTTP port, and WebSocket base port for the gateway process, plus `openapi` and `modules`. `modules` boots only the named modules and the ones they depend on, in every child; omitted or empty mounts every enabled module.",
        ko: "`AkanApp` constructor option type입니다. gateway process를 위한 replica layout, server path, runtime directory, HTTP port, WebSocket base port와 함께 `openapi`, `modules`를 설정합니다. `modules`는 지정한 모듈과 그 의존 모듈만 모든 child에서 부팅하며, 비워두면 활성화된 모든 모듈을 마운트합니다.",
      }),
      code: `import type { AkanAppOptions } from "akanjs/server";

const options: AkanAppOptions = {
  replica: "1,0,2",
  runtimeDir: "./runtime",
  modules: ["article"],
};`,
    },
    {
      name: "AkanServer web surfaces",
      desc: l.trans({
        en: "`server.setWeb(true | false | { csr })` and the `AKAN_SSR` / `AKAN_CSR` env narrow what a process serves beyond its API: SSR is the RSC renderer and its RSC worker process, CSR is the mobile SPA bundle at `/__csr`. They only narrow — a surface `akan.config.ts` left out of the build cannot be switched back on — and `AKAN_SSR=false` takes CSR with it, because the CSR bundle inlines the stylesheet the SSR build compiles. The boot log names the resolved answer.",
        ko: "`server.setWeb(true | false | { csr })`과 `AKAN_SSR` / `AKAN_CSR` env는 프로세스가 API 외에 무엇을 서비스할지 좁힙니다. SSR은 RSC 렌더러와 그 RSC worker process, CSR은 `/__csr`의 모바일 SPA bundle입니다. 좁히기만 하며, `akan.config.ts`가 빌드에서 뺀 surface는 다시 켤 수 없습니다. `AKAN_SSR=false`는 CSR도 함께 내립니다. CSR bundle이 SSR 빌드가 컴파일한 stylesheet를 인라인하기 때문입니다. 부팅 로그에 확정된 결과가 남습니다.",
      }),
      code: `# api only, no RSC worker process
AKAN_SSR=false bun main.js

# web without the mobile SPA bundle
AKAN_CSR=false bun main.js`,
    },
    {
      name: "AkanOption",
      desc: l.trans({
        en: "App/library option builder used by `lib/option.ts`. It registers env-derived use objects, signal middleware, adaptor overrides, and web proxies, and carries the settings an app owns: `setMcp` for the MCP server, `setAgentAccess` for the guards a caller must pass to spend the LLM key through the agent relay, and `setLlm` for the model that relay speaks to. Every lib's option is read in mount order with the app's last.",
        ko: "`lib/option.ts`에서 사용하는 app/library option builder입니다. env-derived use object, signal middleware, adaptor override, web proxy를 등록하고, 앱이 소유하는 설정을 함께 담습니다. `setMcp`는 MCP 서버, `setAgentAccess`는 agent relay로 LLM 키를 쓰려면 통과해야 하는 guard, `setLlm`은 그 relay가 말을 거는 모델입니다. 모든 lib의 option을 마운트 순서대로 읽고 앱의 것을 마지막에 얹습니다.",
      }),
      code: `import { AkanOption } from "akanjs/server";

import { SignedIn } from "../srvkit";

export const option = new AkanOption<ModulesOptions>()
  .use((env) => ({ appName: env.appName }))
  .applyMiddleware(Logging)
  .applyWebProxy(localeWebProxy)
  .setMcp({ instructions: "Domain tools for the akan app." })
  .setLlm((options) => options.llm ?? {})
  .setAgentAccess(SignedIn);`,
    },
    {
      name: "AkanResponse",
      desc: l.trans({
        en: "Response helper for web proxy code. `next` continues the request, `rewrite` proxies to a different URL while preserving proxy metadata, and `redirect` returns a normal redirect response.",
        ko: "web proxy code를 위한 response helper입니다. `next`는 request를 계속 진행하고, `rewrite`는 proxy metadata를 보존하며 다른 URL로 proxy하고, `redirect`는 일반 redirect response를 반환합니다.",
      }),
      code: `import { AkanResponse, type WebProxy } from "akanjs/server";

export const proxy: WebProxy = {
  match: () => true,
  run: ({ request }) => AkanResponse.next({ request }),
};`,
    },
    {
      name: "WebProxy",
      desc: l.trans({
        en: "Type for server-side web proxy registrations. Libraries use it for locale routing, host/base-path routing, and custom request handling before the normal Akan router responds.",
        ko: "server-side web proxy registration을 위한 type입니다. library는 일반 Akan router가 응답하기 전에 locale routing, host/base-path routing, custom request handling에 사용합니다.",
      }),
      code: `import { AkanResponse, type WebProxy } from "akanjs/server";

export const localeWebProxy: WebProxy = {
  match: ({ url }) => url.pathname.startsWith("/ko"),
  run: ({ url }) => AkanResponse.rewrite(new URL(url.pathname.slice(3), url)),
};`,
    },
    {
      name: "Try",
      desc: l.trans({
        en: "Legacy method decorator that catches errors and logs a warning instead of throwing. It appears in integration srvkit classes where a best-effort external API call should not crash the caller.",
        ko: "error를 throw하지 않고 warning으로 기록하는 legacy method decorator입니다. best-effort external API call이 caller를 crash시키면 안 되는 integration srvkit class에서 사용됩니다.",
      }),
      code: `import { Try } from "akanjs/server";

class ExternalApi {
  @Try()
  async sync() {
    await fetch("https://example.com");
  }
}`,
    },
    {
      name: "Transaction / Cache",
      desc: l.trans({
        en: "Legacy method decorators for server-side service/document helpers. `Transaction` wraps execution in the detected database transaction and `Cache` memoizes method results for a timeout window.",
        ko: "server-side service/document helper를 위한 legacy method decorator입니다. `Transaction`은 detected database transaction으로 실행을 감싸고, `Cache`는 timeout window 동안 method result를 memoize합니다.",
      }),
      code: `import { Cache, Transaction } from "akanjs/server";

class UserService {
  @Transaction()
  async updateUser() {}

  @Cache(1000)
  async findUser(id: string) {}
}`,
    },
  ];

  return (
    <Scroll>
      <Scroll.Slide id="akanjs-server" title="akanjs/server">
        <Docs.Title>akanjs/server</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "`akanjs/server` contains app startup, server options, web proxy helpers, decorators, runtime artifacts, and operational utilities. Import it from app entrypoints, `lib/option.ts`, and server-only srvkit integrations.",
              ko: "`akanjs/server`는 app startup, server option, web proxy helper, decorator, runtime artifact, operational utility를 제공합니다. app entrypoint, `lib/option.ts`, server-only srvkit integration에서 import합니다.",
            })}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />
      {symbols.map((symbol) => (
        <Scroll.Slide key={symbol.name} id={symbol.name} title={symbol.name}>
          <Docs.Title>{symbol.name}</Docs.Title>
          <Docs.Description>
            <div>{symbol.desc}</div>
          </Docs.Description>
          <Code.Snippet
            className="w-full"
            title={l.trans({ en: "Usage", ko: "사용 예시" })}
            language="typescript"
            code={symbol.code}
          />
        </Scroll.Slide>
      ))}
      <DocsToc />
    </Scroll>
  );
}
