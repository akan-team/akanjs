import { describe, expect, test } from "bun:test";

import { RemoteVault } from "./remoteVault";

describe("RemoteVault", () => {
  const vault = new RemoteVault("signing-secret");
  const owner = ["user-1", "https://apps.example.com/mcp", "access"] as const;

  test("opens what it sealed for the same place", () => {
    const sealed = vault.seal("token-1", owner);
    expect(sealed).not.toContain("token-1");
    expect(vault.open(sealed, owner)).toBe("token-1");
    expect(vault.seal("", owner)).toBe("");
    expect(vault.open("", owner)).toBe("");
  });

  test("opens nothing sealed for another account, address or field", () => {
    const sealed = vault.seal("token-1", owner);
    expect(vault.open(sealed, ["user-2", "https://apps.example.com/mcp", "access"])).toBe("");
    expect(vault.open(sealed, ["user-1", "https://other.example.com/mcp", "access"])).toBe("");
    expect(vault.open(sealed, ["user-1", "https://apps.example.com/mcp", "refresh"])).toBe("");
    expect(vault.open(sealed, ["user-1 https://apps.example.com/mcp", "access"])).toBe("");
  });

  test("opens nothing with a shortened tag, an altered body or another secret", () => {
    const [iv, tag, body] = vault.seal("token-1", owner).split(".");
    const short = Buffer.from(tag ?? "", "base64url")
      .subarray(0, 4)
      .toString("base64url");
    expect(vault.open([iv, short, body].join("."), owner)).toBe("");
    expect(vault.open([iv, tag, `${body}A`].join("."), owner)).toBe("");
    expect(new RemoteVault("rotated-secret").open([iv, tag, body].join("."), owner)).toBe("");
  });
});
