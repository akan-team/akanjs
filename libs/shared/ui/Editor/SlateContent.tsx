"use client";
import { Plate, PlateContent, type Value } from "@udecode/plate-common";

import { createSlatePlugins } from "./plateUi/createSlatePlugins";

export default function SlateContent({ content, className = "" }: { content: unknown; className?: string }) {
  return (
    <div className={className}>
      <Plate initialValue={content as Value} plugins={createSlatePlugins()}>
        <PlateContent readOnly />
      </Plate>
    </div>
  );
}
