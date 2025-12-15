export const randomString = (length = 12) =>
  [
    ...new Array(Math.floor(length / 12)).fill(0).map(() => (Math.random() + 1).toString(36).slice(2, 14)),
    (Math.random() + 1).toString(36).slice(2, 2 + (length % 12)),
  ].join("");
