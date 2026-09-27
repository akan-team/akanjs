import { describe, expect, test } from "bun:test";
import { mergeLibraryManifests } from "../src/lib/manifestmerge.ts";
import { parseXml, serializeXml } from "../src/lib/xml.ts";

// akanjs readiness O8: the parts of Gradle's manifest merger the pinned AARs need.

const lib = (application: string, top = "") => `<?xml version="1.0" encoding="utf-8"?>
<!-- a comment -->
<manifest xmlns:android="http://schemas.android.com/apk/res/android" xmlns:tools="http://schemas.android.com/tools" package="com.example.lib">
  <uses-sdk android:minSdkVersion="21" />
  ${top}
  <application>
${application}
  </application>
</manifest>`;

describe("XML", () => {
  test("parses and writes elements and attributes (entities decoded, comments dropped)", () => {
    const root = parseXml(`<?xml version="1.0"?><!-- x --><a b="1 &amp; 2"><c d='x'/><e></e></a>`);
    expect(root).toEqual({
      name: "a",
      attrs: [["b", "1 & 2"]],
      children: [
        { name: "c", attrs: [["d", "x"]], children: [] },
        { name: "e", attrs: [], children: [] },
      ],
    });
    expect(serializeXml(root)).toBe(`<a b="1 &amp; 2">\n    <c d="x" />\n    <e />\n</a>`);
    expect(() => parseXml("<a><b></a>")).toThrow(/does not close/);
  });
});

describe("library manifest merge", () => {
  const discovery = (registrar: string) => `
    <service android:name="com.google.firebase.components.ComponentDiscoveryService" android:exported="false" android:directBootAware="true">
      <meta-data android:name="com.google.firebase.components:${registrar}" android:value="com.google.firebase.components.ComponentRegistrar" />
    </service>`;

  test("one ComponentDiscoveryService with every registrar; placeholders replaced; tools: dropped", () => {
    const merged = mergeLibraryManifests(
      [
        {
          from: "firebase-common",
          xml: lib(
            `${discovery("com.google.firebase.FirebaseCommonKtxRegistrar")}
    <provider android:name="com.google.firebase.provider.FirebaseInitProvider" android:authorities="\${applicationId}.firebaseinitprovider" android:exported="false" android:initOrder="100" tools:targetApi="n" />`,
            `<uses-permission android:name="android.permission.INTERNET" />`,
          ),
        },
        {
          from: "firebase-messaging",
          xml: lib(
            discovery("com.google.firebase.messaging.FirebaseMessagingRegistrar") +
              discovery("com.google.firebase.FirebaseCommonKtxRegistrar"),
            `<uses-permission android:name="android.permission.INTERNET" /><uses-permission android:name="android.permission.WAKE_LOCK" />`,
          ),
        },
      ],
      "com.akanjs.x.debug",
    );
    expect(merged.permissions).toEqual(["android.permission.INTERNET", "android.permission.WAKE_LOCK"]);
    const services = merged.applicationXml.filter((x) => x.includes("ComponentDiscoveryService"));
    expect(services).toHaveLength(1);
    expect(services[0]!.match(/<meta-data/g)).toHaveLength(2);
    const provider = merged.applicationXml.find((x) => x.includes("FirebaseInitProvider"))!;
    expect(provider).toContain('android:authorities="com.akanjs.x.debug.firebaseinitprovider"');
    expect(provider).not.toContain("tools:");
    expect(merged.components).toEqual([
      "com.google.firebase.components.ComponentDiscoveryService",
      "com.google.firebase.provider.FirebaseInitProvider",
    ]);
  });

  test("queries in one element, permission definitions once, application meta-data once, appComponentFactory kept", () => {
    const merged = mergeLibraryManifests(
      [
        {
          from: "billing",
          xml: lib(
            `    <meta-data android:name="com.google.android.play.billingclient.version" android:value="9.1.0" />`,
            `<queries><intent><action android:name="com.android.vending.billing.InAppBillingService.BIND" /></intent></queries>`,
          ),
        },
        {
          from: "androidx.core",
          xml: lib(
            `    <meta-data android:name="com.google.android.play.billingclient.version" android:value="9.1.0" />`,
            `<permission android:name="\${applicationId}.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION" android:protectionLevel="signature" /><uses-permission android:name="\${applicationId}.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION" /><queries><intent><action android:name="com.android.vending.billing.InAppBillingService.BIND" /></intent></queries>`,
          ).replace(
            "<application>",
            '<application android:appComponentFactory="androidx.core.app.CoreComponentFactory" android:allowBackup="true">',
          ),
        },
      ],
      "com.akanjs.x",
    );
    expect(merged.permissions).toEqual(["com.akanjs.x.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION"]);
    expect(merged.manifestXml.filter((x) => x.startsWith("<queries")).length).toBe(1);
    expect(merged.manifestXml.find((x) => x.startsWith("<queries"))!.match(/<intent>/g)).toHaveLength(1);
    expect(
      merged.manifestXml.some((x) =>
        x.includes('android:name="com.akanjs.x.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION"'),
      ),
    ).toBe(true);
    expect(merged.applicationXml.filter((x) => x.includes("billingclient.version"))).toHaveLength(1);
    expect(merged.applicationAttrs).toEqual([
      ["android:appComponentFactory", "androidx.core.app.CoreComponentFactory"],
    ]);
  });
});
