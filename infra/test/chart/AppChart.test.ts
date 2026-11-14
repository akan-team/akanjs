import { describe, expect, it } from "bun:test";
import path from "node:path";
import { AppChart, type RenderOptions } from "./AppChart";

const helm = Bun.which("helm");
const chart = new AppChart(helm ?? "helm");

const renderCases: { name: string; render: RenderOptions }[] = [
  ...[[], ...AppChart.valueFiles.map((file) => [file])].flatMap((valueFiles) =>
    AppChart.branches.map((branch) => ({
      name: `${valueFiles.map((file) => path.basename(file)).join(" ") || "_common-values.yaml"} ${branch}`,
      render: { branch, valueFiles },
    })),
  ),
  { name: "cluster main", render: { values: { main: { database: { mode: "cluster", secretName: "db" } } } } },
];

describe.skipIf(!helm && !process.env.CI)("infra/app chart", () => {
  it("runs every branch as the bun user with no privilege escalation and no capabilities", () => {
    for (const { name, render } of renderCases) {
      const pod = AppChart.podSpec(chart.render(render));
      expect({ name, pod: pod.securityContext }).toEqual({
        name,
        pod: {
          runAsNonRoot: true,
          runAsUser: 1000,
          runAsGroup: 1000,
          fsGroup: 1000,
          fsGroupChangePolicy: "OnRootMismatch",
          seccompProfile: { type: "RuntimeDefault" },
        },
      });
      expect({ name, container: pod.containers[0]?.securityContext }).toEqual({
        name,
        container: { allowPrivilegeEscalation: false, capabilities: { drop: ["ALL"] } },
      });
    }
  });

  it("runs the pod as root again from a values file", () => {
    const pod = AppChart.podSpec(
      chart.render({
        values: { podSecurityContext: { runAsUser: 0, runAsGroup: 0, runAsNonRoot: false }, securityContext: null },
      }),
    );

    expect(pod.securityContext).toMatchObject({ runAsUser: 0, runAsGroup: 0, runAsNonRoot: false });
    expect(pod.containers[0]).not.toHaveProperty("securityContext");
  });

  it("drops both security contexts when a values file sets them to null", () => {
    const pod = AppChart.podSpec(chart.render({ values: { podSecurityContext: null, securityContext: null } }));

    expect(pod).not.toHaveProperty("securityContext");
    expect(pod.containers[0]).not.toHaveProperty("securityContext");
  });
});
