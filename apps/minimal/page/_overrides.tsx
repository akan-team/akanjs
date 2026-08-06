import { BrandModal } from "@apps/minimal/ui";
import { override } from "akanjs/ui";

// Logic-free activation manifest for this route subtree (placed at page/ root, so it applies app-wide).
// `override` type-checks each binding against the framework slot's contract and rejects unknown slot names,
// so app components need no annotation of their own. A nested page/**/_overrides.tsx overrides more narrowly.
export default override({ Modal: BrandModal });
