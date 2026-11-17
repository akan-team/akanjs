import { modelNames } from "akanjs/common";
import { st } from "akanjs/store";

import { StoreFacade } from "../../store/storeFacade";

//? A model whose store this page has not loaded holds no state to reset, so it is passed over.
export const resetModels = (resets?: string[] | null) => {
  for (const reset of resets ?? []) {
    const resetModel = StoreFacade.peek(st.do, modelNames(reset).resetModel) as (() => unknown) | undefined;
    void resetModel?.();
  }
};
