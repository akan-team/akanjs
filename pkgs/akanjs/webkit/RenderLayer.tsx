"use client";
import { debugFrame, RouteDefinition, type RouteRender, router, usePathCtx } from "akanjs/client";
import { isThenable, Logger } from "akanjs/common";
import { createContext, createElement, memo, type ReactNode, useContext, useEffect, useRef, useState } from "react";
import { CsrFrameDump } from "./csrFrameDump";
import { EmbeddedLayout, LayoutOutlet } from "./EmbeddedLayout";
import { RenderFailure } from "./RenderFailure";
import { useFetch } from "./useFetch";
import { usePageActivity } from "./usePageActivity";

//? An async render's output is kept between renders, so it is handed a stable outlet rather than the layer below:
//? an element baked into kept output would pin the params it was made with.
const layerChildContext = createContext<ReactNode>(null);
const LayerOutlet = () => useContext(layerChildContext);
const layerOutlet = <LayerOutlet />;

interface RenderedRoute {
  render: RouteRender["render"];
  argsKey: string;
  result: ReactNode | Promise<ReactNode>;
  record: ReturnType<typeof CsrFrameDump.track> | null;
  /** A redirect was issued while the render ran, so what it drew is not the page. */
  redirected: boolean;
  /** The render rejected while its page stayed: what the layer draws instead, with a retry. */
  failure: { error: unknown } | null;
}

interface RenderLayerProps {
  renders: RouteRender[];
  index: number;
  params: Record<string, string>;
  searchParams: Record<string, string | string[]>;
  leaf?: ReactNode;
  /** A page in an MCP view: every layout above it runs, and only the page is shown. */
  isEmbedded?: boolean;
}
export const RenderLayer = memo((props: RenderLayerProps) => {
  const { renders, index, params, searchParams, leaf = null, isEmbedded = false } = props;
  const isLast = index >= renders.length - 1;
  const below = isLast ? (
    leaf
  ) : (
    <RenderLayer
      renders={renders}
      index={index + 1}
      params={params}
      searchParams={searchParams}
      leaf={leaf}
      isEmbedded={isEmbedded}
    />
  );
  const routeRender = renders[index];
  const isEmbeddedLayout = isEmbedded && routeRender?.kind === "layout";
  const children = isEmbeddedLayout ? <LayoutOutlet>{below}</LayoutOutlet> : below;
  const frame = (drawn: ReactNode) => (isEmbeddedLayout ? <EmbeddedLayout>{drawn}</EmbeddedLayout> : drawn);
  const isAsyncRender = isAsyncRouteRender(routeRender);
  const renderedRef = useRef<RenderedRoute | null>(null);
  const [, setFailures] = useState(0);
  const activity = usePageActivity();
  //? Effects stop while the page is hidden, so a cleanup is the one place that sees it leave the screen.
  const onScreenRef = useRef(activity === "current");
  useEffect(() => {
    onScreenRef.current = activity === "current";
    return () => {
      onScreenRef.current = false;
    };
  }, [activity]);
  //? The context's default is an empty object: bootCsr renders root layouts outside any page's wrapper.
  const path = (usePathCtx() as Partial<ReturnType<typeof usePathCtx>>).location?.pathRoute.path ?? "the root";
  if (isAsyncRender && routeRender) {
    const argsKey = RouteDefinition.renderArgsKey(
      routeRender.render,
      { params, searchParams },
      { isPage: routeRender.kind === "page", paramNames: routeRender.paramNames },
    );
    const rendered = renderedRef.current;
    //? A cached page back on screen reruns a render that redirected: signed out, a layout redirects to the sign-in
    //? page, and kept, it would stay blank after the sign-in brings the person back.
    const returned = activity === "current" && !onScreenRef.current;
    //? Rerun only when the render itself (a hot update) or the args it reads change: any other re-render would refetch.
    if (
      !rendered ||
      rendered.render !== routeRender.render ||
      rendered.argsKey !== argsKey ||
      (returned && rendered.redirected)
    ) {
      const redirectsBefore = router.redirectCount();
      const layer = `${routeRender.kind ?? "layout"} ${index} of ${path}`;
      const result = reportFailure(
        routeRender.render({ children: layerOutlet, params, searchParams } as never) ?? null,
        layer,
      );
      const next: RenderedRoute = {
        render: routeRender.render,
        argsKey,
        result,
        record: isThenable(result) ? CsrFrameDump.track(layer, result as Promise<ReactNode>) : null,
        redirected: false,
        failure: null,
      };
      if (isThenable(result))
        (result as Promise<ReactNode>).then(
          () => {
            next.redirected = router.redirectCount() !== redirectsBefore;
          },
          (error: unknown) => {
            if (router.redirectCount() !== redirectsBefore || renderedRef.current !== next) return;
            next.failure = { error };
            setFailures((count) => count + 1);
          },
        );
      renderedRef.current = next;
    }
  }
  const { value, fulfilled } = useFetch(renderedRef.current?.result ?? null, { keepPrevious: true });
  const record = renderedRef.current?.record ?? null;
  if (record && fulfilled) record.delivered = true;
  useEffect(() => {
    if (!record) return;
    record.subscribed = true;
    return () => {
      record.subscribed = false;
    };
  }, [record]);
  if (!routeRender) return null;
  if (!isAsyncRender)
    return frame(createElement(routeRender.render as never, { children, params, searchParams } as never));
  const failure = renderedRef.current?.failure;
  if (failure)
    return (
      <RenderFailure
        error={failure.error}
        onRetry={() => {
          renderedRef.current = null;
          setFailures((count) => count + 1);
        }}
      />
    );
  if (!value) return <>{composeLoadingFallback(renders.slice(index), params)}</>;
  return frame(<layerChildContext.Provider value={children}>{value}</layerChildContext.Provider>);
});

//? useFetch drops a rejection, so a render that throws would leave its layer blank with nothing in the console.
function reportFailure(result: ReactNode | Promise<ReactNode>, layer: string): ReactNode | Promise<ReactNode> {
  if (!isThenable(result)) return result;
  debugFrame("layer.render", { layer });
  (result as Promise<ReactNode>).then(
    () => debugFrame("layer.settle", { layer }),
    (error: unknown) => {
      debugFrame("layer.fail", { layer, message: error instanceof Error ? error.message : String(error) });
      Logger.error(
        `render of ${layer} failed: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`,
      );
    },
  );
  return result;
}

function isAsyncRouteRender(routeRender?: RouteRender): boolean {
  return Boolean(routeRender?.isAsync || routeRender?.render.constructor.name === "AsyncFunction");
}

function composeLoadingFallback(renders: RouteRender[], params: Record<string, string>): ReactNode {
  let element: ReactNode = null;
  for (let i = renders.length - 1; i >= 0; i--) {
    const Loading = renders[i]?.Loading;
    if (!Loading) continue;
    element = Loading({ params, children: element } as never) as ReactNode;
  }
  return element;
}
