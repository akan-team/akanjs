"use client";
import { RouteDefinition, type RouteRender } from "akanjs/client";
import { createContext, createElement, memo, type ReactNode, useContext, useRef } from "react";
import { useFetch } from "./useFetch";

//? An async render's output is kept between renders, so it is handed a stable outlet rather than the layer below:
//? an element baked into kept output would pin the params it was made with.
const layerChildContext = createContext<ReactNode>(null);
const LayerOutlet = () => useContext(layerChildContext);
const layerOutlet = <LayerOutlet />;

interface RenderedRoute {
  render: RouteRender["render"];
  argsKey: string;
  result: ReactNode | Promise<ReactNode>;
}

interface RenderLayerProps {
  renders: RouteRender[];
  index: number;
  params: Record<string, string>;
  searchParams: Record<string, string | string[]>;
  leaf?: ReactNode;
}
export const RenderLayer = memo(({ renders, index, params, searchParams, leaf = null }: RenderLayerProps) => {
  const isLast = index >= renders.length - 1;
  const children = isLast ? (
    leaf
  ) : (
    <RenderLayer renders={renders} index={index + 1} params={params} searchParams={searchParams} leaf={leaf} />
  );
  const routeRender = renders[index];
  const isAsyncRender = isAsyncRouteRender(routeRender);
  const renderedRef = useRef<RenderedRoute | null>(null);
  if (isAsyncRender && routeRender) {
    const argsKey = RouteDefinition.renderArgsKey(
      routeRender.render,
      { params, searchParams },
      { isPage: routeRender.kind === "page", paramNames: routeRender.paramNames },
    );
    const rendered = renderedRef.current;
    //? Rerun only when the render itself (a hot update) or the args it reads change: any other re-render would refetch.
    if (!rendered || rendered.render !== routeRender.render || rendered.argsKey !== argsKey)
      renderedRef.current = {
        render: routeRender.render,
        argsKey,
        result: routeRender.render({ children: layerOutlet, params, searchParams } as never) ?? null,
      };
  }
  const { value } = useFetch(renderedRef.current?.result ?? null, { keepPrevious: true });
  if (!routeRender) return null;
  if (!isAsyncRender) return createElement(routeRender.render as never, { children, params, searchParams } as never);
  if (!value) return <>{composeLoadingFallback(renders.slice(index), params)}</>;
  return <layerChildContext.Provider value={children}>{value}</layerChildContext.Provider>;
});

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
