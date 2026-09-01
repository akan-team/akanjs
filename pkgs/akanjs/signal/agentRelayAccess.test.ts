import { afterEach, describe, expect, test } from "bun:test";
import type { Guard, GuardScope, SignalContext } from "akanjs/signal";
import { AgentRelayAccess } from "./guards";

const contextWith = (account: unknown) => ({ get: () => account }) as unknown as SignalContext;

class SignedIn implements Guard {
  static name = "SignedIn";
  static scope: GuardScope = "account";
  canPass(context: SignalContext): boolean {
    return context.get("account") !== null;
  }
}

class Named implements Guard {
  static name = "Named";
  static scope: GuardScope = "account";
  canPass(context: SignalContext): boolean {
    return !!context.get<{ name?: string }>("account")?.name;
  }
}

class Owns implements Guard {
  static name = "Owns";
  static scope: GuardScope = "resource";
  canPass(): boolean {
    return true;
  }
}

class Boom implements Guard {
  static name = "Boom";
  static scope: GuardScope = "account";
  canPass(): boolean {
    throw new Error("boom");
  }
}

afterEach(() => {
  AgentRelayAccess.use(null);
});

describe("AgentRelayAccess", () => {
  test("refuses every caller until a guard is registered", async () => {
    expect(await new AgentRelayAccess().canPass(contextWith(null))).toBe(false);
    expect(await new AgentRelayAccess().canPass(contextWith({ id: "u1" }))).toBe(false);
  });

  test("delegates to the registered guard", async () => {
    AgentRelayAccess.use(SignedIn);
    expect(await new AgentRelayAccess().canPass(contextWith(null))).toBe(false);
    expect(await new AgentRelayAccess().canPass(contextWith({ id: "u1" }))).toBe(true);
  });

  test("ands several guards", async () => {
    AgentRelayAccess.use([SignedIn, Named]);
    expect(await new AgentRelayAccess().canPass(contextWith({ id: "u1" }))).toBe(false);
    expect(await new AgentRelayAccess().canPass(contextWith({ id: "u1", name: "Ada" }))).toBe(true);
  });

  test("null clears what a library registered", async () => {
    AgentRelayAccess.use(SignedIn);
    AgentRelayAccess.use(null);
    expect(AgentRelayAccess.hasPolicy).toBe(false);
    expect(await new AgentRelayAccess().canPass(contextWith({ id: "u1" }))).toBe(false);
  });

  test("a guard that throws fails closed", async () => {
    AgentRelayAccess.use(Boom);
    expect(await new AgentRelayAccess().canPass(contextWith({ id: "u1" }))).toBe(false);
  });

  test("reports the scope its delegates need", () => {
    expect(AgentRelayAccess.scope).toBe("account");
    AgentRelayAccess.use(SignedIn);
    expect(AgentRelayAccess.scope).toBe("account");
    AgentRelayAccess.use([SignedIn, Owns]);
    expect(AgentRelayAccess.scope).toBe("resource");
  });
});
