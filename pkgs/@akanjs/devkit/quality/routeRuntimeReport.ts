import path from "node:path";
import type { RouteRuntimeCause } from "../transforms/routeRuntimePlan";

export interface RouteRuntimeBuildReport {
  app: string;
  routes: number;
  perModule: string[];
  //? Routes the analysis could load per module, kept whole because the build measured them no smaller that way.
  notSmaller: string[];
  causes: RouteRuntimeCause[];
}

const count = (items: readonly unknown[], one: string, many = `${one}s`) =>
  `${items.length} ${items.length === 1 ? one : many}`;

//* What the last `clientRuntime: "route"` build of an app decided, kept beside its generated entries: which routes load
//* per module, and for every entry keeping the whole runtime the file or the rule that makes it.
export class RouteRuntimeReport {
  static readonly file = ".akan/generated/route-runtime.json";
  static readonly shown = 6;

  static summary({ perModule, notSmaller, routes }: RouteRuntimeBuildReport): string {
    const named = routes - perModule.length - notSmaller.length;
    return [
      `${count(perModule, "route")} load per module`,
      `${notSmaller.length} keep the whole runtime because per module would not be smaller`,
      ...(named > 0 ? [`${named} keep it for a reason \`akan quality runtime\` names`] : []),
    ].join(", ");
  }

  static format(reports: readonly RouteRuntimeBuildReport[]): string {
    return reports
      .map((report) =>
        [
          `Last build of apps/${report.app} under clientRuntime: "route": ${RouteRuntimeReport.summary(report)}.`,
          ...report.causes.flatMap((cause) => RouteRuntimeReport.#causeLines(cause)),
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
