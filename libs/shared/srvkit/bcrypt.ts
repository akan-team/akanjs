import { createHash, timingSafeEqual } from "node:crypto";

export const hashPassword = async (password: string) => {
  return await Bun.password.hash(password, {
    algorithm: "bcrypt",
    cost: process.env.SALT_ROUNDS ? parseInt(process.env.SALT_ROUNDS) : 11,
  });
};

export const isBcryptHash = (hash: string) => /^\$2[abxy]?\$\d{2}\$[./A-Za-z0-9]{53}$/.test(hash);

//? Digests, not the strings: timingSafeEqual needs equal lengths, and checking the lengths first leaks the stored one.
const isPlaintextMatch = (password: string, stored: string) => {
  const digestOf = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digestOf(password), digestOf(stored));
};

export const isPasswordMatch = async (password: string, hash: string) => {
  try {
    return await Bun.password.verify(password, hash, "bcrypt");
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("InvalidEncoding")) throw error;
    return isPlaintextMatch(password, hash);
  }
};
