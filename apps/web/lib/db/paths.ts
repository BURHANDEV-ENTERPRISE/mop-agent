/**
 * Cross-platform data directory resolution (Windows + Linux + macOS).
 * Override with MOP_AGENT_DATA_DIR. Defaults to <cwd>/data in dev for easy inspection.
 */
import { homedir, platform } from "node:os";
import { join } from "node:path";

export function dataDir(): string {
  if (process.env.MOP_AGENT_DATA_DIR) return process.env.MOP_AGENT_DATA_DIR;

  // Production-friendly OS locations (used when not in a project checkout).
  if (process.env.MOP_AGENT_USE_OS_DIR === "1") {
    if (platform() === "win32") {
      return join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), "mop-agent");
    }
    return join(process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share"), "mop-agent");
  }

  // Dev default: ./data (gitignored)
  return join(process.cwd(), "data");
}

export function dbPath(): string {
  return join(dataDir(), "mop-agent.db");
}
