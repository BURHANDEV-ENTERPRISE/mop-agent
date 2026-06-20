/** GET /api/setup/status — whether the owner account has been created yet. */
import { ownerExists } from "@/lib/auth";

export async function GET(): Promise<Response> {
  return Response.json({ ownerExists: ownerExists() });
}
