import type { PageState } from "akanjs/client";
import { Responsive, responsiveWidths } from "akanjs/constant";
import { type Account, getDefaultAccount } from "akanjs/fetch";
import type { SignalType } from "akanjs/signal";
import { store } from "./store";
import { StoreRegistry } from "./storeRegistry";

const defaultMessage = {
  type: "info" as "info" | "success" | "error" | "warning" | "loading",
  content: "",
  duration: 3, // seconds
  key: Math.random().toString(36).slice(2, 15),
};

export type BaseSearchParamsState = { [key: string]: string | string[] };

export const getBaseSearchParam = (searchParams: BaseSearchParamsState, key: string) => {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
};

export class BaseStore extends store("base" as const, () => ({
  csrLoaded: false,
  path: "/",
  pathname: typeof window !== "undefined" ? window.location.pathname : "/",
  params: {} as { [key: string]: string },
  searchParams: {} as BaseSearchParamsState,
  theme: "system",
  innerWidth: 0,
  innerHeight: 0,
  responsive: "md" as Responsive["value"],
  uiOperation: "sleep" as "sleep" | "loading" | "idle",
  messages: [] as (typeof defaultMessage)[],
  tryJwt: null as string | null,
  trySignalType: "restapi" as SignalType,
  tryRoles: [] as string[], //[...roleTypes] as RoleType[],
  tryAccount: getDefaultAccount() as Account<{ [key: string]: string | undefined }>,
  keyboardHeight: 0,
  pageState: {
    transition: "none",
    topSafeArea: 0,
    bottomSafeArea: 0,
    topInset: 0,
    bottomInset: 0,
    gesture: true,
    cache: false,
    ssr: "stream",
    topSafeAreaColor: "var(--color-base-100, Canvas)",
    bottomSafeAreaColor: "var(--color-base-100, Canvas)",
  } as PageState,
  devMode: false,
  deviceToken: "" as string,
  currentPath: "" as string,
})) {
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
export const base = StoreRegistry.register(BaseStore);

export class RootStore extends StoreRegistry.merge("root" as const, BaseStore) {}

export const st = StoreRegistry.build(RootStore);
