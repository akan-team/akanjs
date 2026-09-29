import { via } from "akanjs/constant";

export class MemoInput extends via((field) => ({
  name: field(String),
})) {}

export class MemoObject extends via(MemoInput, (field) => ({
  imageUrl: field(String, { default: "" }), // written by attachMemoImage, relative to the server that stored the image
})) {}

export class LightMemo extends via(MemoObject, ["name", "imageUrl"] as const, (resolve) => ({})) {
  hasImage() {
    return !!this.imageUrl;
  }
}

export class Memo extends via(MemoObject, LightMemo, (resolve) => ({})) {}

export class MemoInsight extends via(Memo, (field) => ({})) {}
