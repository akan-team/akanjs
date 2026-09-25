import { serviceDictionary } from "akanjs/dictionary";

import type { MinimalEndpoint } from "./minimal.signal";

export const dictionary = serviceDictionary(["en", "ko"])
  .endpoint<MinimalEndpoint>((fn) => ({
    benchPing: fn(["benchPing", "Bench Ping"]),
    benchEcho: fn(["benchEcho", "Bench Echo"]),
    benchFanout: fn(["benchFanout", "Bench Fanout"]),
    benchPublish: fn(["benchPublish", "Bench Publish"]),
  }))
  .translate({
    healthy: ["Healthy", "정상"],
    unhealthy: ["Unhealthy", "비정상"],
  });
