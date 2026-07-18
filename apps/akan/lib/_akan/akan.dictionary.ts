import { serviceDictionary } from "akanjs/dictionary";

import type { AkanEndpoint } from "./akan.signal";

export const dictionary = serviceDictionary(["en", "ko"])
  .endpoint<AkanEndpoint>((fn) => ({}))
  .translate({
    hello: ["Hello", "안녕하세요"],
  });
