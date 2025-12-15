export const weightedPick = <T = unknown>(arr: T[], weights: number[], tWeight?: number) => {
  if (arr.length !== weights.length) throw new Error("Array and Weight Length should be equal");
  const totalWeight = tWeight ?? weights.reduce((acc, w) => acc + w, 0);
  let sample = Math.random() * totalWeight;
  const idx = weights.findIndex((w) => (sample -= w) < 0);
  return arr[idx];
};
