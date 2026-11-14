import { via } from "akanjs/constant";

export class RemoteConnection extends via((field) => ({
  url: field(String), // the remote's MCP endpoint, as the server normalized what the person typed
  host: field(String),
  connectedAt: field(Date),
})) {}
