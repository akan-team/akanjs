import { usePage } from "@apps/akan/client";
import { Code, Docs } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();
  return (
    <Scroll>
      <Scroll.Slide id="document-overview" title="model.document.ts">
        <Docs.Title>model.document.ts</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "A document file defines the database behavior of a module. The constant file describes the data shape, while the document file explains how to query, mutate, load, index, and operate on stored documents.",
              ko: "document 파일은 module의 database 동작을 정의합니다. constant 파일이 data shape을 설명한다면, document 파일은 저장된 document를 어떻게 query, mutate, load, index, operate할지 설명합니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "A normal document file usually contains search conditions, document-level behavior, and database model helpers used by services.",
              ko: "일반적인 document 파일에는 검색 조건, document 단위 동작, service가 사용하는 database model helper가 들어갑니다.",
            })}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide
        id="standard-document-shape"
        title={l.trans({ en: "Standard Document Shape", ko: "표준 Document 구조" })}
      >
        <Docs.Title>{l.trans({ en: "Standard Document Shape", ko: "표준 Document 구조" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Use this shape for normal collection-backed models. Business documents usually define query rules, one-document behavior, and model-level helpers together.",
              ko: "collection에 저장되는 일반 model은 이 구조를 사용합니다. 비즈니스 document는 보통 query rule, 단일 document 동작, model-level helper를 함께 정의합니다.",
            })}
          </div>
        </Docs.Description>
        <div className="grid gap-3 md:grid-cols-3">
          {[
            {
              title: "Filter",
              desc: l.trans({
                en: "Reusable list, lookup, and sort conditions.",
                ko: "재사용 list, lookup, sort 조건입니다.",
              }),
            },
            {
              title: "Document",
              desc: l.trans({
                en: "Behavior of one loaded document.",
                ko: "load된 document 하나의 동작입니다.",
              }),
            },
            {
              title: "Model",
              desc: l.trans({
                en: "Model-level helpers used by services.",
                ko: "service가 사용하는 model-level helper입니다.",
              }),
            },
          ].map(({ title, desc }) => (
            <div key={title} className="rounded-xl border border-base-300 bg-base-100 p-4">
              <div className="font-bold text-base-content">{title}</div>
              <div className="mt-2 text-base-content/70">{desc}</div>
            </div>
          ))}
        </div>
        <Code.Snippet
          title="ticket.document.ts"
          code={`import { ID } from "akanjs/base";
import { by, from, into } from "akanjs/document";

import * as cnst from "../cnst";

export class TicketFilter extends from(cnst.Ticket, (filter) => ({
  query: {
    inProject: filter()
      .arg("project", ID)
      .query((project) => ({ project })),
  },
  sort: {},
})) {}

export class Ticket extends by(cnst.Ticket) {
  open() {
    this.status = "opened";
    return this;
  }
}

export class TicketModel extends into(Ticket, TicketFilter, cnst.ticket, () => ({})) {}`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide
        id="query-sort-methods"
        title={l.trans({ en: "Query, Sort, And Generated Methods", ko: "Query, Sort, 자동 생성 함수" })}
      >
        <Docs.Title>
          {l.trans({ en: "Query, Sort, And Generated Methods", ko: "Query, Sort, 자동 생성 함수" })}
        </Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Define frequently used list and lookup conditions once, then use the generated methods in services or signals. For example, a query named inProject becomes methods like listInProject, countInProject, and existsInProject.",
              ko: "자주 쓰는 list와 lookup 조건을 한 번 정의한 뒤 service나 signal에서 자동 생성된 함수를 사용합니다. 예를 들어 inProject라는 query는 listInProject, countInProject, existsInProject 같은 함수로 이어집니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "The framework already provides all-document and latest/oldest ordering behavior, so only add business-specific search and sort rules.",
              ko: "전체 document 조회와 latest/oldest 정렬은 framework가 이미 제공하므로, 비즈니스에 필요한 검색과 정렬 규칙만 추가합니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title="story.document.ts"
          code={`export class TicketFilter extends from(cnst.Ticket, (filter) => ({
  query: {
    inProject: filter()
      .arg("project", ID)
      .query((project) => ({ project })),
  },
  sort: {
    highPriority: { priority: -1 },
  },
})) {}`}
        />
        <div className="grid gap-3 xl:grid-cols-3">
          {[
            {
              title: "arg()",
              desc: l.trans({
                en: "Required input for the query. Required args must come before optional args.",
                ko: "query에 반드시 필요한 입력입니다. 필수 arg는 optional arg보다 앞에 둡니다.",
              }),
            },
            {
              title: "opt()",
              desc: l.trans({
                en: "Optional input. Build the query conditionally when the value exists.",
                ko: "선택 입력입니다. 값이 있을 때만 조건부로 query에 반영합니다.",
              }),
            },
            {
              title: "q helper",
              desc: l.trans({
                en: "Use helpers like all, any, not, oneOf, notOneOf, between, gte, lte, contains, exists, empty, and search.",
                ko: "all, any, not, oneOf, notOneOf, between, gte, lte, contains, exists, empty, search 같은 helper를 사용합니다.",
              }),
            },
          ].map(({ title, desc }) => (
            <div key={title} className="rounded-xl border border-base-300 bg-base-100 p-4">
              <div className="font-bold text-base-content">{title}</div>
              <div className="mt-2 text-base-content/70">{desc}</div>
            </div>
          ))}
        </div>
        <div className="grid gap-3 xl:grid-cols-2">
          <div className="rounded-xl border border-base-300 bg-base-100 p-4">
            <div className="font-bold text-base-content">CRUD helpers</div>
            <div className="mt-2 text-base-content/70">
              get, load, loadMany, create, update, remove, searchDocs, searchCount
            </div>
          </div>
          <div className="rounded-xl border border-base-300 bg-base-100 p-4">
            <div className="font-bold text-base-content">Query helpers</div>
            <div className="mt-2 text-base-content/70">
              list, listIds, find, findId, pick, pickId, exists, count, insight, query
            </div>
          </div>
        </div>
        <Code.Snippet
          title="ticket.service.ts | ticket.document.ts"
          code={`const ticket = await this.getTicket(ticketId);
const ticket = await this.loadTicket(ticketId);
const tickets = await this.loadTicketMany(ticketIds);

const ticket = await this.createTicket(data);
const ticket = await this.updateTicket(ticketId, updateData);
await this.removeTicket(ticketId);`}
        />
        <Code.Snippet
          title="ticket.service.ts | ticket.document.ts"
          code={`const tickets = await this.listInProject(projectId, { sort: "highPriority" });
const ticket = await this.findInProject(projectId);
const ticket = await this.pickInProject(projectId);

const count = await this.countInProject(projectId);
const exists = await this.existsInProject(projectId);
const ticketInsight = await this.insightInProject(projectId);`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="text-search-query" title={l.trans({ en: "Text Search Query", ko: "텍스트 검색 query" })}>
        <Docs.Title>{l.trans({ en: "Text Search Query", ko: "텍스트 검색 query" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "q.search() matches against the full-text index built from fields that declared a text role in constant.ts. It is an ordinary query node, so it composes with normal conditions and produces the same generated methods: listBySearch, countBySearch, queryBySearch, insightBySearch.",
              ko: "q.search()는 constant.ts에서 text 역할을 선언한 field로 만들어진 전문 검색 index를 조회합니다. 평범한 query node이므로 일반 조건과 함께 조합할 수 있고, listBySearch, countBySearch, queryBySearch, insightBySearch가 똑같이 생성됩니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "A filter alone is enough to search from a service. Adding a slice publishes it to clients, so only do that when the model is safe to enumerate.",
              ko: "service에서 검색하는 데는 filter만으로 충분합니다. slice를 달면 client에 공개되므로, 목록을 훑어도 괜찮은 모델에만 추가하세요.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title="ticket.document.ts"
          code={`export class TicketFilter extends from(cnst.Ticket, (filter) => ({
  query: {
    bySearch: filter()
      .arg("text", String)
      .opt("statuses", [cnst.TicketStatus])
      .query((text, statuses, q) =>
        q.all(q.search(text, { prefix: true }), statuses?.length ? { status: q.oneOf(statuses) } : {}),
      ),
  },
  sort: {},
})) {}`}
        />
        <div className="grid gap-3 xl:grid-cols-3">
          {[
            {
              title: "prefix",
              desc: l.trans({
                en: "Treats the last word as a prefix, which is what an as-you-type box needs.",
                ko: "마지막 단어를 접두사로 취급합니다. 입력하면서 검색하는 입력창에 필요한 옵션입니다.",
              }),
            },
            {
              title: "columns",
              desc: l.trans({
                en: 'Limits the match to some of title, desc, tag, and filter. Example: { columns: ["title"] }.',
                ko: 'title, desc, tag, filter 중 일부로 검색 범위를 좁힙니다. 예: { columns: ["title"] }.',
              }),
            },
            {
              title: "weights",
              desc: l.trans({
                en: "Overrides the bm25 weights. Four finite numbers, in the order title, desc, tag, filter.",
                ko: "bm25 가중치를 바꿉니다. title, desc, tag, filter 순서의 유한한 숫자 4개입니다.",
              }),
            },
          ].map(({ title, desc }) => (
            <div key={title} className="rounded-xl border border-base-300 bg-base-100 p-4">
              <div className="font-bold text-base-content">{title}</div>
              <div className="mt-2 text-base-content/70">{desc}</div>
            </div>
          ))}
        </div>
        <Code.Snippet
          title="ticket.service.ts"
          code={`const tickets = await this.listBySearch(text, statuses, { sort: "relevance" });
const count = await this.countBySearch(text, statuses);`}
        />
        <Docs.Description>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: "q.search() must sit at an AND position. Nesting it under q.any() or q.not() throws, because it compiles to a join rather than a where condition.",
                ko: "q.search()는 AND 위치에 있어야 합니다. where 조건이 아니라 join으로 컴파일되기 때문에 q.any()나 q.not() 아래에 넣으면 에러가 납니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "It is rejected in updateOneByQuery and updateManyByQuery. A query-level write takes no join, so honouring only the remaining conditions would widen the write.",
                ko: "updateOneByQuery, updateManyByQuery에서는 거부됩니다. query 단위 write는 join을 쓸 수 없어서, 남은 조건만 적용하면 write 범위가 넓어져 버립니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Blank input matches nothing, not everything. That keeps an empty search box from turning into a full listing.",
                ko: "빈 입력은 전체가 아니라 아무것도 매치하지 않습니다. 빈 검색창이 전체 목록으로 바뀌는 일을 막아줍니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: 'Sort by "relevance" for best-match-first. Any other sort key wins over the score.',
                ko: '가장 관련있는 순으로 보려면 "relevance"로 정렬하세요. 다른 sort key를 주면 점수보다 우선합니다.',
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide
        id="document-by"
        title={l.trans({ en: "Document Instance Behavior", ko: "Document instance 동작" })}
      >
        <Docs.Title>{l.trans({ en: "Document Instance Behavior", ko: "Document instance 동작" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Put small state transitions and document-level checks on the loaded document class. Methods usually mutate this, use this.set(...) when several fields change together, and return this for chaining.",
              ko: "작은 state transition과 document-level check는 load된 document class에 둡니다. method는 보통 this를 변경하고, 여러 field를 함께 바꿀 때 this.set(...)을 사용하며, chaining을 위해 this를 반환합니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "Because each method returns the same document, service code can chain several document methods and save the final result once.",
              ko: "각 method가 같은 document를 반환하므로, service 코드에서 여러 document method를 체이닝한 뒤 마지막에 한 번만 save할 수 있습니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title="ticket.document.ts"
          code={`export class Ticket extends by(cnst.Ticket) {
  open() {
    this.status = "opened";
    return this;
  }
}`}
        />
        <Code.Snippet
          title="ticket.service.ts"
          code={`const ticket = await this.getTicket(ticketId);
await ticket.open().assign(userId).save();`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="model-into" title={l.trans({ en: "Model-Level Helpers", ko: "Model-level helper" })}>
        <Docs.Title>{l.trans({ en: "Model-Level Helpers", ko: "Model-level helper" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Put collection-level operations on the model class. Service files usually call these helpers when they need direct database updates, batch operations, counters, or document generation.",
              ko: "collection-level operation은 model class에 둡니다. service 파일은 직접 database update, batch operation, counter, document generation이 필요할 때 이런 helper를 호출합니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title="story.document.ts"
          code={`export class StoryModel extends into(Story, StoryFilter, cnst.story, () => ({})) {
  async publish(storyId: string) {
    return await this.Story.pickAndWrite(storyId, { status: "approved" });
  }
}`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide
        id="generated-extension"
        title={l.trans({ en: "Extending Generated Documents", ko: "Generated document 확장" })}
      >
        <Docs.Title>{l.trans({ en: "Extending Generated Documents", ko: "Generated document 확장" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Generated or app-template domains can provide existing filter, document, and model behavior. Keep those generated refs in the class declarations, then add only the local app-specific methods you need.",
              ko: "generated 또는 app-template domain은 기존 filter, document, model 동작을 제공할 수 있습니다. class 선언에는 generated ref를 유지하고, 현재 app에 필요한 method만 추가합니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title="user.document.ts"
          code={`export class UserFilter extends from(cnst.User, (filter) => ({ query: {}, sort: {} }), ...user.filters) {}

export class User extends by(cnst.User, ...user.docs) {
  hasAccessToken() {
    return this.githubInfo?.accessToken !== undefined;
  }
}

export class UserModel extends into(User, UserFilter, cnst.user, () => ({}), ...user.models) {}`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide
        id="loaders-lookups"
        title={l.trans({ en: "Loaders And Custom Lookups", ko: "Loader와 custom lookup" })}
      >
        <Docs.Title>{l.trans({ en: "Loaders And Custom Lookups", ko: "Loader와 custom lookup" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Declare loaders for lookup shapes that are used often and should stay consistent. Use a single-field loader for lookups like product by seller, and a multi-field loader for stable combinations like order by shop and order number.",
              ko: "자주 쓰이고 일관되게 유지되어야 하는 lookup shape은 loader로 선언합니다. seller별 product처럼 단일 field lookup에는 single-field loader를, shop과 order number 조합처럼 안정적인 조합에는 multi-field loader를 사용합니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title="product.document.ts"
          code={`export class ProductModel extends into(Product, ProductFilter, cnst.product, ({ byField }) => ({
  productSellerLoader: byField("seller"),
})) {
  async getSellerProducts(sellerId: string) {
    return await this.productSellerLoader.load(sellerId);
  }
  async getManySellerProducts(sellerIds: string[]) {
    return await this.productSellerLoader.loadMany(sellerIds);
  }
}`}
        />
        <Code.Snippet
          title="order.document.ts"
          code={`export class OrderModel extends into(Order, OrderFilter, cnst.order, ({ byQuery }) => ({
  orderLoader: byQuery(["shop", "orderNumber"] as const),
})) {
  async getShopOrder(orderQuery: { shop: string; orderNumber: string }) {
    return await this.orderLoader.load(orderQuery);
  }
}`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="schema-hooks" title={l.trans({ en: "Schema Hooks And Indexes", ko: "Schema hook과 index" })}>
        <Docs.Title>{l.trans({ en: "Schema Hooks And Indexes", ko: "Schema hook과 index" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Use _onSchema when the storage schema needs indexes or lightweight save hooks. Keep heavy business workflows in service or model methods, and keep schema hooks focused on persistence concerns.",
              ko: "storage schema에 index 또는 가벼운 save hook이 필요할 때 _onSchema를 사용합니다. 무거운 비즈니스 workflow는 service나 model method에 두고, schema hook은 persistence concern에 집중시킵니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: 'schema.index() only builds ordinary lookup indexes. It has nothing to do with text search — declare a text role on the field in constant.ts for that. The value "text" is accepted here as an alias for a normal index, which is a leftover name and not a search feature.',
              ko: 'schema.index()는 일반 조회 index만 만듭니다. 텍스트 검색과는 무관하며, 검색은 constant.ts에서 field에 text 역할을 선언해야 합니다. 여기서 값 "text"는 일반 index의 별칭으로 받아들여질 뿐, 검색 기능이 아닙니다.',
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title="story.document.ts"
          code={`export class StoryModel extends into(Story, StoryFilter, cnst.story, () => ({})) {
  static override _onSchema(schema: SchemaOf) {
    schema.index({ author: 1, createdAt: -1 });
  }
}`}
        />
        <Code.Snippet
          title="user.document.ts"
          code={`export class UserModel extends into(User, UserFilter, cnst.user, () => ({})) {
  static override _onSchema(schema: SchemaOf) {
    schema.pre("save", function (next) {
      this.updatedAt = new Date();
      next();
    });
  }
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
                en: "Use Filter, Document, and Model class names that match the constant model name.",
                ko: "Filter, Document, Model class 이름은 constant model 이름과 맞춥니다.",
              }),
              l.trans({
                en: "Put reusable list and lookup conditions in the filter section instead of repeating them in service methods.",
                ko: "반복되는 list와 lookup 조건은 service method마다 쓰지 말고 filter section에 둡니다.",
              }),
              l.trans({
                en: "Put single-document state transitions on the document class, and collection-level operations on the model class.",
                ko: "단일 document의 state transition은 document class에, collection-level operation은 model class에 둡니다.",
              }),
              l.trans({
                en: "Use generated extension spreads when a template domain provides filters, docs, or models.",
                ko: "template domain이 filters, docs, models를 제공하면 generated extension spread를 사용합니다.",
              }),
              l.trans({
                en: "Use loaders for common stable lookups, and schema hooks only for persistence-level indexes or small save hooks.",
                ko: "자주 쓰는 안정적인 lookup에는 loader를 사용하고, schema hook은 persistence-level index나 작은 save hook에만 사용합니다.",
              }),
              l.trans({
                en: "Keep scalar document files small; a simple document class is usually enough.",
                ko: "scalar document 파일은 작게 유지합니다. 보통 단순한 document class면 충분합니다.",
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
