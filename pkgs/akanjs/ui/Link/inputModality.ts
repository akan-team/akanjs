//? What `:focus-visible` decides in a browser, kept by hand: happy-dom matches that selector on every focus, and
//? Safari never focuses a pressed link, so neither the selector nor a per-link press mark could be tested or trusted.
export class InputModality {
  static #keyboard = false;
  static #watching = false;

  static watch(): void {
    if (InputModality.#watching) return;
    InputModality.#watching = true;
    //? On the document: a Tab's keydown fires on the element focus leaves, never on the link it lands on.
    document.addEventListener(
      "keydown",
      () => {
        InputModality.#keyboard = true;
      },
      true,
    );
    document.addEventListener(
      "pointerdown",
      () => {
        InputModality.#keyboard = false;
      },
      true,
    );
  }

  static usesKeyboard(): boolean {
    return InputModality.#keyboard;
  }
}
