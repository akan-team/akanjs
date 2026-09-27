// @ts-nocheck — see ./react.ts for the full rationale behind vendor entries
// and why we enumerate named exports manually instead of relying on
// `export * from "<cjs>"`.
import * as m from "react-dom";

export default m;
export const {
  __DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE,
  browser,
  createPortal,
  flushSync,
  preconnect,
  prefetchDNS,
  preinit,
  preinitModule,
  preload,
  preloadModule,
  requestFormReset,
  unstable_batchedUpdates,
  useFormState,
  useFormStatus,
  version,
} = m;
