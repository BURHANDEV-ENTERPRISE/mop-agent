#!/usr/bin/env node
/**
 * npm bootstrap for the canonical command: `npx mop-agent`.
 *
 * The npx cache is temporary, so this file copies the packaged application to
 * a durable directory before launching the real installer. It starts as the
 * normal user and uses sudo only to create/fix ownership of the system app dir.
 */
import { spawnSync } from "node:child_process";
import {
  accessSync,
  constants,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { platform } from "node:os";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(resolve(PACKAGE_ROOT, "package.json"), "utf8"));
const VERSION = manifest.version;
const DEFAULT_DIR = "/opt/mop-agent";
const APP_DIR = resolve(process.env.MOP_AGENT_DIR || DEFAULT_DIR);
const argv = process.argv.slice(2);
const isRoot = typeof process.getuid === "function" && process.getuid() === 0;

function fail(message) {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: "inherit", ...options });
  if (result.error) fail(`${command} failed: ${result.error.message}`);
  if (result.status !== 0) fail(`${command} exited with code ${result.status ?? 1}.`);
}

function help() {
  console.log(`
MOP-AGENT ${VERSION}

Usage:
  npx mop-agent              Open the installer menu
  npx mop-agent install      Install nginx and Certbot
  npx mop-agent setup        Configure domain, HTTPS, app and systemd
  npx mop-agent status       Show service health and file locations
  npx mop-agent update       Apply the npm version selected by npx
  npx mop-agent uninstall    Remove service and nginx config

Environment:
  MOP_AGENT_DIR              Durable app directory (default: ${DEFAULT_DIR})

Run this command as either a normal sudo user or root. When launched by a normal
user, MOP-AGENT asks for sudo only when an OS operation requires it. The web
service itself never runs as root. Native Windows/macOS production installation
is not yet supported; use WSL2 Ubuntu on Windows or a Linux host.
`);
}

function assertPlatform() {
  if (platform() === "linux") return;
  if (platform() === "win32") {
    fail("Native Windows installation is not supported. Run `npx mop-agent` inside WSL2 Ubuntu.");
  }
  if (platform() === "darwin") {
    fail("macOS production installation is not supported yet. Use development mode or a Linux host.");
  }
  fail(`Unsupported platform: ${platform()}.`);
}

function assertSafeDestination() {
  const forbidden = new Set(["/", "/bin", "/boot", "/dev", "/etc", "/home", "/lib", "/proc", "/root", "/run", "/sbin", "/sys", "/usr", "/var"]);
  if (forbidden.has(APP_DIR)) fail(`Refusing unsafe MOP_AGENT_DIR: ${APP_DIR}`);
}

function writable(path) {
  try {
    accessSync(path, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

function ensureDestination() {
  if (existsSync(APP_DIR) && writable(APP_DIR)) return;
  if (isRoot) {
    mkdirSync(APP_DIR, { recursive: true });
    return;
  }
  const uid = String(process.getuid());
  const gid = String(process.getgid());
  console.log(`\n▸ Preparing ${APP_DIR} (sudo is required once for this system directory)`);
  run("sudo", ["install", "-d", "-o", uid, "-g", gid, APP_DIR]);
  if (!writable(APP_DIR)) {
    run("sudo", ["chown", "-R", `${uid}:${gid}`, APP_DIR]);
  }
}

function shouldCopy(source) {
  const rel = relative(PACKAGE_ROOT, source);
  if (!rel) return true;
  const first = rel.split(sep)[0];
  if (["node_modules", ".git", ".next", "data"].includes(first)) return false;
  if (rel === "apps/web/.env") return false;
  return true;
}

function deployPackage() {
  const marker = resolve(APP_DIR, ".mop-agent-version");
  const current = existsSync(marker) ? readFileSync(marker, "utf8").trim() : "";
  const ready = current === VERSION && existsSync(resolve(APP_DIR, "installer/mop-agent.mjs"));
  if (ready) {
    console.log(`✓ MOP-AGENT ${VERSION} already staged at ${APP_DIR}`);
    return;
  }

  console.log(`\n▸ Staging MOP-AGENT ${VERSION} → ${APP_DIR}`);
  cpSync(PACKAGE_ROOT, APP_DIR, {
    recursive: true,
    force: true,
    filter: shouldCopy,
  });

  console.log("▸ Installing application dependencies");
  const lock = existsSync(resolve(APP_DIR, "npm-shrinkwrap.json"));
  run("npm", [lock ? "ci" : "install", "--include=dev", "--no-audit", "--no-fund"], { cwd: APP_DIR });
  writeFileSync(marker, `${VERSION}\n`, { mode: 0o644 });
  console.log(`✓ MOP-AGENT ${VERSION} staged\n`);
}

function selfTest() {
  const required = [
    "installer/mop-agent.mjs",
    "installer/lib.mjs",
    "apps/web/package.json",
    "apps/web/server.ts",
    "packages/link-protocol/package.json",
    "packages/flow-connector/package.json",
  ];
  const missing = required.filter((file) => !existsSync(resolve(PACKAGE_ROOT, file)));
  if (missing.length) fail(`Package is missing runtime files: ${missing.join(", ")}`);
  console.log(`bootstrap self-test PASS (${VERSION})`);
}

if (argv.includes("--help") || argv.includes("-h")) {
  help();
} else if (argv.includes("--version") || argv.includes("-v")) {
  console.log(VERSION);
} else if (argv.includes("--self-test")) {
  selfTest();
} else {
  assertPlatform();
  assertSafeDestination();
  ensureDestination();
  deployPackage();
  run(process.execPath, [resolve(APP_DIR, "installer/mop-agent.mjs"), ...argv], {
    cwd: APP_DIR,
    env: { ...process.env, MOP_AGENT_MANAGED_BY_NPX: "1" },
  });
}
