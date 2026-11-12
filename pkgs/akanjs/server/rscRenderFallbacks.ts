import type { LayoutFallbackRoute, PathRoute } from "akanjs/client";
import { type Logger, parseSearchParams } from "akanjs/common";
import type { ReactNode } from "react";
import type { ClientManifest } from "./artifact";
import { RouteElementComposer } from "./routeElementComposer";
import { RouteShellGate } from "./routeShellGate";
import type { RscFlightRenderer } from "./rscFlightRenderer";
import type { FlightRenderResult, RenderControl } from "./rscFlightStream";
import { isAkanNotFoundError, isAkanRedirectError, type RscRenderRequest } from "./rscRenderControl";
import type { RscRenderStats } from "./rscRenderStats";
import type { RscRouteDocument } from "./rscRouteDocument";
import type { RscTraceMetadata } from "./ssrTypes";

export interface RscActiveRoute {
  url: URL | null;
  match: { pathRoute: PathRoute; params: Record<string, string> } | null;
  request: Request | null;
}

interface RscRenderFallbacksProps {
  logger: Logger;
  stats: RscRenderStats;
  flights: RscFlightRenderer;
  documents: RscRouteDocument;
  clientManifest: () => ClientManifest;
  runInRequestScope: <T>(request: Request, fn: () => Promise<T>) => Promise<T>;
}

export class RscRenderFallbacks {
  readonly #send: (message: unknown) => void;
  readonly #props: RscRenderFallbacksProps;
  readonly #logger: Logger;
  readonly #stats: RscRenderStats;
  readonly #flights: RscFlightRenderer;
  readonly #documents: RscRouteDocument;

  constructor(send: (message: unknown) => void, props: RscRenderFallbacksProps) {
    this.#send = send;
    this.#props = props;
    this.#logger = props.logger;
    this.#stats = props.stats;
    this.#flights = props.flights;
    this.#documents = props.documents;
  }

  get #clientManifest(): ClientManifest {
    return this.#props.clientManifest();
  }

  async answerControl(
    {
      msg,
      match,
      url: urlObj,
      searchParams,
      trace,
    }: {
      msg: RscRenderRequest;
      match: { pathRoute: PathRoute; params: Record<string, string> } | null;
      url: URL;
      searchParams: Record<string, string | string[]>;
      trace: RscTraceMetadata;
    },
    result: FlightRenderResult,
    control: RenderControl,
  ): Promise<void> {
    const { requestId } = msg;
    this.#stats.lastRenderKind = control.type;
    if (result.lateControlSent) {
      this.#logger.verbose(`render[${requestId}] late ${control.type} delivered after stream start`);
      return;
    }
    if (!match && control.type === "error") {
      const systemResult = await this.#flights.renderFlightElement(
        this.#documents.renderSystemNotFound(urlObj),
        msg.clientManifest ?? this.#clientManifest,
        { requestId, status: 404, trace },
      );
      if (systemResult.cancelled || !systemResult.control) return;
    }
    if (
      match &&
      control.type !== "redirect" &&
      (await this.#trySendFallbackRender({
        requestId,
        kind: control.type,
        route: match.pathRoute,
        params: match.params,
        searchParams,
        pathname: urlObj.pathname,
        url: urlObj,
        error: control.type === "error" ? control.error : undefined,
        clientManifest: msg.clientManifest ?? this.#clientManifest,
        trace,
      }))
    ) {
      return;
    }
    if (
      control.type === "not-found" &&
      (await this.#trySendSystemNotFoundRender({
        requestId,
        url: urlObj,
        clientManifest: msg.clientManifest ?? this.#clientManifest,
        trace,
      }))
    ) {
      return;
    }
    this.#sendRenderControl(requestId, control);
  }

  async answerThrown(msg: RscRenderRequest, activeRoute: RscActiveRoute, error: unknown): Promise<void> {
    const { requestId, url } = msg;
    if (isAkanRedirectError(error)) {
      this.#stats.lastRenderKind = "redirect";
      this.#logger.verbose(`render[${requestId}] redirect ${error.location}`);
      this.#send({
        type: "redirect",
        requestId,
        location: error.location,
        method: error.method,
        status: error.status,
      });
      return;
    }
    const { url: fallbackUrl, match: fallbackMatch, request: fallbackRequest } = activeRoute;
    //? The render's request scope ended with its throw; outside one, a request read sees no request at all.
    const inRequestScope = (send: () => Promise<boolean>) =>
      fallbackRequest ? this.#props.runInRequestScope(fallbackRequest, send) : send();
    const trySendFallback = async (kind: "not-found" | "error") =>
      !!fallbackUrl &&
      !!fallbackMatch &&
      (await inRequestScope(() =>
        this.#trySendFallbackRender({
          requestId,
          kind,
          route: RouteElementComposer.fallbackRouteOf(fallbackMatch.pathRoute, error),
          params: fallbackMatch.params,
          searchParams: parseSearchParams(fallbackUrl.search),
          pathname: fallbackUrl.pathname,
          url: fallbackUrl,
          error: kind === "error" ? error : undefined,
          clientManifest: msg.clientManifest ?? this.#clientManifest,
        }),
      ));
    if (isAkanNotFoundError(error)) {
      this.#stats.lastRenderKind = "not-found";
      this.#logger.verbose(`render[${requestId}] not-found`);
      if (await trySendFallback("not-found")) return;
      if (
        fallbackUrl &&
        (await inRequestScope(() =>
          this.#trySendSystemNotFoundRender({
            requestId,
            url: fallbackUrl,
            clientManifest: msg.clientManifest ?? this.#clientManifest,
          }),
        ))
      ) {
        return;
      }
      this.#send({ type: "not-found", requestId });
      return;
    }
    this.#logger.error(
      `render[${requestId}] failed url=${url}: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`,
    );
    if (await trySendFallback("error")) return;
    this.#send({
      type: "error",
      requestId,
      message: error instanceof Error ? error.message : String(error),
    });
  }

  async #trySendFallbackRender({
    requestId,
    kind,
    route,
    params,
    searchParams,
    pathname,
    url,
    error,
    clientManifest,
    trace,
  }: {
    requestId: string;
    kind: "not-found" | "error";
    route: PathRoute | LayoutFallbackRoute;
    params: Record<string, string>;
    searchParams: Record<string, string | string[]>;
    pathname: string;
    url: URL;
    error?: unknown;
    clientManifest: ClientManifest;
    trace?: RscTraceMetadata;
  }): Promise<boolean> {
    try {
      const gate = new RouteShellGate();
      const element = await this.#documents.renderFallbackDocument({
        kind,
        route,
        params,
        searchParams,
        pathname,
        url,
        error: kind === "error" && process.env.NODE_ENV !== "production" ? error : undefined,
        digest: kind === "error" ? "AKAN_RENDER_ERROR" : undefined,
        gate,
      });
      if (!element) return false;
      return await this.#trySendFlight(
        requestId,
        element,
        clientManifest,
        kind === "not-found" ? 404 : 500,
        trace,
        gate,
      );
    } catch (fallbackError) {
      this.#logger.error(
        `render[${requestId}] custom ${kind} fallback failed: ${
          fallbackError instanceof Error ? (fallbackError.stack ?? fallbackError.message) : String(fallbackError)
        }`,
      );
      return false;
    }
  }

  async #trySendSystemNotFoundRender({
    requestId,
    url,
    clientManifest,
    trace,
  }: {
    requestId: string;
    url: URL;
    clientManifest: ClientManifest;
    trace?: RscTraceMetadata;
  }): Promise<boolean> {
    try {
      return await this.#trySendFlight(
        requestId,
        this.#documents.renderSystemNotFound(url),
        clientManifest,
        404,
        trace,
      );
    } catch (error) {
      this.#logger.error(
        `render[${requestId}] system not-found fallback failed: ${
          error instanceof Error ? (error.stack ?? error.message) : String(error)
        }`,
      );
      return false;
    }
  }

  // A cancelled request counts as delivered; a control (redirect/not-found/error) leaves the next fallback to try.
  async #trySendFlight(
    requestId: string,
    element: ReactNode,
    clientManifest: ClientManifest,
    status: number,
    trace?: RscTraceMetadata,
    gate?: RouteShellGate,
  ): Promise<boolean> {
    const result = await this.#flights.renderFlightElement(element, clientManifest, { requestId, status, trace, gate });
    if (result.cancelled) return true;
    if (result.control) return false;
    this.#stats.recordFlight(result);
    return true;
  }

  #sendRenderControl(requestId: string, control: RenderControl): void {
    if (control.type === "redirect") {
      this.#logger.verbose(`render[${requestId}] redirect ${control.location}`);
      this.#send({
        type: "redirect",
        requestId,
        location: control.location,
        method: control.method,
        status: control.status,
      });
      return;
    }
    if (control.type === "error") {
      const message = control.error instanceof Error ? control.error.message : String(control.error);
      this.#logger.verbose(`render[${requestId}] error`);
      this.#send({ type: "error", requestId, message });
      return;
    }
    this.#logger.verbose(`render[${requestId}] not-found`);
    this.#send({ type: "not-found", requestId });
  }
}
