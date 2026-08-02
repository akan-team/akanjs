export interface WebsocketAuthRequest {
  key: string;
  data: [string | null];
}

export interface WebsocketAuthAckData {
  type: "auth";
  revokedRooms: string[];
}

/**
 * Framework-owned websocket auth contract shared by the client and the server dispatcher.
 * The credential frame carries the raw bearer token; verifying it stays in userland middleware,
 * so the server only swaps the credential snapshot held on the socket.
 */
export const websocketAuthContract = {
  key: "__auth",
  makeRequest: (jwt: string | null): WebsocketAuthRequest => ({ key: "__auth", data: [jwt] }),
  makeAck: (revokedRooms: string[]): WebsocketAuthAckData => ({ type: "auth", revokedRooms }),
  readJwt: (data: unknown): string | null => {
    const jwt = Array.isArray(data) ? data[0] : null;
    return typeof jwt === "string" && jwt.length > 0 ? jwt : null;
  },
} as const;
