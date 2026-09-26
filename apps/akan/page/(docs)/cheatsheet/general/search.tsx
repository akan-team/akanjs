import { usePage } from "@apps/akan/client";
import { Code, cardGridRecipe, Divider, Docs, DocsToc, panelRecipe } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { page } from "akanjs/client";

export default page().render(() => {
  const { l } = usePage();

  const termRows = [
    {
      name: "text",
      desc: l.trans({
        en: 'A field option that puts the field in the search index, written as `{ text: "title" }`.',
        ko: 'field를 검색 인덱스에 넣는 옵션입니다. `{ text: "title" }`처럼 씁니다.',
      }),
    },
    {
      name: "filter",
      desc: l.trans({
        en: "A named query in `document.ts`. The service gets methods named after it, like `listBySearch`.",
        ko: "`document.ts`에 이름을 붙여 선언한 query입니다. service에 그 이름을 딴 `listBySearch` 같은 메서드가 생깁니다.",
      }),
    },
    {
      name: "q.search()",
      desc: l.trans({
        en: "The query node that matches text against the index.",
        ko: "텍스트를 인덱스와 대조하는 query 노드입니다.",
      }),
    },
    {
      name: "slice",
      desc: l.trans({
        en: "A filter published as an endpoint that a client store can load.",
        ko: "filter를 클라이언트 store가 불러올 수 있는 endpoint로 공개한 것입니다.",
      }),
    },
    {
      name: "relevance",
      desc: l.trans({
        en: "A built-in sort key that puts the best match first.",
        ko: "가장 잘 맞는 결과를 먼저 놓는 기본 제공 정렬 키입니다.",
      }),
    },
  ];

  const roleRows = [
    {
      role: "title",
      weight: "10",
      use: l.trans({
        en: "The name a person types into the search box. Ranked above everything else.",
        ko: "사람이 검색창에 치는 이름입니다. 다른 어떤 역할보다 순위에 크게 반영됩니다.",
      }),
    },
    {
      role: "tag",
      weight: "3",
      use: l.trans({
        en: "A keyword list. Ranked below the title and above prose.",
        ko: "키워드 목록입니다. 제목보다 낮고 본문보다 높습니다.",
      }),
    },
    {
      role: "desc",
      weight: "1",
      use: l.trans({
        en: "Prose. It matches, but should not beat a name match.",
        ko: "본문입니다. 매치는 되지만 이름이 맞은 결과보다 앞서지 않도록 가중치가 낮습니다.",
      }),
    },
    {
      role: "filter",
      weight: "0",
      use: l.trans({
        en: "A scoping value like status or owner. Searchable, never a reason to rank first.",
        ko: "status나 owner처럼 범위를 좁히는 값입니다. 검색에는 걸리지만 순위는 올리지 않습니다.",
      }),
    },
    {
      role: "thumb",
      weight: "—",
      use: l.trans({
        en: "Stored with the entry so you can draw the result. Not indexed, so it never matches.",
        ko: "검색 결과를 화면에 그릴 때 쓰도록 함께 저장됩니다. 색인되지 않으므로 매치되지 않습니다.",
      }),
    },
  ];

  const methodRows = [
    {
      name: "listBySearch",
      desc: l.trans({
        en: "The matching documents. A last `{ sort, skip, limit }` argument orders and pages them.",
        ko: "매치된 document 목록입니다. 마지막 인자 `{ sort, skip, limit }`로 정렬하고 페이지를 나눕니다.",
      }),
    },
    {
      name: "countBySearch",
      desc: l.trans({ en: "How many documents match.", ko: "매치되는 document 수입니다." }),
    },
    {
      name: "insightBySearch",
      desc: l.trans({
        en: "The model's insight, computed over the matches only.",
        ko: "매치된 document만으로 계산한 모델의 insight입니다.",
      }),
    },
    {
      name: "queryBySearch",
      desc: l.trans({
        en: "The query itself, for a slice's `exec` to return.",
        ko: "query 자체입니다. slice의 `exec`이 반환할 때 씁니다.",
      }),
    },
  ];

  const optionRows = [
    {
      key: "prefix",
      type: "boolean",
      default: "false",
      desc: l.trans({
        en: "Lets the last word match as a prefix, for as-you-type boxes. Without it, `Ken` misses `Kenny`.",
        ko: "마지막 단어를 접두어로도 매치합니다. 입력하면서 찾는 검색창용이며, 없으면 `Ken`으로 `Kenny`를 못 찾습니다.",
      }),
      example: "q.search(text, { prefix: true })",
    },
    {
      key: "columns",
      type: '("title" | "desc" | "tag" | "filter")[]',
      default: l.trans({ en: "all four", ko: "네 개 모두" }),
      desc: l.trans({
        en: "Looks only in the named roles. `thumb` is not indexed, so it is not a column.",
        ko: "지정한 역할에서만 찾습니다. `thumb`은 색인되지 않으므로 고를 수 없습니다.",
      }),
      example: 'q.search(text, { columns: ["title", "tag"] })',
    },
    {
      key: "weights",
      type: "[title, desc, tag, filter]",
      default: "[10, 1, 3, 0]",
      desc: l.trans({
        en: "Replaces the ranking weights: four finite, non-negative numbers, in title, desc, tag, filter order.",
        ko: "순위 가중치를 바꿉니다. title, desc, tag, filter 순서대로 음수가 아닌 유한한 숫자 네 개를 넘깁니다.",
      }),
      example: "q.search(text, { weights: [20, 1, 5, 0] })",
    },
  ];

  const sortRows = [
    {
      sort: '`"relevance"`',
      order: l.trans({ en: "Best match first.", ko: "가장 잘 맞는 결과부터 옵니다." }),
    },
    {
      sort: l.trans({ en: 'Any other key, like `"latest"`', ko: '다른 키 (`"latest"` 등)' }),
      order: l.trans({ en: "That key wins over the score.", ko: "점수보다 그 키가 우선합니다." }),
    },
    {
      sort: l.trans({ en: "Left off, in a service call", ko: "생략 — service에서 호출" }),
      order: l.trans({
        en: "Best match first, because the query holds a search.",
        ko: "query에 검색이 있으므로 가장 잘 맞는 결과부터 옵니다.",
      }),
    },
    {
      sort: l.trans({ en: "Left off, on a slice endpoint", ko: "생략 — slice endpoint" }),
      order: l.trans({
        en: '`"latest"` is filled in, so the score is never used.',
        ko: '`"latest"`가 채워지므로 점수 순이 되지 않습니다.',
      }),
    },
  ];

  const envRows = [
    {
      key: "AKAN_SEARCH_ENABLED",
      type: "1 | true | 0 | false",
      default: l.trans({ en: "unset = on", ko: "비우면 켜짐" }),
      desc: l.trans({
        en: "Switches the index on or off. Off keeps indexed data; back on re-syncs every model.",
        ko: "인덱스를 켜고 끕니다. 꺼도 색인된 데이터는 남고, 다시 켜면 모든 모델을 다시 맞춰 색인합니다.",
      }),
      example: "AKAN_SEARCH_ENABLED=0",
    },
    {
      key: "AKAN_SEARCH_TOKENIZER",
      type: "string",
      default: "unicode61 remove_diacritics 2",
      desc: l.trans({
        en: "Picks the fts5 tokenizer; Postgres reads only the two forms below.",
        ko: "fts5 토크나이저를 고릅니다. Postgres는 아래 두 형식만 읽습니다.",
      }),
      example: "unicode61 [remove_diacritics 0|1|2]\ntrigram [case_sensitive 0|1]",
    },
  ];

  return (
    <Scroll>
      <Scroll.Slide id="overview" title={l.trans({ en: "Text Search", ko: "텍스트 검색" })}>
        <Docs.Title>{l.trans({ en: "Text Search", ko: "텍스트 검색" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Akan has full-text search built in. There is no search server to run and no index to keep in sync by hand.",
              ko: "Akan에는 전문 검색이 내장되어 있습니다. 따로 띄울 검색 서버도, 손으로 맞춰야 할 인덱스도 없습니다.",
            })}
          </div>
          <div>{l.trans({ en: "It takes three steps:", ko: "세 단계면 됩니다:" })}</div>
          <ol className="my-4 list-decimal space-y-2 pl-5">
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Mark the fields.</strong> Give each searchable field a <code>text</code> role in{" "}
                    <code>constant.ts</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>field 표시하기.</strong> <code>constant.ts</code>에서 검색할 field마다 <code>text</code>{" "}
                    역할을 붙입니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Write the filter.</strong> Call <code>q.search(text)</code> from a filter in{" "}
                    <code>document.ts</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>filter 작성하기.</strong> <code>document.ts</code>의 filter에서 <code>q.search(text)</code>
                    를 호출합니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Call it.</strong> Use the generated <code>listBySearch</code>, sorted by{" "}
                    <code>"relevance"</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>호출하기.</strong> 생성된 <code>listBySearch</code>를 <code>"relevance"</code> 정렬로
                    부릅니다.
                  </span>
                ),
              })}
            </li>
          </ol>
          <div>
            {l.trans({
              en: "Letting clients search as well is a separate decision, covered in Publishing To Clients.",
              ko: "클라이언트에서도 검색하게 할지는 별도의 결정입니다. 아래 '클라이언트에 공개하기'에서 다룹니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "Search works in every database mode. For the same text, SQLite, libSQL and Postgres match the same documents, but Postgres can order them differently because its ranking does not weigh how rare a word is. Postgres setup is covered in Operating It.",
              ko: "검색은 모든 데이터베이스 모드에서 동작합니다. 같은 텍스트라면 SQLite, libSQL, Postgres 모두 같은 document를 찾지만, Postgres는 단어가 얼마나 드문지를 순위에 반영하지 않아서 순서가 다를 수 있습니다. Postgres 설정은 아래 '운영하기'에서 다룹니다.",
            })}
          </div>
          <Docs.SubSubTitle>{l.trans({ en: "Words used on this page", ko: "이 페이지에서 쓰는 말" })}</Docs.SubSubTitle>
          <Docs.IntroTable type={l.trans({ en: "Term", ko: "용어" })} items={termRows} />
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="declare" title={l.trans({ en: "1. Mark The Fields", ko: "1. Field 표시하기" })}>
        <Docs.Title>{l.trans({ en: "1. Mark The Fields", ko: "1. Field 표시하기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  Name a role in the field's options, as in <code>{'{ text: "title" }'}</code>. Pick the role by what
                  the value is, not by how badly you want it found: each role carries its own ranking weight.
                </span>
              ),
              ko: (
                <span>
                  field 옵션에 <code>{'{ text: "title" }'}</code>처럼 역할을 적습니다. 얼마나 잘 검색되길 바라는지가
                  아니라 값이 무엇인지를 보고 고르세요. 역할마다 순위 가중치가 다릅니다.
                </span>
              ),
            })}
          </div>
          <div>
            {l.trans({ en: "A product with all five roles in use:", ko: "다섯 역할을 모두 쓴 상품 모델입니다:" })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/shop/lib/product/product.constant.ts"
            code={`export class ProductStatus extends enumOf("productStatus", [
  "draft",
  "active",
] as const) {}

export class ProductInput extends via((field) => ({
  name: field(String, { text: "title" }),
  summary: field(String, { default: "", text: "desc" }),
  keywords: field([String], { text: "tag" }),
  cover: field(File, { text: "thumb" }).optional(),
})) {}

export class ProductObject extends via(ProductInput, (field) => ({
  status: field(ProductStatus, { default: "draft", text: "filter" }),
})) {}`}
          />
          <Docs.Table
            stacked
            columns={[
              { key: "role", label: l.trans({ en: "Role", ko: "역할" }), code: true },
              { key: "weight", label: l.trans({ en: "Weight", ko: "가중치" }), code: true },
              { key: "use", label: l.trans({ en: "Use", ko: "용도" }) },
            ]}
            rows={roleRows}
          />
          <ul className="my-4 list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      <code>title</code>, <code>tag</code> and <code>desc</code> take a <code>String</code>.
                    </strong>{" "}
                    <code>filter</code> and <code>thumb</code> also take an <code>ID</code> or a relation such as{" "}
                    <code>field(File)</code>, and a string enum counts as a <code>String</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>title</code>, <code>tag</code>, <code>desc</code>는 <code>String</code>을 받습니다.
                    </strong>{" "}
                    <code>filter</code>와 <code>thumb</code>은 <code>ID</code>나 <code>field(File)</code> 같은 관계
                    field도 받고, 문자열 enum은 <code>String</code>으로 취급됩니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Arrays and embedded scalars work.</strong> <code>[String]</code> indexes every item, and a
                    role inside an embedded scalar is indexed through its parent. A field inside a <code>Map</code>{" "}
                    indexes nothing.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>배열과 내장 스칼라에도 쓸 수 있습니다.</strong> <code>[String]</code>은 항목마다 색인되고,
                    내장 스칼라 안의 역할은 부모 field를 통해 색인됩니다. <code>Map</code> 안의 field는 색인되지
                    않습니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Declaring roles is all the wiring.</strong> There is no per-model switch; the index follows
                    the roles you declare.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>역할만 선언하면 끝입니다.</strong> 모델 단위로 켜는 스위치는 따로 없고, 인덱스는 선언한
                    역할을 그대로 따릅니다.
                  </span>
                ),
              })}
            </li>
          </ul>
          <Docs.Alert type="error">
            {l.trans({
              en: (
                <span>
                  <strong>
                    <code>field.secret</code>, <code>field.hidden</code> and <code>resolve()</code> take no text role.
                  </strong>{" "}
                  The index stores plain text, so an indexed secret would leak through search. The type check refuses
                  it.
                </span>
              ),
              ko: (
                <span>
                  <strong>
                    <code>field.secret</code>, <code>field.hidden</code>, <code>resolve()</code>에는 text 역할을 줄 수
                    없습니다.
                  </strong>{" "}
                  인덱스는 평문을 저장하므로, 색인된 비밀 값은 검색으로 새어 나갑니다. 타입 검사에서 거절됩니다.
                </span>
              ),
            })}
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="filter" title={l.trans({ en: "2. Write The Filter", ko: "2. Filter 작성하기" })}>
        <Docs.Title>{l.trans({ en: "2. Write The Filter", ko: "2. Filter 작성하기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  <code>q.search()</code> is a query node like any other, so it combines with ordinary conditions inside{" "}
                  <code>q.all()</code>. You do not need a slice to search from a service.
                </span>
              ),
              ko: (
                <span>
                  <code>q.search()</code>는 다른 것과 똑같은 query 노드라서 <code>q.all()</code> 안에서 일반 조건과
                  조합됩니다. service에서 검색하는 데 slice는 필요 없습니다.
                </span>
              ),
            })}
          </div>
          <Docs.SubSubTitle>{l.trans({ en: "Declare the filter", ko: "filter 선언하기" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: "A search that can also narrow by status:",
              ko: "상태로도 좁힐 수 있는 검색 filter입니다:",
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/shop/lib/product/product.document.ts"
            code={`export class ProductFilter extends from(cnst.Product, (filter) => ({
  query: {
    bySearch: filter()
      .arg("text", String)
      .opt("statuses", [cnst.ProductStatus])
      .query((text, statuses, q) =>
        q.all(
          q.search(text, { prefix: true }),
          statuses?.length ? { status: q.oneOf(statuses) } : {},
        ),
      ),
  },
  sort: {},
})) {}`}
          />
          <ul className="my-4 list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      <code>.arg()</code> is required, <code>.opt()</code> may be left out and comes after every{" "}
                      <code>.arg()</code>.
                    </strong>{" "}
                    Both reach <code>.query()</code> in the order declared, followed by <code>q</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>.arg()</code>는 필수 인자이고, <code>.opt()</code>는 생략할 수 있으며 모든{" "}
                      <code>.arg()</code> 뒤에 둡니다.
                    </strong>{" "}
                    둘 다 선언한 순서대로 <code>.query()</code>에 들어오고, 마지막에 <code>q</code>가 붙습니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      An empty <code>{"{}"}</code> adds no condition.
                    </strong>{" "}
                    With no statuses given, only the search narrows the results.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      빈 <code>{"{}"}</code>는 아무 조건도 더하지 않습니다.
                    </strong>{" "}
                    상태를 넘기지 않으면 검색어만으로 결과를 좁힙니다.
                  </span>
                ),
              })}
            </li>
          </ul>
          <div>
            {l.trans({
              en: (
                <span>
                  Like every filter, it needs an entry under <code>.query()</code> in the dictionary, arguments
                  included:
                </span>
              ),
              ko: (
                <span>
                  다른 filter처럼 dictionary의 <code>.query()</code>에 인자까지 이름을 적어 줍니다:
                </span>
              ),
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/shop/lib/product/product.dictionary.ts"
            code={`.query<ProductFilter>((fn) => ({
  bySearch: fn(["By Search", "검색어별 조회"]).arg((t) => ({
    text: t(["Text", "검색어"]).desc(["Words to search for", "찾을 검색어"]),
    statuses: t(["Statuses", "상태"]).desc(["Statuses to keep", "남길 상태"]),
  })),
}))`}
          />
          <Docs.SubSubTitle>{l.trans({ en: "Call it from the service", ko: "service에서 호출하기" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: "The filter gives the service a family of methods. These four are the ones a search uses:",
              ko: "filter를 선언하면 service에 메서드 묶음이 생깁니다. 검색에 쓰는 것은 이 네 개입니다:",
            })}
          </div>
          <Docs.IntroTable type={l.trans({ en: "Method", ko: "메서드" })} items={methodRows} />
          <div>
            {l.trans({
              en: "A service method that returns one page of results and the total:",
              ko: "결과 한 페이지와 전체 개수를 돌려주는 service 메서드입니다:",
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/shop/lib/product/product.service.ts"
            code={`export class ProductService extends serve(db.product, () => ({})) {
  async searchProducts(
    text: string,
    statuses?: cnst.ProductStatus["value"][],
  ) {
    const [products, total] = await Promise.all([
      this.listBySearch(text, statuses, { sort: "relevance", limit: 20 }),
      this.countBySearch(text, statuses),
    ]);
    return { products, total };
  }
}`}
          />
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="options" title={l.trans({ en: "3. Tune The Match", ko: "3. 매칭 다듬기" })}>
        <Docs.Title>{l.trans({ en: "3. Tune The Match", ko: "3. 매칭 다듬기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  Three options cover almost everything, all passed as the second argument of <code>q.search()</code>.
                </span>
              ),
              ko: (
                <span>
                  옵션 세 가지면 거의 다 됩니다. 모두 <code>q.search()</code>의 두 번째 인자로 넘깁니다.
                </span>
              ),
            })}
          </div>
          <Docs.OptionTable items={optionRows} />
          <Docs.SubSubTitle>{l.trans({ en: "How input is matched", ko: "입력은 이렇게 매치됩니다" })}</Docs.SubSubTitle>
          <ul className="my-4 list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Raw user input is safe.</strong> Nothing in it is read as search syntax. Punctuation splits
                    a word into pieces that must appear side by side, so <code>follow-up</code> finds “follow-up” and
                    “follow up”.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>사용자 입력을 그대로 넣어도 안전합니다.</strong> 입력의 어떤 글자도 검색 문법으로 해석되지
                    않습니다. 문장부호는 단어를 조각으로 나누고 그 조각들이 나란히 있어야 매치되므로,{" "}
                    <code>follow-up</code>은 “follow-up”과 “follow up”을 찾습니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Every word must match,</strong> in any order. The default tokenizer ignores case and
                    accents.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>모든 단어가 매치되어야 합니다.</strong> 순서는 상관없고, 기본 토크나이저는 대소문자와
                    악센트를 구분하지 않습니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Blank input matches nothing.</strong> An empty search box never turns into a full listing.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>빈 입력은 아무것도 매치하지 않습니다.</strong> 빈 검색창이 전체 목록이 되는 일은 없습니다.
                  </span>
                ),
              })}
            </li>
          </ul>
          <Docs.SubSubTitle>{l.trans({ en: "Ordering", ko: "정렬" })}</Docs.SubSubTitle>
          <Docs.Table
            stacked
            columns={[
              { key: "sort", label: l.trans({ en: "When sort is", ko: "sort 값" }) },
              { key: "order", label: l.trans({ en: "Order", ko: "결과 순서" }) },
            ]}
            rows={sortRows}
          />
          <Docs.Alert type="warning">
            {l.trans({
              en: (
                <span>
                  <strong>
                    From a client, ask for <code>"relevance"</code> by name.
                  </strong>{" "}
                  A slice endpoint fills in <code>"latest"</code> when sort is left off, so it never falls through to
                  the score.
                </span>
              ),
              ko: (
                <span>
                  <strong>
                    클라이언트에서는 <code>"relevance"</code>를 반드시 명시하세요.
                  </strong>{" "}
                  slice endpoint는 sort를 비워 두면 <code>"latest"</code>를 채우므로 점수 순으로 정렬되지 않습니다.
                </span>
              ),
            })}
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="publish" title={l.trans({ en: "Publishing To Clients", ko: "클라이언트에 공개하기" })}>
        <Docs.Title>{l.trans({ en: "Publishing To Clients", ko: "클라이언트에 공개하기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "A filter runs on the server only. A slice turns it into an endpoint a client can call, and on a publicly readable model anyone can then walk the table one query at a time.",
              ko: "filter는 서버에서만 실행됩니다. slice를 달면 클라이언트가 부를 수 있는 endpoint가 되고, 공개 조회가 가능한 모델이라면 누구나 query를 반복하며 테이블 전체를 훑을 수 있게 됩니다.",
            })}
          </div>
          <div>{l.trans({ en: "So decide per model:", ko: "그래서 모델마다 판단합니다:" })}</div>
          <div className={cardGridRecipe({ cols: "mdTwo" }, "my-4")}>
            <div className={panelRecipe({ radius: "lg", padding: "sm" }, "min-w-0")}>
              <div className="font-semibold text-primary">
                {l.trans({ en: "Meant To Be Searched", ko: "검색되라고 있는 데이터" })}
              </div>
              <div className="mt-2 text-foreground/70 text-sm">
                {l.trans({
                  en: "A product catalog. Publishing a search slice is the point.",
                  ko: "상품 목록입니다. 검색 slice를 공개하는 것이 곧 목적입니다.",
                })}
              </div>
            </div>
            <div className={panelRecipe({ radius: "lg", padding: "sm" }, "min-w-0")}>
              <div className="font-semibold text-primary">
                {l.trans({ en: "Usually Not", ko: "대개 검색을 열지 않는 데이터" })}
              </div>
              <div className="mt-2 text-foreground/70 text-sm">
                {l.trans({
                  en: "A user directory. Keep its search filter on the server.",
                  ko: "사용자 목록입니다. 검색 filter를 서버에만 둡니다.",
                })}
              </div>
            </div>
          </div>
          <div>
            {l.trans({
              en: "A public catalog search, with its own guard:",
              ko: "자기 guard를 단 공개 상품 검색 slice입니다:",
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/shop/lib/product/product.signal.ts"
            code={`export class ProductSlice extends slice(
  srv.product,
  { guards: { root: Admin, get: Public, cru: Admin } },
  (init) => ({
    bySearch: init({ guards: [Public] })
      .param("text", String)
      .search("statuses", [cnst.ProductStatus])
      .exec(function (text, statuses) {
        return this.productService.queryBySearch(text, statuses);
      }),
  }),
) {}`}
          />
          <ul className="my-4 list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Name the slice in the dictionary too,</strong> under <code>.slice()</code> with a{" "}
                    <code>.desc()</code>. An MCP agent picks the tool by that description.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>dictionary에도 slice 이름을 적습니다.</strong> <code>.slice()</code> 아래에{" "}
                    <code>.desc()</code>와 함께 씁니다. MCP 에이전트는 그 설명을 보고 도구를 고릅니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Load it with the order named:</strong>{" "}
                    <code>{'st.do.initProductBySearch(text, statuses, { sort: "relevance" })'}</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>불러올 때 정렬을 명시합니다.</strong>{" "}
                    <code>{'st.do.initProductBySearch(text, statuses, { sort: "relevance" })'}</code>
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>A live search slice refetches.</strong> A search cannot be matched in memory, so a{" "}
                    <code>.live()</code> slice holding one declares <code>{'{ fallback: "invalidate" }'}</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>실시간 검색 slice는 다시 불러오는 방식입니다.</strong> 검색은 메모리에서 대조할 수 없으므로,
                    검색을 담은 <code>.live()</code> slice는 <code>{'{ fallback: "invalidate" }'}</code>를 선언합니다.
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
                    A named slice is guarded only by its own <code>init({"{ guards }"})</code>.
                  </strong>{" "}
                  The <code>slice()</code> map covers the root slice and generated CRUD. With no guards of its own, the
                  search is open to anyone over HTTP and left out of MCP.
                </span>
              ),
              ko: (
                <span>
                  <strong>
                    이름 붙은 slice는 자기 <code>init({"{ guards }"})</code>로만 보호됩니다.
                  </strong>{" "}
                  <code>slice()</code>의 guard 맵은 root slice와 생성된 CRUD에만 적용됩니다. 자기 guard가 없으면 HTTP로
                  누구나 호출할 수 있고, MCP에는 공개되지 않습니다.
                </span>
              ),
            })}
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="operations" title={l.trans({ en: "Operating It", ko: "운영하기" })}>
        <Docs.Title>{l.trans({ en: "Operating It", ko: "운영하기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "The index keeps itself current through database triggers. A write from any path is reflected, including bulk query-level updates that fire no document hooks.",
              ko: "인덱스는 데이터베이스 trigger로 스스로 최신 상태를 유지합니다. document hook이 실행되지 않는 대량 query 단위 update까지, 어떤 경로의 write든 반영됩니다.",
            })}
          </div>
          <Docs.OptionTable items={envRows} />
          <ul className="my-4 list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Give every process in a deployment the same value.</strong> A process cannot clean up
                    triggers for models it does not mount, so a mixed fleet leaves stale ones behind.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>한 배포의 모든 프로세스에 같은 값을 주세요.</strong> 프로세스는 자기가 마운트하지 않은
                    모델의 trigger를 정리하지 못하므로, 값이 섞이면 낡은 trigger가 남습니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      While search is off, <code>q.search()</code> throws.
                    </strong>{" "}
                    Filters that declare it still build; only a query that reaches it fails.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      검색을 끈 동안에는 <code>q.search()</code>가 에러를 던집니다.
                    </strong>{" "}
                    <code>q.search()</code>를 선언한 filter 자체는 문제없고, 실제로 실행된 query만 실패합니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>A tokenizer change is cheap.</strong> The next boot rebuilds the index from its own copy of
                    the text without re-reading any model table, so the setting is safe to revisit.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>토크나이저 변경은 가볍습니다.</strong> 다음 부팅 때 모델 테이블을 다시 읽지 않고 인덱스가
                    보관한 텍스트 사본에서 인덱스를 다시 만들므로, 부담 없이 다시 조정할 수 있습니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>A fleet restarted at once rebuilds once.</strong> The first process rebuilds and the rest
                    wait for it. On SQLite a process waits only up to its busy timeout (5 seconds by default), so
                    stagger restarts when the index is large.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>한꺼번에 재시작해도 재생성은 한 번입니다.</strong> 첫 프로세스가 다시 만들고 나머지는
                    기다립니다. SQLite에서는 busy timeout(기본 5초)까지만 기다리므로, 인덱스가 크면 재시작을 나눠서
                    하세요.
                  </span>
                ),
              })}
            </li>
          </ul>
          <Docs.SubSubTitle>{l.trans({ en: "On Postgres", ko: "Postgres에서" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: "Three things are specific to Postgres:",
              ko: "Postgres에만 해당하는 것이 세 가지 있습니다:",
            })}
          </div>
          <ul className="my-4 list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>The tokenizer needs an extension.</strong> <code>unicode61</code> needs{" "}
                    <code>unaccent</code> unless it is <code>remove_diacritics 0</code>, and <code>trigram</code> needs{" "}
                    <code>pg_trgm</code>. Akan creates it if its database role has the privilege; otherwise run{" "}
                    <code>CREATE EXTENSION unaccent</code> (or <code>pg_trgm</code>) as a role that has it.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>토크나이저에 맞는 확장이 필요합니다.</strong> <code>unicode61</code>에는{" "}
                    <code>unaccent</code>가(<code>remove_diacritics 0</code>이면 불필요), <code>trigram</code>에는{" "}
                    <code>pg_trgm</code>이 필요합니다. Akan이 쓰는 데이터베이스 role에 권한이 있으면 Akan이 만들고,
                    없으면 권한이 있는 role로 <code>CREATE EXTENSION unaccent</code>(또는 <code>pg_trgm</code>)를
                    실행합니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      Create the database with a UTF-8 <code>LC_CTYPE</code>,
                    </strong>{" "}
                    such as <code>en_US.UTF-8</code> or <code>C.UTF-8</code>. Otherwise case is ignored for ASCII
                    letters only, where SQLite ignores it for every letter.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      데이터베이스는 UTF-8 <code>LC_CTYPE</code>로 만듭니다.
                    </strong>{" "}
                    <code>en_US.UTF-8</code>이나 <code>C.UTF-8</code> 같은 값입니다. 그렇지 않으면 SQLite와 달리 ASCII
                    문자에서만 대소문자를 구분하지 않습니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Only the start of a very long text is indexed.</strong> With <code>unicode61</code>,
                    Postgres indexes the first 20,000 characters of a document's <code>title</code>, <code>tag</code>{" "}
                    and <code>filter</code> text and the first 200,000 of its <code>desc</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>아주 긴 텍스트는 앞부분만 색인됩니다.</strong> <code>unicode61</code>에서 Postgres는
                    document마다 <code>title</code>, <code>tag</code>, <code>filter</code> 텍스트의 앞 20,000자와{" "}
                    <code>desc</code>의 앞 200,000자만 색인합니다.
                  </span>
                ),
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="gotchas" title={l.trans({ en: "Gotchas", ko: "주의할 점" })}>
        <Docs.Title>{l.trans({ en: "Gotchas", ko: "주의할 점" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  Where <code>q.search()</code> cannot go, and what else tends to surprise people:
                </span>
              ),
              ko: (
                <span>
                  <code>q.search()</code>를 둘 수 없는 곳과, 헷갈리기 쉬운 동작들입니다:
                </span>
              ),
            })}
          </div>
          <ul className="my-4 list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      <code>q.search()</code> sits at an AND position only.
                    </strong>{" "}
                    Under <code>q.any()</code> or <code>q.not()</code> the query throws.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>q.search()</code>는 AND 위치에만 둘 수 있습니다.
                    </strong>{" "}
                    <code>q.any()</code>나 <code>q.not()</code> 아래에 두면 query가 에러를 던집니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Not in query-level writes.</strong> The model's <code>updateOne</code> /{" "}
                    <code>updateMany</code> / <code>removeOne</code> / <code>removeMany</code> and the generated{" "}
                    <code>updateBySearch</code> / <code>removeBySearch</code> family refuse it (the error names{" "}
                    <code>updateOneByQuery</code> or <code>updateManyByQuery</code>), because a bulk write cannot join
                    the index.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>query 단위 write에는 쓸 수 없습니다.</strong> 모델의 <code>updateOne</code> /{" "}
                    <code>updateMany</code> / <code>removeOne</code> / <code>removeMany</code>, 그리고 생성된{" "}
                    <code>updateBySearch</code> / <code>removeBySearch</code> 계열은 대량 write가 인덱스와 join할 수
                    없어서 이를 거절합니다. 에러 메시지에는 <code>updateOneByQuery</code>나{" "}
                    <code>updateManyByQuery</code>라는 이름으로 나옵니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      <code>schema.index()</code> has nothing to do with search.
                    </strong>{" "}
                    Even <code>{'schema.index({ name: "text" })'}</code> builds an ordinary lookup index.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>schema.index()</code>는 검색과 무관합니다.
                    </strong>{" "}
                    <code>{'schema.index({ name: "text" })'}</code>라고 써도 일반 조회 인덱스만 만듭니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Removed documents leave the index,</strong> soft deletes included, and a restored one comes
                    back.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>지운 document는 인덱스에서도 빠집니다.</strong> soft delete도 마찬가지이고, 복구하면 다시
                    들어옵니다.
                  </span>
                ),
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <DocsToc />
    </Scroll>
  );
});
