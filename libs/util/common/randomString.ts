const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";

export const randomString = (length = 12) => {
  let result = "";
  while (result.length < length) {
    for (const byte of crypto.getRandomValues(new Uint8Array(length - result.length + 8))) {
      //? 252 is the largest multiple of 36 below 256; dropping the bytes above it keeps every character equally likely.
      if (byte >= 252) continue;
      result += alphabet[byte % 36];
      if (result.length === length) break;
    }
  }
  return result;
};
