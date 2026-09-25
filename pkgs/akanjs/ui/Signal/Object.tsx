"use client";
import { type Cls, FIELD_META, getNonArrayModel, PrimitiveRegistry, type PrimitiveScalar } from "akanjs/base";
import { cn, usePage } from "akanjs/client";
import { capitalize } from "akanjs/common";
import { type ConstantCls, ConstantRegistry } from "akanjs/constant";
import { useState } from "react";
import { buttonRecipe } from "../Button";
import { Modal } from "../Modal";
import { dictText, docPill, docUi } from "../Reference";
import { Tooltip } from "../Tooltip";

export default function Object() {
  return <div></div>;
}

const typeLabel = (modelName: string, arrDepth: number, nullable?: boolean) =>
  `${"[".repeat(arrDepth)}${modelName}${"]".repeat(arrDepth)}${nullable ? "" : "!"}`;

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
      <span
        className={
          isModelType
            ? docPill("info", "cursor-pointer font-mono transition-colors hover:ring-info/60")
            : docPill("muted", "font-mono")
        }
        onClick={() => {
          if (isModelType) setOpenDetail(true);
        }}
      >
        {typeLabel(modelName, arrDepth, nullable)}
      </span>
      {isModelType ? (
        <Modal
          className="max-w-4xl"
          title={`Model — ${modelName}`}
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
  className?: string;
  objRef: ConstantCls;
}
const ObjectDetail = ({ className, objRef }: ObjectDetailProps) => {
  const modelRefName = ConstantRegistry.getRefName(objRef);
  const { l } = usePage();
  return (
    <div className={cn(docUi.tablePanel, className)}>
      <table className={docUi.tableClass}>
        <thead>
          <tr>
            <th>Field</th>
            <th>Type</th>
            <th>Values</th>
            <th className="w-1/2">Description</th>
          </tr>
        </thead>
        <tbody>
          {globalThis.Object.entries(objRef[FIELD_META]).map(
            ([key, { arrDepth, nullable, modelRef, isClass, enum: enumOpt, isMap, of }], idx) => (
              <tr key={idx}>
                <td>
                  <div className="font-medium font-mono">{key}</div>
                  {dictText(l, `${modelRefName}.${key}`) ? (
                    <div className="text-foreground/45 text-xs">{dictText(l, `${modelRefName}.${key}`)}</div>
                  ) : null}
                </td>
                <td>
                  <div className="flex flex-wrap items-center gap-1">
                    {isClass ? (
                      <ObjectType objRef={modelRef} arrDepth={arrDepth} nullable={nullable} />
                    ) : (
                      <span className={docPill("muted", "font-mono")}>
                        {typeLabel(isMap ? "Map" : ConstantRegistry.getModelName(modelRef), arrDepth, nullable)}
                      </span>
                    )}
                    {isMap ? (
                      <>
                        <span className="text-foreground/35">⇒</span>
                        {(() => {
                          const [valueRef, valueArrDepth] = getNonArrayModel(of as Cls);
                          if (PrimitiveRegistry.has(of as Cls))
                            return (
                              <span className={docPill("muted", "font-mono")}>
                                {typeLabel(
                                  PrimitiveRegistry.getName(of as typeof PrimitiveScalar),
                                  valueArrDepth,
                                  true,
                                )}
                              </span>
                            );
                          return <ObjectType objRef={valueRef as ConstantCls} arrDepth={valueArrDepth} nullable />;
                        })()}
                      </>
                    ) : null}
                  </div>
                </td>
                <td>
                  {enumOpt ? (
                    <div className="flex max-w-56 flex-wrap gap-1">
                      {enumOpt.map((opt, idx: number) => (
                        <Tooltip content={l._(`${enumOpt.refName}.${opt}`)} key={idx} variant="primary">
                          <span className={buttonRecipe({ variant: "outline", size: "xs" }, "font-mono")}>{opt}</span>
                        </Tooltip>
                      ))}
                    </div>
                  ) : (
                    <span className="text-foreground/25">—</span>
                  )}
                </td>
                <td className="text-foreground/70">
                  {dictText(l, `${modelRefName}.${key}.desc`) || <span className="text-foreground/25">—</span>}
                </td>
              </tr>
            ),
          )}
        </tbody>
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
      <div>
        <div className="font-bold text-3xl">{gqlName}</div>
        <div className={docUi.sectionDescription}>{dictText(l, `${refName}.modelDesc`)}</div>
      </div>
      <div className={docUi.sectionLabel}>Schema</div>
      <ObjectDetail objRef={objRef as ConstantCls} />
    </div>
  );
};
Object.Schema = ObjectSchema;
