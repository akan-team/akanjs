import type { Adaptor } from "akanjs/service";

import type { EndpointInfo } from "./endpointInfo";
import type { EndpointErrors } from "./types";

// What an endpoint's `errors` declaration promises, checked where it is declared and where it is broken.
export class EndpointErrorContract {
  static readonly #warned = new Set<string>();

  /** Refuses a declaration no response could carry: a status outside 400–599, or a key that is not an error key. */
  static assertDeclared(errors: EndpointErrors | undefined) {
    if (!errors) return;
    for (const [status, keys] of Object.entries(errors) as [string, EndpointErrors[number]][]) {
      const code = Number(status);
      if (!Number.isInteger(code) || code < 400 || code > 599)
        throw new Error(`errors declares status ${status}: an error answers with a 400–599 status`);
      for (const key of keys)
        if (!/^[^.]+\.error\.[^.]+$/.test(key))
          throw new Error(`errors declares "${key}" under ${status}: an error key reads <module>.error.<key>`);
    }
  }

  static keysOf(errors: EndpointErrors | undefined): string[] {
    return errors ? Object.values(errors).flat() : [];
  }

  //? Outside production, and once per endpoint and key: the declaration is what OpenAPI and MCP publish, so a key it
  //? leaves out is an error a client was told it would never see. The framework's own `base.error.*` are exempt.
  static checkThrown(endpoint: Adaptor, endpointInfo: EndpointInfo, key: string, thrownKey: string) {
    const { errors } = endpointInfo.signalOption;
    if (!errors || process.env.NODE_ENV === "production" || thrownKey.startsWith("base.error.")) return;
    if (EndpointErrorContract.keysOf(errors).includes(thrownKey)) return;
    const warnedKey = `${key}\0${thrownKey}`;
    if (EndpointErrorContract.#warned.has(warnedKey)) return;
    EndpointErrorContract.#warned.add(warnedKey);
    endpoint.logger.warn(
      `"${key}" threw ${thrownKey}, which its \`errors\` declaration leaves out: OpenAPI and the MCP catalogue do not publish it.`,
    );
  }
}
