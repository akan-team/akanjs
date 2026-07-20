import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-cbc";
const KEY = Buffer.from(process.env.ENCRYPTION_KEY ?? "00000000000000000000000000000000", "utf8").subarray(0, 32);

export const encryptData = (data: object): string => {
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, KEY, iv);
  const encrypted = cipher.update(JSON.stringify(data), "utf8", "hex") + cipher.final("hex");
  return `${iv.toString("hex")}:${encrypted}`;
};

export const decryptData = (encrypted: string): object => {
  const [ivHex, data] = encrypted.split(":");
  const decipher = createDecipheriv(ALGORITHM, KEY, Buffer.from(ivHex, "hex"));
  return JSON.parse(decipher.update(data, "hex", "utf8") + decipher.final("utf8"));
};
