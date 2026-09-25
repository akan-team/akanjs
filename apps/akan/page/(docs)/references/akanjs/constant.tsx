import { usePage } from "@apps/akan/client";
import { Code, Docs } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();
  const symbols = [
    {
      name: "ConstantRegistry",
      desc: l.trans({
        en: "Runtime registry for scalar/database constant metadata. Framework internals use it to resolve ref names, model classes, scalar metadata, enum metadata, and generated document model contracts.",
        ko: "scalar/database constant metadata를 위한 runtime registry입니다. framework internal은 ref name, model class, scalar metadata, enum metadata, generated document model contract를 resolve할 때 사용합니다.",
      }),
      code: `import { ConstantRegistry } from "akanjs/constant";

const refName = ConstantRegistry.getRefName(User);
const modelName = ConstantRegistry.getModelName(User);`,
    },
    {
      name: "getDefault",
      desc: l.trans({
        en: "Builds a default object from a field object, respecting primitive defaults, nullable fields, arrays, maps, and field-level default callbacks. Model classes expose the same result through `Model.getDefault()`.",
        ko: "field object에서 default object를 만듭니다. primitive default, nullable field, array, map, field-level default callback을 반영하며 model class는 같은 결과를 `Model.getDefault()`로 제공합니다.",
      }),
      code: `import { FIELD_META } from "akanjs/base";
import { getDefault } from "akanjs/constant";

const defaults = User.getDefault();
const schemaDefaults = getDefault(User[FIELD_META]);`,
    },
    {
      name: "crystalize / purify",
      desc: l.trans({
        en: "`crystalize` converts raw values into model-friendly values such as dayjs and nested constants. `purify` converts class instances back into plain serializable objects for API and persistence boundaries.",
        ko: "`crystalize`는 raw value를 dayjs나 nested constant 같은 model-friendly value로 변환합니다. `purify`는 API와 persistence boundary를 위해 class instance를 plain serializable object로 되돌립니다.",
      }),
      code: `import { crystalize, purify } from "akanjs/constant";

const model = crystalize(User, rawUser);
const plain = purify(User, model);`,
    },
    {
      name: "serialize / deserialize",
      desc: l.trans({
        en: "Serialization helpers for document and transport boundaries. They convert constant model values, dates, enums, maps, arrays, and nested models between runtime values and persisted payloads.",
        ko: "document와 transport boundary를 위한 serialization helper입니다. constant model value, date, enum, map, array, nested model을 runtime value와 persisted payload 사이에서 변환합니다.",
      }),
      code: `import { deserialize, serialize } from "akanjs/constant";

const payload = serialize(User, user);
const restored = deserialize(User, payload);`,
    },
    {
      name: "DocumentModel / DefaultOf / QueryOf",
      desc: l.trans({
        en: "Public type helpers used by documents, stores, and tests. `DocumentModel` maps relations to ids, `DefaultOf` describes default state, and `QueryOf` is used for query-shaped inputs.",
        ko: "document, store, test에서 사용하는 public type helper입니다. `DocumentModel`은 relation을 id로 매핑하고, `DefaultOf`는 default state를 설명하며, `QueryOf`는 query-shaped input에 사용합니다.",
      }),
      code: `import type { DefaultOf, DocumentModel, QueryOf } from "akanjs/constant";

type UserDoc = DocumentModel<User>;
type UserDefault = DefaultOf<User>;
type UserQuery = QueryOf<UserDoc>;`,
    },
  ];

  return (
    <Scroll>
      <Scroll.Slide id="akanjs-constant" title="akanjs/constant">
        <Docs.Title>akanjs/constant</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "`akanjs/constant` defines Akan's schema layer. Import it when declaring scalar/module constants, deriving document/default/query types, inspecting model metadata, or converting constant instances across persistence boundaries.",
              ko: "`akanjs/constant`는 Akan의 schema layer를 정의합니다. scalar/module constant 선언, document/default/query type 도출, model metadata inspection, persistence boundary 변환에 사용합니다.",
            })}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />
      {symbols.map((symbol) => (
        <Scroll.Slide key={symbol.name} id={symbol.name} title={symbol.name}>
          <Docs.Title>{symbol.name}</Docs.Title>
          <Docs.Description>
            <div>{symbol.desc}</div>
          </Docs.Description>
          <Code.Snippet title={l.trans({ en: "Usage", ko: "사용 예시" })} language="typescript" code={symbol.code} />
        </Scroll.Slide>
      ))}
      <Scroll.TitleNavigator className="fixed top-32 right-0 hidden w-[250px] flex-col gap-2 lg:flex" />
    </Scroll>
  );
}
