export const VIEW_TRANSITION_REVEAL_CAP_MS = 1000;

// Flight applies the tee's last chunk on a microtask, so the macrotask lets it land before the snapshot.
export function waitForReveal(
  revealed: Promise<void> | undefined,
  capMs = VIEW_TRANSITION_REVEAL_CAP_MS,
): Promise<void> {
  if (!revealed) return Promise.resolve();
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(capTimer);
      resolve();
    };
    const capTimer = setTimeout(finish, capMs);
    void revealed.then(() => setTimeout(finish, 0));
  });
}
