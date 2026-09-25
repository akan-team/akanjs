import { describe, expect, test } from "bun:test";
import { AKAN_OPTIONAL_BACKEND_EXTERNALS } from "./applicationBuildRunner";

describe("ApplicationBuildRunner", () => {
  test("externalizes Akan optional backend dependencies", () => {
    expect(AKAN_OPTIONAL_BACKEND_EXTERNALS).toEqual(
      expect.arrayContaining(["@libsql/client", "bullmq", "croner", "ioredis", "postgres", "protobufjs"]),
    );
  });
});
