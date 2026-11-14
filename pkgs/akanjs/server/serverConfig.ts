import type { AkanWebConfig, AkanWebOption } from "akanjs";
import { AkanError, type BackendEnv, normalizeRoutePrefix } from "akanjs/base";
import { parseBasePaths } from "akanjs/common";
import type { AkanLib } from "./akanLib";
import type { AkanServerOptions, McpServerOption } from "./akanServer";
import { type McpAuthOption, McpRateLimiter } from "./mcp";

export class ServerConfig {
  static requireRoutePrefix(value: string, field: string) {
    const normalized = normalizeRoutePrefix(value);
    if (!normalized)
      throw new AkanError("invalidConfig", `${field} must be a path segment such as "/api"; "${value}" is not one.`);
    return normalized;
  }

  // A prefix and a basePath that shadow each other silently lose every route on one side.
  static assertPrefixClearsBasePaths(prefix: string) {
    const basePaths = parseBasePaths(process.env.AKAN_PUBLIC_BASE_PATHS);
    const first = prefix.split("/")[1];
    const collision = basePaths.find((basePath) => basePath === first);
    if (!collision) return;
    throw new AkanError(
      "invalidConfig",
      `Route prefix "${prefix}" collides with the "${collision}" basePath; give the API its own.`,
    );
  }

  static splitLibsAndOptions(libsOrOptions: (AkanLib | AkanServerOptions)[]) {
    const last = libsOrOptions.at(-1);
    const options = ServerConfig.isServerOptions(last) ? last : undefined;
    const libs = (options ? libsOrOptions.slice(0, -1) : libsOrOptions) as AkanLib[];
    return { libs, options };
  }

  static isServerOptions(value: AkanLib | AkanServerOptions | undefined): value is AkanServerOptions {
    return Boolean(
      value &&
        !("database" in value) &&
        !("service" in value) &&
        !("scalar" in value) &&
        ("openapi" in value ||
          "mcp" in value ||
          "modules" in value ||
          "disableModules" in value ||
          "disableLibs" in value),
    );
  }

  static isEdge(env: BackendEnv) {
    return ((env as { operationMode?: string }).operationMode ?? process.env.AKAN_PUBLIC_OPERATION_MODE) === "edge";
  }

  static isEnvEnabled(...names: string[]) {
    return names.some((name) => process.env[name] === "true" || process.env[name] === "1");
  }

  static narrowWeb(current: AkanWebConfig, web: AkanWebOption | undefined): AkanWebConfig {
    if (web === undefined || web === true) return current;
    if (web === false) return { ssr: false, csr: false };
    return { ssr: current.ssr, csr: web.csr && current.csr };
  }

  static isEnvOff(...names: string[]) {
    return names.some((name) => process.env[name] === "false" || process.env[name] === "0");
  }

  static mcpAuthFromEnv(): McpAuthOption {
    const authorizationServers = ServerConfig.envList("AKAN_MCP_AUTH_SERVERS");
    const scopes = ServerConfig.envList("AKAN_MCP_SCOPES");
    return {
      ...(authorizationServers?.length ? { authorizationServers } : {}),
      ...(scopes?.length ? { scopes } : {}),
      ...(process.env.AKAN_MCP_RESOURCE ? { resource: process.env.AKAN_MCP_RESOURCE } : {}),
    };
  }

  // Code wins over the env only for a value: a spread would let `{ path: undefined }` erase what the env supplied.
  static defined<T extends object>(source: T): Partial<T> {
    return Object.fromEntries(Object.entries(source).filter(([, value]) => value !== undefined)) as Partial<T>;
  }

  static mcpOptionFromEnv(): Omit<McpServerOption, "enabled" | "readOnly" | "auth"> {
    const allowedOrigins = ServerConfig.envList("AKAN_MCP_ALLOWED_ORIGINS");
    const pageSize = Number(process.env.AKAN_MCP_PAGE_SIZE);
    const promptBudget = Number(process.env.AKAN_MCP_PROMPT_BUDGET);
    return {
      ...ServerConfig.mcpPathFromEnv(),
      ...(process.env.AKAN_MCP_VERSION ? { version: process.env.AKAN_MCP_VERSION } : {}),
      ...(process.env.AKAN_MCP_INSTRUCTIONS ? { instructions: process.env.AKAN_MCP_INSTRUCTIONS } : {}),
      ...(allowedOrigins?.length ? { allowedOrigins } : {}),
      ...(Number.isInteger(pageSize) && pageSize > 0 ? { pageSize } : {}),
      ...(Number.isInteger(promptBudget) && promptBudget > 0 ? { promptBudget } : {}),
      ...(process.env.AKAN_MCP_LANGUAGE ? { language: process.env.AKAN_MCP_LANGUAGE } : {}),
      ...(ServerConfig.isEnvOff("AKAN_MCP_LEGACY_TEXT") ? { legacyTextBlock: false } : {}),
      ...(ServerConfig.isEnvOff("AKAN_MCP_APPS") ? { apps: false } : {}),
      ...ServerConfig.mcpModernFromEnv(),
      ...ServerConfig.mcpOutputSchemaFromEnv(),
      ...McpRateLimiter.fromEnv(),
    };
  }

  static mcpModernFromEnv(): Pick<McpServerOption, "modern"> {
    if (ServerConfig.isEnvEnabled("AKAN_MCP_MODERN")) return { modern: true };
    return ServerConfig.isEnvOff("AKAN_MCP_MODERN") ? { modern: false } : {};
  }

  static mcpOutputSchemaFromEnv(): Pick<McpServerOption, "outputSchema"> {
    const value = process.env.AKAN_MCP_OUTPUT_SCHEMA;
    return value === "full" || value === "shallow" || value === "none" ? { outputSchema: value } : {};
  }

  // The route key and the RFC 9728 metadata path both concatenate it, so a missing leading slash is normalized.
  static mcpPathFromEnv() {
    const path = process.env.AKAN_MCP_PATH?.trim();
    if (!path) return {};
    return { path: path.startsWith("/") ? path : `/${path}` };
  }

  static envList(name: string) {
    return process.env[name]
      ?.split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  // Must finish inside the gateway's child-wait budget, or the layer above SIGKILLs this process.
  static defaultShutdownTimeoutMs() {
    const configured = Number(process.env.AKAN_SHUTDOWN_TIMEOUT_MS);
    if (Number.isFinite(configured) && configured > 0) return configured;
    return process.env.AKAN_COMMAND_TYPE === "start" ? 3_000 : 30_000;
  }
}
