import { v2Route, ok, BUCKETS, preflight } from "@/lib/api-v2/http";
import { loadScope } from "@/lib/api-v2/drive";
import { maxApiBytesPerDay } from "@/lib/api-v1/guards";

export const runtime = "nodejs";
export const OPTIONS = preflight("GET, OPTIONS");

export const GET = v2Route({ cap: "any", bucket: BUCKETS.read, route: "/api/v2/me" }, async ({ principal }) => {
  const scope = await loadScope(principal);
  return ok({
    principal: {
      type: principal.kind === "app" ? "app" : "personal_token",
      scopes: principal.scopes,
      ...(principal.kind === "app" ? { appId: principal.appId, appFolderId: principal.appFolderId } : {}),
    },
    // Only apps that asked for `profile:basic` learn the account id.
    ...(principal.kind === "pat" || principal.scopes.includes("profile:basic") ? { user: { id: principal.userId } } : {}),
    drive: { encrypted: scope.webhook.e2eeVersion >= 1, chunkPlainBytes: 8 * 1024 * 1024 },
    limits: { maxBytesPerDay: maxApiBytesPerDay() },
  });
});
