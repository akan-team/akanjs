// Kept for `libs/util` storage adaptors' `@Try`; new code follows the adaptor rule (catch → logger.error → null).

type DecoratedInstance = {
  logger?: { warn?: (message: string) => void };
  __database?: { transaction?: <T>(fn: () => Promise<T>) => Promise<T> };
  __databaseModel?: { __database?: { transaction?: <T>(fn: () => Promise<T>) => Promise<T> } };
  database?: { transaction?: <T>(fn: () => Promise<T>) => Promise<T> };
  connection?: { transaction?: <T>(fn: () => Promise<T>) => Promise<T> };
};

/** Method decorator that catches errors and logs a warning instead of throwing. */
export const Try = () => {
  return (_target: unknown, key: string, descriptor: PropertyDescriptor) => {
    const originMethod = descriptor.value as (this: unknown, ...args: unknown[]) => unknown;
    descriptor.value = async function (...args: unknown[]) {
      try {
        return await originMethod.apply(this, args);
      } catch (e) {
        (this as DecoratedInstance).logger?.warn?.(`${key} action error return: ${e}`);
      }
    };
  };
};

/** @deprecated Wrap the body in `this.transaction(async () => …)`, which every service has. */
export const Transaction = (): MethodDecorator => {
  return ((_target: unknown, key: string, descriptor: PropertyDescriptor) => {
    const originMethod = descriptor.value as (this: unknown, ...args: unknown[]) => unknown;
    descriptor.value = async function (...args: unknown[]) {
      const instance = this as DecoratedInstance;
      const database =
        instance.__database ?? instance.__databaseModel?.__database ?? instance.database ?? instance.connection;
      if (!database?.transaction) throw new Error(`No transactional database in function ${key}`);
      return await database.transaction(async () => await originMethod.apply(this, args));
    };
    return descriptor;
  }) as MethodDecorator;
};
