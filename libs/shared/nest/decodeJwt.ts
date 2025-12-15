import { decode } from "jsonwebtoken";

export const decodeJwt = (token: string) => {
  return decode(token) as unknown;
};
