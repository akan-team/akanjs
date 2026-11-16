<!-- akan:generated -->

# Akan.js API reference

Generated from the akanjs sources of this release: the import paths and signatures a first app needs, so none of
them has to be looked up in `node_modules`. A stage's return type is the same chain, left out below.

## Dictionaries (`*.dictionary.ts`)

### `serviceDictionary` · `akanjs/dictionary`

```ts
serviceDictionary<Languages extends [string, ...string[]] = [string]>(languages?: Languages): ServiceDictInfo<Languages, never, never, never>
```

### `FunctionTranslation`

```ts
.desc(descTrans: Languages)
.arg<TransMap extends { [key: string]: FieldTranslation<Languages>; }>(translate: (t: (trans: Languages) => FieldTranslation<Languages>) => TransMap)
```

### `FieldTranslation`

```ts
.desc(descTrans: Languages)
```
