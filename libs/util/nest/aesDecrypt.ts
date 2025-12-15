import * as crypto from "crypto-js";

export const aesDecrypt = (hash: string, aeskey: string) => crypto.AES.decrypt(hash, aeskey).toString(crypto.enc.Utf8);
