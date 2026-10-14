/** Whether the page runs in a view an MCP host renders, where the host relays every call and owns the frame. */
export const isMcpView = () => !!globalThis.__AKAN_EMBED__;
