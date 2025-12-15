/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import { dayjs, PromiseOrObject } from "@akanjs/base";
import { isValidDate } from "@akanjs/common";
import { FilterQuery, isValidObjectId, PipelineStage, type ProjectionType, Types } from "mongoose";

import { CRUDEventType, SaveEventType } from "./dbDecorators";

export const getDefaultSchemaOptions = <TSchema, TDocument>() => ({
  toJSON: { getters: false, virtuals: true },
  toObject: { getters: false, virtuals: true },
  _id: true,
  id: true,
  timestamps: true,
  methods: {
    refresh: async function () {
      Object.assign(this, await this.constructor.findById(this._id));
      return this;
    },
  },
  statics: {
    pickOne: async function (query: FilterQuery<TSchema>, projection?: ProjectionType<TSchema>): Promise<TDocument> {
      const doc = await this.findOne(query, projection);
      if (!doc) throw new Error("No Document");
      return doc;
    },
    pickById: async function (docId: string | undefined, projection?: ProjectionType<TSchema>): Promise<TDocument> {
      if (!docId) throw new Error("No Document ID");
      const doc = await this.findById(docId, projection);
      if (!doc) throw new Error("No Document");
      return doc;
    },
    sample: async function (
      query: FilterQuery<TSchema>,
      size = 1,
      aggregations: PipelineStage[] = []
    ): Promise<TDocument[]> {
      const objs = await this.aggregate([
        { $match: convertAggregateMatch(query) },
        { $sample: { size } },
        ...aggregations,
      ]);
      return objs.map((obj) => new this(obj) as TDocument);
    },
    sampleOne: async function (
      query: FilterQuery<TSchema>,
      aggregations: PipelineStage[] = []
    ): Promise<TDocument | null> {
      const obj = await this.aggregate([
        { $match: convertAggregateMatch(query) },
        { $sample: { size: 1 } },
        ...aggregations,
      ]);
      return obj.length ? new this(obj[0]) : null;
    },
    preSaveListenerSet: new Set<(doc: TDocument, type: CRUDEventType) => PromiseOrObject<void>>(),
    postSaveListenerSet: new Set<(doc: TDocument, type: CRUDEventType) => PromiseOrObject<void>>(),
    preCreateListenerSet: new Set<(doc: TDocument, type: CRUDEventType) => PromiseOrObject<void>>(),
    postCreateListenerSet: new Set<(doc: TDocument, type: CRUDEventType) => PromiseOrObject<void>>(),
    preUpdateListenerSet: new Set<(doc: TDocument, type: CRUDEventType) => PromiseOrObject<void>>(),
    postUpdateListenerSet: new Set<(doc: TDocument, type: CRUDEventType) => PromiseOrObject<void>>(),
    preRemoveListenerSet: new Set<(doc: TDocument, type: CRUDEventType) => PromiseOrObject<void>>(),
    postRemoveListenerSet: new Set<(doc: TDocument, type: CRUDEventType) => PromiseOrObject<void>>(),
    listenPre: function (
      type: SaveEventType,
      listener: (doc: TDocument, type: CRUDEventType) => PromiseOrObject<void>
    ) {
      if (type === "save") {
        this.preSaveListenerSet.add(listener);
        return () => {
          this.preSaveListenerSet.delete(listener);
        };
      } else if (type === "create") {
        this.preCreateListenerSet.add(listener);
        return () => {
          this.preCreateListenerSet.delete(listener);
        };
      } else if (type === "update") {
        this.preUpdateListenerSet.add(listener);
        return () => {
          this.preUpdateListenerSet.delete(listener);
        };
      } else {
        this.preRemoveListenerSet.add(listener);
        return () => {
          this.preRemoveListenerSet.delete(listener);
        };
      }
    },
    listenPost: function (
      type: SaveEventType,
      listener: (doc: TDocument, type: CRUDEventType) => PromiseOrObject<void>
    ) {
      if (type === "save") {
        this.postSaveListenerSet.add(listener);
        return () => {
          this.postSaveListenerSet.delete(listener);
        };
      } else if (type === "create") {
        this.postCreateListenerSet.add(listener);
        return () => {
          this.postCreateListenerSet.delete(listener);
        };
      } else if (type === "update") {
        this.postUpdateListenerSet.add(listener);
        return () => {
          this.postUpdateListenerSet.delete(listener);
        };
      } else {
        this.postRemoveListenerSet.add(listener);
        return () => {
          this.postSaveListenerSet.delete(listener);
        };
      }
    },
  },
});

const convertOperatorValue = (value: any) => {
  if (Array.isArray(value)) return value.map((v) => convertOperatorValue(v));
  else if (!value) return value;
  else if (isValidObjectId(value)) return new Types.ObjectId(value as string);
  else if (isValidDate(value as Date)) return dayjs(value as Date).toDate();
  else if (value.constructor !== Object) return value;
  else if (typeof value !== "object") return value;
  else
    return Object.fromEntries(
      Object.entries(value as object).map(([key, value]) => [key, convertOperatorValue(value)])
    );
};
export const convertAggregateMatch = (query: any) => {
  return Object.fromEntries(
    Object.entries(query as object).map(([key, value]: [string, any]) => {
      return [key, convertOperatorValue(value)];
    })
  );
};
