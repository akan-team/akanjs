type Type<T = any> = new (...args: any[]) => T;
const getAllPropertyDescriptors = (objRef: Type): { [key: string]: PropertyDescriptor } => {
  const descriptors: { [key: string]: any } = {};
  let current = objRef.prototype as object | null;
  while (current) {
    Object.getOwnPropertyNames(current).forEach((name) => {
      descriptors[name] ??= Object.getOwnPropertyDescriptor(current, name);
    });
    current = Object.getPrototypeOf(current) as Type | object;
  }
  return descriptors;
};

export const applyMixins = (derivedCtor: Type, constructors: (Type | undefined)[], avoidKeys?: Set<string>) => {
  constructors.forEach((baseCtor) => {
    if (!baseCtor) return;
    Object.entries(getAllPropertyDescriptors(baseCtor)).forEach(([name, descriptor]) => {
      if (name === "constructor" || avoidKeys?.has(name)) return;
      Object.defineProperty(derivedCtor.prototype, name, { ...descriptor, configurable: true });
    });
  });
  return derivedCtor;
};
