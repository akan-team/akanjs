// RFC 8628 §6.1: a user code a person types, from consonants only so it never spells a word. The CLI prints it and
// the cloud recomputes it from the device code, so changing the derivation breaks login between versions.
// Security: the sign-in URL carries only `loginIdOf(device code)`; the cloud answers a poll by the device code alone.
export class RemoteAuthCode {
  static readonly alphabet = "BCDFGHJKLMNPQRSTVWXZ";
  static readonly symbolNum = 8;
  static readonly #domain = "akan-remote-auth-code:";
  static readonly #loginDomain = "akan-remote-login-id:";
  //? 240 is the largest multiple of 20 a byte holds: a byte past it is skipped, so no symbol is likelier than another.
  static readonly #byteCeiling = 240;

  static async of(remoteId: string) {
    const symbols = await RemoteAuthCode.#symbols(remoteId);
    return `${symbols.slice(0, 4)}-${symbols.slice(4)}`;
  }

  static async loginIdOf(remoteId: string) {
    const digest = await RemoteAuthCode.#sha256(new TextEncoder().encode(`${RemoteAuthCode.#loginDomain}${remoteId}`));
    return btoa(String.fromCharCode(...digest))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  }

  //? NFKC folds the full-width letters an IME types into ASCII; everything outside the alphabet is punctuation.
  static normalize(input: string) {
    let normalized = "";
    for (const char of input.normalize("NFKC").toUpperCase())
      if (RemoteAuthCode.alphabet.includes(char)) normalized += char;
    return normalized;
  }

  static async matches(remoteId: string, typed: string) {
    const expected = RemoteAuthCode.normalize(await RemoteAuthCode.of(remoteId));
    const given = RemoteAuthCode.normalize(typed);
    let diff = expected.length ^ given.length;
    for (let idx = 0; idx < expected.length; idx++) diff |= expected.charCodeAt(idx) ^ given.charCodeAt(idx);
    return diff === 0;
  }

  static async #symbols(remoteId: string) {
    let block = await RemoteAuthCode.#sha256(new TextEncoder().encode(`${RemoteAuthCode.#domain}${remoteId}`));
    let symbols = "";
    for (;;) {
      for (const byte of block) {
        if (byte >= RemoteAuthCode.#byteCeiling) continue;
        symbols += RemoteAuthCode.alphabet[byte % RemoteAuthCode.alphabet.length];
        if (symbols.length === RemoteAuthCode.symbolNum) return symbols;
      }
      block = await RemoteAuthCode.#sha256(block);
    }
  }

  static async #sha256(bytes: Uint8Array<ArrayBuffer>) {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  }
}
