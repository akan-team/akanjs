import * as jwt from "jsonwebtoken";

export const jwtVerify = (message: string, secret: string) => jwt.verify(message, secret);
