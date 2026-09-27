// The sample's own SPA build. akan-native does not care which bundler produced dist/,
// only that dist/index.html has its JS inlined (IN-1).
import { cpSync, existsSync, rmSync, writeFileSync } from "node:fs";

//? The repo ignores every .env, so a fresh clone has none; the self-test needs one (ENV-6: .env over the config's
//? defaults, and a non-PUBLIC key that must not reach the page). akan-native reads the .env files after this build.
if (!existsSync(".env"))
  writeFileSync(
    ".env",
    ["PUBLIC_GREETING=Hello from .env", "PUBLIC_API_URL=http://localhost:8080", "SAMPLE_SECRET=sample-only", ""].join(
      "\n",
    ),
  );

const mode = process.env.AKAN_NATIVE_MODE ?? "production";
// The build profile (akan-native build: release, akan-native run / dev / test: debug), not the env mode:
// `akan-native build --mode staging` is still minified.
const release = (process.env.AKAN_NATIVE_PROFILE ?? (mode === "production" ? "release" : "debug")) === "release";
rmSync("dist", { recursive: true, force: true });

const result = await Bun.build({
  entrypoints: ["./index.html"],
  outdir: "dist",
  target: "browser",
  // Single-file HTML: Bun inlines scripts, styles and CSS assets into index.html.
  compile: true,
  minify: release,
  define: {
    // Build-time constants, fixed in the bundle (unlike the runtime env from @akanjs/native/core).
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    __BUILD_MODE__: JSON.stringify(mode),
    "process.env.NODE_ENV": JSON.stringify(release ? "production" : "development"),
  },
} as Parameters<typeof Bun.build>[0]);

if (!result.success) {
  for (const message of result.logs) console.error(message);
  process.exit(1);
}
cpSync("public", "dist", { recursive: true });
console.info(
  `sample: dist/index.html (${(Bun.file("dist/index.html").size / 1024).toFixed(1)} KiB, ${mode}, ${release ? "release" : "debug"})`,
);
