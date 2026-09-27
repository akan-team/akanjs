import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
  chooseSigning,
  entitlementProblems,
  type ProvisioningProfile,
  parseIdentities,
  pickIdentity,
  profileCovers,
  profileFromPlist,
  type SigningQuery,
} from "../src/lib/iossigning.ts";
import { parsePlist, toPlist } from "../src/lib/plist.ts";
import { SigningError } from "../src/lib/prepare.ts";

// akanjs readiness O1-2: identities, provisioning profiles and the entitlement check.

const cert = Buffer.from("fake certificate DER").toString("base64");
const certSha1 = createHash("sha1").update(Buffer.from(cert, "base64")).digest("hex").toUpperCase();

const PROFILE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Name</key><string>iOS Team Provisioning Profile: com.akanjs.*</string>
  <key>UUID</key><string>1111-2222</string>
  <key>TeamIdentifier</key><array><string>ABCDE12345</string></array>
  <key>ExpirationDate</key><date>2027-09-26T00:00:00Z</date>
  <key>DeveloperCertificates</key><array><data>
  ${cert}
  </data></array>
  <key>ProvisionedDevices</key><array><string>00008110-000A</string></array>
  <key>Entitlements</key><dict>
    <key>application-identifier</key><string>ABCDE12345.com.akanjs.*</string>
    <key>com.apple.developer.team-identifier</key><string>ABCDE12345</string>
    <key>get-task-allow</key><true/>
    <key>keychain-access-groups</key><array><string>ABCDE12345.*</string></array>
    <key>com.apple.developer.associated-domains</key><string>*</string>
    <key>aps-environment</key><string>development</string>
  </dict>
</dict>
</plist>`;

describe("plist reader", () => {
  test("reads what toPlist writes, plus data (base64) and dates", () => {
    const value = { a: "x & <y>", n: 3, f: 1.5, t: true, list: ["p", { q: false }], empty: {} };
    expect(parsePlist(toPlist(value))).toEqual(value);
    const p = parsePlist(PROFILE_XML) as Record<string, unknown>;
    expect(p.DeveloperCertificates).toEqual([cert]);
    expect(p.ExpirationDate).toEqual(new Date("2027-09-26T00:00:00Z"));
  });
});

describe("iOS signing", () => {
  const profile = profileFromPlist("/p.mobileprovision", parsePlist(PROFILE_XML) as Record<string, unknown>);
  const identity = { sha1: certSha1, name: "Apple Development: Jane Doe (VX85V6WY6B)" };

  test("a profile: team, kind, devices, certificates", () => {
    expect([profile.teamId, profile.appId, profile.kind, profile.devices, profile.certificates]).toEqual([
      "ABCDE12345",
      "ABCDE12345.com.akanjs.*",
      "development",
      ["00008110-000A"],
      [certSha1],
    ]);
    expect(profileCovers(profile, "com.akanjs.sample")).toBe("wildcard");
    expect(profileCovers(profile, "com.other.app")).toBeNull();
  });

  test("entitlements the profile does not allow", () => {
    expect(
      entitlementProblems(
        {
          "application-identifier": "ABCDE12345.com.akanjs.sample",
          "get-task-allow": true,
          "keychain-access-groups": ["ABCDE12345.com.akanjs.sample"],
          "com.apple.developer.associated-domains": ["applinks:example.com"],
          "aps-environment": "development",
        },
        profile,
      ),
    ).toEqual([]);
    expect(
      entitlementProblems(
        {
          "aps-environment": "production",
          "com.apple.developer.in-app-payments": ["merchant.x"],
          "keychain-access-groups": ["OTHERTEAM.x"],
        },
        profile,
      ),
    ).toEqual([
      'aps-environment: the app asks for "production", the profile has "development"',
      "com.apple.developer.in-app-payments: the profile's App ID does not have this capability",
      'keychain-access-groups: "OTHERTEAM.x" is not allowed by the profile (["ABCDE12345.*"])',
    ]);
  });

  test("identities: only valid ones are listed; a name two certificates share needs the SHA-1", () => {
    const out = `  1) ${"A".repeat(40)} "Apple Development: Jane Doe (VX85V6WY6B)"
  2) ${"B".repeat(40)} "akan-native dev: jane"
     2 valid identities found`;
    const ids = parseIdentities(out);
    expect(ids.map((i) => i.name)).toEqual(["Apple Development: Jane Doe (VX85V6WY6B)", "akan-native dev: jane"]);
    expect(pickIdentity(ids, "development").sha1).toBe("A".repeat(40));
    expect(pickIdentity(ids, "development", "Apple Development: Jane Doe").sha1).toBe("A".repeat(40));
    expect(() => pickIdentity(ids, "distribution")).toThrow(/no valid Apple Distribution identity/);
    const twice = [...ids, { sha1: "C".repeat(40), name: "Apple Development: Jane Doe (VX85V6WY6B)" }];
    expect(() => pickIdentity(twice, "development", "Apple Development: Jane Doe (VX85V6WY6B)")).toThrow(/SHA-1/);
    expect(pickIdentity(twice, "development", "c".repeat(40)).sha1).toBe("C".repeat(40));
  });

  describe("finding the signing (docs/api.md §3)", () => {
    const now = new Date("2026-09-26T00:00:00Z");
    const mine = { sha1: certSha1, name: "Apple Development: Jane Doe (VX85V6WY6B)" };
    const other = { sha1: "D".repeat(40), name: "Apple Development: John Roe (NTUUVM39F2)" };
    const dist = { sha1: "E".repeat(40), name: "Apple Distribution: Jane Doe (ABCDE12345)" };
    const exact = (over: Partial<ProvisioningProfile> = {}): ProvisioningProfile => ({
      ...profile,
      name: "iOS Team Provisioning Profile: com.akanjs.sample",
      uuid: "3333",
      appId: `${over.teamId ?? "ABCDE12345"}.com.akanjs.sample`,
      ...over,
    });
    const query = (over: Partial<SigningQuery> = {}): SigningQuery => ({
      bundleId: "com.akanjs.sample",
      kinds: ["development"],
      identityKind: "development",
      entitlementsFor: () => ({}),
      now,
      ...over,
    });
    const push = () => ({ "aps-environment": "development" });
    const failure = (fn: () => unknown): SigningError => {
      try {
        fn();
      } catch (error) {
        if (error instanceof SigningError) return error;
        throw error;
      }
      throw new Error("no SigningError");
    };

    test("the profile Xcode made for the app names the identity, among several in the keychain", () => {
      const got = chooseSigning([mine, other], [exact()], query({ entitlementsFor: push }));
      expect([got.identity, got.profile.uuid]).toEqual([mine, "3333"]);
    });

    test("a wildcard profile only without push or associated domains; an exact one beats it", () => {
      expect(chooseSigning([mine], [profile], query()).profile.uuid).toBe("1111-2222");
      const refused = failure(() => chooseSigning([mine], [profile], query({ entitlementsFor: push })));
      expect(refused.problems).toEqual([
        '"iOS Team Provisioning Profile: com.akanjs.*" (team ABCDE12345, development, until 2027-09-26): a wildcard profile cannot carry push or associated domains',
      ]);
      expect(chooseSigning([mine], [profile, exact()], query()).profile.uuid).toBe("3333");
    });

    test("kind, expiry, team, entitlements and the keychain rule profiles out, each with its reason", () => {
      const error = failure(() =>
        chooseSigning(
          [mine],
          [
            exact({ kind: "app-store" }),
            exact({ expires: new Date("2026-01-01T00:00:00Z") }),
            exact({ teamId: "OTHER12345" }),
            exact({ entitlements: {} }),
            exact({ certificates: ["F".repeat(40)] }),
          ],
          query({ teamId: "ABCDE12345", entitlementsFor: push }),
        ),
      );
      expect(error.message).toStartWith("no development provisioning profile fits com.akanjs.sample.");
      expect(error.problems.map((p) => p.slice(p.indexOf("): ") + 3))).toEqual([
        "an app-store profile, not development",
        "expired",
        "team OTHER12345, not ABCDE12345",
        "aps-environment: the profile's App ID does not have this capability",
        "none of its certificates is a valid identity in this keychain",
      ]);
      expect(failure(() => chooseSigning([mine], [], query())).message).toContain("(none on this Mac covers it)");
    });

    test("several teams or several certificates: listed, not guessed; teamId and identity settle it", () => {
      const theirs = exact({ teamId: "OTHER12345", uuid: "4444", certificates: [other.sha1] });
      const teams = failure(() => chooseSigning([mine, other], [exact(), theirs], query()));
      expect(teams.message).toContain("choose one with signing.teamId");
      expect(teams.problems).toHaveLength(2);
      expect(chooseSigning([mine, other], [exact(), theirs], query({ teamId: "OTHER12345" })).identity).toEqual(other);
      const both = exact({ certificates: [certSha1, other.sha1] });
      expect(failure(() => chooseSigning([mine, other], [both], query())).message).toContain(
        "choose one with signing.identity",
      );
      expect(chooseSigning([mine, other], [both], query({ identity: other.name })).identity).toEqual(other);
      expect(
        failure(() => chooseSigning([mine, other], [exact()], query({ identity: other.sha1 }))).problems[0],
      ).toEndWith(`it does not include the certificate of "${other.name}"`);
    });

    test("run and dev on an iPhone: development and ad hoc profiles must list its UDID; App Store ones need not", () => {
      const phone = { udid: "00008110-000B", name: "Jane's iPhone" };
      const without = exact({ uuid: "6666", expires: new Date("2028-01-01T00:00:00Z") }); // lists 00008110-000A only
      const withIt = exact({ uuid: "7777", devices: ["00008110-000A", phone.udid] });
      // The later-expiring profile lacks the phone: the one that lists it wins.
      expect(chooseSigning([mine], [without, withIt], query({ device: phone })).profile.uuid).toBe("7777");
      // Without a device (build --device): the latest expiry, as before.
      expect(chooseSigning([mine], [without, withIt], query()).profile.uuid).toBe("6666");
      const missing = failure(() => chooseSigning([mine], [without], query({ device: phone })));
      expect(missing.message).toContain(
        `The device "Jane's iPhone" (00008110-000B) is not in the profile: register it`,
      );
      expect(missing.problems[0]).toEndWith(`it does not include device "Jane's iPhone" (00008110-000B)`);
      // Failing for other reasons too: the usual advice.
      expect(
        failure(() => chooseSigning([mine], [exact({ kind: "app-store" })], query({ device: phone }))).message,
      ).toContain("Create one with Xcode");
      const store = exact({ kind: "app-store", certificates: [dist.sha1], devices: [] });
      expect(
        chooseSigning([dist], [store], query({ kinds: ["app-store"], identityKind: "distribution", device: phone }))
          .profile.kind,
      ).toBe("app-store");
    });

    test("one team and one certificate: the profile that expires last; release wants a distribution identity", () => {
      const newer = exact({ uuid: "5555", expires: new Date("2028-01-01T00:00:00Z") });
      expect(chooseSigning([mine], [exact(), newer], query()).profile.uuid).toBe("5555");
      expect(() =>
        chooseSigning([mine], [exact()], query({ kinds: ["app-store"], identityKind: "distribution" })),
      ).toThrow(/no valid Apple Distribution identity/);
      const store = exact({ kind: "app-store", certificates: [dist.sha1] });
      expect(
        chooseSigning([mine, dist], [store, exact()], query({ kinds: ["app-store"], identityKind: "distribution" }))
          .identity,
      ).toEqual(dist);
    });
  });
});
