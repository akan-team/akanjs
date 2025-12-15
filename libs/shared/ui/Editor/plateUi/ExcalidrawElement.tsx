import { withRef } from "@udecode/cn";
import { PlateElement } from "@udecode/plate-common";
import { type TExcalidrawProps, useExcalidrawElement } from "@udecode/plate-excalidraw";
import React, { type ReactNode } from "react";

export const ExcalidrawElement = withRef<typeof PlateElement>(({ nodeProps, ...props }, ref) => {
  const children = props.children as ReactNode;
  const { element } = props;

  const { Excalidraw, excalidrawProps } = useExcalidrawElement({ element }) as {
    Excalidraw?: (props) => ReactNode;
    excalidrawProps: TExcalidrawProps;
  };

  return (
    <PlateElement ref={ref} {...props}>
      <div contentEditable={false}>
        <div className="h-[500px]">{Excalidraw && <Excalidraw {...nodeProps} {...(excalidrawProps as any)} />}</div>
      </div>
      {children}
    </PlateElement>
  );
});
