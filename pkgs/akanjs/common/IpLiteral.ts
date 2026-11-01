import { IpBytes } from "./IpBytes";

export class IpLiteral {
  //? A proxy may record a hop as `a.b.c.d:port` or `[v6]:port`; anything else that is not an address is `null`.
  static parse(entry: string): string | null {
    const trimmed = entry.trim();
    const bracketed = /^\[([^\]]*:[^\]]*)\](?::\d{1,5})?$/.exec(trimmed);
    const v4WithPort = /^(\d{1,3}(?:\.\d{1,3}){3}):\d{1,5}$/.exec(trimmed);
    const [address = "", zone, ...rest] = (bracketed?.[1] ?? v4WithPort?.[1] ?? trimmed).split("%");
    if (rest.length) return null;
    if (zone !== undefined && !(address.includes(":") && /^[A-Za-z0-9_.-]{1,64}$/.test(zone))) return null;
    const bytes = IpBytes.of(IpBytes.normalize(address));
    //? Zone dropped (it names the recorder's interface) and spelled one way, so one caller is one rate-limit key.
    return bytes ? IpLiteral.#format(bytes) : null;
  }

  // RFC 5952 text, an IPv4-mapped address as plain IPv4 the way `IpBytes.normalize` reads it.
  static #format(bytes: Uint8Array): string {
    if (bytes.length === 4) return bytes.join(".");
    if (bytes.subarray(0, 10).every((byte) => byte === 0) && bytes[10] === 0xff && bytes[11] === 0xff)
      return bytes.subarray(12).join(".");
    const groups = Array.from({ length: 8 }, (_, idx) => ((bytes[idx * 2] ?? 0) << 8) | (bytes[idx * 2 + 1] ?? 0));
    let runStart = -1;
    let runLength = 1;
    for (let start = 0; start < groups.length; ) {
      let end = start;
      while (end < groups.length && groups[end] === 0) end += 1;
      if (end - start > runLength) [runStart, runLength] = [start, end - start];
      start = Math.max(end, start + 1);
    }
    const hex = groups.map((group) => group.toString(16));
    if (runStart < 0) return hex.join(":");
    return `${hex.slice(0, runStart).join(":")}::${hex.slice(runStart + runLength).join(":")}`;
  }
}
