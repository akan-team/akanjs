import { getEnv } from "akanjs/base";
import { addRequestScriptHashes, scriptNonce as serverScriptNonce } from "akanjs/fetch";

/** The nonce an inline `<script>` a `.head()` or a layout writes needs under the script policy; server only. */
export const scriptNonce = (): string | undefined => {
  if (getEnv().side !== "server") return undefined;
  return serverScriptNonce();
};

/** Names inline scripts of this page by hash (`sha256-…`) in the response's script policy; call it from `.head()`. */
export const scriptHashes = (...hashes: string[]): void => {
  if (getEnv().side !== "server") return;
  addRequestScriptHashes(hashes);
};
