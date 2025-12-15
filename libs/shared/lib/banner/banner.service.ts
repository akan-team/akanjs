import { serve } from "@akanjs/service";

import * as db from "../db";

export class BannerService extends serve(db.banner, () => ({})) {}
