import { RenderScope } from "akanjs/fetch";
import type { ReactNode } from "react";
import type { LayoutErrorRender, LayoutModule, LayoutNotFoundRender, PageModule } from "../csrTypes";
import { type RouteArgsShape, RouteDefinition, type RouteKind } from "./RouteDefinition";
import type { RouteArgOption, RouteArgType, RouteArgValue, RouteSearchType } from "./routeArgs";

export interface LayoutExtra {
  children: ReactNode;
}

export class LayoutDefinition<Args extends RouteArgsShape = Record<never, never>> extends RouteDefinition<
  Args,
  LayoutExtra
> {
  readonly kind: RouteKind = "layout";
  #notFound?: LayoutNotFoundRender;
  #error?: LayoutErrorRender;

  param<Name extends string, Type extends RouteArgType>(name: Name, type: Type, option: RouteArgOption = {}) {
    this.declare({ kind: "param", name, type, list: false, desc: option.desc });
    return this as unknown as LayoutDefinition<Args & { [Key in Name]: RouteArgValue<Type> }>;
  }

  search<Name extends string, Type extends RouteSearchType>(name: Name, type: Type, option: RouteArgOption = {}) {
    const list = Array.isArray(type);
    this.declare({ kind: "search", name, type: (list ? type[0] : type) as RouteArgType, list, desc: option.desc });
    return this as unknown as LayoutDefinition<Args & { [Key in Name]?: RouteArgValue<Type> }>;
  }

  notFound(render: LayoutNotFoundRender) {
    this.#notFound = (props) => RenderScope.run(() => render(props));
    return this;
  }

  error(render: LayoutErrorRender) {
    this.#error = (props) => RenderScope.run(() => render(props));
    return this;
  }

  protected override extendModule(module: PageModule & LayoutModule): PageModule & LayoutModule {
    return {
      ...module,
      ...(this.#notFound ? { NotFound: this.#notFound } : {}),
      ...(this.#error ? { Error: this.#error } : {}),
    };
  }
}
