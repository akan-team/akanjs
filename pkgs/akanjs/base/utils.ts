export const getNonArrayModel = <T>(arraiedModel: T | T[]): [T, number] => {
  let arrDepth = 0;
  let target: T | T[] = arraiedModel;
  while (Array.isArray(target)) {
    target = target[0] as T;
    arrDepth++;
  }
  return [target, arrDepth];
};
export const arraiedModel = <T = unknown>(modelRef: T, arrDepth = 0) => {
  let target: T | T[] | T[][] | T[][][] = modelRef;
  for (let i = 0; i < arrDepth; i++) target = [target as T];
  return target;
};

export type ApplyFnToArrayObjectsResult<Input, Output> = Input extends readonly (infer Item)[]
  ? ApplyFnToArrayObjectsResult<Item, Output>[]
  : Output;

export const applyFnToArrayObjects = <Input, Fn extends (arg: never) => unknown>(
  arraiedData: Input,
  fn: Fn,
): ApplyFnToArrayObjectsResult<Input, ReturnType<Fn>> => {
  type Result = ApplyFnToArrayObjectsResult<Input, ReturnType<Fn>>;
  if (Array.isArray(arraiedData)) return arraiedData.map((data) => applyFnToArrayObjects(data, fn)) as Result;
  return fn(arraiedData as never) as Result;
};

//? Bun's code splitting orders one chunk before another only where a name it imports is used; this call is such a use.
export const loadedAfter = (..._modules: unknown[]): void => {};
