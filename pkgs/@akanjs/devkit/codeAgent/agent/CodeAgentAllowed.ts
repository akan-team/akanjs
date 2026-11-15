// Kept in this process only: a resumed or reloaded session starts with nothing allowed.
export class CodeAgentAllowed {
  readonly #names = new Set<string>();
  readonly #offers = new Map<string, string[]>();

  get names() {
    return [...this.#names].sort();
  }

  missing(names: string[]) {
    return names.filter((name) => !this.#names.has(name));
  }

  offer(approvalId: string, names: string[]) {
    this.#offers.set(approvalId, names);
  }

  settle(approvalId: string, remember: boolean) {
    const names = this.#offers.get(approvalId) ?? [];
    this.#offers.delete(approvalId);
    if (!remember) return [];
    for (const name of names) this.#names.add(name);
    return names;
  }

  covered() {
    return [...this.#offers].filter(([, names]) => !this.missing(names).length).map(([approvalId]) => approvalId);
  }

  clear() {
    const count = this.#names.size;
    this.#names.clear();
    return count;
  }
}
