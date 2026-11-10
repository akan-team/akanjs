import { storage } from "akanjs/client";

const pushDeviceIdKey = "akan:pushDeviceId";
let deviceIdLoad: Promise<string> | null = null;

//? Kept in the app's own storage, so a reinstall or cleared site data starts a new installation along with its token.
export const getPushDeviceId = () =>
  (deviceIdLoad ??= (async () => {
    const stored = await storage.getItem(pushDeviceIdKey);
    if (stored) return stored;
    const created = Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    await storage.setItem(pushDeviceIdKey, created);
    return created;
  })().catch((error: unknown) => {
    deviceIdLoad = null;
    throw error;
  }));

export const loadPushDeviceId = async () => (await storage.getItem(pushDeviceIdKey)) ?? null;
