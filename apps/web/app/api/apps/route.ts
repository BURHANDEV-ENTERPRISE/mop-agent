import { requireRole } from "@/lib/authz";
import { listAppConfigs, saveAppConfig, type AppId } from "@/lib/channels/config";

const APP_IDS = new Set<AppId>(["telegram", "discord", "whatsapp", "slack", "webhook"]);

export async function GET(req: Request): Promise<Response> {
  const auth = await requireRole(req, ["owner"]);
  if (!auth.ok) return auth.response;
  return Response.json({ apps: listAppConfigs(auth.userId) });
}

export async function POST(req: Request): Promise<Response> {
  const auth = await requireRole(req, ["owner"]);
  if (!auth.ok) return auth.response;
  const body = (await req.json()) as { appId?: AppId; secret?: string; fields?: Record<string, string>; enabled?: boolean };
  if (!body.appId || !APP_IDS.has(body.appId)) return Response.json({ error: "unknown_app" }, { status: 400 });
  try {
    saveAppConfig(auth.userId, { appId: body.appId, secret: body.secret, fields: body.fields, enabled: body.enabled !== false });
    return Response.json({ apps: listAppConfigs(auth.userId), restartRequired: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "save_failed" }, { status: 400 });
  }
}
