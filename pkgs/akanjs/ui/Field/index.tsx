import { cn } from "akanjs/client";
import type { ReactNode } from "react";
import { MultiToggleSelect, Switch, ToggleSelect } from "./Choice";
import { List, Tags, TextList } from "./Collection";
import { Date, DateRange } from "./DateField";
import { Label } from "./Label";
import { DoubleNumber, Number } from "./NumberField";
import { Children, ChildrenId, Parent, ParentId } from "./Relation";
import { Email, Password, Phone, Text, TextArea } from "./Text";

export interface FieldProps {
  className?: string;
  containerClassName?: string;
  labelClassName?: string;
  label?: ReactNode;
  desc?: ReactNode;
  /** Marks the field as optional in the label. */
  nullable?: boolean;
  children?: ReactNode;
}
const FieldSection = ({
  className,
  containerClassName,
  labelClassName,
  label,
  desc,
  nullable,
  children,
}: FieldProps) => {
  return (
    <div className={cn("w-full", className)}>
      {label ? <Label className={labelClassName} nullable={nullable} label={label} desc={desc} /> : null}
      <div className={cn("mt-2 flex w-full flex-col gap-4 px-4", containerClassName)}>{children}</div>
    </div>
  );
};

export const Field = Object.assign(FieldSection, {
  Label,
  List,
  Text,
  TextArea,
  Switch,
  ToggleSelect,
  MultiToggleSelect,
  TextList,
  Tags,
  Date,
  DateRange,
  Number,
  DoubleNumber,
  Email,
  Phone,
  Password,
  Parent,
  ParentId,
  Children,
  ChildrenId,
});
