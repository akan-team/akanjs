import { compare } from "bcryptjs";

export const isPasswordMatch = async (password: string, hash: string) => {
  return await compare(password, hash);
};
