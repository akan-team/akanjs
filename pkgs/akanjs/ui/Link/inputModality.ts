//? What `:focus-visible` decides in a browser, kept by hand: happy-dom matches that selector on every focus, and
//? Safari never focuses a pressed link, so neither the selector nor a per-link press mark could be tested or trusted.
export class InputModality {
  //? Keyboard until the first press: a screen reader's cursor, switch access and voice control move focus with no
  //? keydown on the page.
  static #keyboard = true;
  static readonly #onKeyDown = () => {
    InputModality.#keyboard = true;
  };
  static readonly #onPointerDown = () => {
    InputModality.#keyboard = false;
  };

  //? On the document: a Tab's keydown fires on the element focus leaves, never on the link it lands on. The same
  //? listener added again is kept once, so every Link may call this.
  static watch(): void {
    document.addEventListener("keydown", InputModality.#onKeyDown, true);
    document.addEventListener("pointerdown", InputModality.#onPointerDown, true);
  }

  static usesKeyboard(): boolean {
    return InputModality.#keyboard;
  }
}
