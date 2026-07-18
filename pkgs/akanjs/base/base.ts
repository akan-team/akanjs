import type { CLIENT_VALUE, Cls, DEFAULT_VALUE, PURIFIED_VALUE, SERVER_VALUE } from ".";
import { Float, Int } from "./primitiveRegistry";

class EnumPrototype {}
export type EnumInstance<RefName extends string = string, T = string | number> = Cls<
  { refName: RefName; value: T },
  {
    refName: RefName;
    [SERVER_VALUE]: T;
    [CLIENT_VALUE]: T;
    [DEFAULT_VALUE]: T;
    [PURIFIED_VALUE]: T;
    type: StringConstructor | typeof Int | typeof Float;
    values: readonly T[];
    valueMap: Map<T, number>;
    has: (value: T) => boolean;
    indexOf: (value: T) => number;
    find: (callback: (value: T, index: number, array: readonly T[]) => boolean) => T;
    findIndex: (callback: (value: T, index: number, array: readonly T[]) => boolean) => number;
    filter: (callback: (value: T, index: number, array: readonly T[]) => boolean) => T[];
    map: <R>(callback: (value: T, index: number, array: readonly T[]) => R) => R[];
    forEach: (callback: (value: T, index: number, array: readonly T[]) => void) => void;
  }
>;

/** Returns true when a class was created by `enumOf`. */
export const isEnum = (enumRef: Cls) => Object.getPrototypeOf(Object.getPrototypeOf(enumRef) ?? {}) === EnumPrototype;

/** Creates a typed scalar enum class from a readonly list of string or number values. */
export const enumOf = <RefName extends string, T = string | number>(
  refName: RefName,
  values: readonly T[],
): EnumInstance<RefName, T> => {
  const valueMap = new Map(values.map((value, idx) => [value, idx] as [T, number]));
  const firstValue = values.at(0) as string | number | undefined;
  if (firstValue === undefined) throw new Error("Enum values are empty");
  const type =
    typeof firstValue === "string"
      ? String
      : (values as readonly number[]).every((value: number) => value % 1 === 0)
        ? Int
        : Float;
  class Enum extends EnumPrototype {
    static readonly values = values;
    static readonly valueMap = valueMap;
    static readonly type = type;
    static has(value: T): boolean {
      return Enum.valueMap.has(value);
    }
    static indexOf(value: T): number {
      const idx = Enum.valueMap.get(value);
      if (idx === undefined) throw new Error(`Value ${value} is not in enum`);
      return idx;
    }
    static find(callback: (value: T, index: number, array: readonly T[]) => boolean): T {
      const val = Enum.values.find(callback);
      if (val === undefined) throw new Error(`Value not found in enum`);
      return val;
    }
    static findIndex(callback: (value: T, index: number, array: readonly T[]) => boolean): number {
      const idx = Enum.values.findIndex(callback);
      if (idx === -1) throw new Error(`Value not found in enum`);
      return idx;
    }
    static filter(callback: (value: T, index: number, array: readonly T[]) => boolean): T[] {
      return Enum.values.filter(callback);
    }
    static map<R>(callback: (value: T, index: number, array: readonly T[]) => R): R[] {
      return Enum.values.map(callback);
    }
    static forEach(callback: (value: T, index: number, array: readonly T[]) => void): void {
      Enum.values.forEach(callback);
    }
    static readonly refName = refName;
    readonly refName = refName;
    declare readonly value: T;
  }
  return Enum as unknown as EnumInstance<RefName, T>;
};

/** Id-keyed list helper used for light model collections and immutable-style list updates. */
export class DataList<Light extends { id: string }> {
  // [immerable] = true;
  #idMap: Map<string, number>;
  length: number;
  values: Light[];
  constructor(data: Light[] | DataList<Light> = []) {
    const values = Array.isArray(data) ? data : data.values;
    this.values = [];
    this.#idMap = new Map();
    values.forEach((value) => {
      const idx = this.#idMap.get(value.id);
      if (idx === undefined) {
        this.#idMap.set(value.id, this.values.length);
        this.values.push(value);
      } else this.values[idx] = value;
    });
    this.length = this.values.length;
  }
  indexOf(id: string) {
    const idx = this.#idMap.get(id);
    if (idx === undefined) throw new Error(`Value ${id} is not in list`);
    return idx;
  }
  set(value: Light) {
    const idx = this.#idMap.get(value.id);
    if (idx !== undefined) this.values = [...this.values.slice(0, idx), value, ...this.values.slice(idx + 1)];
    else {
      this.#idMap.set(value.id, this.length);
      this.values = [...this.values, value];
      this.length++;
    }
    return this;
  }
  delete(id: string) {
    const idx = this.#idMap.get(id);
    if (idx === undefined) return this;
    this.#idMap.delete(id);
    this.values.splice(idx, 1);
    this.values.slice(idx).forEach((value, i) => {
      this.#idMap.set(value.id, i + idx);
    });
    this.length--;
    return this;
  }
  get(id: string) {
    const idx = this.#idMap.get(id);
    if (idx === undefined) return undefined;
    return this.values[idx];
  }
  at(idx: number) {
    return this.values.at(idx);
  }
  pickAt(idx: number) {
    const value = this.values.at(idx);
    if (value === undefined) throw new Error(`Value at ${idx} is undefined`);
    return value;
  }
  pick(id: string) {
    return this.values[this.indexOf(id)];
  }
  has(id: string) {
    return this.#idMap.has(id);
  }
  find(fn: (value: Light, idx: number) => boolean) {
    const val = this.values.find(fn);
    return val;
  }
  findIndex(fn: (value: Light, idx: number) => boolean) {
    const val = this.values.findIndex(fn);
    return val;
  }
  some(fn: (value: Light, idx: number) => boolean) {
    return this.values.some(fn);
  }
  every(fn: (value: Light, idx: number) => boolean) {
    return this.values.every(fn);
  }
  forEach(fn: (value: Light, idx: number) => void) {
    this.values.forEach(fn);
  }
  map<T>(fn: (value: Light, idx: number) => T) {
    return this.values.map(fn);
  }
  flatMap<T>(fn: (value: Light, idx: number, array: Light[]) => T | readonly T[]) {
    return this.values.flatMap(fn);
  }
  sort(fn: (a: Light, b: Light) => number) {
    return new DataList(this.values.sort(fn));
  }
  filter(fn: (value: Light, idx: number) => boolean) {
    return new DataList(this.values.filter(fn));
  }
  reduce<T>(fn: (acc: T, value: Light, idx: number) => T, initialValue: T) {
    return this.values.reduce(fn, initialValue);
  }
  slice(start: number, end = this.length) {
    return new DataList(this.values.slice(start, end));
  }
  save() {
    return new DataList(this);
  }
  [Symbol.iterator]() {
    return this.values[Symbol.iterator]();
  }
}

export const logo = `
     _    _                  _     
    / \\  | | ____ _ _ __    (_)___ 
   / _ \\ | |/ / _' | '_ \\   | / __|
  / ___ \\|   < (_| | | | |_ | \\__ \\
 /_/   \\_\\_|\\_\\__,_|_| |_(_)/ |___/
                          |__/      
? See more details on docs  https://www.akanjs.com/docs
★ Star Akanjs on GitHub     https://github.com/akan-team/akanjs

`;
