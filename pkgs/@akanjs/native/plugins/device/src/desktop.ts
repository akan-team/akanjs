// Desktop: system files and command-line tools, spawned asynchronously so the Worker keeps
// serving other calls, and the shell for what only native code can read.
// - macOS: absolute tool paths, because an app started from the Finder gets launchd's minimal PATH.
// - Windows: the shell's device.info (the BIOS vendor and product in the registry), device.language
//   (GetUserPreferredUILanguages, as sys-locale does for tauri-plugins-workspace/plugins/os),
//   device.battery (GetSystemPowerStatus) and webview.version (the WebView2 runtime); the OS
//   version is RtlGetVersion's, which node:os release() reports. native/desktop/src/win/device.rs.
// - Linux: /sys/class/dmi/id (or the device tree on ARM boards), /sys/class/power_supply, the
//   locale variables, the kernel release; webview.version is the WebKitGTK version.
import { randomUUID } from "node:crypto";
import { existsSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { release } from "node:os";
import { join } from "node:path";
import type { Platform } from "../../../packages/core/src/index.ts";
import { AkanNativeError } from "../../../packages/core/src/index.ts";
import { type DesktopContext, defineDesktopPlugin } from "../../../packages/desktop/src/plugin.ts";
import type { BatteryInfo, DeviceApi, DeviceInfo } from "./index.ts";

async function run(cmd: string[]): Promise<string> {
  try {
    const proc = Bun.spawn(cmd, { stdout: "pipe", stderr: "ignore" });
    const [out, code] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
    return code === 0 ? out : "";
  } catch {
    return ""; // tool missing
  }
}

function readText(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

/** A <string> value from an XML property list (SystemVersion.plist and Safari's Info.plist are XML). */
export function plistString(xml: string, key: string): string | null {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return xml.match(new RegExp(`<key>${escaped}</key>\\s*<string>([^<]*)</string>`))?.[1] ?? null;
}

/**
 * `pmset -g batt`, e.g.
 *   Now drawing from 'AC Power'
 *    -InternalBattery-0 (id=22806627)	100%; charged; 0:00 remaining present: true
 * Desktop Macs print only the first line (a UPS may add its own line, which is not the Mac's battery).
 */
export function parsePmset(out: string): BatteryInfo {
  const line = out.split("\n").find((l) => l.includes("InternalBattery"));
  const percent = line?.match(/(\d+)%/)?.[1];
  if (!line || percent === undefined || /present: false/.test(line)) return { level: null, charging: null };
  return { level: Math.min(100, Number(percent)) / 100, charging: /'AC Power'/.test(out) };
}

/** The first entry of `defaults read -g AppleLanguages`: ( "en-KR", en, ... ). */
export function parseAppleLanguages(out: string): string | null {
  const first = out
    .replace(/^[\s(]+/, "")
    .split(/[,\n)]/)[0]
    ?.trim()
    .replace(/^"|"$/g, "");
  return first ? first.replace(/_/g, "-") : null;
}

/** One entry of /sys/class/power_supply: the attribute files it has (sysfs-class-power ABI). */
export type PowerSupply = Partial<
  Record<
    "type" | "scope" | "status" | "capacity" | "online" | "energy_now" | "energy_full" | "charge_now" | "charge_full",
    string
  >
>;

/**
 * The system's batteries (type Battery; scope Device is a mouse or headset) as one reading: the
 * summed energy (or charge) where every battery reports it, else the mean capacity. Connected to
 * power: a mains or USB supply online, else the batteries' status ("Not charging" is a full or
 * held battery on AC, as macOS's "AC attached").
 */
export function parsePowerSupplies(supplies: PowerSupply[]): BatteryInfo {
  const batteries = supplies.filter((s) => s.type === "Battery" && s.scope !== "Device");
  if (batteries.length === 0) return { level: null, charging: null };
  const num = (v: string | undefined) => (v === undefined || v.trim() === "" ? NaN : Number(v));
  const ratio = (now: "energy_now" | "charge_now", full: "energy_full" | "charge_full") => {
    const pairs = batteries.map((b) => [num(b[now]), num(b[full])] as const);
    if (!pairs.every(([n, f]) => Number.isFinite(n) && f > 0)) return null;
    return pairs.reduce((sum, [n]) => sum + n, 0) / pairs.reduce((sum, [, f]) => sum + f, 0);
  };
  const capacities = batteries.map((b) => num(b.capacity)).filter(Number.isFinite);
  const level =
    ratio("energy_now", "energy_full") ??
    ratio("charge_now", "charge_full") ??
    (capacities.length ? capacities.reduce((a, b) => a + b, 0) / capacities.length / 100 : null);
  const external = supplies.filter((s) => s.type !== "Battery" && s.scope !== "Device" && s.online !== undefined);
  const statuses = batteries.map((b) => b.status?.trim());
  const charging = external.length
    ? external.some((s) => s.online!.trim() === "1")
    : statuses.some((s) => s === "Charging" || s === "Full" || s === "Not charging")
      ? true
      : statuses.includes("Discharging")
        ? false
        : null;
  return { level: level === null ? null : Math.min(1, Math.max(0, level)), charging };
}

const SUPPLY_FILES = [
  "type",
  "scope",
  "status",
  "capacity",
  "online",
  "energy_now",
  "energy_full",
  "charge_now",
  "charge_full",
] as const;

function readPowerSupplies(dir: string): PowerSupply[] {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  return names.map((name) => {
    const supply: PowerSupply = {};
    for (const file of SUPPLY_FILES) {
      const value = readText(join(dir, name, file));
      if (value) supply[file] = value.trim();
    }
    return supply;
  });
}

/**
 * The user's language from the POSIX locale variables, in gettext's order for messages:
 * LANGUAGE (a list), LC_ALL, LC_MESSAGES, LANG. "ko_KR.UTF-8" → "ko-KR", "sr_RS@latin" →
 * "sr-Latn-RS"; C and POSIX are no language.
 */
export function posixLanguage(env: Record<string, string | undefined>): string | null {
  const candidates = [...(env.LANGUAGE ?? "").split(":"), env.LC_ALL, env.LC_MESSAGES, env.LANG];
  for (const value of candidates) {
    const m = value?.trim().match(/^([A-Za-z]{2,3})(?:_([A-Za-z]{2}|\d{3}))?(?:\.[^@]*)?(?:@(\w+))?$/);
    if (!m || /^(c|posix)$/i.test(m[1]!)) continue;
    const script = { latin: "Latn", cyrillic: "Cyrl" }[m[3]?.toLowerCase() ?? ""];
    return [m[1]!.toLowerCase(), script, m[2]?.toUpperCase()].filter(Boolean).join("-");
  }
  return null;
}

/** Vendor and product names of hypervisors in DMI/SMBIOS (QEMU, KVM, VMware, VirtualBox, Hyper-V, Parallels, Xen, Apple's Virtualization framework). */
export function isVirtualMachine(manufacturer: string, model: string): boolean {
  return /qemu|kvm|vmware|virtualbox|innotek|parallels|xen|bochs|bhyve|virtual machine|apple virtualization/i.test(
    `${manufacturer} ${model}`,
  );
}

/** Firmware placeholders that name no product. */
const PLACEHOLDER =
  /^(to be filled by o\.?e\.?m\.?|system (product name|manufacturer)|default string|not specified|not applicable|none|o\.?e\.?m\.?|)$/i;
const named = (value: string | null | undefined) => {
  const v = value?.replace(/\0/g, "").trim();
  return v && !PLACEHOLDER.test(v) ? v : null;
};

async function webViewVersion(ctx: DesktopContext): Promise<string | null> {
  try {
    return ((await ctx.shell("webview.version")) as { version: string | null }).version ?? null;
  } catch {
    return null; // a shell without the op
  }
}

/** `platform` and `root` (prefix of /sys, /proc) are replaceable so tests can read a fake Linux on any OS. */
export function createDesktopDevice(
  platform: NodeJS.Platform = process.platform,
  root = "/",
  env: Record<string, string | undefined> = process.env,
) {
  const mac = platform === "darwin";
  const akanNativePlatform: Platform = mac ? "macos" : platform === "win32" ? "windows" : "linux";
  const sys = (path: string) => join(root, path);

  const readInfo = async (ctx: DesktopContext): Promise<DeviceInfo> => {
    if (platform === "win32") {
      const hw = (await ctx.shell("device.info")) as { manufacturer: string | null; model: string | null };
      const manufacturer = named(hw.manufacturer) ?? "unknown";
      const model = named(hw.model) ?? "unknown";
      return {
        platform: "windows",
        model,
        manufacturer,
        osName: "Windows",
        osVersion: release(),
        isVirtual: isVirtualMachine(manufacturer, model),
        webViewVersion: await webViewVersion(ctx),
      };
    }
    if (!mac) {
      // DMI on PCs and most ARM64 servers; ARM boards without firmware tables name themselves in the device tree.
      const manufacturer = named(readText(sys("sys/class/dmi/id/sys_vendor"))) ?? "unknown";
      const model =
        named(readText(sys("sys/class/dmi/id/product_name"))) ??
        named(readText(sys("proc/device-tree/model"))) ??
        "unknown";
      // x86 guests have the hypervisor CPU flag; Xen guests /sys/hypervisor.
      const flagged =
        /^flags\s*:.*\bhypervisor\b/m.test(readText(sys("proc/cpuinfo"))) ||
        readText(sys("sys/hypervisor/type")).trim() !== "";
      return {
        platform: akanNativePlatform,
        model,
        manufacturer,
        osName: "Linux",
        osVersion: release(),
        isVirtual: flagged || isVirtualMachine(manufacturer, model),
        webViewVersion: await webViewVersion(ctx),
      };
    }
    // hw.model is the model identifier ("Mac16,7"); kern.hv_vmm_present is 1 inside a virtual machine.
    const [model = "", vmm = ""] = (await run(["/usr/sbin/sysctl", "-n", "hw.model", "kern.hv_vmm_present"])).split(
      "\n",
    );
    // The file sw_vers reads; plain XML, so no process is needed.
    const osVersion = plistString(readText("/System/Library/CoreServices/SystemVersion.plist"), "ProductVersion") ?? "";
    // WKWebView is the system WebKit, which Safari updates install; Safari's version names it.
    const safari = plistString(readText("/Applications/Safari.app/Contents/Info.plist"), "CFBundleShortVersionString");
    return {
      platform: "macos",
      model: model.trim() || "Mac",
      manufacturer: "Apple",
      osName: "macOS",
      osVersion,
      isVirtual: vmm.trim() === "1",
      webViewVersion: safari,
    };
  };

  let info: Promise<DeviceInfo> | null = null;

  return defineDesktopPlugin<DeviceApi>({
    id: "device",
    methods: {
      getInfo(_args, ctx) {
        info ??= readInfo(ctx).catch((error) => {
          info = null;
          throw error;
        });
        return info;
      },
      getId(_args, ctx) {
        // A random id kept with the app data: per install, like identifierForVendor, not a hardware id.
        const file = join(ctx.appDataDir, "device-id");
        if (existsSync(file)) {
          const stored = readText(file).trim();
          if (stored) return { identifier: stored };
        }
        const identifier = randomUUID();
        writeFileSync(`${file}.tmp`, identifier);
        renameSync(`${file}.tmp`, file);
        return { identifier };
      },
      async getLanguage(_args, ctx) {
        // The WebView and Bun's Intl follow the app bundle's localizations and LANG, not the user's list.
        const tag =
          (mac
            ? parseAppleLanguages(await run(["/usr/bin/defaults", "read", "-g", "AppleLanguages"]))
            : platform === "win32"
              ? ((await ctx.shell("device.language")) as { tag: string | null }).tag
              : posixLanguage(env)) ?? Intl.DateTimeFormat().resolvedOptions().locale;
        return { tag, code: tag.split("-")[0]!.toLowerCase() };
      },
      async getBattery(_args, ctx) {
        if (mac) return parsePmset(await run(["/usr/bin/pmset", "-g", "batt"]));
        if (platform === "win32") return (await ctx.shell("device.battery")) as BatteryInfo;
        if (platform === "linux") return parsePowerSupplies(readPowerSupplies(sys("sys/class/power_supply")));
        throw new AkanNativeError("UNSUPPORTED", `device.getBattery() is not implemented on ${platform}`);
      },
    },
  });
}

export default createDesktopDevice();
