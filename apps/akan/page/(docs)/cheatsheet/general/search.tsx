import { usePage } from "@apps/akan/client";
import { Code, Docs } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();

  return (
    <Scroll>
      <Scroll.Slide id="overview" title={l.trans({ en: "Text Search", ko: "텍스트 검색" })}>
        <Docs.Title>{l.trans({ en: "Text Search", ko: "텍스트 검색" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Akan has built-in full-text search. There is no separate search server to run and no index to keep in sync by hand: you mark fields in constant.ts, write one filter, and the database does the rest.",
              ko: "Akan에는 전문 검색이 내장되어 있습니다. 따로 띄울 검색 서버도, 손으로 맞춰야 할 index도 없습니다. constant.ts에서 field를 표시하고 filter 하나를 쓰면 나머지는 데이터베이스가 합니다.",
            })}
          </div>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: "Declare a text role on the fields you want searchable.",
                ko: "검색 대상으로 삼을 field에 text 역할을 선언합니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Write a filter that calls q.search(text).",
                ko: "q.search(text)를 호출하는 filter를 작성합니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: 'Call the generated listBySearch and sort by "relevance".',
                ko: '생성된 listBySearch를 호출하고 "relevance"로 정렬합니다.',
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="declare" title={l.trans({ en: "1. Mark The Fields", ko: "1. Field 표시하기" })}>
        <Docs.Title>{l.trans({ en: "1. Mark The Fields", ko: "1. Field 표시하기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Five roles exist. Pick one by what the value is, not by how badly you want it found: the roles carry different ranking weights.",
              ko: "역할은 다섯 가지입니다. 얼마나 잘 찾히길 원하는지가 아니라 값의 성격으로 고르세요. 역할마다 순위 가중치가 다릅니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title="product.constant.ts"
          code={`export class ProductInput extends via((field) => ({
  name: field(String, { text: "title" }),
  summary: field(String, { default: "", text: "desc" }),
  keywords: field([String], { text: "tag" }),
  cover: field(File, { text: "thumb" }).optional(),
  status: field(ProductStatus, { default: "draft", text: "filter" }),
})) {}`}
        />
        <div className="grid gap-3 xl:grid-cols-2">
          {[
            {
              title: "title",
              desc: l.trans({
                en: "The name a person searches for. Ranked well above everything else.",
                ko: "사람이 검색창에 치는 이름입니다. 다른 무엇보다 높게 순위가 매겨집니다.",
              }),
            },
            {
              title: "tag",
              desc: l.trans({
                en: "A keyword list. Above prose, below the title.",
                ko: "키워드 목록입니다. 본문보다 높고 제목보다 낮습니다.",
              }),
            },
            {
              title: "desc",
              desc: l.trans({
                en: "Prose. Matched, but it should not beat a name match.",
                ko: "본문입니다. 매치되긴 하지만 이름 매치를 이기면 안 됩니다.",
              }),
            },
            {
              title: "filter",
              desc: l.trans({
                en: "A scoping value like status or owner. Weighted zero: searchable, never a reason to rank first.",
                ko: "status나 owner처럼 범위를 좁히는 값입니다. 가중치 0이라 검색은 되지만 1위가 되는 근거는 되지 못합니다.",
              }),
            },
            {
              title: "thumb",
              desc: l.trans({
                en: "Carried along so you can draw the result. Not indexed, so it never matches.",
                ko: "결과를 그릴 수 있도록 함께 실려옵니다. 색인되지 않으므로 매치되지 않습니다.",
              }),
            },
            {
              title: l.trans({ en: "Secrets are refused", ko: "secret은 거부됩니다" }),
              desc: l.trans({
                en: "A secret, hidden, or resolved field with a text role fails at startup. The index stores plaintext, so this is the guard that keeps a password out of search results.",
                ko: "secret, hidden, resolve field에 text 역할을 붙이면 기동 시점에 실패합니다. index는 평문을 저장하므로, 이 규칙이 비밀번호가 검색 결과에 나오는 일을 막습니다.",
              }),
            },
          ].map(({ title, desc }) => (
            <div key={title} className="rounded-xl border border-base-300 bg-base-100 p-4">
              <div className="font-bold text-base-content">{title}</div>
              <div className="mt-2 text-base-content/70">{desc}</div>
            </div>
          ))}
        </div>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="filter" title={l.trans({ en: "2. Write The Filter", ko: "2. Filter 작성하기" })}>
        <Docs.Title>{l.trans({ en: "2. Write The Filter", ko: "2. Filter 작성하기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "q.search() is a query node like any other, so it combines with ordinary conditions. Nothing else is needed to make search work from a service.",
              ko: "q.search()는 다른 것들과 똑같은 query node라서 일반 조건과 조합됩니다. service에서 검색을 쓰는 데 더 필요한 것은 없습니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title="product.document.ts"
          code={`export class ProductFilter extends from(cnst.Product, (filter) => ({
  query: {
    bySearch: filter()
      .arg("text", String)
      .opt("statuses", [cnst.ProductStatus])
      .query((text, statuses, q) =>
        q.all(q.search(text, { prefix: true }), statuses?.length ? { status: q.oneOf(statuses) } : {}),
      ),
  },
  sort: {},
})) {}`}
        />
        <Code.Snippet
          title="product.service.ts"
          code={`const products = await this.listBySearch(text, statuses, { sort: "relevance", limit: 20 });
const count = await this.countBySearch(text, statuses);`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="options" title={l.trans({ en: "3. Tune The Match", ko: "3. 매칭 다듬기" })}>
        <Docs.Title>{l.trans({ en: "3. Tune The Match", ko: "3. 매칭 다듬기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Three options cover almost everything: prefix for as-you-type boxes, columns to narrow where to look, weights to change what counts as relevant.",
              ko: "옵션 세 가지면 거의 다 됩니다. 입력하면서 검색하려면 prefix, 찾을 범위를 좁히려면 columns, 무엇을 관련있다고 볼지 바꾸려면 weights입니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title={l.trans({ en: "options", ko: "옵션" })}
          code={`q.search(text, { prefix: true })

q.search(text, { columns: ["title", "tag"] })

// title, desc, tag, filter order
q.search(text, { weights: [20, 1, 5, 0] })`}
        />
        <Docs.Description>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: "Raw user input is safe. Punctuation that would otherwise be search syntax is quoted for you.",
                ko: "사용자 입력을 그대로 넣어도 안전합니다. 검색 문법으로 해석될 문장부호는 알아서 따옴표 처리됩니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Blank input matches nothing. An empty search box does not become a full listing.",
                ko: "빈 입력은 아무것도 매치하지 않습니다. 빈 검색창이 전체 목록이 되지 않습니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: 'Sorting by "relevance" gives best-match-first. Any other sort key wins over the score. Name it explicitly from a client: a slice endpoint fills "latest" when sort is left off, so it never falls through to the score.',
                ko: '"relevance"로 정렬하면 가장 관련있는 순입니다. 다른 sort key를 주면 점수보다 우선합니다. Client에서는 반드시 명시하세요. slice endpoint는 sort를 비워두면 "latest"를 채우기 때문에 점수 순으로 내려가지 않습니다.',
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="publish" title={l.trans({ en: "Publishing To Clients", ko: "Client에 공개하기" })}>
        <Docs.Title>{l.trans({ en: "Publishing To Clients", ko: "Client에 공개하기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "A filter is server-side. Adding a slice turns it into an endpoint anyone allowed by the slice guards can call, which on a publicly readable model means anyone can walk the table one query at a time.",
              ko: "filter는 서버 쪽입니다. slice를 달면 slice guard가 허용하는 누구나 호출할 수 있는 endpoint가 되고, 공개 조회가 가능한 모델에서는 누구나 query를 반복하며 테이블 전체를 훑을 수 있다는 뜻이 됩니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "So decide per model. A product catalog is meant to be searched. A user directory usually is not.",
              ko: "그래서 모델마다 판단해야 합니다. 상품 목록은 검색되라고 있는 것이고, 사용자 목록은 대체로 아닙니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title="product.signal.ts"
          code={`export class ProductSlice extends slice(
  srv.product,
  { guards: { root: Admin, get: Public, cru: Admin } },
  (init) => ({
    bySearch: init()
      .param("text", String)
      .search("statuses", [cnst.ProductStatus])
      .exec(function (text, statuses) {
        return this.productService.queryBySearch(text, statuses);
      }),
  }),
) {}`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="operations" title={l.trans({ en: "Operating It", ko: "운영하기" })}>
        <Docs.Title>{l.trans({ en: "Operating It", ko: "운영하기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "The index keeps itself current through database triggers, so a write made by any path is reflected, including bulk query-level updates that fire no document hooks. Changing which fields carry a role rebuilds that model on the next boot.",
              ko: "index는 데이터베이스 trigger로 스스로 최신 상태를 유지하므로, document hook이 돌지 않는 대량 query 단위 update를 포함해 어떤 경로의 write든 반영됩니다. 역할을 붙인 field를 바꾸면 다음 기동 때 해당 모델이 다시 만들어집니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "A nightly job merges the index segments that writes leave behind, so search does not get slower over time. It does a bounded amount of work per run and only one process in a deployment performs it, so nothing needs to be scheduled by hand.",
              ko: "write가 남긴 index segment를 밤마다 병합하는 작업이 돌기 때문에 검색이 시간이 갈수록 느려지지 않습니다. 한 번에 정해진 양만 처리하고 한 배포에서 한 프로세스만 수행하므로, 직접 스케줄을 걸 필요는 없습니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet title={l.trans({ en: "turn it off", ko: "끄기" })} code={`AKAN_SEARCH_ENABLED=0`} />
        <Docs.Description>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: "Unset means on. Turning it off never deletes indexed data, and turning it back on reconciles every model.",
                ko: "값을 주지 않으면 켜져 있습니다. 꺼도 색인된 데이터는 지워지지 않으며, 다시 켜면 모든 모델을 재정합합니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Give every process in a deployment the same value. A process cannot clean up triggers for models it does not mount, so a mixed fleet leaves stale ones behind.",
                ko: "한 배포의 모든 프로세스에 같은 값을 주세요. 프로세스는 자신이 마운트하지 않은 모델의 trigger를 정리할 수 없으므로, 값이 섞이면 낡은 trigger가 남습니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "AKAN_SEARCH_TOKENIZER picks the fts5 tokenizer, defaulting to unicode61 remove_diacritics 2. Changing it rebuilds the index from the mirror on the next boot without re-reading any model table, so it is cheap to revisit. The rebuild takes no cross-process claim, so a fleet restarted at once repeats it in every process.",
                ko: "AKAN_SEARCH_TOKENIZER로 fts5 토크나이저를 고릅니다. 기본값은 unicode61 remove_diacritics 2입니다. 값을 바꾸면 다음 기동 때 모델 테이블을 다시 읽지 않고 미러에서 색인만 다시 만들기 때문에, 부담 없이 다시 조정할 수 있습니다. 이 재생성에는 프로세스 간 클레임이 없어서, 한 번에 재시작한 여러 프로세스가 각자 다시 만듭니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Search needs sqlite or libsql. On Postgres q.search() throws instead of quietly returning every row.",
                ko: "검색에는 sqlite 또는 libsql이 필요합니다. Postgres에서는 q.search()가 조용히 전체 row를 돌려주는 대신 에러를 냅니다.",
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="gotchas" title={l.trans({ en: "Gotchas", ko: "주의할 점" })}>
        <Docs.Title>{l.trans({ en: "Gotchas", ko: "주의할 점" })}</Docs.Title>
        <Docs.Description>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: "q.search() must sit at an AND position. Nesting it under q.any() or q.not() throws.",
                ko: "q.search()는 AND 위치에 있어야 합니다. q.any()나 q.not() 아래에 넣으면 에러가 납니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "It cannot be used in updateOneByQuery or updateManyByQuery. Those writes take no join, and applying only the other conditions would hit rows you did not mean to touch.",
                ko: "updateOneByQuery, updateManyByQuery에는 쓸 수 없습니다. 이 write들은 join을 쓸 수 없고, 나머지 조건만 적용하면 건드릴 생각이 없던 row까지 바뀝니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "schema.index() has nothing to do with search. It builds ordinary lookup indexes only.",
                ko: "schema.index()는 검색과 무관합니다. 일반 조회 index만 만듭니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Removing a document removes it from the index, including a soft delete.",
                ko: "document를 지우면 index에서도 빠집니다. soft delete도 마찬가지입니다.",
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Scroll.TitleNavigator className="fixed top-32 right-0 hidden w-[250px] flex-col gap-2 lg:flex" />
    </Scroll>
  );
}
