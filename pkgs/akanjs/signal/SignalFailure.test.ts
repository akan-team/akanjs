import { afterEach, describe, expect, test } from "bun:test";
import { AkanError } from "akanjs/base";
import { DocumentStoreError, InjectError, InsightQueryError } from "akanjs/service";
import { isExceptionLike } from "./exception";
import { PromptError } from "./mcp/promptError";
import { SignalFailure } from "./SignalFailure";
import { SignalContractError } from "./signalContractError";
import { SignalDeclarationError } from "./signalDeclarationError";

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

const withEnvAsync = async (values: Record<string, string | undefined>, run: () => Promise<void>) => {
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  SignalFailure.reset();
  try {
    await run();
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
      expect("code" in body).toBe(false);
    });
  });

  test("keeps an AkanError's code and status, and still not its message, in a production build", () => {
    withEnv({ NODE_ENV: "production", AKAN_COMMAND_TYPE: undefined, AKAN_ERROR_DETAIL: undefined }, () => {
      const body = SignalFailure.body(new AkanError("queueFull", "queue jobs:tenant-7 is full", { statusCode: 503 }));
      expect(body).toMatchObject({ error: "Service Unavailable", code: "queueFull", statusCode: 503 });
      expect(JSON.stringify(body)).not.toContain("tenant-7");
      expect("stack" in body).toBe(false);
    });
  });

  test("keeps an AkanError's message beside its code outside a production build", () => {
    withEnv({ NODE_ENV: "development", AKAN_COMMAND_TYPE: undefined, AKAN_ERROR_DETAIL: undefined }, () => {
      const body = SignalFailure.body(new AkanError("queueFull", "queue jobs:tenant-7 is full", { statusCode: 503 }));
      expect(body).toMatchObject({ error: "queue jobs:tenant-7 is full", code: "queueFull", statusCode: 503 });
    });
  });

  test("answers 500 for an AkanError whose status is no error status, and keeps its code", () => {
    withEnv({ NODE_ENV: "production", AKAN_COMMAND_TYPE: undefined, AKAN_ERROR_DETAIL: undefined }, () => {
      expect(SignalFailure.generalized(new AkanError("drained", "drained", { statusCode: 204 }))).toEqual({
        error: "Internal Server Error",
        statusCode: 500,
        code: "drained",
      });
    });
  });

  test("keeps the redaction for an AkanError from another copy of the module", async () => {
    const copyPath = "../base/akanError.ts?signal-copy";
    const copy = (await import(copyPath)) as { AkanError: typeof AkanError };
    const foreign = new copy.AkanError("queueFull", "queue jobs:tenant-7 is full", { statusCode: 503 });
    withEnv({ NODE_ENV: "production", AKAN_COMMAND_TYPE: undefined, AKAN_ERROR_DETAIL: undefined }, () => {
      expect(isExceptionLike(foreign)).toBe(false);
      expect(SignalFailure.body(foreign)).toMatchObject({ error: "Service Unavailable", code: "queueFull" });
    });
  });

  test("responds with the AkanError's status", async () => {
    const response = SignalFailure.response(new AkanError("queueFull", "full", { statusCode: 503 }), { path: "/x" });
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: "queueFull", statusCode: 503, path: "/x" });
    expect(SignalFailure.response(new Error("boom")).status).toBe(500);
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

  test("sends Retry-After for a 429 whose body leaves its data out", async () => {
    const refused = new AkanError("busy", "tenant-7 is over its budget", { statusCode: 429, data: { seconds: 2.2 } });
    await withEnvAsync(
      { NODE_ENV: "production", AKAN_COMMAND_TYPE: undefined, AKAN_ERROR_DETAIL: undefined },
      async () => {
        const response = SignalFailure.response(refused);
        expect(response.status).toBe(429);
        expect(response.headers.get("retry-after")).toBe("3");
        expect(JSON.stringify(await response.json())).not.toContain("tenant-7");
      },
    );
    expect(SignalFailure.response(new AkanError("busy", "busy", { statusCode: 429 })).headers.get("retry-after")).toBe(
      null,
    );
    expect(
      SignalFailure.response(new AkanError("down", "down", { statusCode: 503, data: { seconds: 5 } })).headers.get(
        "retry-after",
      ),
    ).toBe(null);
    for (const seconds of [Number.NaN, Number.POSITIVE_INFINITY])
      expect(
        SignalFailure.headersOf(new AkanError("busy", "busy", { statusCode: 429, data: { seconds } }), 429),
      ).toEqual({ "Content-Type": "application/json" });
  });

  test("answers every code of each signal and service family with its own status, and never its message", () => {
    const secret = 'table "billing" at https://bucket/x?sig=token';
    const families: [(code: string) => Error, Record<string, number>][] = [
      [
        (code) => new SignalDeclarationError(code as never, secret),
        {
          handlerAlreadySet: 500,
          nullableLastArg: 500,
          liveAlreadySet: 500,
          invalidArgType: 500,
          invalidErrors: 500,
          baseMismatch: 500,
          missingModel: 500,
          missingSlice: 500,
        },
      ],
      [
        (code) => new SignalContractError(code as never, secret),
        { undefinedReturn: 500, bytesThroughAny: 500, wrongTransport: 500, notRegistered: 500, noHandler: 500 },
      ],
      [
        (code) => new PromptError(code as never, secret),
        { invalidPrompt: 500, unmaskedResource: 500, inlineFailed: 502 },
      ],
      [
        (code) => new InjectError(code as never, secret),
        { notRegistered: 500, notInitialized: 500, invalidInject: 500 },
      ],
      [
        (code) => new DocumentStoreError(code as never, secret),
        {
          invalidQuery: 500,
          invalidSchema: 500,
          invalidDocument: 500,
          unstorableValue: 400,
          tableMissing: 500,
          searchUnavailable: 500,
          searchMisconfigured: 500,
        },
      ],
      [(code) => new InsightQueryError(code as never, secret), { insightUnavailable: 500 }],
    ];
    withEnv({ NODE_ENV: "production", AKAN_COMMAND_TYPE: undefined, AKAN_ERROR_DETAIL: undefined }, () => {
      for (const [make, statuses] of families)
        for (const [code, statusCode] of Object.entries(statuses)) {
          const error = make(code);
          expect(isExceptionLike(error)).toBe(false);
          const body = SignalFailure.body(error);
          expect(body).toMatchObject({ error: AkanError.reasonOf(statusCode), code, statusCode });
          expect(JSON.stringify(body)).not.toContain("billing");
        }
    });
  });

  test("forwards an insight query's refusal to its author, and not an unavailable connection", () => {
    const refused = new InsightQueryError("invalidInsightQuery", "An insight query is one statement. Remove the `;`.");
    expect(isExceptionLike(refused)).toBe(true);
    expect(refused.toJSON()).toEqual({ error: refused.message, code: "invalidInsightQuery", statusCode: 400 });
    const timedOut = new InsightQueryError("insightTimeout", "Insight query exceeded 10ms.");
    expect(isExceptionLike(timedOut)).toBe(true);
    expect(timedOut.toJSON()).toEqual({ error: timedOut.message, code: "insightTimeout", statusCode: 504 });
    expect(isExceptionLike(new InsightQueryError("insightUnavailable", "no insight connection"))).toBe(false);
  });

  test("a thrown non-Error carries no stack field either way", () => {
    withEnv({ NODE_ENV: "development", AKAN_COMMAND_TYPE: undefined, AKAN_ERROR_DETAIL: undefined }, () => {
      const body = SignalFailure.body("just a string");
      expect(body.error).toBe("just a string");
      expect("stack" in body).toBe(false);
    });
  });
});
