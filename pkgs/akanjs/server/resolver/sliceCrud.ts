import { ID } from "akanjs/base";
import { type McpShelf, modelNames, moduleNames } from "akanjs/common";
import { ByIdRead } from "../../signal/byIdRead";
import type { EndpointInfo } from "../../signal/endpointInfo";
import type { SliceCls } from "../../signal/slice";

export class SliceCrud {
  //? On the endpoint itself, as a slice list carries its own: AccountMiddleware reads it there to refuse an OAuth token.
  static #shelf(mcp: McpShelf) {
    return mcp === true ? {} : { mcp };
  }

  // `builder as any` on purpose: its type derives from per-slice literal type args held here only at runtime.
  static endpoints(
    builder: unknown,
    sliceCls: SliceCls,
    cnst: NonNullable<SliceCls["srv"]["cnst"]>,
  ): { [key: string]: EndpointInfo } {
    const refName = cnst.refName;
    const serviceName = moduleNames(refName).service;
    const names = modelNames(refName);
    const endpointObj: { [key: string]: EndpointInfo } = {};
    if (sliceCls.crud.get)
      for (const key of [names.model, names.lightModel])
        endpointObj[key] = ByIdRead.mark(
          refName,
          (builder as any)
            .query(key === names.model ? cnst.full : cnst.light, {
              guards: sliceCls.getGuards,
              ...SliceCrud.#shelf(sliceCls.mcp.get),
            })
            .param(names.modelId, ID)
            .exec(async function (this: any, id: string) {
              return await this[serviceName][names.getModel](id);
            }),
        );

    if (sliceCls.crud.create)
      endpointObj[names.createModel] = (builder as any)
        .mutation(cnst.full, { guards: sliceCls.createGuards, ...SliceCrud.#shelf(sliceCls.mcp.create) })
        .body("data", cnst.input)
        .exec(async function (this: any, data: any) {
          return await this[serviceName].__create(data);
        });

    if (sliceCls.crud.update)
      endpointObj[names.updateModel] = (builder as any)
        .mutation(cnst.full, { guards: sliceCls.updateGuards, ...SliceCrud.#shelf(sliceCls.mcp.update) })
        .param(names.modelId, ID)
        .body("data", cnst.input)
        .exec(async function (this: any, id: string, data: any) {
          return await this[serviceName].__update(id, data);
        });

    if (sliceCls.crud.remove)
      endpointObj[names.removeModel] = (builder as any)
        .mutation(cnst.full, { guards: sliceCls.removeGuards, ...SliceCrud.#shelf(sliceCls.mcp.remove) })
        .param(names.modelId, ID)
        .exec(async function (this: any, id: string) {
          return await this[serviceName].__remove(id);
        });
    return endpointObj;
  }
}
