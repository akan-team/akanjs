import {
  type Cls,
  type EnumInstance,
  isEnum,
  PrimitiveRegistry,
  type PrimitiveScalar,
  type PromiseOrObject,
} from "akanjs/base";
import { parseAkanI18nEnv } from "akanjs/common";
import { deserialize } from "akanjs/constant";
import type { ReactNode } from "react";
import type { Head, LayoutModule, PageConfig, PageModule, RouteGuardProps } from "../csrTypes";
import { AkanNotFoundError } from "../router";
import { Translator } from "../translator";
import { RouteArgError, type RouteArgInfo, type RouteArgInput, RouteArgPending, type RouteBaseArgs } from "./routeArgs";

export type RouteArgsShape = Record<string, unknown>;
export type RouteKind = "page" | "layout" | "rootLayout";
/** Interned: a definition built inside the pages bundle must be recognised by a loader bundled apart from it. */
export const routeDefinitionMarker = Symbol.for("akan.routeDefinition");
/** Interned like the marker: the declared args ride on the module's render function, read by the CSR render cache. */
export const routeArgsMarker = Symbol.for("akan.routeArgs");

type HeadStage<Args> = Head | ((args: Args) => PromiseOrObject<Head | null | undefined>);

interface RouteRenderProps {
  params: Record<string, string>;
  searchParams?: Record<string, string | string[]>;
  children?: ReactNode;
}

export interface RouteArgResolveOption {
  /** A prompt's arguments are strings a person typed: a list is comma-separated and a bad value is refused. */
  strict?: boolean;
}

/** What a route file declares in place of named exports; the loader turns it back into the module shape. */
export abstract class RouteDefinition<
  Args extends RouteArgsShape = Record<never, never>,
  Extra extends object = Record<never, never>,
> {
  readonly [routeDefinitionMarker] = true;
  abstract readonly kind: RouteKind;
  readonly args: RouteArgInfo[] = [];
  #config?: PageConfig;
  // Held as `never`-argument functions: a `PageDefinition<{ projectId }>` must still be a `RouteDefinition` to
  // the loaders, and a stage typed over `Args` would make the wider declaration unassignable to the plain one.
  #head?: HeadStage<never>;
  #guard?: (args: never) => void | Promise<void>;
  #loading?: (args: never) => PromiseOrObject<ReactNode>;
  #render?: (args: never) => PromiseOrObject<ReactNode>;
  #renderRoute?: {
    render: (args: never) => PromiseOrObject<ReactNode>;
    argCount: number;
    route: (props: RouteRenderProps) => Promise<ReactNode>;
  };

  config(config: PageConfig) {
    this.#config = config;
    return this;
  }
  head(head: HeadStage<RouteBaseArgs & Args>) {
    this.#head = head as HeadStage<never>;
    return this;
  }
  /** Runs before any layout body; refuses with `router.redirect()` or `router.notFound()`. */
  guard(guard: (args: RouteBaseArgs & Args) => void | Promise<void>) {
    if (this.#guard)
      throw new Error(`[route-convention] ${this.kind}() declares .guard() twice; run every check from one guard`);
    this.#guard = guard as (args: never) => void | Promise<void>;
    return this;
  }
  loading(render: (args: RouteBaseArgs & Args & Extra) => PromiseOrObject<ReactNode>) {
    this.#loading = render as (args: never) => PromiseOrObject<ReactNode>;
    return this;
  }
  render(render: (args: RouteBaseArgs & Args & Extra) => PromiseOrObject<ReactNode>) {
    this.#render = render as (args: never) => PromiseOrObject<ReactNode>;
    return this;
  }

  get pageConfig() {
    return this.#config;
  }

  protected declare(arg: RouteArgInfo) {
    if (arg.name === "lang")
      throw new Error(`[route-convention] ${this.kind}() receives "lang" on every route; it is never declared`);
    if (this.args.some((existing) => existing.name === arg.name))
      throw new Error(`[route-convention] ${this.kind}() declares "${arg.name}" twice`);
    this.args.push(arg);
  }

  /** A path value the type refuses answers not-found; a failing search value is dropped. `strict` refuses both by name. */
  resolveArgs(input: RouteArgInput, { strict = false }: RouteArgResolveOption = {}): Record<string, unknown> {
    const resolved: Record<string, unknown> = {};
    for (const arg of this.args) {
      const raw = arg.kind === "param" ? input.params[arg.name] : input.searchParams[arg.name];
      if (raw === undefined || raw === "") {
        if (arg.kind === "param") throw new RouteArgError(arg, `Missing required argument "${arg.name}".`);
        continue;
      }
      const value = RouteDefinition.#lift(arg, raw, strict);
      try {
        resolved[arg.name] = RouteDefinition.#parse(arg, value);
      } catch {
        if (strict) throw new RouteArgError(arg, RouteDefinition.#invalidMessage(arg));
        if (arg.kind === "param") throw new AkanNotFoundError();
      }
    }
    return resolved;
  }

  /** A page must declare every `[x]` segment it sits under with `.param()`; a layout may declare a subset. */
  assertPattern(pattern: string, key: string) {
    const inPath = pattern
      .split("/")
      .filter((part) => part.startsWith(":"))
      .map((part) => part.slice(1))
      .filter((name) => name !== "lang");
    const declared = this.args.filter((arg) => arg.kind === "param").map((arg) => arg.name);
    const unknown = declared.find((name) => !inPath.includes(name));
    if (unknown)
      throw new Error(
        `[route-convention] ${key} declares .param("${unknown}") but no [${unknown}] segment is in its path`,
      );
    const undeclared = inPath.find((name) => !declared.includes(name));
    if (this.kind === "page" && undeclared)
      throw new Error(
        `[route-convention] ${key} sits under [${undeclared}] but declares no .param("${undeclared}") — a page reads only what it declares`,
      );
  }

  /** The module shape every route loader reads, so a chain and a legacy module walk one path from here on. */
  toRouteModule(): PageModule & LayoutModule {
    const render = this.#render;
    if (!render)
      throw new Error(`[route-convention] a ${this.kind}() chain ends with .render(), and this one has none`);
    const head = this.#head;
    const guard = this.#guard;
    const loading = this.#loading;
    const module: PageModule & LayoutModule = {
      default: this.#renderRouteOf(render) as never,
      ...(this.#config ? { pageConfig: this.#config } : {}),
      ...(guard ? { guard: this.#guardRouteOf(guard) } : {}),
      ...(head === undefined
        ? {}
        : typeof head === "function"
          ? { generateHead: async (props: RouteRenderProps) => await head(this.#argsOf(props) as never) }
          : { head }),
      ...(loading
        ? {
            Loading: ((props: RouteRenderProps) =>
              loading(this.#argsOf({ ...props, searchParams: {} }) as never)) as never,
          }
        : {}),
    };
    return this.extendModule(module);
  }

  protected extendModule(module: PageModule & LayoutModule): PageModule & LayoutModule {
    return module;
  }

  /** What `.render()` receives beyond the declared args; a page adds its apps' elements. */
  protected renderArgsOf(args: RouteBaseArgs & Args & Extra): PromiseOrObject<RouteBaseArgs & Args & Extra> {
    return args;
  }

  //? Marked with the args it reads, as the render is, so CSR asks the guards again only when one of those moves.
  #guardRouteOf(guard: (args: never) => void | Promise<void>) {
    const route = async (props: RouteGuardProps) => await guard(this.#guardArgsOf(props) as never);
    Object.defineProperty(route, routeArgsMarker, { value: this.args.map(({ kind, name }) => ({ kind, name })) });
    return route;
  }

  //? Kept while the render stage and the arguments are the same: a dev server swapping route modules unfolds every
  //? route again, and a new function per call would make each mounted layer render again, not just the edited one.
  #renderRouteOf(render: (args: never) => PromiseOrObject<ReactNode>) {
    const kept = this.#renderRoute;
    if (kept?.render === render && kept.argCount === this.args.length) return kept.route;
    //? `Translator.renderAt` holds a CSR screen's path only for the render's synchronous part, so a route with no apps
    //? renders before any await, and one with apps renders at the path it was called at.
    const route = async (props: RouteRenderProps) => {
      const args = this.renderArgsOf(this.#argsOf(props));
      if (!(args instanceof Promise)) return await render(args as never);
      const path = Translator.getRenderPath();
      const resolved = await args;
      return await Translator.renderAt(path, () => render(resolved as never));
    };
    Object.defineProperty(route, routeArgsMarker, { value: this.args.map(({ kind, name }) => ({ kind, name })) });
    this.#renderRoute = { render, argCount: this.args.length, route };
    return route;
  }

  /**
   * What a route's render output depends on: a chain's declared args plus `lang`. A legacy module declares nothing,
   * so it depends on the params of its own path (`paramNames`, every param when unknown) and, for a page, every
   * search value — a layout reads no query.
   */
  static renderArgsKey(
    render: unknown,
    props: { params: Record<string, string>; searchParams?: Record<string, string | string[]> },
    { isPage, paramNames }: { isPage: boolean; paramNames?: string[] },
  ): string {
    const declared = (render as { [routeArgsMarker]?: Pick<RouteArgInfo, "kind" | "name">[] } | null)?.[
      routeArgsMarker
    ];
    const searchParams = props.searchParams ?? {};
    if (!declared) {
      const params = paramNames ? paramNames.map((name) => props.params[name]) : props.params;
      return JSON.stringify([params, isPage ? searchParams : null]);
    }
    return JSON.stringify([
      props.params.lang,
      ...declared.map(({ kind, name }) => (kind === "param" ? props.params[name] : searchParams[name])),
    ]);
  }

  #argsOf(props: RouteRenderProps): RouteBaseArgs & Args & Extra {
    const { lang = parseAkanI18nEnv().defaultLocale } = props.params;
    const resolved = this.resolveArgs({ params: props.params, searchParams: props.searchParams ?? {} });
    const args = { lang, ...resolved };
    return (this.kind === "page" ? args : { ...args, children: props.children }) as RouteBaseArgs & Args & Extra;
  }

  #guardArgsOf({ params, searchParams, listing }: RouteGuardProps): RouteBaseArgs & Args {
    const { lang = parseAkanI18nEnv().defaultLocale } = params;
    if (!listing) return { lang, ...this.resolveArgs({ params, searchParams }) } as RouteBaseArgs & Args;
    const declared = new Set(this.args.map((arg) => arg.name));
    return new Proxy({ lang } as RouteBaseArgs & Args, {
      get: (target, key, receiver) => {
        if (typeof key === "string" && declared.has(key)) throw new RouteArgPending(key);
        return Reflect.get(target, key, receiver);
      },
    });
  }

  /** One value where a list was declared is a one-item list (`?tags=a`); under `strict` a list is comma-separated. */
  static #lift(arg: RouteArgInfo, raw: string | string[], strict: boolean): unknown {
    if (!arg.list) return Array.isArray(raw) ? raw[0] : raw;
    if (Array.isArray(raw)) return raw;
    return strict
      ? raw
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean)
      : [raw];
  }

  static #parse(arg: RouteArgInfo, value: unknown): unknown {
    const enumRef = isEnum(arg.type as Cls) ? (arg.type as EnumInstance) : undefined;
    const scalar = (enumRef ? enumRef.type : arg.type) as typeof PrimitiveScalar;
    return deserialize(scalar as never, arg.list ? 1 : 0, value, { key: arg.name, enum: enumRef });
  }

  static #invalidMessage(arg: RouteArgInfo): string {
    if (isEnum(arg.type as Cls))
      return `Invalid argument "${arg.name}": expected one of ${(arg.type as EnumInstance).values.join(", ")}.`;
    const name = PrimitiveRegistry.has(arg.type as Cls)
      ? PrimitiveRegistry.getName(arg.type as typeof PrimitiveScalar)
      : "a value";
    return `Invalid argument "${arg.name}": expected ${name}${arg.list ? "[]" : ""}.`;
  }
}
