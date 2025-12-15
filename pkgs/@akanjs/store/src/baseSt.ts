import { defaultPageState } from "@akanjs/client";
import { Responsive, responsiveWidths } from "@akanjs/constant";
import { Account, defaultAccount, SignalType } from "@akanjs/signal";

import { baseSt, store, StoreOf } from "./storeDecorators";
import { storeInfo } from "./storeInfo";

const defaultMessage = {
  type: "info" as "info" | "success" | "error" | "warning" | "loading",
  content: "",
  duration: 3, // seconds
  key: Math.random().toString(36).slice(2, 15),
};

export class RootStore extends store("root" as const, {
  csrLoaded: false,
  path: "/",
  pathname: typeof window !== "undefined" ? window.location.pathname : "/",
  params: {} as { [key: string]: string },
  searchParams: {} as { [key: string]: string },
  theme: "system",
  prefix: undefined as string | undefined,
  innerWidth: 0,
  innerHeight: 0,
  responsive: "md" as Responsive["value"],
  uiOperation: "sleep" as "sleep" | "loading" | "idle",
  messages: [] as (typeof defaultMessage)[],
  tryJwt: null as string | null,
  trySignalType: "graphql" as SignalType,
  tryRoles: [] as string[], //[...roleTypes] as RoleType[],
  tryAccount: defaultAccount as Account<{ [key: string]: string | undefined }>,
  keyboardHeight: 0,
  pageState: defaultPageState,
  devMode: false,
  deviceToken: "" as string,
  currentPath: "" as string,
}) {
  setDevMode(value: boolean) {
    this.set({ devMode: value });
    localStorage.setItem("devMode", value.toString());
  }
  setWindowSize() {
    if (typeof window === "undefined") return;
    const responsive = Responsive.values[responsiveWidths.findIndex((w) => w < window.innerWidth)];
    this.set({ innerWidth: window.innerWidth, innerHeight: window.innerHeight, responsive });
  }
  showMessage(message: { content: string | string[] } & Partial<typeof defaultMessage>) {
    message.key ??= Math.random().toString(36).slice(2, 15);
    const { messages } = this.get();
    const newMessage = { ...defaultMessage, ...message };

    if (messages.some((m) => m.key === newMessage.key))
      this.set({ messages: messages.map((m) => (m.key === newMessage.key ? newMessage : m)) });
    else this.set({ messages: [...(messages.length > 6 ? messages.slice(1) : messages), newMessage] });
  }
  hideMessage(key: string) {
    const { messages } = this.get();
    this.set({ messages: messages.filter((m) => m.key !== key) });
  }
}

export const base = storeInfo.register("base", RootStore);
export const st = baseSt as StoreOf<RootStore>;
