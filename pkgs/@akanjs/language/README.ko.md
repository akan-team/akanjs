# @akanjs/language

[English](https://github.com/akan-team/akanjs/blob/main/pkgs/@akanjs/language/README.md) | [문서](https://akanjs.com/docs) | [npm](https://www.npmjs.com/package/@akanjs/language) | [런타임](https://www.npmjs.com/package/akanjs)

Akan.js 에디터 지원 밑에 있는, 에디터와 무관한 색인입니다.

Akan.js는 원본 키 하나에서 여러 이름을 만듭니다. `memo`의 slice 키 `inPublic`은 `fetch.initMemoInPublic`과
`st.use.memoListInPublic`이 되고, 필드 `name`은 `st.do.setNameOnMemo`, Filter 쿼리 키 `byName`은 `listByName`이
됩니다. TypeScript는 이런 이름의 선언을 남기지 않습니다. `@akanjs/language`는 워크스페이스의 constant, document,
service, signal, store 파일을 문법만으로 읽고, 합성된 이름마다 원본 키를 찾아 줍니다.

에디터 연동용 패키지이며, 앱 코드에서는 import하지 않습니다.

## 설치

```bash
bun add -d @akanjs/language typescript
```

## 사용 예시

```ts
import { AkanIndex } from "@akanjs/language";
import ts from "typescript";

const index = new AkanIndex({ ts, root: "/path/to/workspace" });
index.setFile(fileName, text);

index.definitionAt(fileName, text, offset);
index.hoverAt(fileName, text, offset);
index.referencesAt(fileName, offset, readText);
index.sourceKeysOf(fileName);
index.renameAt(fileName, offset, "inFeed", readText);
```

호스트가 쓰는 `typescript`를 넘기세요. 이 패키지는 TypeScript를 번들하지 않으며, 사본이 둘이면 `SyntaxKind` 숫자가
어긋납니다. `apps/**`와 `libs/**`의 TypeScript 파일을 모두 `setFile`로 넣고, 파일이 바뀌면 `setFile`을 다시 부르거나
`removeFile`을 부르세요. 이름은 자기 앱과 모든 lib 안에서만 풀리고, 다른 앱으로는 가지 않습니다. `renameAt`은 slice
키나 쿼리 키를, 그 키에서 만들어진 이름 전부와 함께 바꾸는 편집을 돌려줍니다.

ES module과 CommonJS로 배포하며, 런타임 의존성은 없습니다.
