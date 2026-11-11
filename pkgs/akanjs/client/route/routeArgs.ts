import type { FieldToValue, ParamFieldType } from "akanjs/constant";

/** A scalar (`ID`, `String`, `Int`, `Float`, `Boolean`, `Date`) or an `enumOf` class — what a URL segment can carry. */
export type RouteArgType = ParamFieldType;
/** A search argument may also be a flat list, written `[String]`; the URL repeats the key or comma-separates it. */
export type RouteSearchType = RouteArgType | [RouteArgType];
export type RouteArgValue<T> = T extends [infer Item] ? FieldToValue<Item>[] : FieldToValue<T>;

export interface RouteArgOption {
  /** What the value is, read by the person filling the MCP prompt form in — so English. */
  desc?: string;
}

/** Every route sits under `/:lang`, so the locale segment reaches each stage as `lang` with no `.param()` for it. */
export interface RouteBaseArgs {
  lang: string;
}

/** A guard's second argument. `path` is a target to send the visitor back to, never a reason to let them in: CSR asks
 *  a guard again only when the route or an arg it declared moves, so a query it did not declare can move on. */
export interface RouteGuardRequest {
  /** The requested in-app path with its search, as `router.push` takes it; `undefined` while MCP lists the screen. */
  path?: string;
}

export interface RouteArgInfo {
  kind: "param" | "search";
  name: string;
  type: RouteArgType;
  list: boolean;
  desc?: string;
}

export interface RouteArgInput {
  params: Record<string, string>;
  searchParams: Record<string, string | string[]>;
}

/** What the page prompt catalogue publishes for one declared argument. */
export interface RoutePromptArgument {
  name: string;
  description?: string;
  required: boolean;
}

export interface RoutePromptMeta {
  name: string;
  description: string;
  arguments: RoutePromptArgument[];
}

export class RouteArgError extends Error {
  readonly arg: RouteArgInfo;
  constructor(arg: RouteArgInfo, message: string) {
    super(message);
    this.arg = arg;
  }
}

/** A guard read an argument while MCP listed its screen, when none is known yet: the call decides with them. */
export class RouteArgPending extends Error {
  readonly digest = "AKAN_ROUTE_ARG_PENDING";
  constructor(name: string) {
    super(`Argument "${name}" is not known while the screen is listed`);
    this.name = "RouteArgPending";
  }
}
