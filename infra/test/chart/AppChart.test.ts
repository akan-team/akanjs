import { describe, expect, it } from "bun:test";
import path from "node:path";
import { ServerLimits } from "akanjs/server/routing/serverLimits";
import { AppChart, type RenderOptions } from "./AppChart";

const helm = Bun.which("helm");
const chart = new AppChart(helm ?? "helm");

const clusterValues = (storage?: { sharedClaim: string }) => ({
  main: { database: { mode: "cluster", secretName: "db" }, ...(storage ? { storage } : {}) },
});

const renderCases: { name: string; render: RenderOptions }[] = [
  ...[[], ...AppChart.valueFiles.map((file) => [file])].flatMap((valueFiles) =>
    AppChart.branches.map((branch) => ({
      name: `${valueFiles.map((file) => path.basename(file)).join(" ") || "_common-values.yaml"} ${branch}`,
      render: { branch, valueFiles },
    })),
  ),
  { name: "cluster main", render: { values: clusterValues() } },
];
const volumePermissions = (uid: number, gid: number) => ({
  name: "volume-permissions",
  command: ["sh", "-c", `find /data \\( ! -user ${uid} -o ! -group ${gid} \\) -exec chown -h ${uid}:${gid} {} +`],
  securityContext: {
    runAsUser: 0,
    runAsNonRoot: false,
    allowPrivilegeEscalation: false,
    capabilities: { drop: ["ALL"], add: ["CHOWN", "FOWNER", "DAC_READ_SEARCH"] },
  },
  volumeMounts: [{ name: "sqlite-data", mountPath: "/data" }],
});

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

  it("hands a single-mode claim to the pod's uid from a root init container with only the capabilities it needs", () => {
    for (const { name, render } of renderCases.filter(({ render }) => !render.values)) {
      const pod = AppChart.podSpec(chart.render(render));
      expect({ name, init: pod.initContainers }).toEqual({
        name,
        init: [{ ...volumePermissions(1000, 1000), image: pod.containers[0]?.image, imagePullPolicy: "Always" }],
      });
    }
    const pod = AppChart.podSpec(
      chart.render({ values: { podSecurityContext: { runAsUser: 1001, runAsGroup: 1002 } } }),
    );
    expect(pod.initContainers?.[0]?.command).toEqual(volumePermissions(1001, 1002).command);
  });

  it("runs no init container in cluster mode, on a shared claim, or with volumePermissions off", () => {
    for (const values of [
      clusterValues(),
      clusterValues({ sharedClaim: "uploads" }),
      { volumePermissions: { enabled: false } },
    ])
      expect(AppChart.podSpec(chart.render({ values }))).not.toHaveProperty("initContainers");
  });

  it("runs the pod as root again from a values file", () => {
    const pod = AppChart.podSpec(
      chart.render({
        values: {
          podSecurityContext: { runAsUser: 0, runAsGroup: 0, runAsNonRoot: false },
          securityContext: { capabilities: null },
          volumePermissions: { enabled: false },
        },
      }),
    );

    expect(pod.securityContext).toMatchObject({ runAsUser: 0, runAsGroup: 0, runAsNonRoot: false });
    expect(pod.containers[0]?.securityContext).toEqual({ allowPrivilegeEscalation: false });
    expect(pod).not.toHaveProperty("initContainers");
  });

  it("renders the hardened defaults when the values predate them, as `helm upgrade --reuse-values` does, or null them", () => {
    const copy = AppChart.copyWithoutDefaults();
    const fresh = chart.render();
    try {
      for (const chartRoot of [copy.root, AppChart.root])
        for (const values of [{}, { podSecurityContext: null, securityContext: null, ingress: null }]) {
          const rendered = chart.render({ chartRoot, values });
          expect(AppChart.podSpec(rendered)).toEqual(AppChart.podSpec(fresh));
          expect(AppChart.find(rendered, "Ingress").metadata).toEqual(AppChart.find(fresh, "Ingress").metadata);
        }
    } finally {
      copy.remove();
    }
  });

  it("caps an ingress body at the largest body the server accepts, and leaves CORS to the app", () => {
    const uploadMiB = ServerLimits.defaultUploadBodyBytes / 1024 / 1024;
    expect(Number.isInteger(uploadMiB)).toBe(true);
    expect(ServerLimits.defaultUploadBodyBytes).toBeGreaterThanOrEqual(ServerLimits.defaultRequestBodyBytes);

    for (const { name, render } of renderCases) {
      const annotations = AppChart.find(chart.render(render), "Ingress").metadata.annotations ?? {};
      expect({ name, bodySize: annotations["nginx.ingress.kubernetes.io/proxy-body-size"] }).toEqual({
        name,
        bodySize: `${uploadMiB}m`,
      });
      expect({ name, cors: Object.keys(annotations).filter((key) => key.includes("cors")) }).toEqual({
        name,
        cors: [],
      });
    }
  });

  it("brings back the unlimited body and the ingress CORS answer from a values file", () => {
    const { annotations = {} } = AppChart.find(
      chart.render({ values: { ingress: { proxyBodySize: "0", cors: { enabled: true } } } }),
      "Ingress",
    ).metadata;

    expect(annotations["nginx.ingress.kubernetes.io/proxy-body-size"]).toBe("0");
    expect(annotations["nginx.ingress.kubernetes.io/enable-cors"]).toBe("true");
    expect(annotations["nginx.ingress.kubernetes.io/cors-allow-headers"]).toContain("Authorization");
  });
});
