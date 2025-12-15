"use client";
import { type Location, type PathRoute, type RouteGuide } from "@akanjs/client";
import { useCallback } from "react";

interface UseLocationOptions {
  rootRouteGuide: RouteGuide;
}
export const useLocation = ({ rootRouteGuide }: UseLocationOptions) => {
  const getLocation = useCallback((href: string): Location => {
    const getPathSegments = (pathname: string) => {
      return [
        ...pathname
          .split("/")
          .filter((pathSegment) => !!pathSegment)
          .map((pathSegment) => `/${pathSegment}`),
      ];
    };
    const getPathRoute = (pathname: string): PathRoute => {
      const pathSegments = getPathSegments(pathname);
      const getTargetRouteGuide = (pathSegments: string[], routeGuide: RouteGuide): RouteGuide => {
        const pathSegment = pathSegments.shift();
        if (!pathSegment) return routeGuide;
        const childrenSegments = Object.keys(routeGuide.children);
        const matchingPathSegment = childrenSegments.find((segment) => segment === pathSegment);
        const paramSegment = childrenSegments.find((segment) => segment.startsWith("/:"));
        const childRouteGuide = matchingPathSegment
          ? routeGuide.children[pathSegment]
          : paramSegment
            ? routeGuide.children[paramSegment]
            : null;
        if (!childRouteGuide) throw new Error(`Not found: ${pathname}`);
        return getTargetRouteGuide(pathSegments, childRouteGuide);
      };
      const targetRouteGuide = getTargetRouteGuide(pathSegments, rootRouteGuide);
      const pathRoute = targetRouteGuide.pathRoute;
      if (!pathRoute) {
        window.location.assign("/404");
        throw new Error("404");
      }
      return pathRoute;
    };
    const getParams = (pathname: string, pathRoute: PathRoute) => {
      const pathSegments = getPathSegments(pathname);
      return pathRoute.pathSegments.reduce<{ [key: string]: string }>((params, pathSegment, idx) => {
        if (pathSegment.startsWith("/:")) params[pathSegment.slice(2)] = pathSegments[idx - 1].slice(1);
        return params;
      }, {});
    };
    const getSearchParams = (search: string) => {
      return [...new URLSearchParams(search).entries()].reduce<{ [key: string]: string | string[] }>(
        (params, [key, value]) => {
          params[key] = params[key] ? [...(Array.isArray(params[key]) ? params[key] : [params[key]]), value] : value;
          return params;
        },
        {}
      );
    };
    const hrefWithoutOrigin = href.replace(window.location.origin, "");
    const [hrefWithoutHash, hash = ""] = hrefWithoutOrigin.split("#");
    const [pathname, search] = hrefWithoutHash.split("?");
    const pathRoute = getPathRoute(pathname);
    const params = getParams(pathname, pathRoute);
    const searchParams = getSearchParams(search);
    return { pathname, search, params, searchParams, pathRoute, hash, href };
  }, []);
  return { getLocation };
};
