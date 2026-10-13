const decodeBase64Url = (input: string): string => {
  const base64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  if (typeof atob === "function") return atob(padded);
  return Buffer.from(padded, "base64").toString("binary");
};

const decodeJwtPart = <T>(part: string | undefined, name: string): T => {
  if (!part) throw new Error(`Invalid JWT ${name}`);
  const binary = decodeBase64Url(part);
  const json = decodeURIComponent(
    [...binary].map((char) => `%${char.charCodeAt(0).toString(16).padStart(2, "0")}`).join(""),
  );
  return JSON.parse(json) as T;
};

/** Decodes a JWT payload without validating its signature. */
export const decodeJwtPayload = <T = unknown>(jwt: string): T => decodeJwtPart<T>(jwt.split(".")[1], "payload");

/** Decodes a JWT header without validating its signature. */
export const decodeJwtHeader = <T = unknown>(jwt: string): T => decodeJwtPart<T>(jwt.split(".")[0], "header");
