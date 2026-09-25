"use client";
import { type Dayjs, type DefaultPrimitiveName, PrimitiveRegistry, type PrimitiveScalar } from "akanjs/base";
import { usePage } from "akanjs/client";
import { type ConstantCls, ConstantRegistry } from "akanjs/constant";
import type { SerializedArg } from "akanjs/signal";
import { st } from "akanjs/store";
import type { ChangeEvent, ReactNode } from "react";
import { AiOutlineDelete, AiOutlinePlus } from "react-icons/ai";
import { buttonRecipe } from "../Button";
import { DatePicker } from "../DatePicker";
import { Input } from "../Input";
import { dictText, docDash, docUi } from "../Reference";
import { Select } from "../Select";
import { Tooltip } from "../Tooltip";
import UiObject from "./Object";
import { signalUi } from "./style";

interface ArgProps {
  argType: DefaultPrimitiveName;
  value: any;
  onChange: (value: any) => void;
}
export default function Arg({ argType, value, onChange }: ArgProps) {
  return argType === "ID" ? (
    <Arg.ID value={value as string} onChange={onChange} />
  ) : argType === "Int" ? (
    <Arg.Int value={value as number} onChange={onChange} />
  ) : argType === "Float" ? (
    <Arg.Float value={value as number} onChange={onChange} />
  ) : argType === "String" ? (
    <Arg.String value={value as string} onChange={onChange} />
  ) : argType === "Boolean" ? (
    <Arg.Boolean value={value as boolean} onChange={onChange} />
  ) : argType === "Date" ? (
    <Arg.Date value={value as Dayjs} onChange={onChange} />
  ) : argType === "Any" ? (
    <Arg.Json value={value as string} onChange={onChange} />
  ) : argType === "Upload" ? (
    <Arg.Upload value={value as FileList} onChange={onChange} />
  ) : (
    <></>
  );
}

interface ArgTableProps {
  refName: string;
  endpointKey: string;
  args: SerializedArg[];
}
const ArgTable = ({ refName, endpointKey, args }: ArgTableProps) => {
  const { l } = usePage();
  const onCopy = (text: string) => {
    void navigator.clipboard.writeText(text);
    st.do.showMessage({
      content: l.trans({ ko: "클립보드에 복사되었습니다.", en: "Copied to clipboard." }),
      type: "success",
      duration: 3,
    });
  };
  return (
    <table className={docUi.tableClass}>
      <thead>
        <tr>
          <th>Argument</th>
          <th>Type</th>
          <th>Values</th>
          <th className="w-1/2">Description</th>
        </tr>
      </thead>
      <tbody>
        {args.map((arg, idx) => {
          const argRef = ConstantRegistry.getModelRef(arg.refName, arg.modelType);
          const argEnum = arg.enum ? ConstantRegistry.enum.get(arg.enum) : undefined;
          const label = dictText(l, `${refName}.signal.${endpointKey}.arg.${arg.name}`);
          const desc = dictText(l, `${refName}.signal.${endpointKey}.arg.${arg.name}.desc`);
          return (
            <tr key={idx}>
              <td>
                <div className="font-medium font-mono">{arg.name}</div>
                {label ? <div className="text-foreground/45 text-xs">{label}</div> : null}
              </td>
              <td>
                <UiObject.Type objRef={argRef as ConstantCls} arrDepth={arg.arrDepth ?? 0} nullable={arg.nullable} />
              </td>
              <td>
                {argEnum ? (
                  <div className="flex max-w-56 flex-wrap gap-1">
                    {argEnum.map((opt, idx) => (
                      <Tooltip content={l._(`${arg.enum}.${opt}`)} key={idx} variant="primary">
                        <button
                          className={buttonRecipe({ variant: "outline", size: "xs" }, "font-mono")}
                          onClick={() => {
                            onCopy(opt.toString());
                          }}
                          type="button"
                        >
                          {opt}
                        </button>
                      </Tooltip>
                    ))}
                  </div>
                ) : (
                  <span className={docDash}>—</span>
                )}
              </td>
              <td className="text-foreground/70">{desc || <span className={docDash}>—</span>}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
};
Arg.Table = ArgTable;

interface ArgParamProps {
  endpointKey: string;
  arg: SerializedArg;
  value: any;
  onChange: (value: any) => void;
}
const ArgParam = ({ endpointKey, arg, value, onChange }: ArgParamProps) => {
  const argRef = ConstantRegistry.getModelRef(arg.refName, arg.modelType);
  if (!PrimitiveRegistry.has(argRef)) throw new Error(`Param arg - ${endpointKey}/${arg.name} must be scalar`);
  else if ((arg.arrDepth ?? 0) > 0) throw new Error(`Param arg - ${endpointKey}/${arg.name} must not be array`);
  const argType = PrimitiveRegistry.getName(argRef as typeof PrimitiveScalar) as DefaultPrimitiveName;
  return (
    <div className={signalUi.inputRow}>
      <div className={signalUi.inputLabel}>{arg.name}</div>
      <div className="w-full">
        <Arg argType={argType} value={value as string} onChange={onChange} />
      </div>
    </div>
  );
};
Arg.Param = ArgParam;

interface ArgQueryProps {
  endpointKey: string;
  arg: SerializedArg;
  label?: string;
  value: any;
  onChange: (value: any) => void;
  /** Replaces the scalar input this arg would otherwise get, once per element for an array arg. */
  renderScalar?: (value: any, onChange: (value: any) => void) => ReactNode;
}
const ArgQuery = ({ endpointKey, arg, label, value, onChange, renderScalar }: ArgQueryProps) => {
  const argRef = ConstantRegistry.getModelRef(arg.refName, arg.modelType);
  if (!PrimitiveRegistry.has(argRef)) throw new Error(`Query arg - ${endpointKey}/${arg.name} must be scalar`);
  else if ((arg.arrDepth ?? 0) > 1)
    throw new Error(`Query arg - ${endpointKey}/${arg.name} must not be more than 2D array`);
  const argType = PrimitiveRegistry.getName(argRef as typeof PrimitiveScalar) as DefaultPrimitiveName;
  const enumRef = arg.enum ? ConstantRegistry.enum.get(arg.enum) : undefined;
  const options: (string | number)[] = arg.oneOf ?? (enumRef ? [...enumRef.values] : []);
  const multiple = (arg.arrDepth ?? 0) > 0;
  const renderLeaf = (leafValue: unknown, onLeafChange: (value: unknown) => void) =>
    renderScalar ? (
      renderScalar(leafValue, onLeafChange)
    ) : (
      <Arg argType={argType} value={leafValue as string} onChange={onLeafChange} />
    );
  return (
    <div className={signalUi.inputRow}>
      <div className={signalUi.inputLabel}>{label ?? arg.name}</div>
      <div className="w-full">
        {options.length ? (
          <Select<string | number, boolean>
            options={options.map((option) => ({ label: option, value: option }))}
            multiple={multiple}
            nullable={arg.nullable}
            value={multiple ? ((value as (string | number)[] | null) ?? []) : (value as string | number)}
            onChange={onChange}
          />
        ) : multiple && Array.isArray(value) ? (
          <div className="flex flex-col gap-2">
            {value.map((val, idx) => (
              <div className="flex items-center gap-2" key={idx}>
                {renderLeaf(val, (val) => {
                  onChange([...(value.slice(0, idx) as string[]), val, ...(value.slice(idx + 1) as string[])]);
                })}
                <button
                  className={buttonRecipe({ variant: "ghost", size: "icon" }, "size-8 shrink-0 text-foreground/50")}
                  onClick={() => {
                    onChange([...(value.slice(0, idx) as string[]), ...(value.slice(idx + 1) as string[])]);
                  }}
                  type="button"
                >
                  <AiOutlineDelete />
                </button>
              </div>
            ))}
            <button
              className={buttonRecipe({ variant: "outline", size: "sm" }, "w-fit")}
              onClick={() => {
                onChange([...(value as string[]), arg.example]);
              }}
              type="button"
            >
              <AiOutlinePlus /> Add
            </button>
          </div>
        ) : (
          renderLeaf(value, onChange)
        )}
      </div>
    </div>
  );
};
Arg.Query = ArgQuery;

interface ArgFormDataProps {
  endpointKey: string;
  arg: SerializedArg;
  value: any;
  onChange: (value: any) => void;
}
const ArgFormData = ({ endpointKey, arg, value, onChange }: ArgFormDataProps) => {
  const argRef = ConstantRegistry.getModelRef(arg.refName, arg.modelType);
  if (PrimitiveRegistry.getName(argRef as typeof PrimitiveScalar) !== "Upload")
    throw new Error(`FormData arg - ${endpointKey}/${arg.name} must be Upload`);
  else if ((arg.arrDepth ?? 0) < 1) throw new Error(`FormData arg - ${endpointKey}/${arg.name} must be array`);
  return (
    <div className={signalUi.inputRow}>
      <div className={signalUi.inputLabel}>{arg.name}</div>
      <div className="w-full">
        <Arg argType="Upload" value={value as FileList} onChange={onChange} />
      </div>
    </div>
  );
};
Arg.FormData = ArgFormData;

interface ArgIDProps {
  value: string | null;
  onChange: (value: string) => void;
}
const ArgID = ({ value, onChange }: ArgIDProps) => {
  return (
    <Input
      inputClassName="w-full font-mono"
      value={value ?? ""}
      onChange={(value) => {
        onChange(value);
      }}
      validate={(e) => true}
    />
  );
};
Arg.ID = ArgID;

interface ArgIntProps {
  value: number;
  onChange: (value: number) => void;
}
const ArgInt = ({ value, onChange }: ArgIntProps) => {
  return (
    <Input.Number
      inputClassName="w-full font-mono"
      value={value}
      onChange={(value) => {
        onChange(value ?? 0);
      }}
      validate={(e) => true}
    />
  );
};
Arg.Int = ArgInt;

interface ArgFloatProps {
  value: number;
  onChange: (value: number) => void;
}
const ArgFloat = ({ value, onChange }: ArgFloatProps) => {
  return (
    <Input.Number
      inputClassName="w-full font-mono"
      value={value}
      onChange={(value) => {
        onChange(value ?? 0);
      }}
      validate={(e) => true}
    />
  );
};
Arg.Float = ArgFloat;

interface ArgStringProps {
  value: string | null;
  onChange: (value: string) => void;
}
const ArgString = ({ value, onChange }: ArgStringProps) => {
  return (
    <Input
      inputClassName="w-full font-mono"
      value={value ?? ""}
      onChange={(value) => {
        onChange(value);
      }}
      validate={(e) => true}
    />
  );
};
Arg.String = ArgString;

interface ArgBooleanProps {
  value: boolean;
  onChange: (value: boolean) => void;
}
const ArgBoolean = ({ value, onChange }: ArgBooleanProps) => {
  return (
    <Input.Checkbox
      className="w-full"
      checked={value}
      onChange={(value) => {
        onChange(value);
      }}
    />
  );
};
Arg.Boolean = ArgBoolean;

interface ArgDateProps {
  value: Dayjs;
  onChange: (value: Dayjs | null) => void;
}
const ArgDate = ({ value, onChange }: ArgDateProps) => {
  return (
    <DatePicker
      className="w-full"
      value={value}
      onChange={(value) => {
        onChange(value);
      }}
    />
  );
};
Arg.Date = ArgDate;

interface ArgJsonProps {
  value: string;
  onChange: (value: string) => void;
}
const ArgJson = ({ value, onChange }: ArgJsonProps) => {
  return (
    <Input.TextArea
      validate={(e) => true}
      className="w-full"
      inputClassName="min-h-56 w-full rounded-box border border-border bg-background font-mono text-xs leading-relaxed"
      value={value}
      onPressEnter={(value) => {
        onChange(value);
      }}
      onChange={(value) => {
        onChange(value);
      }}
    />
  );
};
Arg.Json = ArgJson;

interface ArgUploadProps {
  value: FileList | null;
  onChange: (value: FileList | null) => void;
}
const ArgUpload = ({ value, onChange }: ArgUploadProps) => {
  return (
    <input
      type="file"
      multiple
      className="w-full max-w-xs cursor-pointer rounded-field border border-input bg-background text-foreground/70 text-sm file:mr-3 file:cursor-pointer file:border-0 file:bg-muted file:px-3 file:py-2 file:font-medium file:text-foreground file:text-sm"
      onChange={(e: ChangeEvent<HTMLInputElement>) => {
        onChange(e.target.files);
      }}
    />
  );
};
Arg.Upload = ArgUpload;
