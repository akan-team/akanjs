/**
 * Detects "address already in use" listen failures across the shapes Bun throws them in
 * (`code: "EADDRINUSE"` on newer versions, message-only on older ones).
 */
export const isPortInUseError = (error: unknown): boolean => {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; message?: unknown };
  if (candidate.code === "EADDRINUSE") return true;
  const message = String(candidate.message ?? "");
  return message.includes("EADDRINUSE") || message.toLowerCase().includes("in use");
};
