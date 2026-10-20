import type { PromiseOrObject } from "akanjs/base";
import { AppScope } from "akanjs/fetch";
import type { ReactNode } from "react";
import { type RouteArgsShape, RouteDefinition } from "./RouteDefinition";
import type {
  RouteArgInfo,
  RouteArgOption,
  RouteArgType,
  RouteArgValue,
  RouteBaseArgs,
  RoutePromptArgument,
  RoutePromptMeta,
  RouteSearchType,
} from "./routeArgs";

interface PagePrompt {
  name: string;
  description: string;
}

interface PageApp {
  name: string;
  description: string;
  load: (args: never) => PromiseOrObject<ReactNode>;
}

/** `never` for a name the page's render already receives, so a clash fails to compile as well as at definition. */
type FreeName<Name extends string, Taken> = Name extends "lang" | keyof Taken ? never : Name;

export class PageDefinition<
  Args extends RouteArgsShape = Record<never, never>,
  Apps extends RouteArgsShape = Record<never, never>,
> extends RouteDefinition<Args> {
  /** MCP names an entry by `^[A-Za-z0-9_-]{1,64}$`; a prompt name outside it never reaches a client's slash menu. */
  static readonly promptName = /^[A-Za-z0-9_-]{1,64}$/;
  /** Appended to a list argument's description: the flat string map of `prompts/get` has no other spelling. */
  static readonly commaSeparated = "Comma-separated list.";

  readonly kind = "page" as const;
  #prompt?: PagePrompt;
  readonly #apps: PageApp[] = [];

  param<Name extends string, Type extends RouteArgType>(
    name: Name & FreeName<Name, Apps>,
    type: Type,
    option: RouteArgOption = {},
  ) {
    this.declare({ kind: "param", name, type, list: false, desc: option.desc });
    return this as unknown as PageDefinition<Args & { [Key in Name]: RouteArgValue<Type> }, Apps>;
  }

  search<Name extends string, Type extends RouteSearchType>(
    name: Name & FreeName<Name, Apps>,
    type: Type,
    option: RouteArgOption = {},
  ) {
    const list = Array.isArray(type);
    this.declare({ kind: "search", name, type: (list ? type[0] : type) as RouteArgType, list, desc: option.desc });
    return this as unknown as PageDefinition<Args & { [Key in Name]?: RouteArgValue<Type> }, Apps>;
  }

  /** Publishes this screen as an MCP prompt: the description is the whole instruction a model receives. English. */
  prompt(name: string, description: string) {
    PageDefinition.#assertEntry("prompt", name, description);
    if (this.#apps.some((app) => app.name === name))
      throw new Error(`[route-convention] page() names "${name}" as both an app and its prompt; MCP lists both`);
    this.#prompt = { name, description };
    return this;
  }

  /**
   * Publishes one component of this screen as an MCP App: a read-only tool whose arguments are the page's `.param()`
   * and `.search()`, and whose result a host draws with `load`'s element. `load` may only query. On the web the
   * element arrives as the render argument `name`. English description.
   */
  app<Name extends string>(
    name: Name & FreeName<Name, Args & Apps>,
    description: string,
    load: (args: RouteBaseArgs & Args) => PromiseOrObject<ReactNode>,
  ) {
    PageDefinition.#assertEntry("app", name, description);
    if (name === "lang")
      throw new Error(`[route-convention] app "lang" would hide the lang every route receives; name it otherwise`);
    if (this.args.some((arg) => arg.name === name) || this.#apps.some((app) => app.name === name))
      throw new Error(
        `[route-convention] page() names "${name}" twice; an app's element arrives as the render argument of its name`,
      );
    if (this.#prompt?.name === name)
      throw new Error(`[route-convention] page() names "${name}" as both an app and its prompt; MCP lists both`);
    this.#apps.push({ name, description, load: load as PageApp["load"] });
    return this as unknown as PageDefinition<Args, Apps & { [Key in Name]: ReactNode }>;
  }

  override render(render: (args: RouteBaseArgs & Args & Apps) => PromiseOrObject<ReactNode>) {
    return super.render(render as never);
  }

  get promptMeta(): RoutePromptMeta | undefined {
    if (!this.#prompt) return undefined;
    return { ...this.#prompt, arguments: this.#entryArguments() };
  }

  get appMetas(): RoutePromptMeta[] {
    return this.#apps.map(({ name, description }) => ({ name, description, arguments: this.#entryArguments() }));
  }

  /** One app's element for these args, alone: what an MCP call runs after the route guards, and its view draws. */
  async loadApp(name: string, args: RouteBaseArgs & Args): Promise<ReactNode> {
    const app = this.#apps.find((candidate) => candidate.name === name);
    if (!app) throw new Error(`[route-convention] this page declares no app "${name}"`);
    return await PageDefinition.#load(app, args);
  }

  protected override declare(arg: RouteArgInfo) {
    if (this.#apps.some((app) => app.name === arg.name))
      throw new Error(
        `[route-convention] page() names "${arg.name}" twice; an app's element arrives as the render argument of its name`,
      );
    super.declare(arg);
  }

  protected override renderArgsOf(args: RouteBaseArgs & Args): PromiseOrObject<RouteBaseArgs & Args> {
    if (!this.#apps.length) return args;
    return Promise.all(this.#apps.map((app) => PageDefinition.#load(app, args))).then((elements) => ({
      ...args,
      ...Object.fromEntries(this.#apps.map((app, idx) => [app.name, elements[idx]])),
    }));
  }

  #entryArguments(): RoutePromptArgument[] {
    return this.args.map((arg) => {
      const description = [arg.desc, arg.list ? PageDefinition.commaSeparated : undefined].filter(Boolean).join(" ");
      return { name: arg.name, ...(description ? { description } : {}), required: arg.kind === "param" };
    });
  }

  static async #load(app: PageApp, args: object): Promise<ReactNode> {
    return await AppScope.run(app.name, () => app.load(args as never));
  }

  static #assertEntry(kind: "prompt" | "app", name: string, description: string) {
    if (!PageDefinition.promptName.test(name))
      throw new Error(`[route-convention] ${kind} name "${name}" must match ${PageDefinition.promptName}`);
    if (!description.trim()) throw new Error(`[route-convention] ${kind} "${name}" needs a description`);
  }
}
