/**
 * Shared AI provider chain (global — every user uses the same config).
 *   GET    — catalog + masked main + ordered fallbacks + env availability.
 *   POST   — set the main provider OR append a fallback {role, provider, apiKey?, model?, baseUrl?}.
 *   PATCH  — reorder fallbacks {reorder:[ids]} OR update a slot {update:{id,…}}.
 *   DELETE — remove a slot {id}.
 * Writes are owner-only; the API key is encrypted at rest.
 */
import { requireAuth, requireRole } from "@/lib/authz";
import { PROVIDER_CATALOG, isKnownProvider } from "@/lib/providers/catalog";
import {
  addFallbackSlot,
  listMaskedSlots,
  removeSlot,
  reorderFallbacks,
  setMainSlot,
  updateSlot,
  type SlotRole,
} from "@/lib/providers/config";

export async function GET(req: Request): Promise<Response> {
  const a = await requireAuth(req);
  if (!a.ok) return a.response;
  return Response.json({
    catalog: PROVIDER_CATALOG,
    ...listMaskedSlots(),
    env: {
      anthropic: !!process.env.ANTHROPIC_API_KEY,
      openrouter: !!process.env.OPENROUTER_API_KEY,
    },
  });
}

export async function POST(req: Request): Promise<Response> {
  const a = await requireRole(req, ["owner"]);
  if (!a.ok) return a.response;
  const body = (await req.json()) as {
    role?: SlotRole;
    provider?: string;
    apiKey?: string;
    model?: string;
    baseUrl?: string;
    label?: string;
  };
  if (!body?.provider || !isKnownProvider(body.provider)) {
    return Response.json({ error: "unknown_provider" }, { status: 400 });
  }
  const input = {
    provider: body.provider,
    apiKey: body.apiKey,
    model: body.model,
    baseUrl: body.baseUrl,
    label: body.label,
  };
  const slot = body.role === "main" ? setMainSlot(input) : addFallbackSlot(input);
  return Response.json({ slot, ...listMaskedSlots() });
}

export async function PATCH(req: Request): Promise<Response> {
  const a = await requireRole(req, ["owner"]);
  if (!a.ok) return a.response;
  const body = (await req.json()) as {
    reorder?: string[];
    update?: { id: string; model?: string; baseUrl?: string; apiKey?: string; enabled?: boolean };
  };
  if (Array.isArray(body.reorder)) {
    reorderFallbacks(body.reorder);
  } else if (body.update?.id) {
    const { id, ...patch } = body.update;
    updateSlot(id, patch);
  } else {
    return Response.json({ error: "nothing_to_do" }, { status: 400 });
  }
  return Response.json(listMaskedSlots());
}

export async function DELETE(req: Request): Promise<Response> {
  const a = await requireRole(req, ["owner"]);
  if (!a.ok) return a.response;
  const body = (await req.json()) as { id?: string };
  if (!body?.id) return Response.json({ error: "missing_id" }, { status: 400 });
  removeSlot(body.id);
  return Response.json(listMaskedSlots());
}
