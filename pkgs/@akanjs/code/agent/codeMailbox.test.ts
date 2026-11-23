import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { CodeMailbox } from "./CodeMailbox";

const boxes: CodeMailbox[] = [];
const open = (dir: string, id: string, name: string, onMail: (mail: { text: string }) => void = () => undefined) => {
  const box = new CodeMailbox(dir, id, name);
  box.open("/repo", onMail);
  boxes.push(box);
  return box;
};

afterEach(() => {
  for (const box of boxes.splice(0)) box.close();
});

describe("CodeMailbox", () => {
  test("each session sees the others and not itself", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "akan-mail-"));
    const one = open(dir, "aaaa1111", "gateway-work");
    const two = open(dir, "bbbb2222", "store-work");
    expect(one.peers().map((peer) => peer.name)).toEqual(["store-work"]);
    expect(two.peers().map((peer) => peer.name)).toEqual(["gateway-work"]);
  });

  test("a message lands in the other session's inbox and is delivered once", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "akan-mail-"));
    const got: string[] = [];
    const one = open(dir, "aaaa1111", "gateway-work");
    open(dir, "bbbb2222", "store-work", (mail) => got.push(mail.text));
    one.send("bbbb2222", "the adapter moved to srvkit");
    await Bun.sleep(CodeMailbox.pollMs + 400);
    expect(got).toEqual(["the adapter moved to srvkit"]);
    await Bun.sleep(CodeMailbox.pollMs + 200);
    expect(got).toEqual(["the adapter moved to srvkit"]);
  });

  test("a session opening on a full inbox does not replay it", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "akan-mail-"));
    open(dir, "cccc3333", "seeded").close();
    const inbox = path.join(dir, "inbox", "cccc3333.jsonl");
    writeFileSync(inbox, `${JSON.stringify({ from: "x", fromName: "x", text: "old" })}\n`);
    const got: string[] = [];
    open(dir, "cccc3333", "seeded", (mail) => got.push(mail.text));
    await Bun.sleep(CodeMailbox.pollMs + 400);
    expect(got).toEqual([]);
  });

  test("a session that stopped beating is not offered as somewhere to send", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "akan-mail-"));
    const one = open(dir, "aaaa1111", "alive");
    const stale = { id: "dddd4444", name: "crashed", cwd: "/repo", pid: 1, at: Date.now() - CodeMailbox.staleMs * 2 };
    writeFileSync(path.join(dir, "live", "dddd4444.json"), JSON.stringify(stale));
    expect(one.peers()).toEqual([]);
    expect(one.find("crashed")).toBeUndefined();
  });

  test("a name or the front of an id finds one peer, and an ambiguous one finds none", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "akan-mail-"));
    const one = open(dir, "aaaa1111", "alive");
    open(dir, "bbbb2222", "store-work");
    open(dir, "bbbb3333", "store-other");
    expect(one.find("store-work")?.id).toBe("bbbb2222");
    expect(one.find("bbbb2")?.id).toBe("bbbb2222");
    expect(one.find("store")).toBeUndefined();
  });

  test("a runaway exchange is stopped by the ceiling rather than by the disk", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "akan-mail-"));
    const one = open(dir, "aaaa1111", "alive");
    for (let at = 0; at < CodeMailbox.sendsPerMinute; at += 1) one.send("bbbb2222", "ping");
    expect(() => one.send("bbbb2222", "ping")).toThrow("a minute is the ceiling");
  });
});
