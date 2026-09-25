"use client";
import { type Cls, FIELD_META, getNonArrayModel, PrimitiveRegistry, type PrimitiveScalar } from "akanjs/base";
import { usePage } from "akanjs/client";
import { capitalize } from "akanjs/common";
import { type ConstantCls, ConstantRegistry } from "akanjs/constant";
import { useState } from "react";
import { Modal } from "../Modal";
import { signalUi } from "./style";

export default function Object() {
  return <div></div>;
}

interface ObjectTypeProps {
  objRef: Cls;
  arrDepth: number;
  nullable?: boolean;
}
const ObjectType = ({ objRef, arrDepth, nullable }: ObjectTypeProps) => {
  const isModelType = !PrimitiveRegistry.has(objRef);
  const modelName = ConstantRegistry.getModelName(objRef);
  const [openDetail, setOpenDetail] = useState(false);
  return (
    <>
      <div
        className={isModelType ? "badge badge-primary cursor-pointer" : "badge badge-outline"}
        onClick={() => {
          if (isModelType) setOpenDetail(true);
        }}
      >
        {"[".repeat(arrDepth)}
        {modelName}
        {"]".repeat(arrDepth)}
        {nullable ? "" : "!"}
      </div>
      {isModelType ? (
        <Modal
          title={`Model Cls - ${modelName}`}
          open={openDetail}
          onCancel={() => {
            setOpenDetail(false);
          }}
        >
          {openDetail ? <ObjectDetail objRef={objRef as ConstantCls} /> : null}
        </Modal>
      ) : null}
    </>
  );
};
Object.Type = ObjectType;

interface ObjectDetailProps {
  objRef: ConstantCls;
}
const ObjectDetail = ({ objRef }: ObjectDetailProps) => {
  const modelRefName = ConstantRegistry.getRefName(objRef);
  const { l } = usePage();
  return (
    <div className={signalUi.tablePanel}>
      <table className="table">
        <thead>
          <tr>
            <th>Key</th>
            <th className="text-center">Cls</th>
            <th className="text-center">Field Name</th>
            <th className="text-center">Description</th>
            <th className="text-center">Enum</th>
          </tr>
        </thead>
        {globalThis.Object.entries(objRef[FIELD_META]).map(
          ([key, { arrDepth, nullable, modelRef, isClass, enum: enumOpt, isMap, of }], idx) => (
            <tbody className="font-normal" key={idx}>
              <tr>
                <td>
                  <div className="font-bold">{key}</div>
                </td>
                <td className="text-center">
                  {isClass ? (
                    <ObjectType objRef={modelRef} arrDepth={arrDepth} />
                  ) : (
                    `${"[".repeat(arrDepth)}${ConstantRegistry.getModelName(modelRef)}${"]".repeat(arrDepth)}${nullable ? "" : "!"}`
                  )}

                  {isMap ? (
                    <>
                      {" => "}
                      {(() => {
                        const [valueRef, valueArrDepth] = getNonArrayModel(of as Cls);
                        if (PrimitiveRegistry.has(of as Cls))
                          return `${"[".repeat(valueArrDepth)}${PrimitiveRegistry.getName(of as typeof PrimitiveScalar)}${"]".repeat(valueArrDepth)}`;
                        else return <ObjectType objRef={valueRef as ConstantCls} arrDepth={valueArrDepth} />;
                      })()}
                    </>
                  ) : null}
                </td>
                <td className="text-center text-base-content/70">{l._(`${modelRefName}.${key}`)}</td>
                <td className="text-center text-base-content/70">{l._(`${modelRefName}.${key}.desc`)}</td>
                <td className="flex flex-wrap items-center justify-center gap-2 text-center">
                  {enumOpt
                    ? enumOpt.map((opt, idx: number) => (
                        <div key={idx} className="tooltip tooltip-primary" data-tip={l._(`${enumOpt.refName}.${opt}`)}>
                          <button className="btn btn-outline btn-xs">{opt}</button>
                        </div>
                      ))
                    : "-"}
                </td>
              </tr>
            </tbody>
          ),
        )}
      </table>
    </div>
  );
};
Object.Detail = ObjectDetail;

interface ObjectSchemaProps {
  objRef: Cls;
}
const ObjectSchema = ({ objRef }: ObjectSchemaProps) => {
  const { l } = usePage();
  const refName = capitalize(ConstantRegistry.getRefName(objRef));
  const gqlName = `${ConstantRegistry.isLight(objRef) ? "Light" : ""}${refName}${ConstantRegistry.isInsight(objRef) ? "Insight" : ""}`;
  return (
    <div className="flex break-after-page flex-col gap-4">
      <div className="mt-24" />
      <div className="font-bold text-3xl">{gqlName}</div>
      <div className="text-base-content/70">{l._(`${refName}.modelDesc`)}</div>
      <div className="font-bold text-2xl">Schema</div>
      <ObjectDetail objRef={objRef as ConstantCls} />
    </div>
  );
};
Object.Schema = ObjectSchema;
