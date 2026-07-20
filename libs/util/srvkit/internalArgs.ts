import { dayjs } from "akanjs/base";
import type { InternalArg, SignalContext } from "akanjs/signal";
import { UAParser } from "ua-parser-js";
import type { AccessInfo } from "./internalArgs.helper";

export class UserIp implements InternalArg {
  getArg(context: SignalContext) {
    if (context.transport === "http") return context.getHttpContext<{ ip?: string }>().req.ip ?? null;
    else return context.getWebSocketContext<{ ip?: string }>().ws.data.ip ?? null;
  }
}

export class Access implements InternalArg {
  getArg(context: SignalContext) {
    const userAgent =
      context.transport === "http"
        ? context.getHttpContext<{ userAgent?: string; geolocation?: string }>().req.userAgent
        : (context.getWebSocketContext<{ userAgent?: string; geolocation?: string }>().ws.data.userAgent ?? null);
    const geolocation =
      context.transport === "http"
        ? context.getHttpContext<{ geolocation?: string }>().req.geolocation
        : (context.getWebSocketContext<{ geolocation?: string }>().ws.data.geolocation ?? null);
    const result = userAgent ? new UAParser(userAgent).getResult() : null;
    if (!userAgent) return null;
    return {
      ...(geolocation ? JSON.parse(geolocation) : {}),
      osName: result?.os.name,
      osVersion: result?.os.version,
      browserName: result?.browser.name,
      browserVersion: result?.browser.version,
      mobileModel: result?.device.model,
      mobileVendor: result?.device.vendor,
      deviceType: result?.device.type ?? "desktop",
      at: dayjs(),
      period: 0,
    } as AccessInfo;
  }
}
