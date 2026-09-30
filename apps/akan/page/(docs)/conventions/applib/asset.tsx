import { usePage } from "@apps/akan/client";
import { Code, cardGridRecipe, Divider, Docs, DocsToc, panelRecipe } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { page } from "akanjs/client";

export default page().render(() => {
  const { l } = usePage();

  const chip = "mt-2 block overflow-x-auto whitespace-nowrap rounded-md bg-muted/60 px-2.5 py-1.5 font-mono text-xs";
  const bulletList = "my-4 list-disc space-y-2 pl-5";

  const folderCards = [
    {
      title: "public/",
      subtitle: l.trans({ en: "The browser may download it", ko: "브라우저가 받아 가도 되는 파일" }),
      desc: l.trans({
        en: "Served as static files by URL. Images, PDFs, downloadable JSON and icons go here.",
        ko: "URL로 바로 서빙됩니다. 이미지, PDF, 내려받는 JSON, 아이콘을 둡니다.",
      }),
      code: "public/images/hero.png → /images/hero.png",
    },
    {
      title: "private/",
      subtitle: l.trans({ en: "Only the server reads it", ko: "서버만 읽는 파일" }),
      desc: l.trans({
        en: "Never served. Seed data, private JSON, model files and resources for server jobs go here. A desktop app that carries its server ships the folder in plain text on the user's computer.",
        ko: "서빙되지 않습니다. seed 데이터, 비공개 JSON, 모델 파일, 서버 작업용 리소스를 둡니다. 서버를 싣는 데스크톱 앱은 이 폴더를 사용자 컴퓨터에 평문으로 싣습니다.",
      }),
      code: "private/model/yolo.onnx",
    },
  ];

  const urlItems = [
    { name: "/docs/product-guide.pdf", desc: "`apps/myapp/public/docs/product-guide.pdf`" },
    { name: "/data/sample-products.json", desc: "`apps/myapp/public/data/sample-products.json`" },
    { name: "/images/hero.png", desc: "`apps/myapp/public/images/hero.png`" },
  ];

  const privateColumns = [
    { key: "file", label: l.trans({ en: "File", ko: "파일" }), code: true },
    { key: "use", label: l.trans({ en: "Used for", ko: "용도" }) },
  ];
  const privateRows = [
    {
      file: "apps/myapp/private/seed/products.json",
      use: l.trans({ en: "Seed data the server loads.", ko: "서버가 불러오는 seed 데이터입니다." }),
    },
    {
      file: "apps/myapp/private/model/yolo.onnx",
      use: l.trans({ en: "Model weights for server-side inference.", ko: "서버에서 추론할 때 쓰는 모델 파일입니다." }),
    },
    {
      file: "libs/shared/private/recommendation/default-rules.json",
      use: l.trans({
        en: "A library's internal rules, covered under Library Assets below.",
        ko: "라이브러리의 내부 규칙으로, 아래 라이브러리 애셋에서 다룹니다.",
      }),
    },
  ];

  const libItems = [
    {
      name: <span className="font-sans">{l.trans({ en: "Library's public/", ko: "라이브러리 public/" })}</span>,
      desc: "`libs/shared/public/banner/logo.png`",
    },
    {
      name: <span className="font-sans">{l.trans({ en: "Inside the app", ko: "앱 안에서" })}</span>,
      desc: "`apps/myapp/public/libs/shared/banner/logo.png`",
    },
    {
      name: <span className="font-sans">{l.trans({ en: "Browser URL", ko: "브라우저 URL" })}</span>,
      desc: "`/libs/shared/banner/logo.png`",
    },
    {
      name: <span className="font-sans">{l.trans({ en: "Library's private/", ko: "라이브러리 private/" })}</span>,
      desc: "`libs/shared/private/recommendation/default-rules.json`",
    },
    {
      name: <span className="font-sans">{l.trans({ en: "Inside the app", ko: "앱 안에서" })}</span>,
      desc: "`apps/myapp/private/libs/shared/recommendation/default-rules.json`",
    },
    {
      name: <span className="font-sans">{l.trans({ en: "Server code reads", ko: "서버 코드가 읽는 경로" })}</span>,
      desc: '`privateFile("libs/shared/recommendation/default-rules.json")`',
    },
  ];

  const folderColumns = [
    { key: "public", label: "public/", code: true },
    { key: "private", label: "private/", code: true },
  ];
  const inPublic = { public: true, private: false };
  const inPrivate = { public: false, private: true };
  const folderGroups = [
    {
      label: l.trans({ en: "Anyone may download it", ko: "누구나 받아 가도 되는 파일" }),
      rows: [
        {
          name: "images/hero.png",
          desc: l.trans({
            en: "UI images and icons, drawn with `Image` from `akanjs/ui`.",
            ko: "UI 이미지와 아이콘으로, `akanjs/ui`의 `Image`로 그립니다.",
          }),
          marks: inPublic,
        },
        {
          name: "docs/product-guide.pdf",
          desc: l.trans({ en: "PDFs and other files a user downloads.", ko: "사용자가 내려받는 PDF 같은 파일입니다." }),
          marks: inPublic,
        },
        {
          name: "data/sample-products.json",
          desc: l.trans({ en: "JSON the browser loads by URL.", ko: "브라우저가 URL로 불러오는 JSON입니다." }),
          marks: inPublic,
        },
      ],
    },
    {
      label: l.trans({ en: "Only the server may read it", ko: "서버만 읽어야 하는 파일" }),
      rows: [
        {
          name: "seed/products.json",
          desc: l.trans({ en: "Internal data such as seed records.", ko: "seed 레코드 같은 내부 데이터입니다." }),
          marks: inPrivate,
        },
        {
          name: "model/yolo.onnx",
          desc: l.trans({ en: "Model weights.", ko: "모델 가중치 파일입니다." }),
          marks: inPrivate,
        },
        {
          name: "recommendation/default-rules.json",
          desc: l.trans({ en: "Server-only configuration and rules.", ko: "서버 전용 설정과 규칙입니다." }),
          marks: inPrivate,
        },
      ],
    },
  ];

  const buildColumns = [
    { key: "folder", label: l.trans({ en: "Folder", ko: "폴더" }) },
    { key: "build", label: l.trans({ en: "In the build", ko: "빌드에서" }) },
  ];
  const buildRows = [
    {
      folder: "`private/`",
      build: l.trans({ en: "Copied into every build.", ko: "모든 빌드에 복사됩니다." }),
    },
    {
      folder: "`public/`",
      build: l.trans({
        en: "Copied when the app serves pages; an API-only build (`web: false`) leaves it out.",
        ko: "앱이 페이지를 서빙할 때 복사되고, API 전용 빌드(`web: false`)에는 들어가지 않습니다.",
      }),
    },
    {
      folder: l.trans({ en: "Fonts in `public/`", ko: "`public/`의 폰트" }),
      build: l.trans({
        en: "Unreferenced fonts are dropped by `assets.pruneFonts`; list any to keep in `assets.keepFonts`.",
        ko: "참조되지 않는 폰트는 `assets.pruneFonts`가 빼고, 남길 폰트는 `assets.keepFonts`에 적습니다.",
      }),
    },
  ];

  return (
    <Scroll>
      <Scroll.Slide id="asset-overview" title={l.trans({ en: "Asset Folders", ko: "애셋 폴더" })}>
        <Docs.Title>{l.trans({ en: "Asset Folders", ko: "애셋 폴더" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  Apps and libraries keep file assets in two folders at their root, beside <code>lib/</code> and{" "}
                  <code>ui/</code>. Which one a file goes in depends on one question: may the browser download it?
                </span>
              ),
              ko: (
                <span>
                  앱과 라이브러리는 파일 애셋을 <code>lib/</code>, <code>ui/</code>와 나란히 루트의 두 폴더에 둡니다.
                  어느 폴더에 둘지는 "브라우저가 이 파일을 받아 가도 되는가?" 하나로 정합니다.
                </span>
              ),
            })}
          </div>
          <div className={cardGridRecipe({ cols: "mdTwo" }, "my-4")}>
            {folderCards.map((card) => (
              <div key={card.title} className={panelRecipe({ radius: "lg", padding: "sm" }, "min-w-0")}>
                <div className="font-mono font-semibold text-primary">{card.title}</div>
                <div className="mb-2 text-foreground/50 text-xs">{card.subtitle}</div>
                <div className="text-foreground/70 text-sm">{card.desc}</div>
                <code className={chip}>{card.code}</code>
              </div>
            ))}
          </div>
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>No wrapping folder.</strong> There is no <code>asset/</code> folder; <code>public/</code>{" "}
                    and <code>private/</code> sit directly at the root.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>감싸는 폴더는 없습니다.</strong> <code>asset/</code> 폴더 없이 <code>public/</code>과{" "}
                    <code>private/</code>이 루트에 바로 놓입니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Libraries have the same pair.</strong> Every app that depends on the library can use them,
                    as the Library Assets section shows.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>라이브러리에도 같은 두 폴더가 있습니다.</strong> 그 라이브러리에 의존하는 모든 앱이 쓸 수
                    있으며, 아래 라이브러리 애셋에서 다룹니다.
                  </span>
                ),
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="public-assets" title={l.trans({ en: "Public Assets", ko: "public 애셋" })}>
        <Docs.Title>{l.trans({ en: "Public Assets", ko: "public 애셋" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  The server serves every file under <code>public/</code> as a static file. Its URL is the file path
                  with <code>apps/myapp/public</code> dropped:
                </span>
              ),
              ko: (
                <span>
                  서버는 <code>public/</code> 아래 파일을 정적 파일로 그대로 서빙합니다. URL은 파일 경로에서{" "}
                  <code>apps/myapp/public</code>을 뺀 것입니다:
                </span>
              ),
            })}
          </div>
          <Docs.IntroTable type="URL" descLabel={l.trans({ en: "File", ko: "파일" })} items={urlItems} />
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>No locale in the URL.</strong> Pages live under <code>/ko/…</code> and <code>/en/…</code>,
                    but public files do not: <code>/ko/images/hero.png</code> is a 404.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>URL에 언어가 붙지 않습니다.</strong> 페이지는 <code>/ko/…</code>, <code>/en/…</code> 아래에
                    있지만 public 파일은 그렇지 않아서, <code>/ko/images/hero.png</code>는 404를 돌려줍니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      Link to a file with a plain <code>{"<a>"}</code>.
                    </strong>{" "}
                    <code>Link</code> from <code>akanjs/ui</code> adds the locale and navigates as a page, so it misses
                    the file.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      파일 링크는 일반 <code>{"<a>"}</code>로 겁니다.
                    </strong>{" "}
                    <code>akanjs/ui</code>의 <code>Link</code>는 언어를 붙이고 페이지로 이동하므로 파일을 찾지 못합니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Cached for 5 minutes in production.</strong> A replaced file can show its old version for
                    that long, while dev never caches.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>프로덕션에서는 5분간 캐시됩니다.</strong> 파일을 바꿔도 그동안은 예전 버전이 보일 수
                    있습니다. 개발 서버는 캐시하지 않습니다.
                  </span>
                ),
              })}
            </li>
          </ul>

          <div>
            {l.trans({
              en: (
                <span>
                  Link to a PDF with a plain <code>{"<a>"}</code>:
                </span>
              ),
              ko: (
                <span>
                  PDF 링크는 일반 <code>{"<a>"}</code> 태그로 겁니다:
                </span>
              ),
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/myapp/ui/ProductGuideLink.tsx"
            code={`import { usePage } from "@apps/myapp/client";

interface ProductGuideLinkProps {
  className?: string;
}
export const ProductGuideLink = ({ className }: ProductGuideLinkProps) => {
  const { l } = usePage();
  return (
    <a
      className={className}
      href="/docs/product-guide.pdf"
      target="_blank"
      rel="noreferrer"
    >
      {l.trans({ en: "Open product guide", ko: "제품 가이드 열기" })}
    </a>
  );
};`}
          />
          <div>
            {l.trans({
              en: "Load a JSON file in the browser from its URL:",
              ko: "JSON 파일은 브라우저에서 URL로 불러옵니다:",
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/myapp/webkit/useSampleProducts.tsx"
            code={`export const useSampleProducts = () => {
  const load = async () => {
    const res = await window.fetch("/data/sample-products.json");
    return await res.json();
  };
  return { load };
};`}
          />
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      Call <code>window.fetch</code>.
                    </strong>{" "}
                    The <code>fetch</code> you import from <code>@apps/myapp/client</code> is Akan's API client, not the
                    browser's.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>window.fetch</code>를 씁니다.
                    </strong>{" "}
                    <code>@apps/myapp/client</code>에서 import하는 <code>fetch</code>는 브라우저의 fetch가 아니라 Akan
                    API 클라이언트입니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Browser only.</strong> A relative URL has no origin on the server, which is why the code
                    lives in <code>webkit/</code>. Server code reads files from disk, as Private Assets shows.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>브라우저 전용입니다.</strong> 서버에는 상대 URL이 가리킬 origin이 없으므로 이 코드는{" "}
                    <code>webkit/</code>에 둡니다. 서버 코드는 아래 private 애셋처럼 디스크에서 파일을 읽습니다.
                  </span>
                ),
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="optimized-images" title={l.trans({ en: "Optimized Images", ko: "이미지 최적화" })}>
        <Docs.Title>{l.trans({ en: "Optimized Images", ko: "이미지 최적화" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  Draw UI images from <code>public/</code> with <code>Image</code> from <code>akanjs/ui</code> instead
                  of a bare <code>{"<img>"}</code>. Like Next.js image optimization, the server sends a smaller, lighter
                  version of the file:
                </span>
              ),
              ko: (
                <span>
                  <code>public/</code>의 UI 이미지는 일반 <code>{"<img>"}</code> 태그 대신 <code>akanjs/ui</code>의{" "}
                  <code>Image</code>로 그립니다. Next.js의 이미지 최적화처럼 서버가 더 작고 가벼운 버전을 보냅니다:
                </span>
              ),
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/myapp/ui/HeroImage.tsx"
            code={`import { usePage } from "@apps/myapp/client";
import { Image } from "akanjs/ui";

interface HeroImageProps {
  className?: string;
}
export const HeroImage = ({ className }: HeroImageProps) => {
  const { l } = usePage();
  return (
    <Image
      className={className}
      src="/images/hero.png"
      alt={l.trans({ en: "Product hero", ko: "제품 대표 이미지" })}
      width={1200}
      height={640}
      priority
    />
  );
};`}
          />
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Resized and cached.</strong> Each image is served at the width it is drawn, as WebP when the
                    browser accepts it. SVG files are sent unchanged.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>크기를 줄이고 캐시합니다.</strong> 이미지는 그려지는 폭에 맞게 줄여, 브라우저가 WebP를
                    지원하면 WebP로 보냅니다. SVG 파일은 그대로 보냅니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      Give <code>width</code> and <code>height</code>.
                    </strong>{" "}
                    They choose the size the server sends and reserve the space before the image loads.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>width</code>와 <code>height</code>를 지정합니다.
                    </strong>{" "}
                    서버가 보낼 크기를 정하고, 이미지가 오기 전에 자리를 잡아 둡니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      <code>priority</code> only for the first screen.
                    </strong>{" "}
                    It preloads the image and loads it right away; every other image loads lazily.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>priority</code>는 첫 화면에만 씁니다.
                    </strong>{" "}
                    이미지를 미리 불러와 바로 그립니다. 나머지 이미지는 화면에 가까워질 때 불러옵니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>The rest is config.</strong> A remote host needs <code>images.remotePatterns</code>, and a{" "}
                    <code>quality</code> other than 75 needs <code>images.qualities</code> in{" "}
                    <code>akan.config.ts</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>나머지는 설정입니다.</strong> 외부 호스트의 이미지는 <code>akan.config.ts</code>의{" "}
                    <code>images.remotePatterns</code>에, 75가 아닌 <code>quality</code> 값은{" "}
                    <code>images.qualities</code>에 등록해야 합니다.
                  </span>
                ),
              })}
            </li>
          </ul>
          <Docs.LinkGrid
            items={[
              {
                href: "/cheatsheet/performance/image",
                title: l.trans({ en: "Image Optimization", ko: "이미지 최적화" }),
                desc: l.trans({
                  en: "srcSet, formats, caching and every prop, step by step.",
                  ko: "srcSet, 포맷, 캐시, 모든 prop을 단계별로 다룹니다.",
                }),
              },
              {
                href: "/conventions/applib/config#images",
                title: l.trans({ en: "images in akan.config.ts", ko: "akan.config.ts의 images" }),
                desc: l.trans({
                  en: "Widths, formats, qualities and the remote hosts the optimizer may fetch.",
                  ko: "이미지 최적화에 쓰는 폭, 포맷, quality와 허용할 외부 호스트를 정합니다.",
                }),
              },
            ]}
          />
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="private-assets" title={l.trans({ en: "Private Assets", ko: "private 애셋" })}>
        <Docs.Title>{l.trans({ en: "Private Assets", ko: "private 애셋" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  Files under <code>private/</code> are never served, so no URL reaches them. Server code reads them
                  from disk to load data, run inference or start a service. They are not secret from whoever holds the
                  server's files, though: a desktop app that carries the server (<code>native.desktop.server</code>)
                  holds them in plain text, so keep keys and license files that must stay yours out of such an app.
                </span>
              ),
              ko: (
                <span>
                  <code>private/</code> 아래 파일은 서빙되지 않으므로 어떤 URL로도 접근할 수 없습니다. 서버 코드가
                  디스크에서 읽어 데이터를 불러오고, 추론을 돌리고, 서비스를 초기화하는 데 씁니다. 다만 서버 파일을 가진
                  사람에게는 비밀이 아닙니다. 서버를 싣는 데스크톱 앱(<code>native.desktop.server</code>)은 이 파일을
                  평문으로 실으므로, 남에게 보이면 안 되는 키와 라이선스 파일은 그런 앱에 두지 않습니다.
                </span>
              ),
            })}
          </div>
          <Docs.Table columns={privateColumns} rows={privateRows} stacked />

          <Docs.SubSubTitle>
            {l.trans({ en: "Read from the app folder", ko: "앱 폴더 기준으로 읽기" })}
          </Docs.SubSubTitle>
          <div>
            {l.trans({
              en: (
                <span>
                  Build the path from <code>AKAN_APP_DIR</code>, the app's own folder, with one small helper in{" "}
                  <code>srvkit/</code>:
                </span>
              ),
              ko: (
                <span>
                  경로는 앱 자신의 폴더인 <code>AKAN_APP_DIR</code>에서 만듭니다. <code>srvkit/</code>에 작은 헬퍼
                  하나를 둡니다:
                </span>
              ),
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/myapp/srvkit/privateFile.ts"
            code={`import path from "node:path";

export const privateFile = (relativePath: string) => {
  const appDir = process.env.AKAN_APP_DIR ?? path.dirname(Bun.main);
  return Bun.file(path.join(appDir, "private", relativePath));
};`}
          />
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      <code>AKAN_APP_DIR</code> is the app folder everywhere.
                    </strong>{" "}
                    It is <code>apps/myapp</code> under <code>akan start</code> and <code>dist/apps/myapp</code> in a
                    build, and the server sets it before any app module loads, a desktop app's included. A script run
                    outside the server has none, which is why the helper falls back to the folder of{" "}
                    <code>Bun.main</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>AKAN_APP_DIR</code> 값은 어디서나 앱 폴더입니다.
                    </strong>{" "}
                    <code>akan start</code>에서는 <code>apps/myapp</code>, 빌드에서는 <code>dist/apps/myapp</code>
                    입니다. 서버는 앱 모듈을 불러오기 전에 이 값을 정하며, 데스크톱 앱에 넣은 서버도 같습니다. 서버
                    밖에서 도는 스크립트에는 값이 없어서 헬퍼가 <code>Bun.main</code>의 폴더로 대신합니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      It lives in <code>srvkit/</code>.
                    </strong>{" "}
                    Code that touches <code>Bun</code> or <code>process.env</code> belongs there, never in a page or a
                    client file.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>srvkit/</code>에 둡니다.
                    </strong>{" "}
                    <code>Bun</code>이나 <code>process.env</code>를 건드리는 코드는 그곳에 두고, 페이지나 클라이언트
                    파일에는 두지 않습니다.
                  </span>
                ),
              })}
            </li>
          </ul>
          <Docs.Alert type="warning">
            {l.trans({
              en: (
                <span>
                  <strong>
                    Never read <code>./private/…</code> directly.
                  </strong>{" "}
                  A relative path follows the working directory, which is the workspace root under{" "}
                  <code>akan start</code>. The same line finds the file in a build and misses it in dev.
                </span>
              ),
              ko: (
                <span>
                  <strong>
                    <code>./private/…</code>로 바로 읽지 마세요.
                  </strong>{" "}
                  상대 경로는 작업 디렉터리를 따라가는데, <code>akan start</code>에서는 그것이 워크스페이스 루트입니다.
                  같은 코드가 빌드에서는 파일을 찾고 개발 중에는 놓칩니다.
                </span>
              ),
            })}
          </Docs.Alert>

          <Docs.SubSubTitle>{l.trans({ en: "Load data and models", ko: "데이터와 모델 불러오기" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: "Read a JSON file with the helper:",
              ko: "JSON 파일은 헬퍼로 읽습니다:",
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/myapp/srvkit/seedProducts.ts"
            code={`import { privateFile } from "./privateFile";

export const loadInitialProducts = async () => {
  return await privateFile("seed/products.json").json();
};`}
          />
          <div>
            {l.trans({
              en: (
                <span>
                  A model file is loaded once, when the server starts, inside an <code>adapt()</code> class:
                </span>
              ),
              ko: (
                <span>
                  모델 파일은 서버가 시작할 때 <code>adapt()</code> 클래스 안에서 한 번만 불러옵니다:
                </span>
              ),
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/myapp/srvkit/yoloDetector.ts"
            code={`import { adapt } from "akanjs/service";
import { privateFile } from "./privateFile";

export class YoloDetector extends adapt("yoloDetector" as const, () => ({})) {
  #model: YoloModel | null = null;

  override async onInit() {
    this.#model = await loadYoloModel(privateFile("model/yolo.onnx"));
  }

  async detect(image: ArrayBuffer) {
    return this.#model?.detect(image) ?? [];
  }
}`}
          />
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      <code>onInit</code> runs once per process.
                    </strong>{" "}
                    The weights are read at boot, not on every request.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>onInit</code>은 프로세스마다 한 번 실행됩니다.
                    </strong>{" "}
                    가중치는 요청마다 읽지 않고 시작할 때 한 번만 읽습니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      Inject it with <code>plug(YoloDetector)</code>.
                    </strong>{" "}
                    <code>loadYoloModel</code> and <code>YoloModel</code> stand for your ONNX runtime's loader.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      서비스에는 <code>plug(YoloDetector)</code>로 주입합니다.
                    </strong>{" "}
                    <code>loadYoloModel</code>과 <code>YoloModel</code>은 사용하는 ONNX 런타임의 로더로 바꿔 넣을
                    자리입니다.
                  </span>
                ),
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="library-asset-sync" title={l.trans({ en: "Library Assets", ko: "라이브러리 애셋" })}>
        <Docs.Title>{l.trans({ en: "Library Assets", ko: "라이브러리 애셋" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  A library keeps assets in its own <code>public/</code> and <code>private/</code>. Every app that
                  depends on it gets both under <code>libs/&lt;lib&gt;/</code>, public ones as URLs and private ones for
                  server code only:
                </span>
              ),
              ko: (
                <span>
                  라이브러리는 애셋을 자기 <code>public/</code>과 <code>private/</code>에 둡니다. 그 라이브러리에
                  의존하는 모든 앱이 둘 다 <code>libs/&lt;lib&gt;/</code> 아래로 받습니다. public은 URL로, private은
                  서버 코드 전용으로 씁니다:
                </span>
              ),
            })}
          </div>
          <Docs.IntroTable
            type={l.trans({ en: "Where", ko: "위치" })}
            descLabel={l.trans({ en: "Path", ko: "경로" })}
            items={libItems}
          />
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      <code>public/libs</code> and <code>private/libs</code> are generated.
                    </strong>{" "}
                    <code>akan sync</code> rebuilds them and git ignores them, so never put your own files there.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>public/libs</code>와 <code>private/libs</code>는 생성되는 폴더입니다.
                    </strong>{" "}
                    <code>akan sync</code>가 다시 만들고 git은 무시하므로, 직접 만든 파일을 두지 마세요.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>A desktop app that carries its server carries these files too.</strong> Any app that depends
                    on the library may turn on <code>native.desktop.server</code>, and then its users can read the
                    library's <code>private/</code> in plain text, so keep keys and license files that must stay yours
                    out of it.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>서버를 싣는 데스크톱 앱은 이 파일도 싣습니다.</strong> 라이브러리에 의존하는 어느 앱이든{" "}
                    <code>native.desktop.server</code>를 켤 수 있고, 그러면 그 앱의 사용자가 라이브러리의{" "}
                    <code>private/</code>를 평문으로 읽을 수 있습니다. 남에게 보이면 안 되는 키와 라이선스 파일은 두지
                    마세요.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Library server code reads through the app too.</strong> It runs inside the app, and the
                    library's source folder is not in a build.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>라이브러리의 서버 코드도 앱 경로로 읽습니다.</strong> 앱 안에서 실행되고, 빌드에는
                    라이브러리 소스 폴더가 없기 때문입니다.
                  </span>
                ),
              })}
            </li>
          </ul>
          <div>
            {l.trans({
              en: (
                <span>
                  Draw a library image by its <code>/libs/…</code> URL:
                </span>
              ),
              ko: (
                <span>
                  라이브러리 이미지는 <code>/libs/…</code> URL로 그립니다:
                </span>
              ),
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/myapp/ui/SharedLogo.tsx"
            code={`import { usePage } from "@apps/myapp/client";
import { Image } from "akanjs/ui";

interface SharedLogoProps {
  className?: string;
}
export const SharedLogo = ({ className }: SharedLogoProps) => {
  const { l } = usePage();
  return (
    <Image
      className={className}
      src="/libs/shared/banner/logo.png"
      alt={l.trans({ en: "Shared logo", ko: "공용 로고" })}
      width={240}
      height={80}
    />
  );
};`}
          />
          <div>
            {l.trans({
              en: (
                <span>
                  Read a library's private file through <code>private/libs/&lt;lib&gt;</code>:
                </span>
              ),
              ko: (
                <span>
                  라이브러리의 private 파일은 <code>private/libs/&lt;lib&gt;</code>를 거쳐 읽습니다:
                </span>
              ),
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/myapp/srvkit/defaultRules.ts"
            code={`import { privateFile } from "./privateFile";

export const loadDefaultRules = async () => {
  const file = privateFile("libs/shared/recommendation/default-rules.json");
  return await file.json();
};`}
          />
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="practical-rules" title={l.trans({ en: "Which Folder?", ko: "어느 폴더에 둘까" })}>
        <Docs.Title>{l.trans({ en: "Which Folder?", ko: "어느 폴더에 둘까" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  Ask whether anyone on the internet may download the file. Yes means <code>public/</code>, no means{" "}
                  <code>private/</code>.
                </span>
              ),
              ko: (
                <span>
                  인터넷의 누구든 이 파일을 받아 가도 되는지 묻습니다. 된다면 <code>public/</code>, 안 된다면{" "}
                  <code>private/</code>입니다.
                </span>
              ),
            })}
          </div>
          <Docs.Matrix
            type={l.trans({ en: "Example file", ko: "예시 파일" })}
            columns={folderColumns}
            groups={folderGroups}
            markLabel={l.trans({ en: "Goes here", ko: "여기에 둡니다" })}
            emptyLabel={l.trans({ en: "Not here", ko: "여기가 아닙니다" })}
          />
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      When unsure, use <code>private/</code>.
                    </strong>{" "}
                    A public file needs no sign-in: anyone who knows the URL can download it.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      애매하면 <code>private/</code>에 둡니다.
                    </strong>{" "}
                    public 파일은 로그인이 필요 없어서, URL을 아는 사람은 누구나 받아 갈 수 있습니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      UI images go through <code>Image</code>.
                    </strong>{" "}
                    Use <code>Image</code> from <code>akanjs/ui</code> so the server optimizes them.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      UI 이미지는 <code>Image</code>로 그립니다.
                    </strong>{" "}
                    <code>akanjs/ui</code>의 <code>Image</code>를 써야 서버가 최적화합니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Share through a library.</strong> When several apps need the same file, put it in the
                    library's own <code>public/</code> or <code>private/</code> instead of copying it into each app.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>공유는 라이브러리로 합니다.</strong> 여러 앱이 같은 파일을 쓴다면 앱마다 복사하지 말고
                    라이브러리 자신의 <code>public/</code>이나 <code>private/</code>에 둡니다.
                  </span>
                ),
              })}
            </li>
          </ul>

          <Docs.SubSubTitle>{l.trans({ en: "What a build ships", ko: "빌드에 들어가는 것" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: (
                <span>
                  <code>akan build</code> copies both folders into <code>dist</code>. Only that copy is trimmed; your
                  source folders keep every file.
                </span>
              ),
              ko: (
                <span>
                  <code>akan build</code>는 두 폴더를 <code>dist</code>로 복사합니다. 덜어내는 것은 그 복사본뿐이고,
                  소스 폴더의 파일은 그대로 남습니다.
                </span>
              ),
            })}
          </div>
          <Docs.Table columns={buildColumns} rows={buildRows} stacked />
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <DocsToc />
    </Scroll>
  );
});
