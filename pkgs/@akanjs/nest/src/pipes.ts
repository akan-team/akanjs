import { dayjs, Float, getNonArrayModel, Int, isGqlScalar, JSON as GqlJSON, Type } from "@akanjs/base";
import { deserializeArg } from "@akanjs/constant";
import { ArgMeta } from "@akanjs/signal";
import { ArgumentMetadata, Injectable, PipeTransform } from "@nestjs/common";
import { Readable } from "stream";

@Injectable()
export class ArrayifyPipe implements PipeTransform {
  transform(value: string | string[], metadata: ArgumentMetadata) {
    return Array.isArray(value) ? value : value.split(",");
  }
}
@Injectable()
export class IntPipe implements PipeTransform {
  transform(value: string, metadata: ArgumentMetadata) {
    return Array.isArray(value) ? value.map(parseInt) : [parseInt(value)];
  }
}
@Injectable()
export class FloatPipe implements PipeTransform {
  transform(value: string, metadata: ArgumentMetadata) {
    return Array.isArray(value) ? value.map(parseFloat) : [parseFloat(value)];
  }
}
@Injectable()
export class BooleanPipe implements PipeTransform {
  transform(value: string, metadata: ArgumentMetadata) {
    return Array.isArray(value) ? value.map((v) => Boolean(v)) : [Boolean(value)];
  }
}
@Injectable()
export class DayjsPipe implements PipeTransform {
  transform(value: string, metadata: ArgumentMetadata) {
    return Array.isArray(value) ? value.map(dayjs) : [dayjs(value)];
  }
}

@Injectable()
export class JSONPipe implements PipeTransform {
  transform(value: string | object, metadata: ArgumentMetadata) {
    const transformable = typeof value === "string" && value.length;
    const obj = transformable ? (JSON.parse(atob(value)) as object) : (value as object);
    return obj;
  }
}
interface FileStream {
  originalname: string;
  mimetype: string;
  encoding: string;
  buffer: Buffer;
}
const convertToFileStream = (value: FileStream) => ({
  filename: value.originalname,
  mimetype: value.mimetype,
  encoding: value.encoding,
  createReadStream: () => Readable.from(value.buffer),
});
@Injectable()
export class MulterToUploadPipe implements PipeTransform {
  transform(value: FileStream, metadata: ArgumentMetadata) {
    return Array.isArray(value) ? value.map(convertToFileStream) : convertToFileStream(value);
  }
}

const gqlScalarPipeMap = new Map<Type, any>([
  [Int, IntPipe],
  [Float, FloatPipe],
  [Boolean, BooleanPipe],
  [Date, DayjsPipe],
  [GqlJSON, JSONPipe],
]);
export const getQueryPipes = (modelRef: Type, arrDepth: number): Type[] => {
  const pipes: Type[] = arrDepth ? [ArrayifyPipe] : [];
  const scalarPipe = gqlScalarPipeMap.get(modelRef) as Type | undefined;
  if (scalarPipe) pipes.push(scalarPipe);
  return pipes;
};

export const getBodyPipes = (argMeta: ArgMeta) => {
  const [returnRef] = getNonArrayModel(argMeta.returns() as Type);
  if (returnRef.prototype !== Date.prototype && !isGqlScalar(returnRef)) return [];
  @Injectable()
  class BodyPipe implements PipeTransform {
    transform(value: any, metadata: ArgumentMetadata) {
      const [argRef, arrDepth] = getNonArrayModel(argMeta.returns() as Type);
      return deserializeArg(argRef, arrDepth, value, argMeta.argsOption);
    }
  }
  return [BodyPipe];
};
