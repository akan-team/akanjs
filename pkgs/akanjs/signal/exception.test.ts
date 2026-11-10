import { describe, expect, test } from "bun:test";
import { AkanError } from "akanjs/base";
import { isGuardRefusal } from "akanjs/common";
import { InvalidInputError } from "akanjs/constant";
import { FilterQueryError, NoDocumentError } from "akanjs/document";
import { restoreRemoteError } from "../fetch/client/remoteError";
import { Exception, isExceptionLike } from "./exception";

describe("Exception", () => {
  test("takes the code of its status and keeps its wire shape", () => {
    const error = new Exception(429, "base.error.tooManyRequests", undefined, { seconds: 3 });

    expect(error.code).toBe("tooManyRequests");
    expect(Exception.is(error, "tooManyRequests")).toBe(true);
    expect(AkanError.is(error)).toBe(true);
    expect(error.toJSON()).toEqual({ error: "base.error.tooManyRequests", statusCode: 429, data: { seconds: 3 } });
  });

  test("narrows through each status class's own `is`", () => {
    const error: unknown = new Exception.BadRequest("item.error.invalid");

    if (!Exception.BadRequest.is(error, "badRequest")) throw new Error("expected a BadRequestException");
    const narrowed: Exception = error;
    expect([narrowed.statusCode, narrowed.code]).toEqual([400, "badRequest"]);
    expect(Exception.NotFound.is(error)).toBe(false);
    expect(Exception.is(error)).toBe(true);
  });

  test("keeps each status class's name and default message", () => {
    const error = new Exception.NotFound();

    expect([error.name, error.message, error.code, error.statusCode]).toEqual([
      "NotFoundException",
      "Not Found",
      "notFound",
      404,
    ]);
  });
});

describe("isExceptionLike", () => {
  test("forwards an Exception and a missing document, and no other AkanError", () => {
    expect(isExceptionLike(new Exception.Conflict("item.error.locked"))).toBe(true);
    expect(isExceptionLike(new NoDocumentError("No Document (item): 507f1f77bcf86cd799439011"))).toBe(true);
    expect(isExceptionLike(new AkanError("queueFull", "queue jobs:tenant-7 is full", { statusCode: 503 }))).toBe(false);
    expect(isExceptionLike(new InvalidInputError("data.price", "Int"))).toBe(false);
    expect(isExceptionLike(new FilterQueryError("No filter query for key: byOwner"))).toBe(false);
  });

  test("still forwards a restored remote error, which is a plain Error with a status and toJSON", () => {
    const payload = { error: "item.error.locked", statusCode: 409 };
    const restored = Object.assign(new Error(payload.error), { statusCode: 409, toJSON: () => payload });

    expect(isExceptionLike(restored)).toBe(true);
    expect(isExceptionLike(new Error("SQLITE_ERROR: no such column"))).toBe(false);
  });
});

describe("isGuardRefusal", () => {
  test("reads a 401/403 as a guard's refusal unless it is known to be one the server kept", () => {
    expect(isGuardRefusal(new Exception.Forbidden("Access denied"))).toBe(true);
    expect(isGuardRefusal(new Exception.Unauthorized("Sign in"))).toBe(true);
    expect(isGuardRefusal(restoreRemoteError({ error: "Access denied", statusCode: 403 }, 403))).toBe(true);
    expect(isGuardRefusal(Object.assign(new Error("Access denied"), { statusCode: 403 }))).toBe(true);
    expect(isGuardRefusal({ statusCode: 401 })).toBe(true);
    const unreadable = Object.assign(new Error("Access denied"), {
      statusCode: 403,
      toJSON: () => {
        throw new Error("circular");
      },
    });
    expect(isGuardRefusal(unreadable)).toBe(true);

    const kept = new AkanError("fileGrantRefused", "day1 is outside the folder the user granted.", { statusCode: 403 });
    expect(isGuardRefusal(kept)).toBe(false);
    const restored = restoreRemoteError({ error: "Forbidden", code: "fileGrantRefused", statusCode: 403 }, 403);
    expect(isGuardRefusal(restored)).toBe(false);
    expect(isGuardRefusal(new Exception.NotFound("No item"))).toBe(false);
    expect(isGuardRefusal(new Error("broken"))).toBe(false);
    expect(isGuardRefusal(null)).toBe(false);
  });
});
