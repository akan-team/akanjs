---
"akanjs": patch
---

Internal: the SQL document store (`SqlDocumentStore`) is composed from one collaborator per concern next to it instead of one 99-member class: `SqlTableSchema` (the table and its indexes), `DocumentRowCodec` (rows to documents and back), `DocumentHydrator` and `StoredRows` (the document prototype and the row each document was read as), `QueryScope` (live-row scoping and joins), `DocumentWriter` (document writes and their hooks) and `QueryWriter` (query-level writes). Its public members, SQL, parameter order and transaction boundaries are unchanged on SQLite and Postgres.
