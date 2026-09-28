/**
 * Whether what a subtree registered is published right now. A gate under another is active only while the one
 * above it is, so a panel parked inside a page closes with the page.
 */
export class AgentGate {
  #active: boolean;
  readonly #onChange: () => void;
  readonly #parent: AgentGate | null;

  constructor(active: boolean, onChange: () => void, parent: AgentGate | null = null) {
    this.#active = active;
    this.#onChange = onChange;
    this.#parent = parent;
  }

  get active(): boolean {
    return this.#active && (this.#parent?.active ?? true);
  }

  set(active: boolean) {
    if (this.#active === active) return;
    this.#active = active;
    this.#onChange();
  }
}
