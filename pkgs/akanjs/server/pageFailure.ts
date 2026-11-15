import type { Logger } from "akanjs/common";
import { ErrorReporting } from "../signal/errorReporting";
import { reportedTraceOf } from "../signal/trace";
import { UNMATCHED_ROUTE } from "./metrics/requestMetrics";

interface HtmlRenderFailure {
  logger: Logger;
  request?: Request;
  phase: string;
  description: string;
}

export class PageFailure {
  static readonly #routes = new WeakMap<Request, string>();

  static routed(req: Request, routeId: string | undefined) {
    if (routeId) PageFailure.#routes.set(req, routeId);
  }

  //? A Flight digest marks an error a server component threw, which the RSC worker already sent the reporter.
  static htmlRender(error: unknown, { logger, request, phase, description }: HtmlRenderFailure) {
    const path = request ? new URL(request.url).pathname : "unknown";
    logger.error(`[SSR] ${phase} failed path=${path}: ${description}`);
    if (typeof (error as { digest?: unknown } | null)?.digest === "string") return;
    const routeId = (request && PageFailure.#routes.get(request)) ?? null;
    ErrorReporting.report(error, { source: "render", traceId: reportedTraceOf().traceId, routeId });
  }

  //? The page's own 5xx: its worker stopped, timed out or refused. After a render error of the same request reached
  //? the reporter, this is that fault told again by the host, so it is left out.
  static answered(error: unknown, route: string) {
    const { traceId } = reportedTraceOf();
    if (ErrorReporting.renderReported(traceId)) return;
    ErrorReporting.report(error, { source: "render", traceId, routeId: route === UNMATCHED_ROUTE ? null : route });
  }
}
