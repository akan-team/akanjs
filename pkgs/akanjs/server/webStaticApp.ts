import type { PagePromptRender, PagePromptRenderInput } from "../signal/mcp/pagePrompt";
import { RscPagePrompts } from "./rscPagePrompts";
import type { RscWorker } from "./rscWorkerHost";
import { SsrStaticApp } from "./ssrStaticApp";
import type { WebRouteContext } from "./webRouteContext";

export class WebStaticApp {
  readonly #context: WebRouteContext;
  readonly #rsc: () => RscWorker;
  readonly #ssr: SsrStaticApp;

  constructor(context: WebRouteContext, rsc: () => RscWorker) {
    this.#context = context;
    this.#rsc = rsc;
    this.#ssr = new SsrStaticApp(context.logger);
  }

  async render({ origin, ...input }: PagePromptRenderInput): Promise<PagePromptRender> {
    const deadlineAt = Date.now() + SsrStaticApp.deadlineMs;
    const rsc = this.#rsc();
    const entry = (await rsc.listPagePrompts()).find((candidate) => candidate.name === input.name);
    if (entry?.kind !== "app" || !entry.static) return { run: await rsc.runPagePrompt(input), html: null };
    const lang = input.language ?? this.#context.artifact.i18n.defaultLocale;
    //? The route's client references load lazily in dev, so the manifest is the one its first render would ensure.
    const manifest = await this.#context.ensureRoute(
      new URL(RscPagePrompts.urlOf(entry.pattern, { ...input.arguments, lang }, {})),
    );
    const { run, drawn } = await rsc.drawPagePrompt(
      { ...input, language: lang },
      manifest.clientManifest,
      deadlineAt - Date.now(),
    );
    if (!run.ok || !drawn) return { run, html: null };
    try {
      const request = new Request(run.url, { headers: input.headers });
      const html = await this.#ssr.render(
        {
          app: input.name,
          url: run.url,
          headers: input.headers,
          lang,
          drawing: drawn,
          ssrManifest: manifest.ssrManifest,
          origin,
          stylesheetHref: this.#context.stylesheetHref(request, new URL(run.url).pathname),
        },
        deadlineAt - Date.now(),
      );
      return { run, html };
    } catch (error) {
      this.#context.logger.warn(
        `static app "${input.name}" sent no HTML: ${error instanceof Error ? (error.stack ?? error.message) : error}`,
      );
      return { run, html: null };
    }
  }
}
