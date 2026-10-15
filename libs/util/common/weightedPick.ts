export const weightedPick = <T = unknown>(arr: T[], weights: number[], tWeight?: number): T | undefined => {
  if (arr.length !== weights.length) return undefined;
  const totalWeight = tWeight ?? weights.reduce((acc, weight) => acc + Math.max(0, weight), 0);
  if (!(totalWeight > 0)) return undefined;
  let sample = Math.random() * totalWeight;
  for (let idx = 0; idx < arr.length; idx += 1) {
    sample -= Math.max(0, weights[idx] ?? 0);
    if (sample < 0) return arr[idx];
  }
  //? Float rounding can leave the sample a hair above zero after the last weight; it belongs to the last item.
  const lastIdx = weights.findLastIndex((weight) => weight > 0);
  return lastIdx < 0 ? undefined : arr[lastIdx];
};
