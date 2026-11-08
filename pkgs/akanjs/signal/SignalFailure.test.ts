import { afterEach, describe, expect, test } from "bun:test";
import { SignalFailure } from "./SignalFailure";

const withEnv = (values: Record<string, string | undefined>, run: () => void) => {
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  SignalFailure.reset();
  try {
    run();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    SignalFailure.reset();
  }
};

describe("SignalFailure", () => {
  afterEach(() => SignalFailure.reset());

  test("says nothing about the failure in a production build", () => {
    withEnv({ NODE_ENV: "production", AKAN_COMMAND_TYPE: undefined, AKAN_ERROR_DETAIL: undefined }, () => {
      const body = SignalFailure.body(new Error("SQLITE_ERROR: no such column: user.secret"), { path: "/x" });
      expect(body.error).toBe("Internal Server Error");
      expect(body.statusCode).toBe(500);
      expect(body.path).toBe("/x");
      expect(typeof body.timestamp).toBe("string");
      expect("stack" in body).toBe(false);
    });
  });

  test("says nothing either for a server started without NODE_ENV, or with one it does not know", () => {
    for (const NODE_ENV of [undefined, "staging"])
      withEnv({ NODE_ENV, AKAN_COMMAND_TYPE: undefined, AKAN_ERROR_DETAIL: undefined }, () => {
        const body = SignalFailure.body(new Error("SQLITE_ERROR: no such column: user.secret"));
        expect(body.error).toBe("Internal Server Error");
        expect("stack" in body).toBe(false);
      });
  });

  test("keeps the message and stack outside a production build", () => {
    withEnv({ NODE_ENV: "development", AKAN_COMMAND_TYPE: undefined, AKAN_ERROR_DETAIL: undefined }, () => {
      const body = SignalFailure.body(new Error("boom")) as { error: string; stack?: string };
      expect(body.error).toBe("boom");
      expect(body.stack).toContain("boom");
    });
  });

  test("keeps them under `akan start`, whatever NODE_ENV says", () => {
    withEnv({ NODE_ENV: "production", AKAN_COMMAND_TYPE: "start", AKAN_ERROR_DETAIL: undefined }, () => {
      expect((SignalFailure.body(new Error("boom")) as { error: string }).error).toBe("boom");
    });
  });

  test("AKAN_ERROR_DETAIL puts the detail back for a deployed build somebody is debugging", () => {
    withEnv({ NODE_ENV: "production", AKAN_COMMAND_TYPE: undefined, AKAN_ERROR_DETAIL: "1" }, () => {
      expect((SignalFailure.body(new Error("boom")) as { error: string }).error).toBe("boom");
    });
  });

  test("a thrown non-Error carries no stack field either way", () => {
    withEnv({ NODE_ENV: "development", AKAN_COMMAND_TYPE: undefined, AKAN_ERROR_DETAIL: undefined }, () => {
      const body = SignalFailure.body("just a string");
      expect(body.error).toBe("just a string");
      expect("stack" in body).toBe(false);
    });
  });
});
