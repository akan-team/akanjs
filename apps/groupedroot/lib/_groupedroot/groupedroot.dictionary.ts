import { serviceDictionary } from "akanjs/dictionary";

import type { GroupedrootEndpoint } from "./groupedroot.signal";

export const dictionary = serviceDictionary(["en", "ko"])
  .endpoint<GroupedrootEndpoint>((fn) => ({}))
  .translate({});
