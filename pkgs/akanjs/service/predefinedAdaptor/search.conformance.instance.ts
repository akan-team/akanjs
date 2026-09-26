import { DocumentSchema } from "akanjs/document";
import { SqlDocumentStore, SqliteDatabase } from "./database.adaptor";
import { Scheduler } from "./schedule.adaptor";
import { searchConfConstant, searchConfDatabase } from "./search.conformance.fixture";

// One process of a fleet booting on one SQLite file. It sleeps until the start time the test gave every process, so all
// of them reach the search schema together, then ensures the fixture model and exits.
const config = JSON.parse(process.env.AKAN_TEST_SQLITE_CONFIG ?? "{}") as object;
await Bun.sleep(Math.max(0, Number(process.env.AKAN_TEST_START_AT ?? 0) - Date.now()));
const scheduler = new Scheduler();
const database = new SqliteDatabase();
Object.assign(database, { scheduler, config });
await database.onInit();
await new SqlDocumentStore(database, searchConfConstant, searchConfDatabase, new DocumentSchema()).ensure();
await database.onDestroy();
await scheduler.onDestroy();
