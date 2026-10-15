import { describe, expect, test } from "bun:test";
import { matchesAccept } from "./matchesAccept";

const png = { name: "Photo.PNG", type: "image/png" };
const csv = { name: "report.csv", type: "text/csv" };
const unknownType = { name: "clip", type: "" };

describe("matchesAccept", () => {
  test("accepts everything when there is no accept list", () => {
    expect(matchesAccept(unknownType)).toBe(true);
    expect(matchesAccept(png, " ")).toBe(true);
  });

  test("matches exact MIME types, wildcards and extensions without regard to case", () => {
    expect(matchesAccept(png, "image/jpeg, image/png")).toBe(true);
    expect(matchesAccept(png, "IMAGE/*")).toBe(true);
    expect(matchesAccept(png, ".png")).toBe(true);
    expect(matchesAccept(csv, ".csv,text/csv")).toBe(true);
    expect(matchesAccept(png, "*/*")).toBe(true);
  });

  test("refuses a file outside the list, including one whose type the browser could not tell", () => {
    expect(matchesAccept(png, "video/*")).toBe(false);
    expect(matchesAccept(csv, "image/jpeg, image/png")).toBe(false);
    expect(matchesAccept(unknownType, "image/jpeg, image/png")).toBe(false);
    expect(matchesAccept({ name: "a.png.exe", type: "application/x-msdownload" }, ".png")).toBe(false);
  });
});
