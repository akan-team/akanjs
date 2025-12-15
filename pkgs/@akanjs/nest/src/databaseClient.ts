import { capitalize } from "@akanjs/common";
import { Injectable } from "@nestjs/common";
import { InjectConnection } from "@nestjs/mongoose";
import type { Connection } from "mongoose";

@Injectable()
export class DatabaseClient {
  @InjectConnection() connection: Connection;
  getModel(modelName: string) {
    const model = this.connection.models[capitalize(modelName)];
    return model;
  }
}
