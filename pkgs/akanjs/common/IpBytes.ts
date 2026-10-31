export class IpBytes {
  // A dual-stack listener reports an IPv4 client as `::ffff:a.b.c.d`, which no `udp4` socket accepts.
  static normalize(address: string): string {
    const trimmed = address.trim();
    const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(trimmed);
    return mapped?.[1] ?? trimmed;
  }

  static of(address: string): Uint8Array | null {
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
    return address.includes(":") ? IpBytes.#ipv6(address) : null;
  }

  static #ipv6(address: string): Uint8Array | null {
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
}
