/**
 * TEMPORARY. These recipes belong in akanjs, not here.
 *
 * akanjs ships `buttonRecipe`/`badgeRecipe`/`inputRecipe` already, but each is missing axes this
 * workspace needs, and the `recipes.*` override slot cannot supply them: it types an override as
 * `(variants?: ButtonVariants, …)`, and `ButtonVariants` is derived from the framework recipe — so an
 * override may restyle the existing axes but can never add one. Hence a shadow module rather than an
 * override.
 *
 * The gaps are framework defects, not workspace preferences. The sharpest is `outline` living inside
 * the same `variant` list as the colors, which makes a colored outline button inexpressible; 38 sites
 * here silently lost their color to it. Written up with file:line and call-site counts in the brief
 * handed to the akanjs side.
 *
 * Removal plan, once the framework gains the axes:
 *   1. delete this folder
 *   2. rewrite 258 import lines from "@libs/util/ui" to "akanjs/ui"
 *   3. the call sites are NOT touched — the call shape here is deliberately the shape the
 *      framework is expected to adopt, so the swap is import-only
 *
 * Step 3 used to carry a caveat: the two recipes disagree on what a variantless `buttonRecipe()`
 * means (muted here, primary there, kept that way so existing consumers' output stays byte-identical),
 * so a swap would have flipped every such call. All 203 now name `variant: "default"` explicitly,
 * which is a no-op here and correct there — the ordering hazard is gone rather than sequenced around.
 *
 * That last point is the whole reason this folder is shaped the way it is. If the framework lands a
 * different axis shape (e.g. a full `color` × `variant` split), step 3 stops being free and every call
 * site churns — so keep the two in sync deliberately, not by accident.
 */
export { type BadgeVariants, badgeRecipe } from "./badge";
export { type ButtonVariants, buttonRecipe } from "./button";
export { type CheckboxVariants, checkboxRecipe } from "./checkbox";
export { type InputVariants, inputRecipe } from "./input";
export {
  type AlertVariants,
  alertRecipe,
  type CardVariants,
  cardRecipe,
  type TableVariants,
  tableRecipe,
} from "./surface";
export { type TabVariants, tabActiveClass, tabDisabledClass, tabRecipe } from "./tab";
export {
  timelineBoxClass,
  timelineClass,
  timelineEndClass,
  timelineItemClass,
  timelineMiddleClass,
  timelineStartClass,
} from "./timeline";
