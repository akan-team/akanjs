import path from "node:path";
import type { RouteRuntimeCause } from "../transforms/routeRuntimePlan";

export interface RouteRuntimeBuildReport {
  app: string;
  routes: number;
  perModule: string[];
  //? Routes the analysis could load per module, kept whole because the build measured them no smaller that way.
  notSmaller: string[];
  //? Routes no smaller per module than where every page keeps the whole runtime, which came out larger still when the
  //? build kept it for them among this app's other pages: they load per module.
  refused?: string[];
  causes: RouteRuntimeCause[];
}

const count = (items: readonly unknown[], one: string, many = `${one}s`) =>
  `${items.length} ${items.length === 1 ? one : many}`;

export class RouteRuntimeReport {
  static readonly file = ".akan/generated/route-runtime.json";
  static readonly shown = 6;

  static summary({ perModule, notSmaller, routes }: RouteRuntimeBuildReport): string {
    const named = routes - perModule.length - notSmaller.length;
    const verb = (many: number, word: string) => (many === 1 ? `${word}s` : word);
    return [
      `${count(perModule, "route")} ${verb(perModule.length, "load")} per module`,
      `${notSmaller.length} ${verb(notSmaller.length, "keep")} the whole runtime because per module would not be smaller`,
      ...(named > 0 ? [`${named} ${verb(named, "keep")} it for a reason \`akan quality runtime\` names`] : []),
    ].join(", ");
  }

  static format(reports: readonly RouteRuntimeBuildReport[]): string {
    return reports
      .map((report) =>
        [
          `Last build of apps/${report.app} under clientRuntime: "route": ${RouteRuntimeReport.summary(report)}.`,
          ...report.causes.flatMap((cause) => RouteRuntimeReport.#causeLines(cause)),
          ...RouteRuntimeReport.#refusedLines(report.refused ?? []),
        ].join("\n"),
      )
      .join("\n\n");
  }

  static #causeLines({ rule, file, line, message, entries, routes, chains }: RouteRuntimeCause): string[] {
    const where = file ? `${file}${line ? `:${line}` : ""} ` : "";
    const listed = routes.slice(0, RouteRuntimeReport.shown).join(", ");
    const more =
      routes.length > RouteRuntimeReport.shown ? `, and ${routes.length - RouteRuntimeReport.shown} more` : "";
    return [
      `  [${rule}] ${where}${message}`,
      `    ${count(entries, "entry", "entries")} on ${count(routes, "route")}${routes.length ? `: ${listed}${more}` : ""}`,
      ...chains.map((chain) => `    reached as ${RouteRuntimeReport.#chain(chain)}`),
    ];
  }

  static #refusedLines(routes: readonly string[]): string[] {
    if (routes.length === 0) return [];
    const more =
      routes.length > RouteRuntimeReport.shown ? `, and ${routes.length - RouteRuntimeReport.shown} more` : "";
    return [
      `  ${count(routes, "route")} measured no smaller per module than where every page keeps the whole runtime, and larger still keeping it here, so ${routes.length === 1 ? "it loads" : "they load"} per module: ${routes.slice(0, RouteRuntimeReport.shown).join(", ")}${more}`,
    ];
  }

  static #chain(chain: readonly string[]) {
    return chain.length > 6
      ? `${chain.slice(0, 2).join(" → ")} → … → ${chain.slice(-3).join(" → ")}`
      : chain.join(" → ");
  }

  static async write(appDir: string, report: RouteRuntimeBuildReport) {
    await Bun.write(path.join(appDir, RouteRuntimeReport.file), `${JSON.stringify(report, null, 1)}\n`);
  }

  static async read(workspaceRoot: string): Promise<RouteRuntimeBuildReport[]> {
    const files = [...new Bun.Glob(`apps/*/${RouteRuntimeReport.file}`).scanSync({ cwd: workspaceRoot, dot: true })];
    const reports = await Promise.all(
      files.sort().map((file) =>
        Bun.file(path.join(workspaceRoot, file))
          .json()
          .catch(() => null),
      ),
    );
    return reports.filter((report): report is RouteRuntimeBuildReport => !!report && Array.isArray(report.causes));
  }
}
