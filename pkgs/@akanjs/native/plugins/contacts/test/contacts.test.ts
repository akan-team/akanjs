import { afterEach, describe, expect, test } from "bun:test";
import { pluginDecls } from "../../../packages/cli/src/lib/native-plugins.ts";
import { AkanNativeError, isAkanNativeError } from "../../../packages/core/src/index.ts";
import { installMockHost, type MockHost } from "../../../packages/core/src/testing.ts";
import manifest from "../native-plugin.json";
import { type Contact, contacts } from "../src/index.ts";

let host: MockHost | null = null;
afterEach(() => {
  host?.uninstall();
  host = null;
});

const rejection = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: unknown) => e,
  );

describe("contacts", () => {
  test("native hosts: permission states, the projection, and the contact shape", async () => {
    const book: Contact[] = [
      { id: "1", name: "Ada Lovelace", phones: [{ number: "010-1234-5678", label: "mobile" }] },
      { id: "2", name: null, phones: [] },
    ];
    const asked: unknown[] = [];
    host = installMockHost({
      platform: "android",
      plugins: {
        contacts: {
          methods: {
            checkPermission: () => ({ contacts: "prompt-with-rationale" }),
            requestPermission: () => ({ contacts: "granted" }),
            getContacts: (args) => {
              asked.push(args);
              return { contacts: book };
            },
          },
        },
      },
    });
    expect(await contacts.checkPermission()).toEqual({ contacts: "prompt-with-rationale" });
    expect(await contacts.requestPermission()).toEqual({ contacts: "granted" });
    expect(await contacts.getContacts({ projection: { name: false, phones: true } })).toEqual({ contacts: book });
    expect(asked).toEqual([{ projection: { name: false, phones: true } }]);
  });

  test("a denied address book keeps its code", async () => {
    host = installMockHost({
      platform: "ios",
      plugins: {
        contacts: {
          methods: {
            getContacts: () => {
              throw new AkanNativeError("PERMISSION_DENIED", "contacts access was denied");
            },
          },
        },
      },
    });
    expect(isAkanNativeError(await rejection(contacts.getContacts()), "PERMISSION_DENIED")).toBe(true);
  });

  test("web and macOS reject UNSUPPORTED", async () => {
    for (const platform of ["web", "macos"] as const) {
      host = installMockHost({ platform, plugins: {} });
      expect(contacts.isSupported("getContacts")).toBe(false);
      expect(isAkanNativeError(await rejection(contacts.checkPermission()), "UNSUPPORTED")).toBe(true);
      expect(isAkanNativeError(await rejection(contacts.getContacts()), "UNSUPPORTED")).toBe(true);
      host.uninstall();
      host = null;
    }
  });

  test("manifest: iOS and Android only, reading with NSContactsUsageDescription and READ_CONTACTS", () => {
    const plugin = { spec: "contacts", dir: `${import.meta.dir}/..`, manifest: manifest as never };
    expect(pluginDecls([plugin], "macos")).toEqual({});
    for (const platform of ["ios", "android"] as const) {
      expect(pluginDecls([plugin], platform)).toEqual({
        contacts: { methods: ["checkPermission", "requestPermission", "getContacts"], events: [] },
      });
    }
    expect(manifest.ios.infoPlist.NSContactsUsageDescription).toBeTruthy();
    expect(manifest.android.permissions).toEqual(["android.permission.READ_CONTACTS"]);
  });
});
