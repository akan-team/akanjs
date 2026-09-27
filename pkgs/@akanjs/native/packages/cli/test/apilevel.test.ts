import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { allowedLevel, checkApiLevels, formatApiProblems, loadApiVersions, readClass } from "../src/lib/apilevel.ts";
import { fileEntry, writeZip } from "../src/lib/apk.ts";

// A small api-versions.xml in the SDK's layout (one element per line, tab indented).
const XML = `<?xml version="1.0" encoding="utf-8"?>
<api version="4">
\t<class name="java/lang/Object" since="1">
\t\t<method name="&lt;init>()V"/>
\t</class>
\t<class name="android/app/Activity" since="1">
\t\t<extends name="java/lang/Object"/>
\t\t<method name="getDisplay()Landroid/view/Display;" since="30"/>
\t\t<method name="getWindow()Landroid/view/Window;"/>
\t\t<method name="getOnBackInvokedDispatcher()Landroid/window/OnBackInvokedDispatcher;" since="33"/>
\t</class>
\t<class name="android/window/OnBackInvokedCallback" since="33">
\t</class>
\t<class name="android/view/WindowInsets$Type" since="30">
\t\t<method name="ime()I"/>
\t</class>
\t<class name="android/os/Build$VERSION" since="1">
\t\t<field name="SDK_INT" since="4"/>
\t</class>
</api>
`;

/** A class file with just a constant pool, this class, a superclass and interfaces. */
function classFile(
  name: string,
  superName: string,
  opts: {
    interfaces?: string[];
    classes?: string[];
    methods?: [string, string, string][];
    fields?: [string, string, string][];
    lambdas?: string[];
  } = {},
): Uint8Array {
  const pool: number[][] = [];
  const utf8Index = new Map<string, number>();
  const add = (entry: number[]) => (pool.push(entry), pool.length);
  const utf8 = (s: string) => {
    const known = utf8Index.get(s);
    if (known) return known;
    const bytes = [...new TextEncoder().encode(s)];
    const i = add([1, bytes.length >> 8, bytes.length & 255, ...bytes]);
    utf8Index.set(s, i);
    return i;
  };
  const u2 = (n: number) => [n >> 8, n & 255];
  const cls = (s: string) => add([7, ...u2(utf8(s))]);
  const nat = (n: string, d: string) => add([12, ...u2(utf8(n)), ...u2(utf8(d))]);
  const thisIndex = cls(name);
  const superIndex = cls(superName);
  const interfaceIndexes = (opts.interfaces ?? []).map(cls);
  for (const c of opts.classes ?? []) cls(c);
  for (const [owner, n, d] of opts.methods ?? []) add([10, ...u2(cls(owner)), ...u2(nat(n, d))]);
  for (const [owner, n, d] of opts.fields ?? []) add([9, ...u2(cls(owner)), ...u2(nat(n, d))]);
  for (const type of opts.lambdas ?? []) add([18, 0, 0, ...u2(nat("run", `()L${type};`))]);
  const bytes = [0xca, 0xfe, 0xba, 0xbe, 0, 0, 0, 61, ...u2(pool.length + 1), ...pool.flat()];
  bytes.push(
    0,
    0x21,
    ...u2(thisIndex),
    ...u2(superIndex),
    ...u2(interfaceIndexes.length),
    ...interfaceIndexes.flatMap(u2),
    0,
    0,
    0,
    0,
    0,
    0,
  );
  return new Uint8Array(bytes);
}

const jar = (classes: Uint8Array[]) => writeZip(classes.map((c, i) => fileEntry(`c${i}.class`, c, false)));

const dir = mkdtempSync(join(tmpdir(), "akan-native-apilevel-"));
writeFileSync(join(dir, "api-versions.xml"), XML);
const api = loadApiVersions(join(dir, "api-versions.xml"));

describe("Android API level check", () => {
  test("reads the constant pool: classes, members, supertypes, lambda types", () => {
    const info = readClass(
      classFile("a/B", "android/app/Activity", {
        interfaces: ["a/I"],
        methods: [["android/app/Activity", "getDisplay", "()Landroid/view/Display;"]],
        lambdas: ["android/window/OnBackInvokedCallback"],
      }),
    );
    expect(info.name).toBe("a/B");
    expect(info.superName).toBe("android/app/Activity");
    expect(info.interfaces).toEqual(["a/I"]);
    expect(info.members).toContainEqual({
      owner: "android/app/Activity",
      name: "getDisplay",
      descriptor: "()Landroid/view/Display;",
      field: false,
    });
    expect(info.lambdaTypes).toEqual(["android/window/OnBackInvokedCallback"]);
  });

  test("allowed level: minSdk, a plugin package's level, or N for an ApiN class (and what nests in it)", () => {
    expect(allowedLevel("com/akanjs/runtime/AkanNativeActivity", 29)).toBe(29);
    expect(allowedLevel("com/akanjs/runtime/AkanNativeActivity$Api30", 29)).toBe(30);
    expect(allowedLevel("com/akanjs/runtime/AkanNativeCompat$Api33$display$1", 29)).toBe(33);
    expect(allowedLevel("com/akanjs/plugins/haptics/HapticsApi31", 29)).toBe(31);
    expect(allowedLevel("com/akanjs/plugins/sqlite/SqlitePlugin", 29, [["com/akanjs/plugins/sqlite/", 35]])).toBe(35);
    expect(allowedLevel("com/akanjs/plugins/sqliteother/X", 29, [["com/akanjs/plugins/sqlite/", 35]])).toBe(29);
  });

  test("a call above minSdk outside an ApiN class is a problem, inside one it is not", () => {
    const call: [string, string, string] = ["android/app/Activity", "getDisplay", "()Landroid/view/Display;"];
    const problems = checkApiLevels(
      jar([
        classFile("a/Main", "java/lang/Object", { methods: [call] }),
        classFile("a/Main$Api30", "java/lang/Object", { methods: [call] }),
      ]),
      api,
      29,
    );
    expect(problems).toEqual([
      {
        className: "a/Main",
        what: "method android/app/Activity.getDisplay()Landroid/view/Display;",
        since: 30,
        allowed: 29,
      },
    ]);
    expect(formatApiProblems(problems, 29)).toContain(
      "a.Main: method android/app/Activity.getDisplay()Landroid/view/Display; needs API 30",
    );
  });

  test("members are looked up through the app's own supertypes (kotlinc names the receiver's type)", () => {
    const activity = classFile("a/MyActivity", "android/app/Activity");
    const caller = classFile("a/Caller", "java/lang/Object", {
      methods: [
        ["a/MyActivity", "getOnBackInvokedDispatcher", "()Landroid/window/OnBackInvokedDispatcher;"],
        ["a/MyActivity", "getWindow", "()Landroid/view/Window;"],
      ],
    });
    const problems = checkApiLevels(jar([activity, caller]), api, 29);
    expect(problems.map((p) => [p.className, p.since])).toEqual([["a/Caller", 33]]);
  });

  test("classes, supertypes and lambda interfaces count too; fields up to minSdk do not", () => {
    const problems = checkApiLevels(
      jar([
        classFile("a/Back", "java/lang/Object", { interfaces: ["android/window/OnBackInvokedCallback"] }),
        classFile("a/Insets", "java/lang/Object", {
          classes: ["android/view/WindowInsets$Type"],
          fields: [["android/os/Build$VERSION", "SDK_INT", "I"]],
        }),
        classFile("a/Lambda", "java/lang/Object", { lambdas: ["android/window/OnBackInvokedCallback"] }),
      ]),
      api,
      29,
    );
    expect(problems.map((p) => p.what)).toEqual([
      "supertype android/window/OnBackInvokedCallback",
      "class android/view/WindowInsets$Type",
      "lambda type android/window/OnBackInvokedCallback",
    ]);
  });

  test("the SDK's own api-versions.xml loads when it is installed", () => {
    const sdk = join(
      process.env.ANDROID_HOME ?? join(process.env.HOME ?? "", "Library/Android/sdk"),
      "platforms/android-36/data/api-versions.xml",
    );
    if (!Bun.file(sdk).size) return;
    const real = loadApiVersions(sdk);
    expect(real.get("android/content/Context")?.members.get("getDisplay()Landroid/view/Display;")).toBe(30);
    expect(real.get("android/view/WindowInsets$Type")?.since).toBe(30);
    // a mainline module class (module="…" before since="…") and a constructor (&lt;init>)
    expect(real.get("android/adservices/AdServicesState")?.since).toBe(34);
    expect(
      real.get("android/app/Notification$Builder")?.members.get("<init>(Landroid/content/Context;Ljava/lang/String;)V"),
    ).toBe(26);
  });
});
