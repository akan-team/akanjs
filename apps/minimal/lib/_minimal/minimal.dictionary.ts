import { serviceDictionary } from "akanjs/dictionary";

import type { MinimalEndpoint } from "./minimal.signal";

export const dictionary = serviceDictionary(["en", "ko"])
  .endpoint<MinimalEndpoint>((fn) => ({}))
  .translate({
    healthy: ["Healthy", "정상"],
    unhealthy: ["Unhealthy", "비정상"],
  });
