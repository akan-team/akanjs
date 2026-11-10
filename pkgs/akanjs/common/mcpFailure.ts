//? In `_meta`, not `structuredContent`: a client checks `structuredContent` against the tool's `outputSchema` even
//? on a failed call, and a failure shape would never match it.
export const MCP_FAILURE_META = "akanjs/failure";

export interface McpFailure {
  code: string;
  /** The status HTTP would answer with; absent for a tool the page itself served. */
  statusCode?: number;
}
