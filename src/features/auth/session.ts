import "server-only";

import { headers } from "next/headers";
import { cache } from "react";
import { auth } from "./server";

export const getAuthSession = cache(async () => {
  return auth.api.getSession({ headers: await headers() });
});
