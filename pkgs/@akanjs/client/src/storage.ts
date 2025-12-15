import { baseClientEnv } from "@akanjs/base";
import { Preferences } from "@capacitor/preferences";

export const storage = {
  getItem: async (key: string) => {
    if (baseClientEnv.side === "server") return;
    if (baseClientEnv.renderMode === "ssr") return localStorage.getItem(key);
    else return (await Preferences.get({ key })).value;
  },
  setItem: async (key: string, value: string) => {
    if (baseClientEnv.side === "server") return;
    if (baseClientEnv.renderMode === "ssr") {
      localStorage.setItem(key, value);
      return;
    } else {
      await Preferences.set({ key, value });
      return;
    }
  },
  removeItem: (key: string) => {
    if (baseClientEnv.side === "server") return;
    if (baseClientEnv.renderMode === "ssr") {
      localStorage.removeItem(key);
      return;
    } else return Preferences.remove({ key });
  },
};
