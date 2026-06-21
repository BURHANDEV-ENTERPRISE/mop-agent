/**
 * Execution backends for capability-gated run_shell (Fasa 6).
 *
 *  host   — run on the user's machine (default), cwd = project root.
 *  docker — sandbox in a container; project mounted at /work; network "none" by default.
 *  ssh    — run on a remote build box.
 *
 * Only reached when the runShell/editCode capability is enabled (tools.ts guards),
 * so this is opt-in. Each command has a hard timeout.
 */
import { spawn } from "node:child_process";
import { platform } from "node:os";
import type { ExecutionPolicy } from "@mop/link-protocol";

export type ExecResult = { stdout: string; stderr: string; code: number | null };

function run(cmd: string, args: string[], timeoutMs: number): Promise<ExecResult> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      stderr += `\n[timeout after ${timeoutMs}ms]`;
      child.kill("SIGKILL");
    }, timeoutMs);
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("error", (e) => {
      clearTimeout(timer);
      resolve({ stdout, stderr: stderr + String(e.message), code: 127 });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ stdout: stdout.slice(0, 100_000), stderr: stderr.slice(0, 20_000), code });
    });
  });
}

export async function runShell(command: string, projectRoot: string, policy: ExecutionPolicy): Promise<ExecResult> {
  const timeoutMs = policy.timeoutMs ?? 60_000;

  if (policy.backend === "docker") {
    const image = policy.docker?.image ?? "node:20-slim";
    const network = policy.docker?.network ?? "none";
    return run(
      "docker",
      ["run", "--rm", "--network", network, "-v", `${projectRoot}:/work`, "-w", "/work", image, "sh", "-lc", command],
      timeoutMs,
    );
  }

  if (policy.backend === "ssh") {
    if (!policy.ssh) return { stdout: "", stderr: "ssh backend not configured", code: 1 };
    const remote = `${policy.ssh.user}@${policy.ssh.host}`;
    const remoteCmd = policy.ssh.cwd ? `cd ${policy.ssh.cwd} && ${command}` : command;
    return run("ssh", [remote, remoteCmd], timeoutMs);
  }

  // host (default)
  const shell = platform() === "win32" ? "cmd" : "sh";
  const flag = platform() === "win32" ? "/c" : "-lc";
  return new Promise((resolve) => {
    const child = spawn(shell, [flag, command], { cwd: projectRoot, windowsHide: true });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      stderr += `\n[timeout after ${timeoutMs}ms]`;
      child.kill("SIGKILL");
    }, timeoutMs);
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("error", (e) => {
      clearTimeout(timer);
      resolve({ stdout, stderr: stderr + String(e.message), code: 127 });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ stdout: stdout.slice(0, 100_000), stderr: stderr.slice(0, 20_000), code });
    });
  });
}
