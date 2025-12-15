import { isIpAddress } from "./isIpAddress";

export const isHttpUri = (str: string) => {
  try {
    const protocol = str.split("://")[0];
    if (protocol !== "http" && protocol !== "https") return false;
    const hostname = str.split("://")[1].split(":")[0];
    if (!isIpAddress(hostname) && hostname !== "localhost") return false;
    return true;
  } catch {
    return false;
  }
};
