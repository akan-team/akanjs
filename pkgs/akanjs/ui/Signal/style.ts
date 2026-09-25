import { docPill, type Tone } from "../Reference";

export const signalUi = {
  inputRow: "flex w-full flex-col gap-2 py-2 md:flex-row md:items-center",
  inputLabel: "w-full shrink-0 font-mono text-foreground/70 text-sm md:w-40",
};

/** The REST convention rather than a palette choice: reads are blue, writes are green. */
const methodTone: { [key: string]: Tone } = {
  query: "info",
  prompt: "info",
  message: "info",
  mutation: "success",
  pubsub: "warning",
};

/** Only a mutation is a POST — enumerating that side leaves a `prompt` a GET beside the queries, and lets a
 *  read-shaped type added later inherit the right verb rather than be mislabelled. */
export const getMethodLabel = (type: string) => (type === "mutation" ? "POST" : type === "query" ? "GET" : type);

export const getMethodBadgeClassName = (type: string) =>
  docPill(methodTone[type] ?? "muted", "w-16 justify-center uppercase");

export const getWsBadgeClassName = (type: string) => docPill(methodTone[type] ?? "muted", "uppercase");

export const getGuardBadgeClassName = (guard: string) =>
  docPill(guard === "Public" ? "warning" : guard === "None" ? "muted" : "info");

/** Published to agents is quiet; refused is amber, because it is a thing to go fix. */
export const getMcpBadgeClassName = (exposed: boolean) => docPill(exposed ? "success" : "warning");

const statusTone: { [key: string]: Tone } = {
  error: "error",
  success: "success",
  listening: "success",
  loading: "info",
};

export const getStatusTone = (status: string): Tone => statusTone[status] ?? "muted";

export const getStatusBadgeClassName = (status: string) => docPill(getStatusTone(status), "uppercase");
