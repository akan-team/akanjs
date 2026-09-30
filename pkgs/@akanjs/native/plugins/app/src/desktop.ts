// Desktop: app info from the bundle, deep links from TAO Event::Opened (plugins.md D6),
// the page's beforeQuit veto (D4).

import { RetainedEvents } from "../../../packages/core/src/kernel.ts";
import {
  createPageVeto,
  type DesktopContext,
  defineDesktopPlugin,
  linkClaimed,
  type QuitReason,
} from "../../../packages/desktop/src/plugin.ts";
import { relaunchAfterExit } from "../../../packages/desktop/src/relaunch.ts";
import type { AppApi, AppEvents } from "./index.ts";

// Every window's page that listens is asked before quitting; all must allow (plugins.md D4, SH-6).
const quitVeto = createPageVeto<{ reason: QuitReason }>();

let launchUrl: string | null = null;
let launched = false;
/** Every link, the launch link too, retained until a page listens (the shared C2 rule, kernel RetainedEvents). */
const links = new RetainedEvents<string>();

export default defineDesktopPlugin<AppApi, AppEvents>({
  id: "app",
  setup(ctx: DesktopContext) {
    ctx.onBeforeQuit(({ reason }) => quitVeto.ask({ reason }));
    ctx.onNativeEvent("opened", (event) => {
      for (const url of (event.urls as string[] | undefined) ?? []) {
        // A sign-in callback that ends auth-session's start() is its answer, not a deep link (R10).
        if (linkClaimed(url)) continue;
        // The first URL, before anything was delivered, is the launch URL (a cold start by deep link);
        // it never changes. Side effects belong to urlOpen, which gets it too.
        if (!launched) {
          launched = true;
          launchUrl = url;
        }
        links.emit(url, true);
      }
    });
  },
  methods: {
    getInfo: (_args, ctx) => ({
      id: ctx.app.id,
      name: ctx.app.name,
      version: ctx.app.version,
      build: ctx.app.build ?? 1,
    }),
    getLaunchUrl: () => ({ url: launchUrl }),
    exit: (_args, ctx) => {
      setTimeout(() => ctx.quit(0), 50); // answer the call first
    },
    relaunch: async (_args, ctx) => {
      await relaunchAfterExit(process.execPath);
      setTimeout(() => ctx.quit(0), 50);
    },
    answerBeforeQuit: (args, ctx) => quitVeto.answer(args, ctx.window),
    minimize: async (_args, ctx) => {
      await ctx.shell("window.minimize");
    },
    // Android's back ownership: a desktop window has no system back to hand it to.
    setBackEnabled: () => undefined,
  },
  events: {
    urlOpen(send) {
      launched = true; // a link after a page listened is not the launch URL
      // A deep link is handled once: by the most recently focused window that listens (SH-6).
      // What arrived before the page listened is delivered now (plugins.md C2).
      links.listen("pages", (url) => (send({ url }, "focused")?.length ?? 1) > 0);
      return () => links.unlisten("pages");
    },
    beforeQuit: (send, ctx) => quitVeto.source(send, ctx),
    // Android's back button and its swipe: never fire here, but listening works on every platform.
    backButton: () => () => {},
    backProgress: () => () => {},
    serverState(send, ctx) {
      if (!ctx.server) return () => {};
      send({ state: ctx.server.state });
      return ctx.server.onState((state) => void send({ state }));
    },
  },
});
