// Runs a command in the Linux build and test container (scripts/vm/linux.Dockerfile) on a copy of
// this repository (docs/testing-windows-linux.md):
//
//   bun scripts/vm/linux.ts bun run akan-native test linux --app examples/sample
//   bun scripts/vm/linux.ts --shell            an interactive shell in the container
//   AKAN_NATIVE_LINUX_WORK=tray bun scripts/vm/linux.ts …   a separate copy (parallel runs must not share one)
//   AKAN_NATIVE_LINUX_SRC=<dir> …               copy that tree instead of this package (the akanjs monorepo)
//
// The repository is mounted read-only and copied into a volume with rsync (without node_modules,
// target, .akan and dist, which the container keeps its own of), so builds never write Linux files
// into the Mac's tree. Cargo's registry, rustup's toolchains and ~/.akan/native are volumes too, so a
// second run is incremental. Commands run under a virtual X display (Xvfb) and a D-Bus session
// with an unlocked gnome-keyring, like a desktop session.

import { resolve } from "node:path";

// rsync --delete onto the copy: another tree synced into this package's volume would replace it.
if (process.env.AKAN_NATIVE_LINUX_SRC && !process.env.AKAN_NATIVE_LINUX_WORK)
  throw new Error("AKAN_NATIVE_LINUX_SRC copies another tree: name its copy with AKAN_NATIVE_LINUX_WORK");
const REPO = resolve(process.env.AKAN_NATIVE_LINUX_SRC ?? resolve(import.meta.dir, "../.."));
const IMAGE = "akan-native-linux:latest";
const HOME = "/home/akan-native";
const WORK = process.env.AKAN_NATIVE_LINUX_WORK
  ? `akan-native-linux-work-${process.env.AKAN_NATIVE_LINUX_WORK.replace(/[^a-z0-9-]/gi, "")}`
  : "akan-native-linux-work";

function sh(cmd: string[], inherit = true): number {
  return Bun.spawnSync(cmd, { stdio: inherit ? ["inherit", "inherit", "inherit"] : ["ignore", "pipe", "pipe"] })
    .exitCode;
}

// The image is labelled with its Dockerfile's hash and built again when the Dockerfile changed.
const DOCKERFILE = resolve(import.meta.dir, "linux.Dockerfile");
const hash = new Bun.CryptoHasher("sha256")
  .update(await Bun.file(DOCKERFILE).text())
  .digest("hex")
  .slice(0, 16);
const built = Bun.spawnSync(
  ["docker", "image", "inspect", "-f", '{{index .Config.Labels "akan-native.dockerfile"}}', IMAGE],
  { stdout: "pipe", stderr: "ignore" },
);
if (built.exitCode !== 0 || built.stdout.toString().trim() !== hash) {
  console.error(`building ${IMAGE} (a few minutes, once per Dockerfile change)`);
  if (
    sh([
      "docker",
      "build",
      "--label",
      `akan-native.dockerfile=${hash}`,
      "-f",
      DOCKERFILE,
      "-t",
      IMAGE,
      import.meta.dir,
    ]) !== 0
  )
    process.exit(1);
}

const args = process.argv.slice(2);
const interactive = args[0] === "--shell";
const command = interactive ? "bash" : args.map((a) => `'${a.replace(/'/g, `'\\''`)}'`).join(" ") || "true";

// The desktop session: a D-Bus session bus, gnome-keyring's Secret Service unlocked with an empty
// password (the login keyring of a desktop session), and an X server on :99. The password is read
// as a line: without the newline gnome-keyring creates no login keyring, so there is no "default"
// collection and storing a secret waits for a password prompt that never comes (checked).
const session = `
set -e
rsync -a --delete --exclude node_modules --exclude target --exclude .akan --exclude dist --exclude .git --exclude .claude --exclude local /src/ ${HOME}/work/akan-native/
cd ${HOME}/work/akan-native
[ -d node_modules ] || bun install --silent >/dev/null
export DISPLAY=:99 NO_AT_BRIDGE=1
Xvfb :99 -screen 0 1440x900x24 -nolisten tcp >/dev/null 2>&1 &
eval "$(dbus-launch --sh-syntax)"
printf '\\n' | gnome-keyring-daemon --unlock --components=secrets >/dev/null 2>&1 || true
# A stand-in browser (does nothing), so URL handler lookups answer as on a desktop with one.
mkdir -p ~/.local/share/applications ~/.config
printf '[Desktop Entry]\\nType=Application\\nName=Test browser\\nExec=true %%u\\nNoDisplay=true\\nMimeType=x-scheme-handler/http;x-scheme-handler/https;\\n' > ~/.local/share/applications/akan-native-test-browser.desktop
printf '[Default Applications]\\nx-scheme-handler/http=akan-native-test-browser.desktop;\\nx-scheme-handler/https=akan-native-test-browser.desktop;\\n' > ~/.config/mimeapps.list
${command}
`;

const docker = [
  "docker",
  "run",
  "--rm",
  interactive ? "-it" : "-i",
  // An init as PID 1 reaps orphaned processes, as on a desktop: without it an app that exited stays
  // a zombie, and the updater's relaunch (which waits for the old process) never goes on.
  "--init",
  "--shm-size=1g",
  "-v",
  `${REPO}:/src:ro`,
  "-v",
  `${WORK}:${HOME}/work`,
  "-v",
  `akan-native-linux-cargo:${HOME}/.cargo/registry`,
  "-v",
  `akan-native-linux-rustup:${HOME}/.rustup`,
  "-v",
  `akan-native-linux-akan-native:${HOME}/.akan/native`,
  IMAGE,
  "bash",
  "-c",
  session,
];
process.exit(sh(docker));
