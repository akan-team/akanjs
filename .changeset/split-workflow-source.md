---
"@akanjs/devkit": patch
---

Internal: the workflow engine's source-editing helpers in `workflow/source.ts` are split by what they edit into `constantSource.ts`, `dictionarySource.ts`, `serviceSource.ts`, `signalSource.ts`, `templateSource.ts`, `testSource.ts`, `sourceImports.ts`, `fieldExpression.ts`, `fieldLabel.ts`, `fieldOrder.ts`, `modulePaths.ts`, `primitiveReport.ts` and `sourceText.ts`, with the shared AST lookups in `sourceAst.ts`. `workflow/source.ts` re-exports the same names, so `@akanjs/devkit/workflow` and every scaffold and `akan workflow` edit behave as before.
