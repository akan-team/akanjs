import { Href } from "./href";
import { isNativeShell } from "./nativeHost";

//? HTML lets a script close any tab whose session history holds one document, so only one this app opened is closed.
export const closeAppOpenedTab = (): boolean => {
  const win = globalThis.window;
  if (!win || isNativeShell() || win.history?.length !== 1 || typeof win.close !== "function") return false;
  //? `window.open(href, "_blank", "noopener")` and a `target="_blank"` link drop the opener but still send the referrer.
  const referrer = globalThis.document?.referrer ?? "";
  if (!win.opener && (!referrer || Href.leavesOrigin(referrer, win.location.href))) return false;
  win.close();
  return win.closed === true;
};
