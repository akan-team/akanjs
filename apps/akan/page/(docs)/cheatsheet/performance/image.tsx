import { usePage } from "@apps/akan/client";
import { Code, Divider, Docs, DocsToc } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { page } from "akanjs/client";

export default page().render(() => {
  const { l } = usePage();

  const bulletList = "my-4 list-disc space-y-2 pl-5";

  const termRows = [
    {
      name: "optimizer",
      desc: l.trans({
        en: "The `/_akan/image` endpoint that resizes, re-encodes and caches an image.",
        ko: "이미지를 줄이고 다시 인코딩해 캐시하는 `/_akan/image` 엔드포인트입니다.",
      }),
    },
    {
      name: "srcSet",
      desc: l.trans({
        en: "The candidate URLs on an `<img>`. The browser downloads only the one that fits.",
        ko: "`<img>`에 붙는 후보 URL 목록입니다. 브라우저는 맞는 것 하나만 내려받습니다.",
      }),
    },
    {
      name: "sizes",
      desc: l.trans({
        en: "How wide the image renders per viewport, e.g. `(min-width: 768px) 50vw, 100vw`.",
        ko: "뷰포트별로 이미지가 그려지는 폭입니다. 예: `(min-width: 768px) 50vw, 100vw`.",
      }),
    },
    {
      name: ["1x", "2x"],
      desc: l.trans({
        en: "Two candidates for one fixed width: a normal screen and a high-density one.",
        ko: "고정 폭 하나에 대한 후보 두 개입니다. 일반 화면용과 고밀도(Retina) 화면용입니다.",
      }),
    },
    {
      name: "640w",
      desc: l.trans({
        en: "A candidate labelled with its pixel width. The browser picks one through `sizes`.",
        ko: "픽셀 폭이 붙은 후보입니다. 브라우저가 `sizes`를 보고 하나를 고릅니다.",
      }),
    },
    {
      name: "TTL",
      desc: l.trans({
        en: "How long a downloaded remote image is reused before it is fetched again.",
        ko: "내려받은 외부 이미지를 다시 받기 전까지 재사용하는 시간입니다.",
      }),
    },
  ];

  const todoNotes = [
    l.trans({
      en: (
        <>
          <strong>
            Render with <code>Image</code>.
          </strong>{" "}
          Use it for every image the UI shows.
        </>
      ),
      ko: (
        <>
          <strong>
            <code>Image</code>로 그립니다.
          </strong>{" "}
          UI에 보이는 이미지는 모두 이 컴포넌트를 씁니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>Allow remote hosts.</strong> Remote images stay blocked until you list them in{" "}
          <code>images.remotePatterns</code> of <code>akan.config.ts</code>.
        </>
      ),
      ko: (
        <>
          <strong>외부 호스트를 허용합니다.</strong> <code>akan.config.ts</code>의 <code>images.remotePatterns</code>에
          적기 전까지 외부 이미지는 차단됩니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>Keep sizes few.</strong> Reuse a handful of sizes so many elements share one cached file.
        </>
      ),
      ko: (
        <>
          <strong>크기 종류를 줄입니다.</strong> 몇 가지 크기를 반복해 써야 여러 요소가 캐시 파일 하나를 함께 씁니다.
        </>
      ),
    }),
  ];

  const usageNotes = [
    l.trans({
      en: (
        <>
          <strong>Always pass the rendered width.</strong> Without <code>width</code> it falls back to{" "}
          <code>file.imageSize</code>, the original's width, so a 4000px photo is fetched at 3840px.
        </>
      ),
      ko: (
        <>
          <strong>그려질 폭을 꼭 넘깁니다.</strong> <code>width</code>가 없으면 원본 폭인 <code>file.imageSize</code>를
          쓰므로, 4000px 사진은 3840px로 요청됩니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>
            <code>priority</code> is for the first screen.
          </strong>{" "}
          That image loads eagerly at high priority and is preloaded during SSR. Every other image loads lazily.
        </>
      ),
      ko: (
        <>
          <strong>
            <code>priority</code>는 첫 화면용입니다.
          </strong>{" "}
          높은 우선순위로 바로 로드하고 SSR 중에 preload합니다. 나머지 이미지는 lazy로 로드됩니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>
            A custom <code>quality</code> must be allowed.
          </strong>{" "}
          Add the value to <code>qualities</code> in the config, or the optimizer answers 400.
        </>
      ),
      ko: (
        <>
          <strong>
            따로 준 <code>quality</code>는 허용 목록에 있어야 합니다.
          </strong>{" "}
          설정의 <code>qualities</code>에 그 값을 넣지 않으면 optimizer가 400으로 답합니다.
        </>
      ),
    }),
  ];

  const srcSetColumns = [
    { key: "given", label: l.trans({ en: "You pass", ko: "넘긴 것" }) },
    { key: "srcSet", label: "srcSet" },
    { key: "fits", label: l.trans({ en: "Good for", ko: "어울리는 곳" }) },
  ];
  const srcSetRows = [
    {
      given: l.trans({ en: "`width` only", ko: "`width`만" }),
      srcSet: l.trans({
        en: "A 1x/2x pair, each rounded up to an allowed width",
        ko: "1x/2x 두 개, 각각 허용된 폭으로 올림",
      }),
      fits: l.trans({ en: "A fixed-size box: avatar, thumbnail", ko: "고정 크기: 아바타, 썸네일" }),
    },
    {
      given: l.trans({ en: "`sizes`, with or without `width`", ko: "`sizes` (`width` 유무 무관)" }),
      srcSet: l.trans({
        en: "All 15 allowed widths as `w` candidates; `width` is ignored",
        ko: "허용된 15개 폭 전부를 `w` 후보로, `width`는 무시",
      }),
      fits: l.trans({ en: "A fluid box that follows the viewport", ko: "뷰포트에 따라 폭이 변하는 요소" }),
    },
    {
      given: l.trans({ en: "`src` with no `width`", ko: "`width` 없는 `src`" }),
      srcSet: l.trans({ en: "The 8 `deviceSizes` as `w` candidates", ko: "`deviceSizes` 8개를 `w` 후보로" }),
      fits: l.trans({ en: "A full-width image", ko: "화면 전체 폭 이미지" }),
    },
    {
      given: l.trans({ en: "a `data:` or `blob:` URL, an `.svg` path", ko: "`data:`·`blob:` URL, `.svg` 경로" }),
      srcSet: l.trans({ en: "None; the original `src` is used", ko: "없음, 원본 `src`를 그대로 씀" }),
      fits: l.trans({ en: "Inline previews and icons", ko: "인라인 미리보기, 아이콘" }),
    },
    {
      given: "`unoptimized`",
      srcSet: l.trans({ en: "None; the original `src` is used", ko: "없음, 원본 `src`를 그대로 씀" }),
      fits: l.trans({ en: "An image another service already optimized", ko: "다른 서비스가 이미 최적화한 이미지" }),
    },
  ];

  const srcSetNotes = [
    l.trans({
      en: (
        <>
          <strong>
            <code>sizes</code> wins over <code>width</code>.
          </strong>{" "}
          Once it is present, the width no longer shapes the URLs, so give it only to a fluid element.
        </>
      ),
      ko: (
        <>
          <strong>
            <code>sizes</code>가 <code>width</code>보다 우선합니다.
          </strong>{" "}
          <code>sizes</code>가 있으면 width는 URL에 쓰이지 않으니, 폭이 변하는 요소에만 줍니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>
            <code>unoptimized</code> is not for SVGs.
          </strong>{" "}
          <code>data:</code>, <code>blob:</code> and <code>.svg</code> sources skip the optimizer on their own. The flag
          is for images optimized elsewhere.
        </>
      ),
      ko: (
        <>
          <strong>
            <code>unoptimized</code>는 SVG용이 아닙니다.
          </strong>{" "}
          <code>data:</code>, <code>blob:</code>, <code>.svg</code>는 알아서 optimizer를 건너뜁니다. 이 플래그는 다른
          곳에서 이미 최적화한 이미지용입니다.
        </>
      ),
    }),
  ];

  const propItems = [
    {
      key: "file",
      type: "File | { url, imageSize } | null",
      desc: l.trans({
        en: "The image to show. Its `imageSize` fills in `width` and `height` when you omit them.",
        ko: "보여줄 이미지입니다. `width`·`height`를 생략하면 `imageSize`로 채웁니다.",
      }),
    },
    {
      key: "src",
      type: "string",
      desc: l.trans({
        en: "A direct URL that wins over `file.url`. With neither, an empty `bg-muted` box renders and nothing is requested.",
        ko: "직접 넘기는 URL이며 `file.url`보다 우선합니다. 둘 다 없으면 요청 없이 `bg-muted` 빈 상자를 그립니다.",
      }),
    },
    {
      key: "width",
      type: "number",
      default: "file.imageSize[0]",
      desc: l.trans({
        en: "The rendered width in CSS pixels. It picks the 1x/2x candidates.",
        ko: "화면에 그려지는 폭(CSS 픽셀)입니다. 이 값으로 1x/2x 후보를 고릅니다.",
      }),
    },
    {
      key: "height",
      type: "number",
      default: "file.imageSize[1]",
      desc: l.trans({
        en: "The rendered height in CSS pixels. It reserves space, so the layout does not jump.",
        ko: "화면에 그려지는 높이(CSS 픽셀)입니다. 자리를 미리 잡아 레이아웃이 튀지 않게 합니다.",
      }),
    },
    {
      key: "sizes",
      type: "string",
      desc: l.trans({
        en: "Switches to the full `w` srcSet for a fluid element.",
        ko: "폭이 변하는 요소용으로 `w` 후보 전체를 내보내게 합니다.",
      }),
    },
    {
      key: "quality",
      type: "number",
      default: "75",
      desc: l.trans({
        en: "Encoding quality. Any value other than 75 must be listed in `qualities`.",
        ko: "인코딩 품질입니다. 75가 아닌 값은 `qualities`에 있어야 합니다.",
      }),
    },
    {
      key: "priority",
      type: "boolean",
      default: "false",
      desc: l.trans({
        en: "Loads eagerly at high priority and preloads during SSR. `preload` does the same.",
        ko: "우선순위를 높여 바로 로드하고 SSR 중에 preload합니다. `preload`도 같은 일을 합니다.",
      }),
    },
    {
      key: "unoptimized",
      type: "boolean",
      default: "false",
      desc: l.trans({
        en: "Skips the optimizer and renders the original `src`.",
        ko: "optimizer를 건너뛰고 원본 `src`를 그립니다.",
      }),
    },
    {
      key: "alt",
      type: "string",
      default: '"image"',
      desc: l.trans({
        en: "Alt text. Always pass a real one; the default tells a screen reader nothing.",
        ko: "대체 텍스트입니다. 기본값은 스크린 리더에 아무 정보도 주지 않으니 항상 직접 넘깁니다.",
      }),
    },
  ];

  const sizeItems = [
    {
      key: "deviceSizes",
      type: "number[]",
      default: "[640, 750, 828, 1080, 1200, 1920, 2048, 3840]",
      desc: l.trans({
        en: "Widths for viewport-wide images. Together with `imageSizes`, the only `w` values accepted.",
        ko: "화면 폭 이미지용 width 목록입니다. `imageSizes`와 합친 값만 `w`로 받습니다.",
      }),
    },
    {
      key: "imageSizes",
      type: "number[]",
      default: "[32, 48, 64, 96, 128, 256, 384]",
      desc: l.trans({
        en: "Widths for fixed-size elements, joined with `deviceSizes`.",
        ko: "고정 크기 요소용 width 목록이며 `deviceSizes`와 합쳐집니다.",
      }),
    },
    {
      key: "formats",
      type: '("image/avif" | "image/webp")[]',
      default: '["image/webp"]',
      desc: l.trans({
        en: "Output formats in preference order. The first one the request's `Accept` header allows wins.",
        ko: "선호 순서대로 적은 출력 포맷입니다. 요청의 `Accept` 헤더가 허용하는 것 중 앞에 적힌 포맷이 쓰입니다.",
      }),
    },
    {
      key: "qualities",
      type: "number[]",
      default: "[75]",
      desc: l.trans({
        en: "Allowed `q` values. Anything else is a 400, even a valid integer from 1 to 100.",
        ko: "허용하는 `q` 값입니다. 1~100 사이 정수라도 목록에 없으면 400입니다.",
      }),
    },
  ];

  const sourceItems = [
    {
      key: "remotePatterns",
      type: "{ protocol?, hostname?, port?, pathname?, search? }[]",
      default: "[]",
      desc: l.trans({
        en: "Allow-list for absolute URLs. Empty means no remote image is accepted at all.",
        ko: "절대 URL 허용 목록입니다. 비어 있으면 외부 이미지를 하나도 받지 않습니다.",
      }),
    },
    {
      key: "localPatterns",
      type: "{ pathname?, search? }[]",
      default: '[{ pathname: "/**" }]',
      desc: l.trans({
        en: "Allow-list for root-relative URLs. The default admits all of `public/`.",
        ko: "루트 상대 URL 허용 목록입니다. 기본값은 `public/` 전체를 허용합니다.",
      }),
    },
    {
      key: "dangerouslyAllowSVG",
      type: "boolean",
      default: "false",
      desc: l.trans({
        en: "Lets an SVG through the optimizer untouched. While off, an SVG input is a 400.",
        ko: "SVG를 optimizer에 그대로 통과시킵니다. 꺼져 있으면 SVG 입력은 400입니다.",
      }),
    },
  ];

  const fetchItems = [
    {
      key: "minimumCacheTTL",
      type: "number",
      default: "14400",
      desc: l.trans({
        en: "Seconds a remote image is reused at least. Also the floor of the response `max-age` in production.",
        ko: "외부 이미지를 최소 몇 초 재사용할지입니다. production 응답 `max-age`의 하한으로도 쓰입니다.",
      }),
    },
    {
      key: "maximumRedirects",
      type: "number",
      default: "3",
      desc: l.trans({
        en: "Redirects followed for a remote image. Every hop must match `remotePatterns` too.",
        ko: "외부 이미지를 받을 때 따라가는 리다이렉트 수입니다. 매 홉도 `remotePatterns`에 맞아야 합니다.",
      }),
    },
    {
      key: "fetchTimeoutMs",
      type: "number",
      default: "7000",
      desc: l.trans({
        en: "Timeout for each hop of the remote fetch, in milliseconds.",
        ko: "외부 fetch의 홉마다 적용하는 타임아웃(ms)입니다.",
      }),
    },
    {
      key: "maxRemoteBytes",
      type: "number",
      default: "26214400 (25MB)",
      desc: l.trans({
        en: "Largest remote body accepted. Anything bigger is a 413.",
        ko: "받아들이는 외부 응답 본문의 최대 크기입니다. 넘으면 413입니다.",
      }),
    },
  ];

  const loadItems = [
    {
      key: "maxConcurrency",
      type: "number",
      default: "0",
      desc: l.trans({
        en: "Encodes that run at once. `0` means half the CPUs the server sees, at least one.",
        ko: "동시에 도는 인코딩 수입니다. `0`이면 서버가 보는 CPU의 절반(최소 1)입니다.",
      }),
    },
  ];

  const codecColumns = [
    { key: "system", label: "macOS · Windows" },
    { key: "linux", label: "Linux" },
  ];
  const everywhere = { system: true, linux: true };
  const osOnly = { system: true, linux: false };
  const codecGroups = [
    {
      label: l.trans({ en: "Output", ko: "출력" }),
      rows: [
        {
          name: "image/webp",
          desc: l.trans({ en: "The default output. Works everywhere.", ko: "기본 출력 포맷입니다. 어디서나 됩니다." }),
          marks: everywhere,
        },
        {
          name: "image/avif",
          desc: l.trans({
            en: "Dropped from `formats` on Linux; those callers get webp.",
            ko: "Linux에서는 `formats`에서 빠지고, 그 요청은 webp를 받습니다.",
          }),
          marks: osOnly,
        },
      ],
    },
    {
      label: l.trans({ en: "Input decoding", ko: "입력 읽기" }),
      rows: [
        {
          name: <span className="font-sans">JPEG · PNG · GIF · WebP</span>,
          desc: l.trans({ en: "Read and resized on every platform.", ko: "모든 플랫폼에서 읽고 줄입니다." }),
          marks: everywhere,
        },
        {
          name: <span className="font-sans">AVIF · TIFF</span>,
          desc: l.trans({
            en: "Passed through untouched on Linux.",
            ko: "Linux에서는 손대지 않고 그대로 보냅니다.",
          }),
          marks: osOnly,
        },
      ],
    },
  ];

  const inputColumns = [
    { key: "input", label: l.trans({ en: "Input", ko: "입력" }) },
    { key: "result", label: l.trans({ en: "Result", ko: "결과" }) },
  ];
  const inputRows = [
    {
      input: l.trans({ en: "JPEG · PNG · static GIF", ko: "JPEG · PNG · 정적 GIF" }),
      result: l.trans({
        en: "Resized, then converted to the first `formats` entry the browser accepts.",
        ko: "크기를 줄인 뒤, 브라우저가 받는 `formats` 중 첫 포맷으로 바꿉니다.",
      }),
    },
    {
      input: "WebP · AVIF",
      result: l.trans({ en: "Resized, but kept in its own format.", ko: "크기만 줄이고 포맷은 그대로 둡니다." }),
    },
    {
      input: l.trans({ en: "Animated GIF · PNG · WebP", ko: "애니메이션 GIF · PNG · WebP" }),
      result: l.trans({
        en: "Passed through untouched, so the animation survives.",
        ko: "애니메이션이 살아 있도록 손대지 않고 그대로 보냅니다.",
      }),
    },
    {
      input: "`.ico` · `.icns` · `.bmp` · `.jxl` · `.heic`",
      result: l.trans({ en: "Passed through untouched.", ko: "손대지 않고 그대로 보냅니다." }),
    },
    {
      input: l.trans({ en: "AVIF · TIFF on Linux", ko: "Linux의 AVIF · TIFF" }),
      result: l.trans({
        en: "Passed through untouched; there is no codec to read it.",
        ko: "읽을 코덱이 없어 그대로 보냅니다.",
      }),
    },
    {
      input: "SVG",
      result: l.trans({
        en: "A 400 unless `dangerouslyAllowSVG` is on; then it is served as-is.",
        ko: "`dangerouslyAllowSVG`를 켜지 않으면 400이고, 켜면 그대로 보냅니다.",
      }),
    },
  ];

  const formatNotes = [
    l.trans({
      en: (
        <>
          <strong>
            Listing <code>{'["image/avif", "image/webp"]'}</code> is safe.
          </strong>{" "}
          A Linux deployment serves webp to everyone, and a developer's Mac serves both for real.
        </>
      ),
      ko: (
        <>
          <strong>
            <code>{'["image/avif", "image/webp"]'}</code>로 적어도 안전합니다.
          </strong>{" "}
          Linux 배포는 모두에게 webp를 주고, 개발자의 Mac에서는 둘 다 실제로 동작합니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>Order matters.</strong> The first <code>formats</code> entry the browser's <code>Accept</code> header
          allows wins, so put <code>image/avif</code> first. A browser that accepts neither gets the source format back,
          resized.
        </>
      ),
      ko: (
        <>
          <strong>순서가 중요합니다.</strong> 브라우저 <code>Accept</code> 헤더가 허용하는 것 중 <code>formats</code>에
          먼저 적힌 포맷이 쓰이므로 <code>image/avif</code>를 앞에 둡니다. 둘 다 받지 않는 브라우저는 원본 포맷 그대로
          크기만 줄여 받습니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>A failed encode still answers.</strong> The original bytes are served and nothing is cached, so the
          next request tries again.
        </>
      ),
      ko: (
        <>
          <strong>인코딩이 실패해도 응답은 나갑니다.</strong> 원본 바이트를 보내고 캐시하지 않으므로, 다음 요청에서 다시
          시도합니다.
        </>
      ),
    }),
  ];

  const patternColumns = [
    { key: "field", label: l.trans({ en: "Field", ko: "필드" }), code: true },
    { key: "match", label: l.trans({ en: "How it matches", ko: "비교 방식" }) },
    { key: "example", label: l.trans({ en: "Example", ko: "예시" }), code: true },
  ];
  const patternRows = [
    {
      field: "protocol",
      match: l.trans({ en: "Exact: `http` or `https`", ko: "정확히 일치: `http` 또는 `https`" }),
      example: '"https"',
    },
    {
      field: "hostname",
      match: l.trans({ en: "Glob; `*` also spans dots", ko: "glob, `*`는 점(.)도 넘어갑니다" }),
      example: '"*.example.com"',
    },
    {
      field: "port",
      match: l.trans({
        en: 'Exact string; `""` means the default port',
        ko: '정확히 일치하는 문자열, `""`은 기본 포트',
      }),
      example: '"8443"',
    },
    {
      field: "pathname",
      match: l.trans({
        en: "Glob; `*` is one segment, `**` any depth",
        ko: "glob, `*`는 경로 한 단계, `**`는 여러 단계",
      }),
      example: '"/articles/**"',
    },
    {
      field: "search",
      match: l.trans({ en: "Exact, including the leading `?`", ko: "앞의 `?`까지 포함해 정확히 일치" }),
      example: '"?v=2"',
    },
  ];

  const patternNotes = [
    l.trans({
      en: (
        <>
          <strong>An omitted field matches anything.</strong> <code>{'{ hostname: "cdn.example.com" }'}</code> admits
          every path on that host, over http and https.
        </>
      ),
      ko: (
        <>
          <strong>적지 않은 필드는 무엇이든 통과합니다.</strong> <code>{'{ hostname: "cdn.example.com" }'}</code>만
          적으면 그 호스트의 모든 경로를 http와 https 모두로 허용합니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>
            <code>*</code> stops at <code>/</code>, <code>**</code> does not.
          </strong>{" "}
          A hostname has no <code>/</code>, so <code>*.example.com</code> also matches <code>a.b.example.com</code>.
        </>
      ),
      ko: (
        <>
          <strong>
            <code>*</code>는 <code>/</code>에서 멈추고 <code>**</code>는 넘어갑니다.
          </strong>{" "}
          hostname에는 <code>/</code>가 없으므로 <code>*.example.com</code>은 <code>a.b.example.com</code>에도 맞습니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>
            <code>port</code> and <code>search</code> are exact.
          </strong>{" "}
          A pattern can pin a non-standard port or one fixed query, but not a signature that changes per image.
        </>
      ),
      ko: (
        <>
          <strong>
            <code>port</code>와 <code>search</code>는 정확히 일치해야 합니다.
          </strong>{" "}
          비표준 포트나 고정된 쿼리 하나는 요구할 수 있지만, 이미지마다 바뀌는 서명은 표현할 수 없습니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>Redirects are checked too.</strong> Every hop must match, so a CDN that redirects to an unlisted host
          is refused.
        </>
      ),
      ko: (
        <>
          <strong>리다이렉트도 검사합니다.</strong> 매 홉이 패턴에 맞아야 하므로, 목록에 없는 호스트로 리다이렉트하는
          CDN은 거절됩니다.
        </>
      ),
    }),
  ];

  const cacheColumns = [
    { key: "source", label: l.trans({ en: "Source", ko: "원본" }) },
    { key: "reread", label: l.trans({ en: "Original re-read", ko: "원본을 다시 읽는 때" }) },
    { key: "picked", label: l.trans({ en: "Server serves the edit", ko: "서버가 수정본을 주는 때" }) },
  ];
  const cacheRows = [
    {
      source: l.trans({ en: "Remote, production build", ko: "외부, production 빌드" }),
      reread: l.trans({ en: "Once the TTL runs out", ko: "TTL이 끝난 뒤" }),
      picked: l.trans({ en: "After the TTL", ko: "TTL 이후" }),
    },
    {
      source: l.trans({ en: "Remote, `akan start`", ko: "외부, `akan start`" }),
      reread: l.trans({ en: "On every request", ko: "요청마다" }),
      picked: l.trans({ en: "Immediately", ko: "즉시" }),
    },
    {
      source: l.trans({ en: "Local file in `public/`", ko: "`public/`의 로컬 파일" }),
      reread: l.trans({ en: "On every request, compared by mtime and size", ko: "요청마다, mtime과 크기로 비교" }),
      picked: l.trans({ en: "Immediately", ko: "즉시" }),
    },
  ];

  const cacheNotes = [
    l.trans({
      en: (
        <>
          <strong>An unchanged original is not re-encoded.</strong> The encoded file is keyed by the upstream ETag, so
          re-reading the same image costs one download and no encode.
        </>
      ),
      ko: (
        <>
          <strong>원본이 그대로면 다시 인코딩하지 않습니다.</strong> 인코딩된 파일은 업스트림 ETag로 찾으므로, 같은
          이미지를 다시 읽는 비용은 다운로드 한 번이고 인코딩은 없습니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>
            Production means a built artifact run with <code>NODE_ENV=production</code>.
          </strong>{" "}
          Under <code>akan start</code> the TTL is skipped, so an upstream edit shows up at once.
        </>
      ),
      ko: (
        <>
          <strong>
            production은 <code>NODE_ENV=production</code>으로 실행한 빌드 결과물입니다.
          </strong>{" "}
          <code>akan start</code>에서는 TTL을 건너뛰므로 업스트림 수정이 바로 보입니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>The browser keeps its own copy.</strong> A production response carries a <code>max-age</code> of at
          least <code>minimumCacheTTL</code>, so a visitor may see the old image until it expires.
        </>
      ),
      ko: (
        <>
          <strong>브라우저도 자기 사본을 따로 둡니다.</strong> production 응답에는 최소 <code>minimumCacheTTL</code>
          만큼의 <code>max-age</code>가 붙으므로, 방문자는 그 시간이 지날 때까지 예전 이미지를 볼 수 있습니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>Each replica has its own cache.</strong> It lives in the build artifact directory, so replicas fill it
          separately and every deploy starts cold.
        </>
      ),
      ko: (
        <>
          <strong>캐시는 replica마다 따로 있습니다.</strong> 빌드 결과물 디렉터리에 쌓이므로 replica마다 따로 채우고,
          배포할 때마다 빈 상태로 시작합니다.
        </>
      ),
    }),
  ];

  const keyRows = [
    {
      name: "url",
      desc: l.trans({
        en: "The original's path or URL, from the `url` parameter.",
        ko: "`url` 파라미터로 들어온 원본 경로나 URL입니다.",
      }),
    },
    {
      name: "width",
      desc: l.trans({
        en: "The `w` parameter, already rounded up to an allowed width.",
        ko: "허용된 폭으로 올림된 `w` 파라미터입니다.",
      }),
    },
    {
      name: "quality",
      desc: l.trans({
        en: "The `q` parameter: 75 unless a component passes `quality`.",
        ko: "`q` 파라미터입니다. 컴포넌트가 `quality`를 넘기지 않으면 75입니다.",
      }),
    },
    {
      name: <span className="font-sans">{l.trans({ en: "output format", ko: "출력 포맷" })}</span>,
      desc: l.trans({
        en: "The first `formats` entry the browser accepts, or the source's own format.",
        ko: "브라우저가 받는 `formats` 중 첫 포맷, 아니면 원본 포맷입니다.",
      }),
    },
    {
      name: <span className="font-sans">{l.trans({ en: "source tag", ko: "원본 태그" })}</span>,
      desc: l.trans({
        en: "Upstream ETag (or a content hash) for a remote image; mtime and size for a local one.",
        ko: "외부 이미지는 업스트림 ETag(없으면 내용 해시), 로컬 이미지는 mtime과 크기입니다.",
      }),
    },
  ];

  const hitNotes = [
    l.trans({
      en: (
        <>
          <strong>Reuse a few card sizes.</strong> Many one-off widths spread across more allowed widths; a handful of
          repeated sizes lands on the same files.
        </>
      ),
      ko: (
        <>
          <strong>카드 크기 몇 가지를 반복해 씁니다.</strong> 제각각인 width는 여러 허용 폭으로 흩어지고, 반복되는 몇
          가지 크기는 같은 파일로 모입니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>
            Keep <code>qualities</code> at <code>[75]</code>
          </strong>{" "}
          unless one surface truly needs otherwise. Every extra value multiplies the files, and the client asks only for
          75 unless a component passes <code>quality</code>.
        </>
      ),
      ko: (
        <>
          <strong>
            <code>qualities</code>는 꼭 필요할 때가 아니면 <code>[75]</code>로 둡니다.
          </strong>{" "}
          값이 하나 늘 때마다 파일도 배로 늘고, 컴포넌트가 <code>quality</code>를 넘기지 않는 한 클라이언트는 75만
          요청합니다.
        </>
      ),
    }),
  ];

  return (
    <Scroll>
      <Scroll.Slide id="overview" title={l.trans({ en: "Image Optimization", ko: "이미지 최적화" })}>
        <Docs.Title>{l.trans({ en: "Image Optimization", ko: "이미지 최적화" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Someone uploads a 4MB phone photo and it renders as a 96px avatar. The layout looks right, yet every visitor downloads four megabytes for one thumbnail.",
              ko: "폰으로 찍은 4MB 사진이 96px 아바타로 그려진다고 해 봅시다. 화면은 멀쩡해 보이지만, 방문자는 썸네일 하나를 보려고 4MB를 내려받습니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: (
                <span>
                  <code>Image</code> from <code>akanjs/ui</code> solves this in three steps:
                </span>
              ),
              ko: (
                <span>
                  <code>akanjs/ui</code>의 <code>Image</code>는 이 문제를 세 단계로 풉니다:
                </span>
              ),
            })}
          </div>
          <ol className="my-4 list-decimal space-y-2 pl-5">
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>The component</strong> writes an optimizer URL for each candidate, such as{" "}
                    <code>{"/_akan/image?url=…&w=640&q=75"}</code>.
                  </>
                ),
                ko: (
                  <>
                    <strong>컴포넌트가</strong> 후보마다 <code>{"/_akan/image?url=…&w=640&q=75"}</code> 같은 optimizer
                    URL을 만듭니다.
                  </>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>The server</strong> resizes and re-encodes the original once, then keeps the result on disk.
                  </>
                ),
                ko: (
                  <>
                    <strong>서버가</strong> 원본을 한 번만 줄이고 다시 인코딩한 뒤, 결과를 디스크에 캐시합니다.
                  </>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>The browser</strong> picks the candidate from <code>srcSet</code> that fits the screen and
                    downloads only that one.
                  </>
                ),
                ko: (
                  <>
                    <strong>브라우저가</strong> <code>srcSet</code>에서 화면에 맞는 후보를 골라 그것 하나만
                    내려받습니다.
                  </>
                ),
              })}
            </li>
          </ol>
          <div>
            {l.trans({
              en: "The rest of this page is about not defeating that cache.",
              ko: "이 페이지의 나머지는 그 캐시를 헛되게 만들지 않는 방법입니다.",
            })}
          </div>
          <Docs.SubSubTitle>{l.trans({ en: "What you do", ko: "해야 할 일" })}</Docs.SubSubTitle>
          <ul className={bulletList}>
            {todoNotes.map((note, idx) => (
              <li key={idx}>{note}</li>
            ))}
          </ul>
          <Docs.SubSubTitle>{l.trans({ en: "Words used on this page", ko: "이 페이지에서 쓰는 말" })}</Docs.SubSubTitle>
          <Docs.IntroTable type={l.trans({ en: "Term", ko: "용어" })} items={termRows} />
          <Docs.Alert type="warning">
            {l.trans({
              en: (
                <span>
                  <strong>None of this runs in the CSR bundle.</strong> A mobile app or a prebuilt shell renders the raw{" "}
                  <code>src</code>, because no Akan server sits in front of it to optimize.
                </span>
              ),
              ko: (
                <span>
                  <strong>CSR 번들에서는 이 모든 것이 동작하지 않습니다.</strong> 모바일 앱이나 미리 빌드한 shell은
                  앞에서 최적화해 줄 Akan 서버가 없으므로 원본 <code>src</code>를 그대로 그립니다.
                </span>
              ),
            })}
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="usage" title={l.trans({ en: "Use Image", ko: "Image 사용하기" })}>
        <Docs.Title>{l.trans({ en: "Use Image", ko: "Image 사용하기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  Pass a <code>file</code> (a <code>File</code> relation or any <code>{"{ url, imageSize }"}</code>) or
                  a plain <code>src</code>, plus the width it renders at:
                </span>
              ),
              ko: (
                <span>
                  <code>file</code>(<code>File</code> 관계 필드나 <code>{"{ url, imageSize }"}</code> 형태의 객체) 또는{" "}
                  <code>src</code>를 넘기고, 그려질 폭을 함께 줍니다:
                </span>
              ),
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/myapp/lib/article/Article.Unit.tsx"
            code={`import type { cnst } from "@apps/myapp/client";
import { Image } from "akanjs/ui";

interface CoverProps {
  className?: string;
  article: cnst.LightArticle;
}
export const Cover = ({ className, article }: CoverProps) => {
  return (
    <Image
      className={className}
      file={article.cover}
      width={640}
      height={360}
      alt={article.title}
      priority={article.isFeatured}
    />
  );
};`}
          />
          <ul className={bulletList}>
            {usageNotes.map((note, idx) => (
              <li key={idx}>{note}</li>
            ))}
          </ul>
          <Docs.SubSubTitle>{l.trans({ en: "Which srcSet you get", ko: "어떤 srcSet이 나오나" })}</Docs.SubSubTitle>
          <Docs.Table columns={srcSetColumns} rows={srcSetRows} />
          <ul className={bulletList}>
            {srcSetNotes.map((note, idx) => (
              <li key={idx}>{note}</li>
            ))}
          </ul>
          <Docs.SubSubTitle>Props</Docs.SubSubTitle>
          <Docs.OptionTable items={propItems} />
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="config" title={l.trans({ en: "Config", ko: "설정" })}>
        <Docs.Title>{l.trans({ en: "Config", ko: "설정" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  Every optimizer setting lives under the <code>images</code> key of <code>akan.config.ts</code>. An
                  array you write replaces its default outright: setting <code>deviceSizes</code> drops all eight
                  defaults.
                </span>
              ),
              ko: (
                <span>
                  optimizer 설정은 모두 <code>akan.config.ts</code>의 <code>images</code> 키 아래에 있습니다. 배열 값은
                  기본값과 합쳐지지 않고 통째로 바뀌어서, <code>deviceSizes</code>를 적으면 기본값 여덟 개가 모두
                  사라집니다.
                </span>
              ),
            })}
          </div>
          <Docs.SubSubTitle>{l.trans({ en: "Sizes, formats and quality", ko: "크기, 포맷, 품질" })}</Docs.SubSubTitle>
          <Docs.OptionTable items={sizeItems} />
          <Docs.Alert type="error">
            {l.trans({
              en: (
                <span>
                  <strong>
                    Widen <code>deviceSizes</code>, <code>imageSizes</code> and <code>qualities</code>; never narrow
                    them.
                  </strong>{" "}
                  <code>Image</code> does not read <code>akan.config.ts</code> and keeps the default lists as its own
                  constants. A narrower config makes the server reject, with a 400, the <code>w</code> and{" "}
                  <code>q</code> values the client still sends.
                </span>
              ),
              ko: (
                <span>
                  <strong>
                    <code>deviceSizes</code>, <code>imageSizes</code>, <code>qualities</code>는 넓히기만 하고 좁히지
                    마세요.
                  </strong>{" "}
                  <code>Image</code>는 <code>akan.config.ts</code>를 읽지 않고 기본 목록을 자기 상수로 들고 있습니다.
                  설정만 좁히면 클라이언트가 계속 보내는 <code>w</code>·<code>q</code> 값을 서버가 400으로 거절합니다.
                </span>
              ),
            })}
          </Docs.Alert>
          <Docs.SubSubTitle>{l.trans({ en: "Allowed sources", ko: "허용할 원본" })}</Docs.SubSubTitle>
          <Docs.OptionTable items={sourceItems} />
          <Docs.SubSubTitle>{l.trans({ en: "Fetching remote images", ko: "외부 이미지 가져오기" })}</Docs.SubSubTitle>
          <Docs.OptionTable items={fetchItems} />
          <Docs.SubSubTitle>{l.trans({ en: "Server load", ko: "서버 부하" })}</Docs.SubSubTitle>
          <Docs.OptionTable items={loadItems} />
          <div>
            {l.trans({
              en: (
                <span>
                  Encoding shares one worker pool with file reads and hashing. Raise <code>maxConcurrency</code> and a
                  burst of image requests slows down everything else the server does, which is why the default holds it
                  to half.
                </span>
              ),
              ko: (
                <span>
                  인코딩은 파일 읽기, 해싱과 같은 worker pool을 씁니다. <code>maxConcurrency</code>를 올리면 이미지
                  요청이 몰릴 때 서버의 다른 작업까지 느려지므로, 기본값은 일부러 절반으로 묶어 둡니다.
                </span>
              ),
            })}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="formats" title={l.trans({ en: "Formats And The Platform", ko: "포맷과 플랫폼" })}>
        <Docs.Title>{l.trans({ en: "Formats And The Platform", ko: "포맷과 플랫폼" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  Encoding runs on <code>Bun.Image</code>, and its codecs depend on the server's OS. AVIF, HEIC and TIFF
                  need an OS codec that only macOS and Windows have, so a Linux container never emits AVIF.
                </span>
              ),
              ko: (
                <span>
                  인코딩은 <code>Bun.Image</code>가 하고, 쓸 수 있는 코덱은 서버 OS에 따라 다릅니다. AVIF, HEIC, TIFF는
                  macOS와 Windows에만 있는 OS 코덱이 필요하므로, Linux 컨테이너는 AVIF를 내보내지 않습니다.
                </span>
              ),
            })}
          </div>
          <Docs.Matrix
            type={l.trans({ en: "Codec", ko: "코덱" })}
            columns={codecColumns}
            groups={codecGroups}
            markLabel={l.trans({ en: "Available", ko: "지원" })}
            emptyLabel={l.trans({ en: "Not available", ko: "지원 안 함" })}
          />
          <Docs.SubSubTitle>
            {l.trans({ en: "What happens to each input", ko: "입력별로 일어나는 일" })}
          </Docs.SubSubTitle>
          <Docs.Table columns={inputColumns} rows={inputRows} stacked />
          <ul className={bulletList}>
            {formatNotes.map((note, idx) => (
              <li key={idx}>{note}</li>
            ))}
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="remote" title="remotePatterns">
        <Docs.Title>remotePatterns</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  A remote image is refused until its URL matches an entry in <code>remotePatterns</code>, and the
                  default list is empty. When the optimizer answers 400 for a remote image, check this setting first.
                </span>
              ),
              ko: (
                <span>
                  외부 이미지는 URL이 <code>remotePatterns</code>의 항목과 맞아야 받으며, 기본값은 빈 목록입니다. 외부
                  이미지 최적화가 400으로 실패하면 이 설정부터 확인하세요.
                </span>
              ),
            })}
          </div>
          <div>
            {l.trans({
              en: "Add each host you serve images from:",
              ko: "이미지를 가져올 호스트를 하나씩 추가합니다:",
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/myapp/akan.config.ts"
            code={`import type { AppConfig } from "akanjs";

const config: AppConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.example.com",
        pathname: "/articles/**",
      },
    ],
  },
};

export default config;`}
          />
          <Docs.Table columns={patternColumns} rows={patternRows} />
          <ul className={bulletList}>
            {patternNotes.map((note, idx) => (
              <li key={idx}>{note}</li>
            ))}
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="remote-cache" title={l.trans({ en: "Remote Cache", ko: "외부 이미지 캐시" })}>
        <Docs.Title>{l.trans({ en: "Remote Cache", ko: "외부 이미지 캐시" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  A remote image is downloaded once, then served from disk until its TTL runs out, so a warm image never
                  reaches its origin. The TTL is the upstream <code>max-age</code>, but never less than{" "}
                  <code>minimumCacheTTL</code>.
                </span>
              ),
              ko: (
                <span>
                  외부 이미지는 한 번 내려받은 뒤 TTL이 끝날 때까지 디스크에서 제공하므로, 캐시된 이미지는 원본
                  서버(origin)까지 가지 않습니다. TTL은 업스트림 <code>max-age</code>이고, <code>minimumCacheTTL</code>
                  보다 짧아지지 않습니다.
                </span>
              ),
            })}
          </div>
          <Docs.Table columns={cacheColumns} rows={cacheRows} />
          <ul className={bulletList}>
            {cacheNotes.map((note, idx) => (
              <li key={idx}>{note}</li>
            ))}
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="cache-hit" title={l.trans({ en: "Cache Hits", ko: "캐시 적중" })}>
        <Docs.Title>{l.trans({ en: "Cache Hits", ko: "캐시 적중" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Each encoded file is stored under a key made of five parts. The more distinct widths and qualities your pages request, the more rarely reused files the cache splits into.",
              ko: "인코딩된 파일은 다섯 가지 값으로 만든 key로 저장됩니다. 페이지가 요청하는 width와 quality 종류가 많을수록, 캐시는 잘 재사용되지 않는 파일들로 잘게 쪼개집니다.",
            })}
          </div>
          <Docs.IntroTable type={l.trans({ en: "Key part", ko: "key 구성" })} items={keyRows} />
          <ul className={bulletList}>
            {hitNotes.map((note, idx) => (
              <li key={idx}>{note}</li>
            ))}
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <DocsToc />
    </Scroll>
  );
});
