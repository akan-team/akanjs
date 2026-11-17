import type { ServerPolicy } from "akanjs/native/api";
import { ServerEnvProfile } from "../transforms/serverEnvProfile";
import type { AkanNativeDesktopConfig } from "./types";

export class DesktopServerConfig {
  //? `true` or `{ omit, profile, modules }`: lists trimmed once, so two targets that agree on them stage one server.
  static resolve<T extends { server?: AkanNativeDesktopConfig["server"] }>(
    desktop: T,
    where: string,
    configPath: string,
  ): T {
    const { server } = desktop;
    if (server === undefined || typeof server === "boolean") return desktop;
    if (!DesktopServerConfig.#isPlainObject(server))
      throw new Error(`${where} in ${configPath} must be true or { omit, profile, modules }.`);
    const names = (list: unknown, key: string, what: string) => {
      if (list === undefined) return [];
      if (!Array.isArray(list) || list.some((name) => typeof name !== "string" || !name.trim()))
        throw new Error(`${where}.${key} in ${configPath} must be a list of ${what}.`);
      return [...new Set(list.map((name: string) => name.trim()))].sort();
    };
    const { profile } = server;
    if (profile !== undefined && (typeof profile !== "string" || !ServerEnvProfile.namePattern.test(profile)))
      throw new Error(
        `${where}.profile in ${configPath} names env/env.server.<env>.<profile>.ts: a lowercase-first name of letters, digits and dashes.`,
      );
    const modules = names(server.modules, "modules", "module names or @<operationMode> selectors");
    const env = DesktopServerConfig.#env(server.env, where, configPath);
    const { restart } = server;
    if (restart !== undefined && restart !== "forever" && !(Number.isInteger(restart) && (restart as number) > 0))
      throw new Error(`${where}.restart in ${configPath} must be "forever" or a count of crashes in a row from 1.`);
    const watchdog = DesktopServerConfig.#watchdog(server.watchdog, where, configPath);
    return {
      ...desktop,
      server: {
        omit: names(server.omit, "omit", "package names"),
        ...(profile ? { profile } : {}),
        ...(modules.length ? { modules } : {}),
        ...(Object.keys(env).length ? { env } : {}),
        ...(restart !== undefined ? { restart } : {}),
        ...(watchdog ? { watchdog } : {}),
      },
    };
  }
  //? The stage owns these: the operation mode, the database mode, what is served and the shutdown budget the shell's
  //? quit waits on are what make it the carried server.
  static readonly #stagedEnv = new Set([
    "AKAN_PUBLIC_OPERATION_MODE",
    "AKAN_DATABASE_MODE",
    "AKAN_DATABASE_MODES",
    "AKAN_SSR",
    "AKAN_CSR",
    "AKAN_MCP",
    "AKAN_SHUTDOWN_TIMEOUT_MS",
    "AKAN_MODULES",
  ]);
  static #env(env: unknown, where: string, configPath: string): Record<string, string> {
    if (env === undefined) return {};
    if (!DesktopServerConfig.#isPlainObject(env) || Object.values(env).some((value) => typeof value !== "string"))
      throw new Error(`${where}.env in ${configPath} must be an object of strings.`);
    const staged = Object.keys(env).filter((key) => DesktopServerConfig.#stagedEnv.has(key.toUpperCase()));
    if (staged.length)
      throw new Error(
        `${where}.env in ${configPath} sets ${staged.join(", ")}, which the carried server's stage owns (modules: desktop.server.modules).`,
      );
    const secrets = ServerEnvProfile.secretPaths(env);
    if (secrets.length)
      throw new Error(
        `${where}.env in ${configPath} holds secret-named values (${secrets.join(", ")}), and the app carries its env where anyone on the computer reads it. Leave them out.`,
      );
    return env as Record<string, string>;
  }
  //? The akan.config.ts shape, which takes `true` and fills in what is left out; the launcher reads what this returns
  //? with serverPolicyOf in @akanjs/native, which devkit cannot load while it reads a config.
  static #watchdog(watchdog: unknown, where: string, configPath: string): ServerPolicy["watchdog"] | null {
    if (watchdog === undefined || watchdog === false) return null;
    const options = watchdog === true ? {} : watchdog;
    const whole = (value: unknown) => value === undefined || (Number.isInteger(value) && (value as number) > 0);
    if (
      !DesktopServerConfig.#isPlainObject(options) ||
      Object.keys(options).some((key) => key !== "intervalMs" && key !== "failures") ||
      !whole(options.intervalMs) ||
      !whole(options.failures)
    )
      throw new Error(
        `${where}.watchdog in ${configPath} must be true or { intervalMs, failures }, whole numbers from 1.`,
      );
    return {
      intervalMs: (options.intervalMs as number | undefined) ?? 10_000,
      failures: (options.failures as number | undefined) ?? 3,
    };
  }
  static #isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
}
