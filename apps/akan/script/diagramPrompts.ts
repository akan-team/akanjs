import path from "node:path";
import ts from "typescript";

export const diagramImageSizes = ["1024x1024", "1536x1024", "1024x1536"] as const;
export type DiagramImageSize = (typeof diagramImageSizes)[number];
export type DiagramImageQuality = "low" | "medium" | "high";

export interface DiagramPrompt {
  /** 프롬프트가 적힌 자리(`page/...tsx:줄`) — 생성 로그와 `--dry-run` 에서 고칠 곳을 찾아가는 주소. */
  where: string;
  size: DiagramImageSize;
  subject: string;
  quality?: DiagramImageQuality;
}

/**
 * 모든 삽화에 공통으로 붙는 화풍. 그림끼리 같은 손으로 그린 것처럼 보이게 하는 것이 목적이라
 * 개별 프롬프트에서 반복하지 않고 여기서 한 번만 정의한다.
 *
 * 라벨은 영문만 그림에 굽는다 — 한국어판도 같은 그림을 쓴다. 래스터 안의 글자는 generateLlms.ts 가
 * 긁지 못하므로 같은 내용을 `Docs.Figure` 의 `alt` 에 `l.trans` 로 적어 검색·미러에 남긴다.
 * 모델이 라벨 철자를 틀릴 수 있어 생성할 때마다 눈으로 확인한다.
 *
 * 순백 배경을 요구하는 이유: `Docs.Figure` 가 mix-blend 로 종이를 지우고 다크 테마에서 반전하므로
 * 종이 질감·그림자가 남으면 페이지 위에 회색 판으로 드러난다.
 */
export const diagramStyle =
  "Hand-drawn whiteboard sketch, marker and ballpoint line work, on a flat pure white background — no paper " +
  "texture, no paper edges, no shadow, no vignette. Black ink only, except the one element the subject names as " +
  "the red accent, which is traced in red; no other red anywhere. No shading, no gradients, no perspective, no " +
  "3D, no photographs, no realistic device mockups, no UI screenshots, no logos. Confident slightly imperfect " +
  "lines, generous white space. Label shapes only with the English labels the subject gives in double quotes, " +
  "hand-lettered in neat black handwriting that keeps the upper and lower case exactly as quoted, with a capital " +
  "letter height of about one thirtieth of the image height, placed just beside or inside the shape they name; a " +
  "label described as a smaller second line sits directly under its label in smaller lowercase lettering. Spell " +
  "every label exactly as given and write each one exactly once. Add no other words, letters, numbers or symbols " +
  "anywhere.";

/** 연작(인프라 성장 1·2·3단계, 런타임 솔로·게이트웨이)이 같은 사물을 같은 모양으로 그리게 하는 어휘. */
export const diagramGlyphs =
  "Draw recurring objects the same simple way: a person is a small head-and-shoulders outline; a server is a tall " +
  "rounded rectangle with two short horizontal slots near its top; a container is a plain square; a process is a " +
  "rounded rectangle with a thin band across its top; a database is a cylinder; a cache is a stack of three thin " +
  "flat disks; a queue is a row of three small squares threaded by one arrow; a cloud is a three-bump cloud " +
  "outline; a browser is a window outline with three small dots in its top bar; a phone is a tall rounded " +
  "rectangle with a short speaker slot at the top; application source is a folded-corner page with three short " +
  "lines.";

/**
 * 아직 페이지에 붙이지 않은 그림. 페이지에 붙인 그림의 프롬프트는 그 `Docs.Figure` 의 `prompt` 가
 * 유일한 원본이다 — 붙이는 순간 여기서 지우고 옮긴다.
 */
export const diagramDrafts: Record<string, DiagramPrompt> = {
  "write-once-deploy-everywhere": {
    where: "script/diagramPrompts.ts — draft for /docs/intro/fundamentals, Write once, deploy everywhere",
    size: "1536x1024",
    subject:
      'A single small hexagon on the left labelled "Akan App". Four long smooth arrows fan out from it to the right, ' +
      'ending at a browser labelled "Web", a phone labelled "Mobile", a stack of three flat server boxes labelled ' +
      '"Server" and a database cylinder labelled "Database". A thin bracket groups the four on the right. The ' +
      "arrow to the browser is the red accent.",
  },
};

/**
 * 블로그 목록 썸네일. `Docs.Figure` 가 아니라 페이지에서 읽을 프롬프트가 없으므로 여기가 원본이다.
 * 180px 너비로 보이므로 라벨 없이 굵은 선의 큰 도형 몇 개로만 그린다.
 */
export const thumbnailPrompts: Record<string, DiagramPrompt> = {
  "blog-production-stability": {
    where: "script/diagramPrompts.ts — thumbnail for /blog/production-stability",
    size: "1536x1024",
    subject:
      "A blog thumbnail, so draw only a few large shapes with thick bold lines, filling the middle of the frame. " +
      "On the left, a big round stopwatch with its hand pointing straight up. To its right, a wide simple chart " +
      "with one horizontal axis and one vertical axis; across the whole chart runs a single long line that stays " +
      "perfectly flat and steady from left to right, like a calm heartbeat monitor with no spikes. The flat line " +
      "is the red accent. No labels, no tick marks, no numbers.",
  },
  "blog-benchmark": {
    where: "script/diagramPrompts.ts — thumbnail for /blog/benchmark",
    size: "1536x1024",
    subject:
      "A blog thumbnail, so draw only a few large shapes with thick bold lines, filling the middle of the frame. " +
      "In the centre, a big half-circle speedometer gauge with a few short tick marks along its arc and a needle " +
      "pointing far to the right, near the maximum. To the right of the gauge, a small bar chart of four upright " +
      "bars of rising height standing on one baseline. The needle is the red accent. No labels, no numbers.",
  },
  "blog-manifesto": {
    where: "script/diagramPrompts.ts — thumbnail for /blog/manifesto",
    size: "1536x1024",
    subject:
      "A blog thumbnail, so draw only a few large shapes with thick bold lines, filling the middle of the frame. " +
      "A calm beach scene in simple outlines: a person seen from the side sits relaxed in a low folding beach " +
      "chair with a laptop open on their lap, a palm tree leans in from the left edge, a straight horizon line " +
      "of the sea runs behind them, and a half sun sits on the horizon to the right with a few short rays. The " +
      "sun is the red accent. No labels, no words.",
  },
};

const figureTag = "Docs.Figure";
/** `Docs.Figure` 의 width/height 기본값과 같아야 한다 — 생략된 크기를 여기서 같은 값으로 읽는다. */
const defaultFigureWidth = 1536;
const defaultFigureHeight = 1024;

const attributeOf = (element: ts.JsxOpeningLikeElement, name: string) =>
  element.attributes.properties.find(
    (attr): attr is ts.JsxAttribute => ts.isJsxAttribute(attr) && ts.isIdentifier(attr.name) && attr.name.text === name,
  )?.initializer;

const literalOf = (initializer: ts.JsxAttributeValue | undefined) => {
  const node = initializer && ts.isJsxExpression(initializer) ? initializer.expression : initializer;
  if (!node) return undefined;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  return undefined;
};

/**
 * 페이지 소스의 `Docs.Figure` 를 읽어 그림 id → 프롬프트를 만든다. 실행하지 않고 AST 로만 읽으므로
 * `image`·`prompt`·`width`·`height` 는 리터럴이어야 한다. `prompt` 의 줄바꿈과 들여쓰기는 공백 하나로 접는다.
 */
export const loadDiagramPrompts = async (appRoot: string) => {
  const prompts: Record<string, DiagramPrompt> = { ...diagramDrafts, ...thumbnailPrompts };
  const problems: string[] = [];

  for await (const file of new Bun.Glob("page/**/*.tsx").scan({ cwd: appRoot })) {
    const sourceText = await Bun.file(path.join(appRoot, file)).text();
    if (!sourceText.includes(figureTag)) continue;
    const sourceFile = ts.createSourceFile(file, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

    const visit = (node: ts.Node) => {
      node.forEachChild(visit);
      if (!ts.isJsxSelfClosingElement(node) && !ts.isJsxOpeningElement(node)) return;
      if (node.tagName.getText(sourceFile) !== figureTag) return;

      const where = `${file}:${sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1}`;
      const id = literalOf(attributeOf(node, "image"));
      const prompt = literalOf(attributeOf(node, "prompt"));
      const width = literalOf(attributeOf(node, "width")) ?? defaultFigureWidth;
      const height = literalOf(attributeOf(node, "height")) ?? defaultFigureHeight;
      const size = diagramImageSizes.find((known) => known === `${width}x${height}`);
      if (typeof id !== "string" || typeof prompt !== "string") {
        problems.push(`${where}: image and prompt must be literal strings`);
        return;
      }
      if (!size) {
        problems.push(`${where}: ${width}x${height} is not one of ${diagramImageSizes.join(", ")}`);
        return;
      }

      const subject = prompt.replace(/\s+/g, " ").trim();
      const existing = prompts[id];
      if (existing && existing.subject !== subject) {
        problems.push(`${id}: ${existing.where} and ${where} carry different prompts for the same image`);
        return;
      }
      prompts[id] = existing ?? { where, size, subject };
    };
    visit(sourceFile);
  }

  return { prompts, problems };
};
