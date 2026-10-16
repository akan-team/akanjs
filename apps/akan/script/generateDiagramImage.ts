import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  type DiagramImageQuality,
  type DiagramPrompt,
  diagramGlyphs,
  diagramStyle,
  loadDiagramPrompts,
} from "./diagramPrompts";

const appRoot = path.resolve(import.meta.dir, "..");
const outputRoot = path.join(appRoot, "public", "akanjsImage", "diagrams");

interface ImageRequest {
  model: string;
  prompt: string;
  size: string;
  quality: DiagramImageQuality;
}

interface ImageProvider {
  /** 이 제공자의 키가 들어오는 환경변수 이름. */
  keyEnv: string;
  baseUrl: string;
  model: string;
  /** 제공자마다 본문 키가 달라서 직렬화를 제공자가 소유한다. 모델별 미지원 파라미터가 있어 곡 필요한 것만 넣는다. */
  body: (request: ImageRequest) => Record<string, unknown>;
  /** seedream 5.0 은 3.69MP 미만을 400 으로 거절한다 — 문서의 크기 표기를 모델이 받는 크기로 옮긴다. */
  size?: (size: string) => string;
}

const scaledSizes: Record<string, string> = {
  "1024x1024": "2048x2048",
  "1536x1024": "2496x1664",
  "1024x1536": "1664x2496",
};

const providers: Record<string, ImageProvider> = {
  openai: {
    keyEnv: "OPENAI_API_KEY",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-image-2.5-sunburst",
    body: ({ model, prompt, size, quality }) => ({ model, prompt, size, quality, n: 1 }),
  },
  bytedance: {
    keyEnv: "BYTEDANCE_API_KEY",
    baseUrl: "https://ark.ap-southeast.bytepluses.com/api/v3",
    model: "dola-seedream-5-0-pro-260628",
    size: (size) => scaledSizes[size] ?? size,
    body: ({ model, prompt, size }) => ({ model, prompt, size, response_format: "b64_json", watermark: false }),
  },
};

interface RunOptions {
  provider: string;
  ids: string[];
  all: boolean;
  dryRun: boolean;
  check: boolean;
  model: string;
  quality: DiagramImageQuality;
  baseUrl: string;
  out?: string;
  maxEdge: number;
  keyFile?: string;
}

interface ImageResponse {
  data?: { b64_json?: string; url?: string }[];
  usage?: Record<string, number>;
  error?: { message?: string; code?: string };
  message?: string;
}

const readOptions = (): RunOptions => {
  const argv = process.argv.slice(2);
  const value = (name: string) => {
    const index = argv.indexOf(`--${name}`);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const providerName = value("provider") ?? "bytedance";
  const provider = providers[providerName];
  if (!provider) {
    console.error(`Unknown provider: ${providerName}. Known providers: ${Object.keys(providers).join(", ")}`);
    process.exit(1);
  }
  const quality = value("quality");

  return {
    provider: providerName,
    ids: (value("id") ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean),
    all: argv.includes("--all"),
    dryRun: argv.includes("--dry-run"),
    check: argv.includes("--check"),
    model: value("model") ?? provider.model,
    quality: quality === "low" || quality === "medium" ? quality : "high",
    baseUrl: value("base-url") ?? provider.baseUrl,
    out: value("out"),
    maxEdge: Number(value("max-edge") ?? 1600) || 1600,
    keyFile: value("key-file"),
  };
};

/** 키는 환경변수(Bun 이 cwd 의 .env 도 읽는다)나 파일에서만 받고, 어떤 경로로도 값 전체를 출력하지 않는다. */
const readApiKey = async (options: RunOptions): Promise<string | null> => {
  const fromEnv = process.env[providers[options.provider].keyEnv]?.trim();
  if (fromEnv) return fromEnv;
  if (!options.keyFile) return null;
  const fromFile = await readFile(options.keyFile, "utf8").catch(() => "");
  return fromFile.trim() || null;
};

const promptOf = (prompt: DiagramPrompt) => `${diagramStyle}\n\n${diagramGlyphs}\n\n${prompt.subject}`;

/**
 * 2.5K 로 받은 원본은 문서에 쓸 이유가 없고 저장소만 무겁게 한다 — 긴 변을 줄여 PNG 로 다시 굽는다.
 * 밝기를 올리는 것은 모델이 순백 대신 그리는 옅은 회색 종이를 흰색으로 날려 `Docs.Figure` 의 blend 가
 * 배경을 완전히 지우게 하려는 것이고, 32색 팔레트는 선화를 1/10 크기로 줄이면서 빨간 강조선을 남긴다
 * (16색이면 가는 빨간 선이 회색으로 뭉개진다). 그래도 원본보다 커지면 원본을 쓴다.
 */
const shrink = async (bytes: Buffer, maxEdge: number) => {
  try {
    const resized = await new Bun.Image(bytes, { autoOrient: true })
      .resize(maxEdge, maxEdge, { fit: "inside", withoutEnlargement: true })
      .modulate({ brightness: 1.12 })
      .png({ palette: true, colors: 32 })
      .buffer();
    return resized.byteLength < bytes.byteLength ? resized : bytes;
  } catch {
    return bytes;
  }
};

/**
 * 어느 키를 쓰고 있는지만 지문으로 알려 준다 — 지문이 같으면 같은 키다. `GET /models` 는 과금 없이
 * 도는 호출이라 키·주소 문제와 잔액 문제를 가른다. Ark 는 이 경로가 없어도 401/404 로 답하므로
 * 인증이 통과했는지는 여전히 읽힌다.
 */
const probe = async (apiKey: string, options: RunOptions) => {
  const digest = new Bun.CryptoHasher("sha256").update(apiKey).digest("hex").slice(0, 12);
  console.info(`provider=${options.provider} key sha256=${digest}`);
  const response = await fetch(`${options.baseUrl}/models`, {
    headers: { authorization: `Bearer ${apiKey}` },
  });
  if (!response.ok) {
    console.info(`GET ${options.baseUrl}/models -> ${response.status} ${(await response.text()).slice(0, 300)}`);
    return;
  }
  const catalogue = (await response.json()) as { data?: { id?: string }[] };
  const ids = catalogue.data?.map((model) => model.id ?? "") ?? [];
  /** 그림 모델만 골라 보여 준다 — 이 계정이 실제로 어떤 이미지 모델 id 를 쓰는지가 여기서 나온다. */
  const imageIds = ids.filter((id) => /image|seedream|seededit/i.test(id));
  console.info(`GET /models -> 200 · ${ids.length} models · image: ${imageIds.join(", ") || "(none)"}`);
};

const requestImage = async (
  { id, prompt, apiKey }: { id: string; prompt: DiagramPrompt; apiKey: string },
  options: RunOptions,
) => {
  const provider = providers[options.provider];
  const response = await fetch(`${options.baseUrl}/images/generations`, {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify(
      provider.body({
        model: options.model,
        prompt: promptOf(prompt),
        size: (provider.size ?? ((size: string) => size))(prompt.size),
        quality: prompt.quality ?? options.quality,
      }),
    ),
  });
  const body = (await response.json().catch(() => ({}))) as ImageResponse;
  if (!response.ok) {
    console.error(`[${id}] ${response.status} ${body.error?.message ?? body.message ?? JSON.stringify(body)}`);
    return null;
  }
  const image = body.data?.[0];
  if (image?.b64_json) return Buffer.from(image.b64_json, "base64");
  if (image?.url) return Buffer.from(await (await fetch(image.url)).arrayBuffer());
  console.error(`[${id}] The response carried no image payload: ${JSON.stringify(body).slice(0, 300)}`);
  return null;
};

const run = async () => {
  const options = readOptions();

  if (options.check) {
    const apiKey = await readApiKey(options);
    if (!apiKey) {
      console.error(`No API key. Export ${providers[options.provider].keyEnv} or pass --key-file <path>.`);
      process.exit(1);
    }
    await probe(apiKey, options);
    return;
  }

  const { prompts, problems } = await loadDiagramPrompts(appRoot);
  if (problems.length > 0) {
    console.error(problems.join("\n"));
    process.exit(1);
  }
  const known = Object.keys(prompts).sort();
  const knownList = known.map((id) => `  ${id.padEnd(30)} ${prompts[id].where}`).join("\n");

  const targets = options.all ? known : options.ids;
  const unknown = targets.filter((id) => !prompts[id]);
  if (unknown.length > 0) {
    console.error(`Unknown diagram id: ${unknown.join(", ")}. Known ids:\n${knownList}`);
    process.exit(1);
  }
  if (targets.length === 0) {
    console.error(`Pass --id <id[,id]> or --all. Known ids:\n${knownList}`);
    process.exit(1);
  }
  if (options.out && targets.length > 1) {
    console.error("--out names one file, so it takes exactly one --id.");
    process.exit(1);
  }

  if (options.dryRun) {
    for (const id of targets) {
      console.info(`\n--- ${id}  (${prompts[id].where} · ${prompts[id].size})\n${promptOf(prompts[id])}`);
    }
    return;
  }

  const apiKey = await readApiKey(options);
  if (!apiKey) {
    console.error(`No API key. Export ${providers[options.provider].keyEnv} or pass --key-file <path>.`);
    process.exit(1);
  }

  await mkdir(outputRoot, { recursive: true });
  for (const id of targets) {
    const bytes = await requestImage({ id, prompt: prompts[id], apiKey }, options);
    if (!bytes) process.exit(1);
    const shrunk = await shrink(bytes, options.maxEdge);
    const outputPath = path.join(outputRoot, `${options.out ?? id}.png`);
    await writeFile(outputPath, shrunk);
    console.info(
      `[${id}] ${path.relative(appRoot, outputPath)} · ${options.provider}/${options.model} · ` +
        `${Math.round(bytes.byteLength / 1024)}KB -> ${Math.round(shrunk.byteLength / 1024)}KB`,
    );
  }
};

void run();
