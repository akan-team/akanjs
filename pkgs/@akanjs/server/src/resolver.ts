// https://github.com/nestjs/graphql/issues/755
import { arraiedModel, Float, getNonArrayModel, type GqlScalar, ID, Int, JSON, Type, Upload } from "@akanjs/base";
import { capitalize, lowerlize } from "@akanjs/common";
import { constantInfo, getFieldMetas, GqlReturn } from "@akanjs/constant";
import { getNestParamDecorator, None } from "@akanjs/nest";
import { getServiceRefs, isServiceEnabled } from "@akanjs/service";
import {
  copySignal,
  getArgMetas,
  getGqlMetas,
  getResolveFieldMetas,
  getSigMeta,
  ResolveFieldMeta,
} from "@akanjs/signal";
import { Inject, UseGuards } from "@nestjs/common";
import * as Nest from "@nestjs/graphql";
import GraphQLJson from "graphql-type-json";
import { GraphQLUpload } from "graphql-upload";

import { generateGql, generateGqlInput } from "./gql";

const scalarNestReturnMap = new Map<GqlScalar, any>([
  [Upload, GraphQLUpload],
  [ID, Nest.ID],
  [Int, Nest.Int],
  [Float, Nest.Float],
  [JSON, GraphQLJson],
  [Boolean, Boolean],
  [Date, Date],
  [String, String],
  [Map, GraphQLJson],
]);
const getNestReturn = (returns: GqlReturn, type: "input" | "object" = "object") => {
  const [model, arrDepth] = getNonArrayModel(returns() as Type);
  const modelRef = (scalarNestReturnMap.get(model) ??
    (type === "object" ? generateGql(model) : generateGqlInput(model))) as Type;
  return () => arraiedModel<Type>(modelRef, arrDepth);
};

export const resolverOf = (sigRef: Type, allSrvs: { [key: string]: Type }) => {
  const Rsv = copySignal(sigRef);
  const sigMeta = getSigMeta(Rsv);
  const gqlMetas = getGqlMetas(Rsv);

  // 1. Inject All Services
  Object.keys(allSrvs).forEach((srvName) => {
    if (!isServiceEnabled(allSrvs[srvName])) return;
    const srvRef = getServiceRefs(srvName)[0];
    Inject(srvRef)(Rsv.prototype, lowerlize(srvName));
  });
  // 2. Resolve Query And Mutations
  for (const gqlMeta of gqlMetas) {
    if (
      gqlMeta.signalOption.guards?.some((guard) => guard === None) ||
      gqlMeta.signalOption.onlyFor === "restapi" ||
      !["Query", "Mutation"].includes(gqlMeta.type)
    )
      continue;
    const [argMetas, internalArgMetas] = getArgMetas(Rsv, gqlMeta.key);
    const descriptor = gqlMeta.descriptor;
    for (const argMeta of argMetas) {
      Nest.Args({
        name: argMeta.name,
        type: getNestReturn(argMeta.returns, "input"),
        ...argMeta.argsOption,
      })(Rsv.prototype, gqlMeta.key, argMeta.idx);
    }
    for (const internalArgMeta of internalArgMetas) {
      const decorate = getNestParamDecorator(internalArgMeta.type);
      decorate(internalArgMeta.option ?? {})(Rsv.prototype, gqlMeta.key, internalArgMeta.idx);
    }
    UseGuards(...(gqlMeta.signalOption.guards ?? []))(Rsv.prototype, gqlMeta.key, descriptor);
    if (gqlMeta.type === "Query")
      Nest.Query(getNestReturn(gqlMeta.returns), gqlMeta.signalOption)(Rsv.prototype, gqlMeta.key, descriptor);
    else if (gqlMeta.type === "Mutation")
      Nest.Mutation(getNestReturn(gqlMeta.returns), gqlMeta.signalOption)(Rsv.prototype, gqlMeta.key, descriptor);
  }

  // 3. Resolve Fields
  const resolveFieldMetas: ResolveFieldMeta[] = getResolveFieldMetas(Rsv);
  const resolveFieldKeys = resolveFieldMetas.map((resolveFieldMeta) => resolveFieldMeta.key);
  if (sigMeta.returns) {
    const modelRef = sigMeta.returns();
    const fieldMetas = getFieldMetas(modelRef);
    fieldMetas
      .filter((fieldMeta) => fieldMeta.isClass && !fieldMeta.isScalar && !resolveFieldKeys.includes(fieldMeta.key))
      .forEach((fieldMeta) => {
        const refName = constantInfo.getRefName(fieldMeta.modelRef);
        const className = capitalize(refName);
        const serviceName = `${refName}Service`;
        Rsv.prototype[fieldMeta.key] = async function (
          this: { [key: string]: any },
          parent: { [key: string]: object }
        ) {
          const service = this[serviceName] as { [key: string]: (...args) => Promise<object[]> };
          return fieldMeta.arrDepth
            ? await service[`load${className}Many`](parent[fieldMeta.key])
            : await service[`load${className}`](parent[fieldMeta.key]);
        };
        Nest.Parent()(Rsv.prototype, fieldMeta.key, 0);
        Nest.ResolveField(getNestReturn(() => arraiedModel(fieldMeta.modelRef, fieldMeta.arrDepth) as Type))(
          Rsv.prototype,
          fieldMeta.key,
          Object.getOwnPropertyDescriptor(Rsv.prototype, fieldMeta.key) ?? {}
        );
      });
  }

  for (const resolveFieldMeta of resolveFieldMetas) {
    const [, internalArgMetas] = getArgMetas(Rsv, resolveFieldMeta.key);
    Nest.Parent()(Rsv.prototype, resolveFieldMeta.key, 0);
    for (const internalArgMeta of internalArgMetas) {
      const decorate = getNestParamDecorator(internalArgMeta.type);
      decorate(internalArgMeta.option ?? {})(Rsv.prototype, resolveFieldMeta.key, internalArgMeta.idx);
    }
    Nest.ResolveField(resolveFieldMeta.key, getNestReturn(resolveFieldMeta.returns))(
      Rsv.prototype,
      resolveFieldMeta.key,
      Object.getOwnPropertyDescriptor(Rsv.prototype, resolveFieldMeta.key) ?? {}
    );
  }
  // 4. Apply Resolver
  if (sigMeta.returns) Nest.Resolver(getNestReturn(sigMeta.returns))(Rsv);
  else Nest.Resolver()(Rsv);
  return Rsv;
};
