import { describe, expect, test } from "bun:test";
import { AkanError } from "akanjs/base";
import { InvalidInputError } from "akanjs/constant";
import { FilterQueryError, NoDocumentError } from "akanjs/document";
import { Exception, isExceptionLike } from "./exception";

describe("Exception", () => {
  test("takes the code of its status and keeps its wire shape", () => {
    const error = new Exception(429, "base.error.tooManyRequests", undefined, { seconds: 3 });

    expect(error.code).toBe("tooManyRequests");
    expect(Exception.is(error, "tooManyRequests")).toBe(true);
    expect(AkanError.is(error)).toBe(true);
    expect(error.toJSON()).toEqual({ error: "base.error.tooManyRequests", statusCode: 429, data: { seconds: 3 } });
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
