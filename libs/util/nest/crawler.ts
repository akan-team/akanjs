import { type Browser, launch } from "puppeteer";

export class Crawler {
  #browser: Browser;
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
    await this.#browser.close();
  }

  async generatePdf(url: string) {
    if (!this.#launched) await this.init({ headless: this.#headless });
    const page = await this.#browser.newPage();
    await page.goto(url);
    const pdf = await page.pdf();
    await this.#browser.close();
    return pdf;
  }
}
