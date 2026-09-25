import { type Browser, launch } from "puppeteer";

import { Err } from "../lib/dict";

export class Crawler {
  #browser: Browser | null = null;
  #launched = false;
  #headless = true;

  async init({ headless = false }: { headless?: boolean } = {}) {
    this.#browser = await launch({
      headless,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--no-first-run",
        "--no-zygote",
        "--single-process",
      ],
    });
    this.#launched = true;
  }

  async close() {
    if (!this.#browser) throw new Err("util.error.browserNotInitialized");
    await this.#browser.close();
  }

  async generatePdf(url: string) {
    if (!this.#browser) throw new Err("util.error.browserNotInitialized");
    if (!this.#launched) await this.init({ headless: this.#headless });
    const page = await this.#browser.newPage();
    await page.goto(url);
    const pdf = await page.pdf();
    await this.#browser.close();
    return pdf;
  }
}
