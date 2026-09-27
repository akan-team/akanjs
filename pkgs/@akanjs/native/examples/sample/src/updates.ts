// Web bundle updates in the sample (UP-2). Normally this only confirms a new bundle once the app
// has rendered (markReady). With PUBLIC_UPDATE_PROBE (a dev-build runtime env, set by the update
// check script) it also downloads and applies the published release and logs each step, so an
// update and its rollback can be checked end to end:
//   "apply"    check → download → apply; the new bundle (on trial) logs its mark and confirms
//   "no-ready" the same, but the new bundle never confirms: the shell rolls it back to the
//              previous one, which then logs "rolled-back <bundle>"
import { env } from "@akanjs/native/core";
import { markReady, updates } from "@akanjs/native/plugins/updates";

const log = (message: string) => console.info(`AKAN_NATIVE_UPDATE_PROBE ${message}`);

export async function startUpdates(): Promise<void> {
  const probe = env.PUBLIC_UPDATE_PROBE;
  if (!probe || !updates.isSupported("getState")) return markReady();
  const state = await updates.getState();
  const running = state.bundle ?? "embedded";
  if (state.rolledBack) {
    log(`rolled-back ${state.rolledBack} running ${running}`);
    return markReady();
  }
  if (state.trial) {
    log(`running ${running} trial=true mark=${env.PUBLIC_UPDATE_MARK ?? "-"}`);
    if (probe === "no-ready") return; // never confirms: the shell rolls it back after updates.readyTimeout
    await markReady();
    const after = await updates.getState();
    log(`confirmed ${after.bundle} trial=${after.trial}`);
    return;
  }
  log(`start ${running} mark=${env.PUBLIC_UPDATE_MARK ?? "-"}`);
  const check = await updates.check();
  log(`check ${JSON.stringify(check)}`);
  if (!check.available) return markReady();
  const { bundle } = await updates.download();
  log(`downloaded ${bundle}`);
  await updates.apply(); // the page reloads into the new bundle, on trial
}
