"use client";
import { csrLocation, type Location, type PathRoute, type RouteGuide } from "akanjs/client";
import { parseSearchParams } from "akanjs/common";
import { useCallback, useRef } from "react";
import { CsrStack } from "./CsrStack";

interface UseLocationOptions {
  rootRouteGuide: RouteGuide;
}
export const useLocation = ({ rootRouteGuide }: UseLocationOptions) => {
  const routeGuide = useRef(rootRouteGuide);
  routeGuide.current = rootRouteGuide;
  const getLocation = useCallback((href: string): Location => {
    const getPathSegments = (pathname: string) =>
      pathname
        .split("/")
        .filter((pathSegment) => !!pathSegment)
        .map((pathSegment) => `/${pathSegment}`);
    const getPathRoute = (pathname: string): PathRoute => {
      let target: RouteGuide | null = routeGuide.current;
      //? A path no page matches draws the not-found of the deepest node it reached, under that node's layouts.
      let notFoundRouteOf = target.notFoundRouteOf;
      for (const pathSegment of getPathSegments(pathname)) {
        const parent: RouteGuide = target;
        const childrenSegments = Object.keys(parent.children);
        const matchingPathSegment = childrenSegments.find((segment) => segment === pathSegment);
        const paramSegment = childrenSegments.find((segment) => segment.startsWith("/:"));
        const child = matchingPathSegment
          ? parent.children[pathSegment]
          : paramSegment
            ? parent.children[paramSegment]
            : undefined;
        if (!child) {
          target = null;
          break;
        }
        target = child;
        notFoundRouteOf = child.notFoundRouteOf ?? notFoundRouteOf;
      }
      if (target?.pathRoute) return target.pathRoute;
      if (notFoundRouteOf) return notFoundRouteOf(pathname);
      if (!target) throw new Error(`Not found: ${pathname}`);
      csrLocation.assign("/404");
      throw new Error("404");
    };
    const getParams = (pathname: string, pathRoute: PathRoute) => {
      const pathSegments = getPathSegments(pathname);
      return pathRoute.pathSegments.reduce<{ [key: string]: string }>((params, pathSegment, idx) => {
        if (pathSegment.startsWith("/:")) params[pathSegment.slice(2)] = pathSegments[idx - 1].slice(1);
        return params;
      }, {});
    };
    const hrefWithoutOrigin = csrLocation.strip(href);
    const [hrefWithoutHash, hash = ""] = hrefWithoutOrigin.split("#");
    const [pathname, search] = hrefWithoutHash.split("?");
    const pathRoute = getPathRoute(pathname);
    const params = getParams(pathname, pathRoute);
    const searchParams = parseSearchParams(search ?? "");
    return { pathname, search, params, searchParams, pathRoute, hash, href, entryId: CsrStack.nextEntryId() };
  }, []);
  return { getLocation };
};
