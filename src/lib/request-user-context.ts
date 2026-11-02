import "server-only";

import { cache } from "react";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getProfileForUser } from "@/lib/profile-service";

/**
 * Deduplicate authentication and profile reads within one React server render.
 * React cache is request-scoped here; it does not persist private user data
 * between requests or users.
 */
export const getRequestSession = cache(async () =>
  auth.api.getSession({ headers: await headers() }),
);

export const getRequestProfile = cache(async (userId: string) =>
  getProfileForUser(userId),
);
