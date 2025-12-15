import { type Page } from "@playwright/test";
import { test } from "@playwright/test";

export { expect } from "@playwright/test";
export { test };

export class PageAgent {
  readonly page: Page;
  readonly #defaultWaitMs = 500;
  #isInitialized = false;
  constructor(page: Page) {
    this.page = page;
  }
  async goto(path: string) {
    await Promise.all([this.page.goto(path), this.waitForPathChange(path)]);
    if (!this.#isInitialized) {
      // await this.page.waitForEvent("websocket");
      this.#isInitialized = true;
    }
  }
  async waitForPathChange(path?: string) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Timeout waiting for pathChange message"));
      }, 30000);
      this.page.on("console", (msg) => {
        if (msg.type() === "log" && msg.text().startsWith(`%cpathChange-finished:${path ?? ""}`)) {
          clearInterval(timeout);
          setTimeout(() => {
            resolve(true);
          }, this.#defaultWaitMs);
        }
      });
    });
  }
  async wait(ms = this.#defaultWaitMs) {
    await this.page.waitForTimeout(ms);
  }
  url() {
    return "/" + this.page.url().split("/").slice(4).join("/");
  }
}
