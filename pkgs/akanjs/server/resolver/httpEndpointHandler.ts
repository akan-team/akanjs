import type { BackendEnv } from "akanjs/base";
import type { InjectRegistry, LiveRegistry } from "akanjs/service";
import type { Endpoint } from "../../signal/endpoint";
import type { EndpointInfo } from "../../signal/endpointInfo";
import type { MiddlewareCls } from "../../signal/middleware";
import { SignalContext } from "../../signal/signalContext";
import { getCurrentTrace } from "../../signal/trace";
import type { RequestSeries } from "../metrics/requestMetrics";

interface HttpEndpointProps {
  registry: InjectRegistry;
  env: BackendEnv;
  live: LiveRegistry;
  middleware: Map<string, MiddlewareCls>;
}

export const httpEndpointHandler = (
  calls: RequestSeries,
  key: string,
  endpointInfo: EndpointInfo,
  endpoint: Endpoint,
  { registry, env, live, middleware }: HttpEndpointProps,
) => {
  return async (req: Bun.BunRequest): Promise<Response | undefined> => {
    let startedAt = 0;
    const response = await SignalContext.try(endpoint, endpointInfo, key, async () => {
      //? The call's trace already read the clock as it began; a second reading would cost about a timer call a request.
      startedAt = getCurrentTrace()?.startedAt ?? performance.now();
      const context = await new SignalContext(key, req, {
        endpointInfo,
        adaptor: endpoint,
        registry,
        env,
        live,
        middleware,
      }).init();
      // `exec` widened its return for the pubsub branch, which no HTTP route takes.
      return (await context.exec()) as Response | undefined;
    });
    calls.observe(response?.status ?? 200, performance.now() - startedAt);
    return response;
  };
};
