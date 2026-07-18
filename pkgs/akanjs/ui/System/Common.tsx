import "dayjs/locale/ko";

import type { ClientEnv } from "akanjs/base";
import type { RootLayoutProps, WebAppManifest } from "akanjs/client";
import type { AkanTheme } from "akanjs/fetch";
import type { ReactNode } from "react";

export interface ProviderProps {
  /** Additional classes for the app frame/root wrapper. */
  className?: string;
  /** Public application name used by client routing and metadata. */
  appName: string;
  /** Route params passed from the app root layout. */
  params: RootLayoutProps["params"];
  /** Additional head content rendered by the app shell. */
  head?: ReactNode;
  /** Web app manifest emitted as a data URL. */
  manifest?: WebAppManifest;
  /** Client runtime environment injected into the app bridge. */
  env: ClientEnv;
  /** Initial Akan theme configuration. */
  theme?: AkanTheme;
  /** Optional route prefix/base path. */
  prefix?: string;
  /** App content rendered inside the system provider. */
  children: ReactNode | ReactNode[];
  /** Optional Google Analytics tracking id. */
  gaTrackingId?: string;
  /** Select mobile-style frame behavior or normal web layout. */
  layoutStyle?: "mobile" | "web";
  /** Enable reconnect helper. Defaults to local operation mode in CSR. */
  reconnect?: boolean;
  /** Connect the client WebSocket runtime after the browser loads. */
  wsConnect?: boolean;
  /** Active-locale dictionary injected by the server (SSR only) to seed the client Translator. */
  dictionary?: Record<string, Record<string, unknown>>;
  /**
   * Full lang-keyed dictionary snapshot (SSR server-only). The provider seeds every locale into
   * the RSC-worker Translator (free on the server, never shipped to the browser) and serializes only
   * the request's active locale to the client, so translations resolve regardless of locale routing.
   */
  allDictionary?: Record<string, Record<string, Record<string, unknown>>>;
  /** Root route component used by CSR page loading. */
  of: (props: unknown) => ReactNode | null;
}

export const Common = () => {
  return <></>;
};

export function ManifestLink({ manifest }: { manifest?: WebAppManifest }) {
  if (!manifest) return null;
  return <link rel="manifest" href={createManifestDataUrl(manifest)} />;
}

export function createManifestDataUrl(manifest: WebAppManifest): string {
  const json = JSON.stringify(toManifestJson(manifest));
  return `data:application/manifest+json;base64,${encodeBase64Utf8(json)}`;
}

export function toManifestJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(toManifestJson);
  if (!isPlainObject(value)) return value;

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entryValue]) => entryValue !== undefined)
      .map(([key, entryValue]) => [camelToSnake(key), toManifestJson(entryValue)]),
  );
}

function camelToSnake(key: string): string {
  return key.replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Object.prototype.toString.call(value) === "[object Object]";
}

function encodeBase64Utf8(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  if (typeof btoa === "function") return btoa(binary);

  const buffer = (
    globalThis as typeof globalThis & {
      Buffer?: {
        from: (bytes: Uint8Array) => {
          toString: (encoding: "base64") => string;
        };
      };
    }
  ).Buffer;
  if (buffer) return buffer.from(bytes).toString("base64");
  throw new Error("Base64 encoding is not available in this runtime");
}
