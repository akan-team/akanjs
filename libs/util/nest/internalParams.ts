import { Dayjs, dayjs } from "@akanjs/base";
import { getRequest, InternalParamPipe } from "@akanjs/nest";
import { ExecutionContext } from "@nestjs/common";
import UAParser from "ua-parser-js";

export class UserIp implements InternalParamPipe<string> {
  getParam(context: ExecutionContext) {
    const req = getRequest(context) as { ip?: string };
    return req.ip ?? null;
  }
}

interface AccessInfo {
  period: number;
  countryCode?: string;
  countryName?: string;
  city?: string;
  postal?: number;
  location?: {
    type: "Point";
    coordinates: [number, number];
  };
  ipv4?: string;
  state?: string;
  userAgent?: string;
  at: Dayjs;
}
export class Access implements InternalParamPipe {
  getParam(context: ExecutionContext) {
    const req = getRequest(context) as { userAgent?: string; geolocation?: string };
    const result = new UAParser(req.userAgent).getResult();
    if (!req.userAgent) return null;
    return {
      ...(req.geolocation ? JSON.parse(req.geolocation) : {}),
      osName: result.os.name,
      osVersion: result.os.version,
      browserName: result.browser.name,
      browserVersion: result.browser.version,
      mobileModel: result.device.model,
      mobileVendor: result.device.vendor,
      deviceType: result.device.type ?? "desktop",
      at: dayjs(),
      period: 0,
    } as AccessInfo;
  }
}
