import { usePage } from "@apps/akan/client";
import { Code, Divider, Docs, DocsToc } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { page } from "akanjs/client";

export default page()
  .config({ transition: "fade" })
  .head(({ lang }) => {
    const title =
      lang === "ko" ? "Development: 데이터 마이그레이션 | Akan.js" : "Development: Data Migration | Akan.js";
    const description =
      lang === "ko"
        ? "코드 변경 뒤 저장된 데이터를 새 모양으로 고치는 파일. 검토할 계획, 실행 기록, 되돌리기를 갖췄습니다."
        : "A file that reshapes stored data after a code change, with a plan to review, a record and a rollback.";
    return (
      <>
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
      </>
    );
  })
  .render(() => {
    const { l } = usePage();

    const relatedLinks = [
      {
        href: "/cheatsheet/dev/script",
        title: l.trans({ en: "Scripts", ko: "스크립트" }),
        desc: l.trans({
          en: "Run a one-off job that needs no record.",
          ko: "기록이 필요 없는 일회성 작업을 실행합니다.",
        }),
      },
      {
        href: "/references/cli/application#migrate",
        title: l.trans({ en: "akan migrate Reference", ko: "akan migrate 레퍼런스" }),
        desc: l.trans({
          en: "Every action, option and exit code.",
          ko: "모든 동작, 옵션, 종료 코드를 정리했습니다.",
        }),
      },
    ];

    const actionColumns = [
      { key: "action", label: l.trans({ en: "Action", ko: "동작" }), code: true },
      { key: "desc", label: l.trans({ en: "What it does", ko: "하는 일" }) },
    ];
    const actionRows = [
      {
        action: "list",
        desc: l.trans({
          en: "The default. Each migration as `pending`, `applied` or `partial`, with the params it takes.",
          ko: "기본 동작입니다. 마이그레이션마다 `pending`, `applied`, `partial` 상태와 받는 파라미터를 보여 줍니다.",
        }),
      },
      {
        action: "plan <id>",
        desc: l.trans({
          en: "Runs `plan` and prints its summary, the first 100 items and a `planHash`.",
          ko: "`plan`을 실행해 요약, 앞쪽 항목 100개, `planHash`를 출력합니다.",
        }),
      },
      {
        action: "apply <id>",
        desc: l.trans({
          en: "Plans again, writes, then runs `verify`.",
          ko: "계획을 다시 세우고, 쓰고, 이어서 `verify`를 실행합니다.",
        }),
      },
      {
        action: "verify <id>",
        desc: l.trans({ en: "Runs `verify` alone.", ko: "`verify`만 실행합니다." }),
      },
      {
        action: "rollback <id>",
        desc: l.trans({
          en: "Undoes the apply from its change log.",
          ko: "변경 기록으로 apply를 되돌립니다.",
        }),
      },
    ];

    const paramItems = [
      {
        key: "desc",
        type: "String",
        desc: l.trans({
          en: "What the value means, for whoever fills it in.",
          ko: "값을 채울 사람에게 보여 줄 뜻입니다.",
        }),
      },
      {
        key: "enum",
        type: "String[]",
        desc: l.trans({ en: "The values a `String` may take.", ko: "`String`이 가질 수 있는 값입니다." }),
      },
      {
        key: "default",
        desc: l.trans({ en: "The value when the param is left out.", ko: "파라미터를 빼면 쓰는 값입니다." }),
      },
      {
        key: "nullable",
        type: "Boolean",
        desc: l.trans({
          en: "Left out, the value is `null` rather than an error.",
          ko: "빼면 오류 대신 `null`이 됩니다.",
        }),
      },
    ];

    const tableColumns = [
      { key: "call", label: l.trans({ en: "Call", ko: "호출" }), code: true },
      { key: "desc", label: l.trans({ en: "What it does", ko: "하는 일" }) },
    ];
    const tableRows = [
      {
        call: "find(where?, { after, limit })",
        desc: l.trans({
          en: "Rows in id order, removed ones too (as in `count` and `rewrite`) unless `{ withRemoved: false }`.",
          ko: "id 순서로 행을 읽습니다. `count`, `rewrite`처럼 삭제된 행도 포함하며, `{ withRemoved: false }`면 뺍니다.",
        }),
      },
      {
        call: "get(id) · count(where?)",
        desc: l.trans({ en: "One row, or how many match.", ko: "행 하나, 또는 맞는 행의 수입니다." }),
      },
      {
        call: "set(id, patch) · unset(id, paths)",
        desc: l.trans({
          en: "Writes or removes dot paths in one row's `_doc`.",
          ko: "행 하나의 `_doc`에서 점 경로를 쓰거나 지웁니다.",
        }),
      },
      {
        call: "rewrite(fn, { where })",
        desc: l.trans({
          en: "Walks matching rows 500 at a time (`batchSize`); `fn` returns a patch, or nothing to skip the row.",
          ko: "맞는 행을 500개씩(`batchSize`) 돕니다. `fn`이 patch를 돌려주면 쓰고, 아무것도 돌려주지 않으면 둡니다.",
        }),
      },
      {
        call: "insert(doc) · copy(id, patch)",
        desc: l.trans({
          en: "A new row; `copy` starts from another row's `_doc`.",
          ko: "새 행을 만듭니다. `copy`는 다른 행의 `_doc`에서 시작합니다.",
        }),
      },
      {
        call: "remove(id) · restore(id)",
        desc: l.trans({ en: "A soft removal and its undo.", ko: "소프트 삭제와 그 복원입니다." }),
      },
    ];

    return (
      <Scroll>
        <Scroll.Slide id="overview" title={l.trans({ en: "Data Migrations", ko: "데이터 마이그레이션" })}>
          <Docs.Title>{l.trans({ en: "Data Migrations", ko: "데이터 마이그레이션" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: "A code change that renames, moves or splits a field leaves the documents already stored in the old shape. A migration is a file in `script/migration/` that reshapes them, and the same file runs on your machine and in a deployed container.",
                ko: "필드 이름을 바꾸거나, 옮기거나, 나누는 코드 변경은 이미 저장된 문서를 옛 모양으로 남겨 둡니다. 마이그레이션은 그 문서를 새 모양으로 고치는 `script/migration/` 속 파일이고, 같은 파일이 내 컴퓨터에서도 배포된 컨테이너에서도 실행됩니다.",
              })}
            </div>
            <ul className="my-4 list-disc space-y-2 pl-5">
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>It plans before it writes.</strong> <code>plan</code> changes none of your data and
                      reports what would change, and <code>apply</code> can refuse when the data moved since that
                      report.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>쓰기 전에 계획합니다.</strong> <code>plan</code>은 데이터를 바꾸지 않고 무엇이 바뀔지
                      보고하며, <code>apply</code>는 그 보고 뒤에 데이터가 바뀌었으면 거부할 수 있습니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Every run is recorded.</strong> The app's own database keeps which migration ran, when,
                      with which params and, given <code>--actor</code>, by whom, so each environment knows what it
                      still owes.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>모든 실행이 기록됩니다.</strong> 앱의 데이터베이스가 어떤 마이그레이션을 언제, 어떤
                      파라미터로 실행했는지와 <code>--actor</code>를 주면 누가 실행했는지까지 남기므로, 환경마다 무엇이
                      남았는지 압니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>It can be rolled back.</strong> Every write keeps the value it replaced. A rollback puts
                      those back, deletes for good the rows the migration inserted or copied, and skips a row someone
                      edited since.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>되돌릴 수 있습니다.</strong> 쓸 때마다 바꾸기 전 값을 남깁니다. 되돌리기는 그 값을
                      돌려놓고 마이그레이션이 넣거나 복사한 행은 영구히 지우되, 그사이 누가 고친 행은 건너뜁니다.
                    </span>
                  ),
                })}
              </li>
            </ul>
            <Docs.LinkGrid items={relatedLinks} />
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="command" title={l.trans({ en: "Create And Run", ko: "만들고 실행하기" })}>
          <Docs.Title>{l.trans({ en: "Create And Run", ko: "만들고 실행하기" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: "From the workspace root, create a migration named for what it does:",
                ko: "워크스페이스 루트에서 하는 일을 이름으로 붙여 마이그레이션을 만듭니다:",
              })}
            </div>
          </Docs.Description>
          <Code.Snippet
            className="w-full"
            title="Terminal"
            language="bash"
            code="akan create-migration orderToppings koyo"
          />
          <Docs.Description>
            <div>
              {l.trans({
                en: (
                  <span>
                    This writes <code>apps/koyo/script/migration/202610211000_orderToppings.ts</code>. The file name is
                    the migration's id, and its UTC timestamp keeps migrations in the order they were written. Run it
                    with <code>akan migrate</code>:
                  </span>
                ),
                ko: (
                  <span>
                    그러면 <code>apps/koyo/script/migration/202610211000_orderToppings.ts</code>가 생깁니다. 파일 이름이
                    마이그레이션의 id이고, 앞의 UTC 타임스탬프가 작성한 순서를 지킵니다. 실행은{" "}
                    <code>akan migrate</code>로 합니다:
                  </span>
                ),
              })}
            </div>
          </Docs.Description>
          <Code.Snippet
            className="w-full"
            title="Terminal"
            language="bash"
            code={`akan migrate koyo
akan migrate koyo plan 202610211000_orderToppings
akan migrate koyo apply 202610211000_orderToppings`}
          />
          <Docs.Description>
            <Docs.Table columns={actionColumns} rows={actionRows} />
            <ul className="my-4 list-disc space-y-2 pl-5">
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Rerun one while you write it</strong> by rolling it back, editing, and applying it again.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>작성 중에 다시 돌리려면</strong> 되돌리고, 고치고, 다시 apply합니다.
                    </span>
                  ),
                })}
              </li>
            </ul>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="write" title={l.trans({ en: "Write One", ko: "작성하기" })}>
          <Docs.Title>{l.trans({ en: "Write One", ko: "작성하기" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: (
                  <span>
                    A migration's default export is <code>migration(title)</code> with three stages. This one moves each
                    order's <code>topping</code> into a <code>toppings</code> list:
                  </span>
                ),
                ko: (
                  <span>
                    마이그레이션은 <code>migration(title)</code>에 세 단계를 이어 default로 export합니다. 다음
                    마이그레이션은 주문마다 <code>topping</code>을 <code>toppings</code> 목록으로 옮깁니다:
                  </span>
                ),
              })}
            </div>
          </Docs.Description>
          <Code.Snippet
            className="w-full"
            title="apps/koyo/script/migration/202610211000_orderToppings.ts"
            code={`import { migration } from "akanjs/server";

const hasTopping = { topping: { $ne: null } };

export default migration("Move each order's topping into its toppings list")
  .plan(async ({ table }) => ({
    summary: { orders: await table("icecreamOrder").count(hasTopping) },
  }))
  .apply(async ({ table }) => {
    await table("icecreamOrder").rewrite(
      ({ _doc }) => ({ toppings: [_doc.topping], topping: undefined }),
      { where: hasTopping },
    );
  })
  .verify(async ({ table }) => {
    const left = await table("icecreamOrder").count(hasTopping);
    return left ? [\`\${left} orders still hold a topping\`] : [];
  });`}
          />
          <Docs.Description>
            <ul className="my-4 list-disc space-y-2 pl-5">
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        <code>plan</code> only reports.
                      </strong>{" "}
                      It returns the report a person reviews: <code>summary</code> to read, and optionally{" "}
                      <code>items</code>, the decisions <code>apply</code> receives as its second argument.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        <code>plan</code>은 보고만 합니다.
                      </strong>{" "}
                      사람이 검토할 보고를 돌려줍니다. <code>summary</code>는 읽을 요약이고, 선택인 <code>items</code>는{" "}
                      <code>apply</code>가 두 번째 인자로 받는 결정 목록입니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        <code>verify</code> returns problems,
                      </strong>{" "}
                      one string for each thing still wrong. It runs right after every apply, and an empty list means
                      the data is as intended.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        <code>verify</code>는 문제 목록을 돌려줍니다.
                      </strong>{" "}
                      아직 잘못된 것 하나에 문자열 하나입니다. apply 직후마다 실행되며, 빈 목록이면 데이터가
                      의도대로라는 뜻입니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Skip rows already fixed.</strong> The <code>where</code> above leaves out orders without a{" "}
                      <code>topping</code>, so a second run changes nothing.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>이미 고친 행은 건너뜁니다.</strong> 위의 <code>where</code>가 <code>topping</code>이 없는
                      주문을 빼므로, 두 번 실행해도 바뀌는 것이 없습니다.
                    </span>
                  ),
                })}
              </li>
            </ul>
            <Docs.SubSubTitle>{l.trans({ en: "Params", ko: "파라미터" })}</Docs.SubSubTitle>
            <div>
              {l.trans({
                en: (
                  <span>
                    A choice that belongs to whoever runs the migration, not to the code, is a param. It takes a scalar
                    such as <code>String</code> or <code>ID</code>, or an <code>enumOf</code> class, and its value is
                    checked before <code>plan</code> runs:
                  </span>
                ),
                ko: (
                  <span>
                    코드가 아니라 실행하는 사람이 정할 값은 파라미터로 받습니다. <code>String</code>, <code>ID</code>{" "}
                    같은 스칼라나 <code>enumOf</code> 클래스를 받고, 값은 <code>plan</code>이 돌기 전에 검사됩니다:
                  </span>
                ),
              })}
            </div>
          </Docs.Description>
          <Code.Snippet
            className="w-full"
            title="apps/koyo/script/migration/202610221400_orderStore.ts"
            code={`import { ID } from "akanjs/base";
import { migration } from "akanjs/server";

const noStore = { store: null };

export default migration("Give storeless orders the fallback store")
  .param("fallbackStore", ID, { desc: "The store those orders join" })
  .plan(async ({ table }) => {
    const orders = await table("icecreamOrder").find(noStore);
    const items = orders.map(({ id }) => id);
    return { summary: { orders: items.length }, items };
  })
  .apply(async ({ table, params }, { items }) => {
    const store = params.fallbackStore;
    for (const id of items) await table("icecreamOrder").set(id, { store });
  });`}
          />
          <Code.Snippet
            className="w-full"
            title="Terminal"
            language="bash"
            code={`akan migrate koyo plan 202610221400_orderStore \\
  --param fallbackStore=6716a2c0f1e2d3c4b5a69788`}
          />
          <Docs.Description>
            <div>
              {l.trans({
                en: (
                  <span>
                    The third argument of <code>.param()</code> takes:
                  </span>
                ),
                ko: (
                  <span>
                    <code>.param()</code>의 세 번째 인자는 다음을 받습니다:
                  </span>
                ),
              })}
            </div>
            <Docs.OptionTable items={paramItems} />
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="table" title={l.trans({ en: "Rows And Filters", ko: "행과 필터" })}>
          <Docs.Title>{l.trans({ en: "Rows And Filters", ko: "행과 필터" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: (
                  <span>
                    <code>table(refName)</code> reads and writes a model's rows as stored, so a field the model no
                    longer declares is still reachable. <code>refName</code> is the camelCase model name:
                  </span>
                ),
                ko: (
                  <span>
                    <code>table(refName)</code>은 모델의 행을 저장된 그대로 읽고 씁니다. 그래서 모델이 더는 선언하지
                    않는 필드에도 닿습니다. <code>refName</code>은 camelCase 모델 이름입니다:
                  </span>
                ),
              })}
            </div>
            <Docs.Table columns={tableColumns} rows={tableRows} stacked />
            <div>
              {l.trans({
                en: (
                  <span>
                    A filter maps dot paths into <code>_doc</code>, or a column such as <code>removedAt</code>, to a
                    value or to <code>$ne</code>, <code>$in</code>, <code>$nin</code>, <code>$exists</code>,{" "}
                    <code>$gt</code>, <code>$gte</code>, <code>$lt</code> or <code>$lte</code>. Every key must match.
                  </span>
                ),
                ko: (
                  <span>
                    필터는 <code>_doc</code> 안의 점 경로나 <code>removedAt</code> 같은 열을 값, 또는 <code>$ne</code>,{" "}
                    <code>$in</code>, <code>$nin</code>, <code>$exists</code>, <code>$gt</code>, <code>$gte</code>,{" "}
                    <code>$lt</code>, <code>$lte</code>에 대응시킵니다. 모든 키가 맞아야 합니다.
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
                        <code>$ne</code> leaves out missing and <code>null</code> values.
                      </strong>{" "}
                      <code>{'{ status: { $ne: "done" } }'}</code> skips rows whose <code>status</code> is absent or{" "}
                      <code>null</code>; find those with <code>{"{ status: null }"}</code>.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        <code>$ne</code>는 값이 없거나 <code>null</code>인 행을 뺍니다.
                      </strong>{" "}
                      <code>{'{ status: { $ne: "done" } }'}</code>는 <code>status</code>가 없거나 <code>null</code>인
                      행을 건너뛰므로, 그런 행은 <code>{"{ status: null }"}</code>로 찾습니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        <code>updatedAt</code> stays as it was.
                      </strong>{" "}
                      A migration reshapes data rather than editing it, so nothing sorted by <code>updatedAt</code>{" "}
                      moves.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        <code>updatedAt</code>은 그대로 둡니다.
                      </strong>{" "}
                      마이그레이션은 데이터를 수정하는 일이 아니라 모양을 바꾸는 일이라, <code>updatedAt</code> 순
                      정렬이 흔들리지 않습니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        Beside <code>table</code>, each stage gets
                      </strong>{" "}
                      <code>params</code>, <code>createId()</code> for a new row's id, <code>logger</code>,{" "}
                      <code>sql</code> for a raw read, and <code>get(srv.IcecreamOrderService)</code> for a service of
                      the booted app, with <code>srv</code> imported from <code>../../server</code>.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        각 단계는 <code>table</code> 말고도
                      </strong>{" "}
                      <code>params</code>, 새 행 id를 만드는 <code>createId()</code>, <code>logger</code>, 원시 조회용{" "}
                      <code>sql</code>, 부팅된 앱의 서비스를 꺼내는 <code>get(srv.IcecreamOrderService)</code>를
                      받습니다. <code>srv</code>는 <code>../../server</code>에서 가져옵니다.
                    </span>
                  ),
                })}
              </li>
            </ul>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="review" title={l.trans({ en: "Review, Apply, Roll Back", ko: "검토, 적용, 되돌리기" })}>
          <Docs.Title>{l.trans({ en: "Review, Apply, Roll Back", ko: "검토, 적용, 되돌리기" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: (
                  <span>
                    On data others rely on, put a review between plan and apply. <code>plan</code> prints a{" "}
                    <code>planHash</code> with its report; hand it to <code>apply</code> with <code>--expect</code>, and
                    the apply stops with <code>planChanged</code> if the plan it computes again no longer matches.
                  </span>
                ),
                ko: (
                  <span>
                    다른 사람이 쓰는 데이터라면 plan과 apply 사이에 검토를 둡니다. <code>plan</code>은 보고와 함께{" "}
                    <code>planHash</code>를 출력합니다. 이 값을 <code>--expect</code>로 <code>apply</code>에 넘기면,
                    다시 계산한 계획이 달라졌을 때 apply가 <code>planChanged</code>로 멈춥니다.
                  </span>
                ),
              })}
            </div>
          </Docs.Description>
          <Code.Snippet
            className="w-full"
            title="Terminal"
            language="bash"
            code={`akan migrate koyo plan 202610211000_orderToppings
akan migrate koyo apply 202610211000_orderToppings --expect <planHash>
akan migrate koyo rollback 202610211000_orderToppings`}
          />
          <Docs.Description>
            <ul className="my-4 list-disc space-y-2 pl-5">
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>The hash covers the params too,</strong> so apply with the params you planned with.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>해시에는 파라미터도 들어갑니다.</strong> 그러니 계획할 때와 같은 파라미터로 apply합니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        A problem from <code>verify</code> fails the command
                      </strong>{" "}
                      with exit code 3 but leaves the migration applied. Roll it back and fix the file, or write a new
                      migration once another environment has applied this one.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        <code>verify</code>가 문제를 찾으면 명령은 종료 코드 3으로 실패하지만
                      </strong>{" "}
                      마이그레이션은 적용된 채로 남습니다. 되돌려서 파일을 고치거나, 다른 환경에 이미 적용됐다면 새
                      마이그레이션을 씁니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>A rollback skips rows edited since.</strong> A row whose value changed after the migration
                      wrote it is left as it is and listed in the result, so a later edit is never overwritten.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>되돌리기는 그사이 고친 행을 건너뜁니다.</strong> 마이그레이션이 쓴 뒤 값이 바뀐 행은
                      그대로 두고 결과에 적으므로, 나중의 수정을 덮어쓰지 않습니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        <code>.rollback(fn)</code> replaces the default
                      </strong>{" "}
                      when undoing needs a judgment, such as keeping a copied row others now point at. It walks{" "}
                      <code>changes</code> with <code>for await</code>, newest first, and calls{" "}
                      <code>changes.revert(change)</code> or <code>changes.skip(change, reason)</code>.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        <code>.rollback(fn)</code>은 기본 되돌리기를 바꿉니다.
                      </strong>{" "}
                      다른 행이 이미 가리키는 사본을 남겨 두는 것처럼 판단이 필요할 때 씁니다. <code>for await</code>로{" "}
                      <code>changes</code>를 최신 것부터 돌며 <code>changes.revert(change)</code>나{" "}
                      <code>changes.skip(change, reason)</code>을 부릅니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>One run at a time.</strong> While one runs, a second from another terminal or replica is
                      refused.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>한 번에 하나만 실행됩니다.</strong> 실행 중에는 다른 터미널이나 레플리카의 실행이
                      거부됩니다.
                    </span>
                  ),
                })}
              </li>
            </ul>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="large" title={l.trans({ en: "Large Tables", ko: "큰 테이블" })}>
          <Docs.Title>{l.trans({ en: "Large Tables", ko: "큰 테이블" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: "An apply runs in one transaction, so a failure leaves nothing half done. On SQLite that transaction holds the only write lock, and once it passes about five seconds the live server's writes start to fail. For a table that takes longer, commit as you go:",
                ko: "apply는 트랜잭션 하나로 실행되므로, 실패해도 반쯤 된 상태가 남지 않습니다. SQLite에서는 그 트랜잭션이 하나뿐인 쓰기 잠금을 쥐고 있어서, 5초쯤 넘어가면 서비스 중인 서버의 쓰기가 실패하기 시작합니다. 그보다 오래 걸리는 테이블은 진행하면서 커밋합니다:",
              })}
            </div>
          </Docs.Description>
          <Code.Snippet
            className="w-full"
            title="apps/koyo/script/migration/202610211000_orderToppings.ts"
            code={`import { migration } from "akanjs/server";

const hasTopping = { topping: { $ne: null } };

export default migration("Move each order's topping into its toppings list")
  .config({ transaction: false })
  .apply(async ({ table }) => {
    await table("icecreamOrder").rewrite(
      ({ _doc }) => ({ toppings: [_doc.topping], topping: undefined }),
      { where: hasTopping },
    );
  });`}
          />
          <Docs.Description>
            <ul className="my-4 list-disc space-y-2 pl-5">
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        Each <code>rewrite</code> batch commits on its own,
                      </strong>{" "}
                      with the point it reached. A failed apply leaves the migration <code>partial</code>: apply again
                      with the same params to resume there, planning it again first if you pass <code>--expect</code>,
                      or roll back what it wrote.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        <code>rewrite</code>의 묶음마다 따로 커밋하고
                      </strong>{" "}
                      어디까지 했는지 남깁니다. 실패한 apply는 마이그레이션을 <code>partial</code>로 남깁니다. 같은
                      파라미터로 다시 apply하면 그 지점부터 이어 가고(<code>--expect</code>를 쓴다면 먼저 다시
                      plan합니다), 되돌리면 쓴 만큼 되돌립니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Write it so a second run changes nothing.</strong> A resumed apply runs <code>apply</code>{" "}
                      from the top again.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>두 번 돌려도 바뀌는 것이 없게 씁니다.</strong> 이어 가는 apply도 <code>apply</code>를
                      처음부터 다시 실행합니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>The change log takes disk.</strong> Every changed row keeps its old and new values, about
                      160 bytes plus the values themselves.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>변경 기록은 디스크를 씁니다.</strong> 바뀐 행마다 이전 값과 새 값을 남기며, 값 자체에 더해
                      행마다 160바이트쯤 듭니다.
                    </span>
                  ),
                })}
              </li>
            </ul>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="container" title={l.trans({ en: "In A Container", ko: "컨테이너에서" })}>
          <Docs.Title>{l.trans({ en: "In A Container", ko: "컨테이너에서" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: (
                  <span>
                    The built image carries every migration, so nothing is copied into a container. There,{" "}
                    <code>bun main.js ops migrate</code> takes the same actions and options as <code>akan migrate</code>
                    , without the app name:
                  </span>
                ),
                ko: (
                  <span>
                    빌드된 이미지에 모든 마이그레이션이 들어 있으므로 컨테이너에 따로 복사할 것이 없습니다. 컨테이너
                    안에서는 <code>bun main.js ops migrate</code>가 앱 이름 없이 <code>akan migrate</code>와 같은 동작과
                    옵션을 받습니다:
                  </span>
                ),
              })}
            </div>
            <Docs.SubSubTitle>Docker</Docs.SubSubTitle>
          </Docs.Description>
          <Code.Snippet
            className="w-full"
            title="Terminal"
            language="bash"
            code="docker exec myapp bun main.js ops migrate list"
          />
          <Docs.Description>
            <Docs.SubSubTitle>Kubernetes</Docs.SubSubTitle>
          </Docs.Description>
          <Code.Snippet
            className="w-full"
            title="Terminal"
            language="bash"
            code={`kubectl exec -n myapp-main deploy/app-deployment -c app -- \\
  bun main.js ops migrate plan 202610211000_orderToppings --actor jane --json`}
          />
          <Docs.Description>
            <ul className="my-4 list-disc space-y-2 pl-5">
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        <code>--json</code> prints one JSON line last,
                      </strong>{" "}
                      with <code>ok</code> and, on failure, a <code>code</code> naming why. The exit code is 0 on
                      success, 2 for a mistake in the command, 3 when verify finds problems and 1 otherwise,{" "}
                      <code>alreadyApplied</code> included.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        <code>--json</code>은 마지막 줄에 JSON 한 줄을 출력합니다.
                      </strong>{" "}
                      <code>ok</code>와, 실패하면 이유를 담은 <code>code</code>가 들어 있습니다. 종료 코드는 성공이면 0,
                      명령을 잘못 쓰면 2, verify가 문제를 찾으면 3, <code>alreadyApplied</code>를 포함한 그 밖의 경우는
                      1입니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        <code>--actor</code> names who ran it
                      </strong>{" "}
                      in the run's record.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        <code>--actor</code>는 실행한 사람을
                      </strong>{" "}
                      실행 기록에 남깁니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>It boots a second server beside the one serving traffic,</strong> with no port and no
                      schedules, and stops when the action ends.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>서비스 중인 서버 옆에 두 번째 서버를 띄웁니다.</strong> 포트와 스케줄 없이 떠서 동작이
                      끝나면 멈춥니다.
                    </span>
                  ),
                })}
              </li>
            </ul>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="rules" title={l.trans({ en: "Writing Rules", ko: "작성 규칙" })}>
          <Docs.Title>{l.trans({ en: "Writing Rules", ko: "작성 규칙" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: "A migration changes production data that a rollback may have to put back. Four habits keep that possible:",
                ko: "마이그레이션은 되돌려야 할 수도 있는 운영 데이터를 바꿉니다. 네 가지 습관이 그 길을 지킵니다:",
              })}
            </div>
            <ol className="my-4 list-decimal space-y-2 pl-5">
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>New code meets old data first.</strong> A deploy serves traffic before anyone applies the
                      migration, so the new code must read both shapes until it is applied.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>새 코드가 옛 데이터를 먼저 만납니다.</strong> 배포된 코드는 누군가 마이그레이션을 적용하기
                      전부터 요청을 받으므로, 적용될 때까지 두 모양을 모두 읽을 수 있어야 합니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        Write through <code>table()</code>, not services or <code>sql</code>.
                      </strong>{" "}
                      A service write runs the model's hooks, which may notify users, and neither reaches the change
                      log, so a rollback cannot undo it.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        쓰기는 서비스나 <code>sql</code>이 아니라 <code>table()</code>로 합니다.
                      </strong>{" "}
                      서비스로 쓰면 사용자 알림 같은 모델 훅이 돌고, 둘 다 변경 기록에 남지 않아 되돌릴 수 없습니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Call nothing outside the database.</strong> A rollback can put rows back, but it cannot
                      unsend an email or refund a payment.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>데이터베이스 밖은 호출하지 않습니다.</strong> 되돌리기는 행을 돌려놓을 수는 있어도, 보낸
                      메일이나 결제는 되돌리지 못합니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        Throw a plain <code>Error</code>
                      </strong>{" "}
                      with a message an operator can act on. The run's record keeps it.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        예외는 평범한 <code>Error</code>로 던지고
                      </strong>{" "}
                      운영자가 보고 조치할 수 있는 메시지를 씁니다. 실행 기록에 그대로 남습니다.
                    </span>
                  ),
                })}
              </li>
            </ol>
            <Docs.Alert type="info">
              {l.trans({
                en: (
                  <span>
                    <strong>Delete a migration once every environment has applied it.</strong> Each database keeps its
                    record, and the change log can still roll it back without the file, but only with the default undo,
                    so keep a file whose <code>.rollback(fn)</code> you may still need.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>모든 환경에 적용된 마이그레이션은 지워도 됩니다.</strong> 데이터베이스마다 기록이 남고
                    파일이 없어도 변경 기록으로 되돌릴 수 있지만 기본 되돌리기로만 되돌리므로,{" "}
                    <code>.rollback(fn)</code>이 아직 필요할 수 있는 파일은 남겨 둡니다.
                  </span>
                ),
              })}
            </Docs.Alert>
          </Docs.Description>
        </Scroll.Slide>
        <DocsToc />
      </Scroll>
    );
  });
