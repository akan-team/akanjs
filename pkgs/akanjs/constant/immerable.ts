//? immer's `immerable` is this registry symbol, so a constant marks itself draftable without loading immer.
export const immerable: unique symbol = Symbol.for("immer-draftable");
