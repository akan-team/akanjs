import { usePage } from "@apps/akan/client";
import { Code, Docs } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();
  return (
    <Scroll>
      <Scroll.Slide id="asset-overview" title={l.trans({ en: "Asset Overview", ko: "애셋 개요" })}>
        <Docs.Title>{l.trans({ en: "Asset Overview", ko: "애셋 개요" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Apps and libraries can both have an asset folder. Use public for files that the browser can request, and private for files that only server code should read.",
              ko: "앱과 라이브러리는 모두 asset 폴더를 가질 수 있습니다. 브라우저가 요청할 수 있는 파일은 public에 두고, 서버 코드만 읽어야 하는 파일은 private에 둡니다.",
            })}
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {[
              {
                title: "asset/public/",
                desc: l.trans({
                  en: "Served as static assets. Use it for images, PDF files, downloadable JSON, icons, and other files that can be public.",
                  ko: "정적 애셋으로 서빙됩니다. 이미지, PDF, 다운로드 가능한 JSON, 아이콘처럼 공개되어도 되는 파일에 사용합니다.",
                }),
              },
              {
                title: "asset/private/",
                desc: l.trans({
                  en: "Available only to server-side code. Use it for seed data, private JSON, model files, and resources used by server jobs.",
                  ko: "서버 코드에서만 사용할 수 있습니다. seed data, private JSON, 모델 파일, 서버 작업용 리소스에 사용합니다.",
                }),
              },
            ].map(({ title, desc }) => (
              <div key={title} className="rounded-xl border border-base-300 bg-base-100 p-4">
                <div className="font-mono font-semibold text-primary">{title}</div>
                <div className="mt-2 text-base-content/70 text-sm">{desc}</div>
              </div>
            ))}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="public-assets" title={l.trans({ en: "Public Assets", ko: "Public 애셋" })}>
        <Docs.Title>{l.trans({ en: "Public Assets", ko: "Public 애셋" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Files under asset/public are copied to the app's public surface and served by the server. The browser can request them directly by URL.",
              ko: "asset/public 아래 파일은 앱의 public surface로 복사되고 서버가 정적 파일로 서빙합니다. 브라우저는 URL로 직접 요청할 수 있습니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title="public asset examples"
          language="bash"
          code={`apps/myapp/asset/public/docs/product-guide.pdf
apps/myapp/asset/public/data/sample-products.json
apps/myapp/asset/public/images/hero.png

# Web requests
/docs/product-guide.pdf
/data/sample-products.json
/images/hero.png`}
        />

        <Code.Snippet
          title="Link to a PDF"
          code={`import { Link } from "akanjs/ui";              
export function GetProductGuide() {
  return <Link href="/docs/product-guide.pdf">Open product guide</Link>;
}`}
        />
        <Code.Snippet
          title="Fetch static JSON"
          code={`export async function loadSampleProducts() {
  const res = await fetch("/data/sample-products.json");
  return res.json();
}`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="optimized-images" title={l.trans({ en: "Optimized Images", ko: "Optimized Image" })}>
        <Docs.Title>{l.trans({ en: "Optimized Images", ko: "Optimized Image" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "When an image is public, you can render it with the Image component from akanjs/ui. Akan serves an optimized image response in a similar way to Next.js image optimization, so use this for UI images instead of a plain img tag when possible.",
              ko: "이미지가 public에 있다면 akanjs/ui의 Image 컴포넌트로 렌더링할 수 있습니다. Akan은 Next.js image optimization과 비슷하게 최적화된 이미지 응답을 서빙하므로, UI 이미지는 가능한 일반 img 태그보다 Image를 사용하세요.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title="HeroImage.tsx"
          code={`import { Image } from "akanjs/ui";

export function HeroImage() {
  return (
    <Image
      src="/images/hero.png"
      alt="Product hero"
      width={1200}
      height={640}
      priority
    />
  );
}`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="private-assets" title={l.trans({ en: "Private Assets", ko: "Private 애셋" })}>
        <Docs.Title>{l.trans({ en: "Private Assets", ko: "Private 애셋" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Files under asset/private are for server-only resources. Put files here when the browser should not download them directly, but the server needs them to load data, run inference, or initialize a service.",
              ko: "asset/private 아래 파일은 서버 전용 리소스입니다. 브라우저가 직접 다운로드하면 안 되지만 서버가 데이터 로딩, 추론, 서비스 초기화에 사용해야 하는 파일을 여기에 둡니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title="private asset examples"
          language="bash"
          code={`apps/myapp/asset/private/seed/products.json
apps/myapp/asset/private/model/yolo.onnx
libs/shared/asset/private/recommendation/default-rules.json`}
        />
        <Code.Snippet
          title="Load private JSON on the server"
          code={`export async function loadInitialProducts() {
  const file = Bun.file("./private/seed/products.json");
  return file.json();
}`}
        />
        <Code.Snippet
          title="Use a private model file on the server"
          code={`export async function detectObjects(image: ArrayBuffer) {
  const file = Bun.file("./private/model/yolo.onnx");
  const model = await loadYoloModel(file);
  return model.detect(image);
}`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="library-asset-sync" title={l.trans({ en: "Library Asset Sync", ko: "라이브러리 애셋 sync" })}>
        <Docs.Title>{l.trans({ en: "Library Asset Sync", ko: "라이브러리 애셋 sync" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "When a library has assets, Akan syncs both public and private assets into each app. Public assets become browser-requestable files, while private assets stay server-only after sync. Sync links the library folder into the app, so editing a library asset takes effect without another sync; a production build copies the real files into the build output.",
              ko: "라이브러리가 애셋을 가지고 있으면 Akan은 public과 private 애셋을 모두 각 앱으로 sync합니다. public 애셋은 브라우저가 요청할 수 있는 파일이 되고, private 애셋은 sync 이후에도 서버 전용으로 남습니다. sync는 라이브러리 폴더를 앱에 링크하므로 라이브러리 애셋을 수정하면 다시 sync하지 않아도 반영되고, 프로덕션 빌드에서는 실제 파일이 빌드 결과물로 복사됩니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title="library asset mapping"
          language="bash"
          code={`# Source in a library
libs/shared/asset/public/banner/logo.png
libs/shared/asset/private/recommendation/default-rules.json

# Linked into an app as public assets
apps/myapp/public/libs/shared/banner/logo.png

# Linked into an app as private assets
apps/myapp/private/libs/shared/recommendation/default-rules.json

# Copied as real files into the production build
dist/apps/myapp/public/libs/shared/banner/logo.png

# Browser request
/libs/shared/banner/logo.png`}
        />
        <Code.Snippet
          title="Use synced public library asset"
          code={`import { Image } from "akanjs/ui";

export function SharedLogo() {
  return (
    <Image
      src="/libs/shared/banner/logo.png"
      alt="Shared logo"
      width={240}
      height={80}
    />
  );
}`}
        />
        <Code.Snippet
          title="Use synced private library asset"
          code={`export async function loadDefaultRules() {
  const file = Bun.file("./private/libs/shared/recommendation/default-rules.json");
  return file.json();
}`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="practical-rules" title={l.trans({ en: "Practical Rules", ko: "실전 규칙" })}>
        <Docs.Title>{l.trans({ en: "Practical Rules", ko: "실전 규칙" })}</Docs.Title>
        <Docs.Description>
          <div className="space-y-1">
            {[
              l.trans({
                en: "Use public when the browser is allowed to request the file directly.",
                ko: "브라우저가 파일을 직접 요청해도 된다면 public을 사용합니다.",
              }),
              l.trans({
                en: "Use private when the file contains internal data, model weights, or server-only configuration.",
                ko: "내부 데이터, 모델 파일, 서버 전용 설정처럼 공개되면 안 되는 파일은 private을 사용합니다.",
              }),
              l.trans({
                en: "Use Image from akanjs/ui for public UI images that should be optimized by the server.",
                ko: "서버 최적화가 필요한 public UI 이미지는 akanjs/ui의 Image를 사용합니다.",
              }),
              l.trans({
                en: "Put reusable public files in a library asset folder when multiple apps need the same asset.",
                ko: "여러 앱이 같은 파일을 사용한다면 library asset 폴더에 reusable public 파일로 둡니다.",
              }),
            ].map((rule) => (
              <div key={rule} className="rounded-xl border border-base-300 bg-base-100 px-4 text-base-content/70">
                {rule}
              </div>
            ))}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.TitleNavigator className="fixed top-32 right-0 hidden w-[250px] flex-col gap-2 lg:flex" />
    </Scroll>
  );
}
