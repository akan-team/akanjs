import type { ExtensionAPI, InlineExtension } from "@earendil-works/pi-coding-agent";
import type { CodeAgentProfile } from "akanjs/common";
import { Type } from "typebox";
import type { CodeMailbox, CodePeer } from "../agent/CodeMailbox";

export interface MailToolPackOptions {
  profile: CodeAgentProfile;
  /** Late, because the mailbox only exists once the session it announces has one. */
  mailbox: () => CodeMailbox | undefined;
}

export class MailToolPack {
  static readonly toolNames = ["list_peers", "send_peer_message"];

  readonly #options: MailToolPackOptions;

  constructor(options: MailToolPackOptions) {
    this.#options = options;
  }

  names() {
    return this.#options.profile.session.store === "file" ? MailToolPack.toolNames : [];
  }

  extension(): InlineExtension | undefined {
    if (!this.names().length) return undefined;
    return { name: "akan-mail", factory: (pi: ExtensionAPI) => this.#register(pi) };
  }

  #register(pi: ExtensionAPI) {
    pi.registerTool({
      name: "list_peers",
      label: "List peer sessions",
      description:
        "List the other akan code sessions running in this workspace right now, with their name and working directory. Call it before send_peer_message so you name a session that is actually there.",
      promptSnippet: "list_peers: the other akan code sessions running here",
      parameters: Type.Object({}),
      execute: async () => ({
        content: [{ type: "text" as const, text: MailToolPack.#render(this.#options.mailbox()?.peers() ?? []) }],
        details: undefined,
      }),
    });
    pi.registerTool({
      name: "send_peer_message",
      label: "Message a peer session",
      description:
        "Hand a message to another akan code session in this workspace. It arrives there as a prompt, so it costs that session a turn — use it to hand over a piece of work or to warn it about a change you made, not to chat. Say what you want done and what you already did.",
      promptSnippet: "send_peer_message: hand work to another akan code session",
      parameters: Type.Object({
        to: Type.String({ description: "The peer's name, or the front of its id, from list_peers." }),
        message: Type.String({ description: "What that session should know or do." }),
      }),
      execute: async (_id, params) => {
        const mailbox = this.#options.mailbox();
        const peer = mailbox?.find(params.to);
        if (!mailbox || !peer)
          return {
            content: [{ type: "text" as const, text: `No live session matches "${params.to}". Call list_peers.` }],
            details: undefined,
            isError: true,
          };
        try {
          mailbox.send(peer.id, params.message);
          return { content: [{ type: "text" as const, text: `Sent to ${peer.name}.` }], details: undefined };
        } catch (error: unknown) {
          return { content: [{ type: "text" as const, text: String(error) }], details: undefined, isError: true };
        }
      },
    });
  }

  static #render(peers: CodePeer[]) {
    if (!peers.length) return "No other akan code session is running in this workspace.";
    return peers.map((peer) => `${peer.name} (${peer.id.slice(0, 8)}) — ${peer.cwd}`).join("\n");
  }
}
