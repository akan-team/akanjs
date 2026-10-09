import { EnumList, Model, Print, Scalar, Zone } from "./Doc";
import { Graph } from "./Graph";

export * from "./schemaDoc";
export * from "./schemaGraph";

export const Constant = { Doc: { Zone, Print, Model, Scalar, Enum: EnumList }, Graph };
