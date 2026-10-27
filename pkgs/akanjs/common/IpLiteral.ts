export class IpLiteral {
  // A dual-stack listener reports an IPv4 client as `::ffff:a.b.c.d`, which no `udp4` socket accepts.
  static normalize(address: string): string {
    const trimmed = address.trim();
    const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(trimmed);
    return mapped?.[1] ?? trimmed;
  }

  //? A proxy may record a hop as `a.b.c.d:port` or `[v6]:port`; anything else that is not an address is `null`.
  static parse(entry: string): string | null {
    const trimmed = entry.trim();
    const bracketed = /^\[([^\]]*:[^\]]*)\](?::\d{1,5})?$/.exec(trimmed);
    const v4WithPort = /^(\d{1,3}(?:\.\d{1,3}){3}):\d{1,5}$/.exec(trimmed);
    const [address = "", zone, ...rest] = (bracketed?.[1] ?? v4WithPort?.[1] ?? trimmed).split("%");
    if (rest.length) return null;
    if (zone !== undefined && !(address.includes(":") && /^[A-Za-z0-9_.-]{1,64}$/.test(zone))) return null;
    const bytes = IpLiteral.bytes(IpLiteral.normalize(address));
    //? Zone dropped (it names the recorder's interface) and spelled one way, so one caller is one rate-limit key.
    return bytes ? IpLiteral.#format(bytes) : null;
  }

  static bytes(address: string): Uint8Array | null {
    if (address.includes(".") && !address.includes(":")) {
      const parts = address.split(".");
      if (parts.length !== 4) return null;
      const bytes = new Uint8Array(4);
      for (const [idx, part] of parts.entries()) {
        const value = Number(part);
        // A leading zero reads as octal to some parsers, so `010.0.0.1` would name two different hosts.
        if (!/^(?:0|[1-9]\d{0,2})$/.test(part) || value > 255) return null;
        bytes[idx] = value;
      }
      return bytes;
    }
    return address.includes(":") ? IpLiteral.#ipv6Bytes(address) : null;
  }

  static #ipv6Bytes(address: string): Uint8Array | null {
    // A zone index (`fe80::1%eth0`) is not part of the address; `normalize` already unwrapped IPv4-mapped.
    const bare = address.split("%")[0] ?? "";
    const halves = bare.split("::");
    if (halves.length > 2) return null;
    const groupsOf = (text: string) => (text ? text.split(":").filter((group) => group !== "") : []);
    const head = groupsOf(halves[0] ?? "");
    const tail = halves.length === 2 ? groupsOf(halves[1] ?? "") : [];
    const filled = halves.length === 2 ? 8 - head.length - tail.length : 0;
    if (filled < 0 || head.length + tail.length + filled !== 8) return null;
    const groups = [...head, ...new Array(filled).fill("0"), ...tail];
    const bytes = new Uint8Array(16);
    for (const [idx, group] of groups.entries()) {
      if (!/^[0-9a-f]{1,4}$/i.test(group)) return null;
      const value = Number.parseInt(group, 16);
      bytes[idx * 2] = value >> 8;
      bytes[idx * 2 + 1] = value & 0xff;
    }
    return bytes;
  }

  // RFC 5952 text, an IPv4-mapped address as plain IPv4 the way `normalize` reads it.
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
