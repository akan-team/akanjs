import { describe, expect, test } from "bun:test";
import { LocalePath } from "./localePath";

const always = { defaultLocale: "en", locales: ["en", "ko"], localePrefix: "always" as const };
const asNeeded = { ...always, localePrefix: "as-needed" as const };

describe("LocalePath", () => {
  test("omits only the default locale's segment, and only under as-needed", () => {
    expect(LocalePath.omits("en", asNeeded)).toBe(true);
    expect(LocalePath.omits("ko", asNeeded)).toBe(false);
    expect(LocalePath.omits("en", always)).toBe(false);
    expect(LocalePath.omits("en", { defaultLocale: "en" })).toBe(false);
  });

  test("splits a prefixed pathname alike in both modes", () => {
    for (const i18n of [always, asNeeded]) {
      expect(LocalePath.split("/ko/pokemon/deoxys", i18n)).toEqual({
        locale: "ko",
        path: "/pokemon/deoxys",
        isPrefixed: true,
      });
      expect(LocalePath.split("/en", i18n)).toEqual({ locale: "en", path: "/", isPrefixed: true });
    }
  });

  test("reads an unprefixed pathname as the default locale under as-needed and as no locale under always", () => {
    expect(LocalePath.split("/pokemon/deoxys", asNeeded)).toEqual({
      locale: "en",
      path: "/pokemon/deoxys",
      isPrefixed: false,
    });
    expect(LocalePath.split("/pokemon/deoxys", always)).toEqual({
      locale: null,
      path: "/pokemon/deoxys",
      isPrefixed: false,
    });
    expect(LocalePath.split("/kotlin", asNeeded).locale).toBe("en");
  });

  test("joins a path onto the URL its locale has", () => {
    expect(LocalePath.join("en", "/pokemon/deoxys", asNeeded)).toBe("/pokemon/deoxys");
    expect(LocalePath.join("en", "/", asNeeded)).toBe("/");
    expect(LocalePath.join("ko", "/", asNeeded)).toBe("/ko");
    expect(LocalePath.join("ko", "/pokemon", asNeeded)).toBe("/ko/pokemon");
    expect(LocalePath.join("en", "/pokemon", always)).toBe("/en/pokemon");
    expect(LocalePath.join("en", "/", always)).toBe("/en");
  });
});
