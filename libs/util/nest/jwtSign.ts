import * as jwt from "jsonwebtoken";

export const jwtSign = (message: string | { [key: string]: any }, secret: string) => jwt.sign(message, secret);
