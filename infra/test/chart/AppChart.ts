import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export interface Manifest {
  kind: string;
  metadata: { name: string; annotations?: Record<string, string> };
  spec: {
    template?: {
      spec: {
        securityContext?: Record<string, unknown>;
        containers: { name: string; securityContext?: Record<string, unknown> }[];
      };
    };
  };
}

export interface RenderOptions {
  appName?: string;
  branch?: string;
  valueFiles?: string[];
  values?: Record<string, unknown>;
}

export class AppChart {
  static readonly root = path.join(import.meta.dir, "../../app");
  static readonly valueFiles = fs
    .readdirSync(path.join(AppChart.root, "values"))
    .filter((file) => file.endsWith("-values.yaml") && !file.startsWith("_"))
    .map((file) => path.join(AppChart.root, "values", file));
  static readonly commonValues = path.join(AppChart.root, "values/_common-values.yaml");
  static readonly branches = ["debug", "develop", "main"] as const;

  readonly #helm: string;

  constructor(helm: string) {
    this.#helm = helm;
  }

  render({ appName = "myapp", branch = "main", valueFiles = [], values }: RenderOptions = {}): Manifest[] {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "akan-chart-"));
    try {
      const extra: string[] = [];
      if (values) {
        const file = path.join(dir, "values.yaml");
        fs.writeFileSync(file, JSON.stringify(values));
        extra.push(file);
      }
      const result = Bun.spawnSync([
        this.#helm,
        "template",
        "app",
        AppChart.root,
        "-n",
        `${appName}-${branch}`,
        "-f",
        AppChart.commonValues,
        ...[...valueFiles, ...extra].flatMap((file) => ["-f", file]),
        "--set",
        `appName=${appName},image.registry=registry.example,repoName=repo,serveDomain=example.com`,
      ]);
      if (result.exitCode !== 0) throw new Error(`helm template failed: ${result.stderr.toString()}`);
      return [Bun.YAML.parse(result.stdout.toString()) as Manifest | null | (Manifest | null)[]]
        .flat()
        .filter((doc): doc is Manifest => doc !== null);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  static find(manifests: Manifest[], kind: string): Manifest {
    const manifest = manifests.find((doc) => doc.kind === kind);
    if (!manifest) throw new Error(`no ${kind} rendered`);
    return manifest;
  }

  static podSpec(manifests: Manifest[]) {
    const spec = AppChart.find(manifests, "Deployment").spec.template?.spec;
    if (!spec) throw new Error("the Deployment has no pod template");
    return spec;
  }
}
