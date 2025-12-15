/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/unbound-method */
import { Logger } from "@akanjs/common";
import mongoose from "mongoose";

export const initMongoDB = ({
  logging,
  threshold = 5000,
  sendReport = false,
}: {
  logging: boolean;
  threshold?: number;
  sendReport?: boolean;
}) => {
  const mongoDBLogger = new Logger("MongoDB");
  if (logging)
    mongoose.set("debug", function (collection: string, method: string, ...methodArgs: object[]) {
      mongoDBLogger.verbose(
        `${collection}.${method}(${methodArgs
          .slice(0, -1)
          .map((arg) => JSON.stringify(arg))
          .join(", ")})`
      );
    });

  // 1. Query duration logging
  const originalExec = mongoose.Query.prototype.exec as (...args) => Promise<object>;
  const getQueryInfo = (queryAgent: mongoose.Query<any, any>) => {
    const model = queryAgent.model;
    const collectionName = model.collection.collectionName;
    const dbName = model.db.name;
    const query = queryAgent.getQuery();
    const queryOptions = queryAgent.getOptions();
    return { dbName, collectionName, query, queryOptions };
  };
  mongoose.Query.prototype.exec = function (...args: object[]) {
    const start = Date.now();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    return originalExec.apply(this, args).then((result: object) => {
      const duration = Date.now() - start;
      const { dbName, collectionName, query, queryOptions } = getQueryInfo(this as mongoose.Query<any, any>);
      if (logging)
        mongoDBLogger.verbose(
          `Queried ${dbName}.${collectionName}.query(${JSON.stringify(query)}, ${JSON.stringify(
            queryOptions
          )}) - ${duration}ms`
        );
      return result;
    }) as unknown as Promise<any>;
  };

  // 2. Aggregate duration logging)
  const originalAggregate = mongoose.Model.aggregate;
  const getAggregateInfo = (aggregateModel: mongoose.Model<any>) => {
    const dbName = aggregateModel.db.db?.databaseName ?? "unknown";
    const collectionName = aggregateModel.collection.collectionName;
    return { dbName, collectionName };
  };
  mongoose.Model.aggregate = function (...args) {
    const startTime = Date.now();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return
    return originalAggregate.apply(this, args).then((result: object) => {
      const duration = Date.now() - startTime;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      const { dbName, collectionName } = getAggregateInfo(this);
      if (logging)
        mongoDBLogger.verbose(
          `Aggregated ${dbName}.${collectionName}.aggregate(${args
            .map((arg) => JSON.stringify(arg))
            .join(", ")}) - ${duration}ms`
        );
      return result;
    });
  };

  // 3. Set transaction settings
  mongoose.set("transactionAsyncLocalStorage", true);
};
