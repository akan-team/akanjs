import { baseClientEnv } from "@akanjs/base";
import { Logger, pathGet } from "@akanjs/common";

export interface Dictionary {
  [key: string]: {
    [key: string]: string;
  };
}
export interface AllDictionary {
  [key: string]: Dictionary;
}

export class ServerTranslator {
  static #langTransMap = new Map<string, { dictionary: Dictionary; translate: (key: string) => string }>();
  async init(lang: string) {
    const { dictionary } = await this.#getTranslator(lang);
    return { lang: dictionary } as AllDictionary;
  }
  async initAllLanguages(existingAllDictionary?: AllDictionary) {
    const allDictionary =
      existingAllDictionary ??
      ((await (await fetch(`${baseClientEnv.serverHttpUri}/getAllDictionary`)).json()) as AllDictionary);
    Object.entries(allDictionary).forEach(([lang, dictionary]) => {
      this.setTranslator(lang, dictionary);
    });
    return allDictionary;
  }
  async #getTranslator(lang: string) {
    const existingTrans = ServerTranslator.#langTransMap.get(lang);
    if (existingTrans) return existingTrans;
    Logger.log("Initialize ServerTranslator");
    const dictionary = (await (
      await fetch(`${baseClientEnv.serverHttpUri}/getDictionary/${lang}`)
    ).json()) as Dictionary;
    return this.setTranslator(lang, dictionary);
  }
  hasTranslator(lang: string) {
    return ServerTranslator.#langTransMap.has(lang);
  }
  setTranslator(lang: string, dictionary: Dictionary) {
    const trans = {
      dictionary,
      translate: (dictKey: string) => {
        return (pathGet(dictKey, dictionary, ".", { t: dictKey }) as { t: string }).t;
      },
    };
    ServerTranslator.#langTransMap.set(lang, trans);
    return trans;
  }
  getTransSync(lang: string, key: string, param?: Record<string, string | number>): string | undefined {
    const trans = ServerTranslator.#langTransMap.get(lang);
    if (!trans) return undefined;
    const { translate } = trans;
    const msg = translate(key);
    return param ? msg.replace(/{([^}]+)}/g, (_, key: string) => param[key] as string) : msg;
  }
  async getTrans(lang: string, key: string, param?: Record<string, string | number>): Promise<string> {
    const { translate } = await this.#getTranslator(lang);
    const msg = translate(key);
    return param ? msg.replace(/{([^}]+)}/g, (_, key: string) => param[key] as string) : msg;
  }
  async getDictionary(lang: string) {
    const { dictionary } = await this.#getTranslator(lang);
    return dictionary;
  }
}
export const serverTranslator = new ServerTranslator();
