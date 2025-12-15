import * as crypto from "crypto-js";

export const aesEncrypt = (data: string, aeskey: string) => crypto.AES.encrypt(data, aeskey).toString();
