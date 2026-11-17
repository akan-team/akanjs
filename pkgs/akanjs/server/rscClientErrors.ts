import type { RscClientErrorSender } from "../client/rscClientErrorSender";
import type { BrowserErrorKind } from "../signal/browserError";

export type PageErrorReport = (error: unknown, kind: BrowserErrorKind) => void;
export const pageErrorReporter = (routeIdOf: () => string | null): PageErrorReport | null => {
  const [navigation] = performance.getEntriesByType("navigation") as PerformanceNavigationTiming[];
  //? Only a page the server lets report names its request id, in the document's own `Server-Timing`.
  const requestId = navigation?.serverTiming?.find(({ name }) => name === "akan-report")?.description;
  if (!requestId) return null;
  let sender: Promise<RscClientErrorSender> | undefined;
  const report: PageErrorReport = (error, kind) => {
    //? A route control's digest starts with `AKAN_`: a redirect or a not-found is no error, so it never loads the sender.
    if (String((error as { digest?: unknown } | null)?.digest).startsWith("AKAN_")) return;
    const routeId = routeIdOf();
    sender ??= import("../client/rscClientErrorSender").then(
      ({ RscClientErrorSender }) => new RscClientErrorSender(requestId),
    );
    sender.then(
      (loaded) => loaded.send(error, kind, routeId),
      () => null,
    );
  };
  window.addEventListener("error", (event) => {
    if (event.error) report(event.error, "error");
  });
  window.addEventListener("unhandledrejection", (event) => report(event.reason, "rejection"));
  return report;
};
