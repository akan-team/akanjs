import { usePage } from "@apps/akan/client";
import { Code, Docs } from "@apps/akan/ui";
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
        en: "Constructor option type for `AkanApp`. It configures replica layout, server path, runtime directory, HTTP port, and WebSocket base port for the gateway process.",
        ko: "`AkanApp` constructor option type입니다. gateway process를 위한 replica layout, server path, runtime directory, HTTP port, WebSocket base port를 설정합니다.",
      }),
      code: `import type { AkanAppOptions } from "akanjs/server";

const options: AkanAppOptions = {
  replica: "1,0,2",
  runtimeDir: "./runtime",
};`,
    },
    {
      name: "AkanOption",
      desc: l.trans({
        en: "App/library option builder used by `lib/option.ts`. It registers env-derived use objects, signal middleware, and web proxies consumed by the server runtime.",
        ko: "`lib/option.ts`에서 사용하는 app/library option builder입니다. server runtime이 사용하는 env-derived use object, signal middleware, web proxy를 등록합니다.",
      }),
      code: `import { AkanOption } from "akanjs/server";

export const option = new AkanOption()
  .use((env) => ({ appName: env.appName }))
  .applyMiddleware(Logging)
  .applyWebProxy(localeWebProxy);`,
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
      <div className="divider" />
      {symbols.map((symbol) => (
        <Scroll.Slide key={symbol.name} id={symbol.name} title={symbol.name}>
          <Docs.Title>{symbol.name}</Docs.Title>
          <Docs.Description>
            <div>{symbol.desc}</div>
          </Docs.Description>
          <Code.Snippet title={l.trans({ en: "Usage", ko: "사용 예시" })} language="typescript" code={symbol.code} />
        </Scroll.Slide>
      ))}
      <Scroll.TitleNavigator className="fixed top-32 right-0 hidden w-[250px] flex-col gap-2 lg:flex" />
    </Scroll>
  );
}
