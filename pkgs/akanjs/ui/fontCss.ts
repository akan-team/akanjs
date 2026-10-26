import {
  getFontFaces,
  getFontFallbackName,
  getFontVariableName,
  isFontOptimizationEnabled,
  isFontPreloadEnabled,
  type ReactFont,
  type ReactFontDeclaration,
  type ReactFontFace,
} from "akanjs/client";

export interface FontPreload {
  href: string;
  type: string;
}

export class FontCss {
  static getPreloads(fonts: ReactFont[]): FontPreload[] {
    const seen = new Set<string>();
    const preloads: FontPreload[] = [];
    for (const font of fonts) {
      if (!isFontOptimizationEnabled(font) || !isFontPreloadEnabled(font)) continue;
      for (const face of getFontFaces(font)) {
        if (face.path.preload === false || seen.has(face.optimizedSrc)) continue;
        seen.add(face.optimizedSrc);
        preloads.push({ href: face.optimizedSrc, type: "font/woff2" });
      }
    }
    return preloads;
  }

  static getRuntimeCss(fonts: ReactFont[]) {
    const css = fonts.flatMap((font) => {
      if (isFontOptimizationEnabled(font)) return [];
      return [
        ...getFontFaces(font).map((face) => FontCss.#buildFontFaceRule(face, face.src)),
        FontCss.#buildRootVariableRule(font),
      ];
    });
    return css.join("\n");
  }

  static getStyleId(fonts: ReactFont[]) {
    const key = fonts
      .map(
        (font) =>
          `${font.name}:${getFontFaces(font)
            .map((face) => `${face.src}:${face.weight}:${face.style}`)
            .join(",")}`,
      )
      .join("|");
    let hash = 0x811c9dc5;
    for (let i = 0; i < key.length; i++) {
      hash ^= key.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    return `akan-fonts-${(hash >>> 0).toString(36)}`;
  }

  static #buildFontFaceRule(face: ReactFontFace, src: string) {
    const declarations = [
      ["font-family", FontCss.#quote(face.font.name)],
      ["src", `url(${FontCss.#quote(src)})`],
      ["font-weight", String(face.weight)],
      ["font-style", face.style],
      ["font-display", face.font.display ?? "swap"],
      ...FontCss.#toDeclarationEntries(face.font.declarations),
      ...FontCss.#toDeclarationEntries(face.path.declarations),
    ];
    return `@font-face {\n${declarations.map(([prop, value]) => `  ${prop}: ${value};`).join("\n")}\n}`;
  }

  static #buildRootVariableRule(font: ReactFont) {
    return `:root { ${getFontVariableName(font)}: ${FontCss.#quote(font.name)}, ${FontCss.#quote(
      getFontFallbackName(font),
    )}; }`;
  }

  static #toDeclarationEntries(declarations: ReactFontDeclaration[] = []) {
    return declarations.map((declaration) => [declaration.prop, declaration.value] as const);
  }

  static #quote(value: string) {
    return JSON.stringify(value);
  }
}
