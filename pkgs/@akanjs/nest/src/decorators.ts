/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */

import "reflect-metadata";

import type { Connection } from "mongoose";

export const Try = () => {
  return function (target, key: string, descriptor: PropertyDescriptor) {
    const originMethod = descriptor.value;
    descriptor.value = async function (...args) {
      try {
        const result = await originMethod.apply(this, args);
        return result;
      } catch (e) {
        this.logger?.warn(`${key} action error return: ${e}`);
      }
    };
  };
};

export const Transaction = () => {
  return function (target, key: string, descriptor: PropertyDescriptor) {
    const originMethod = descriptor.value;
    descriptor.value = function (...args) {
      if (!this.connection) throw new Error(`No Connection in function ${key}`);
      return new Promise((resolve, reject) => {
        (this.connection as Connection)
          .transaction(async () => {
            const res = await originMethod.apply(this, args);
            resolve(res);
          })
          .catch(reject);
      });
    };
    return descriptor;
  };
};

export const Cache = (timeout = 1000, getCacheKey?: (...args) => string): MethodDecorator => {
  return function (target: object, key: string, descriptor: PropertyDescriptor) {
    const originMethod = descriptor.value;
    const cacheMap = new Map<string, any>();
    const timerMap = new Map<string, NodeJS.Timeout>();
    descriptor.value = async function (...args) {
      const classType = this.__model ? "doc" : this.__databaseModel ? "service" : "class";
      const model = this.__model ?? this.__databaseModel?.__model;
      const cache = this.__cache ?? this.__databaseModel?.__cache;
      const getCacheKeyFn = getCacheKey ?? JSON.stringify;
      const cacheKey = `${classType}:${model.modelName}:${key}:${getCacheKeyFn(...args)}`;
      const getCache = async (cacheKey: string) => {
        if (classType === "class") return cacheMap.get(cacheKey);
        const cached = (await cache.get(cacheKey)) as string | null;
        if (cached) return JSON.parse(cached);
        return null;
      };
      const setCache = async (cacheKey: string, value: any) => {
        if (classType === "class") {
          const existingTimer = timerMap.get(cacheKey);
          if (existingTimer) clearTimeout(existingTimer);
          cacheMap.set(cacheKey, value);
          const timer = setTimeout(() => {
            cacheMap.delete(cacheKey);
            timerMap.delete(cacheKey);
          }, timeout);
          timerMap.set(cacheKey, timer);
        } else await cache.set(cacheKey, JSON.stringify(value), { PX: timeout });
      };
      const cachedData = await getCache(cacheKey);
      if (cachedData) {
        this.logger?.trace(`${model.modelName} cache hit: ${cacheKey}`);
        return cachedData;
      }
      const result = await originMethod.apply(this, args);
      await setCache(cacheKey, result);
      this.logger?.trace(`${model.modelName} cache set: ${cacheKey}`);
      return result;
    };
  };
};
