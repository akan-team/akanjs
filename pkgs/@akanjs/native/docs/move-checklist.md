# akanjs로 옮기기 전 확인 목록

이 패키지를 akanjs 레포(`pkgs/@akanjs/native`)로 옮기기 전과, 옮긴 뒤 크게 바꿀 때마다 확인한다. akanjs의 규칙으로 빌드하고 테스트해도 통과해야 하기 때문이다.

## 한 번에 돌리기

```sh
bun scripts/move-check.ts --typescript <akanjs>/node_modules/typescript
```

돌리는 것:

| 확인 | 왜 |
|---|---|
| `bun run typecheck` (TypeScript 7) | 이 레포의 기준 |
| `bun test --isolate` | `akan test`가 `--isolate`로 돈다. 테스트 파일끼리 전역 상태(env, 모듈 캐시, 임시 폴더)를 나누면 여기서 드러난다 |
| `scripts/declarations.ts` (TypeScript 6) | akanjs의 `pkgs/akanjs/build.ts`는 vendor 패키지의 .d.ts를 akanjs의 TypeScript 6으로, 패키지 tsconfig에 declaration + emitDeclarationOnly를 얹어 만든다. 오류가 기본값에서는 경고로만 지나가서 타입이 빠질 수 있으므로, 여기서는 오류가 실패다 |
| `scripts/contract.ts --check` | 네 언어의 계약 표가 contract.json과 같다 |
| `scripts/native-vectors.ts` | 공유 벡터를 Swift·Kotlin 커널로 돌린다 |
| `scripts/maven-licenses.ts --check` | 고정한 POM과 라이선스가 잠금 파일과 같다(네트워크) |
| `scripts/third-party-notices.ts --check` | THIRD_PARTY_NOTICES.md가 잠금 파일들과 같다 |
| `cargo test` | 데스크톱 셸(CARGO_TARGET_DIR는 소스 밖) |

## 셀프 테스트 (기기가 필요해 스크립트가 돌리지 않는다)

```sh
bun run akan-native test macos --app examples/sample
bun run akan-native test ios --app examples/sample
bun run akan-native test android --app examples/sample --avd <이름>
bun run akan-native test web --app examples/sample
bun scripts/vm/linux.ts bun run akan-native test linux --app examples/sample
bun scripts/vm/windows.ts test
```

## 기록

| 날짜 | 커밋 | 결과 |
|---|---|---|
| 2026-09-27 | e7265ff | typecheck, `bun test --isolate` 1116 pass(세 번), TypeScript 6.0.3 declarations 204 파일 오류 0(이 패키지 tsconfig, 그리고 akanjs 루트 옵션 `lib: ESNext, DOM`·`noUncheckedIndexedAccess: false`·`allowJs`·`experimentalDecorators`로도 0), TypeScript 6.0.3 전체 타입 검사 통과, 벡터·계약·라이선스·고지·cargo 통과. 셀프 테스트는 f38e226·db831a4 기준 macOS 72/72 · iOS 70/70 · Android 71/71 · Linux 72/72 · Windows 71/71 · web 59/59, e7265ff에서 iOS·Android 다시 통과 |
| 2026-09-27 | 07ced6c 이후 | 요청 B 반영 뒤: `bun scripts/move-check.ts` 전부 ✓(bun test --isolate 1118, TS 6.0.3 declarations 오류 0). 셀프 테스트 macOS 72/72 · iOS 71/71 · Android 72/72 · Linux 72/72 · Windows 71/71 · web 59/59. Linux K13의 running이 Windows VM과 동시에 돌 때 2 → 1로 흔들려서, 호출 중 개수는 늘지 않았는지만 본다 |
