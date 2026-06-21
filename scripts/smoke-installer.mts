/**
 * Smoke test: installer library (detect + generators + plans). Pure, no side effects.
 *   npx tsx scripts/smoke-installer.mts
 */
import {
  detectOS, renderNginxVhost, renderSystemdUnit, planInstallDeps, planDbSetup, planSsl,
  nginxPaths, installPaths,
} from "../installer/lib.mjs";

function main() {
  const os = detectOS();
  console.log(`[test] detected: ${os.pretty} family=${os.family} pkg=${os.pkg ? "yes" : "no"}`);

  const nginx = renderNginxVhost({ domain: "agent.example.com", port: "3000" });
  const systemd = renderSystemdUnit({ appDir: "/opt/mop-agent", port: "3000", user: "root" });
  const deps = os.pkg ? planInstallDeps(os) : [];
  const db = planDbSetup({ dbName: "mopagent", dbUser: "mopagent", dbPass: "secret" });
  const ssl = planSsl({ domain: "agent.example.com", email: "a@example.com" });
  const debianNginx = nginxPaths("debian");
  const rhelNginx = nginxPaths("rhel");
  const paths = installPaths("/opt/mop-agent", "debian");

  console.log(`[test] nginx has proxy_pass+ws-upgrade: ${nginx.includes("proxy_pass http://127.0.0.1:3000") && nginx.includes('Connection "upgrade"')}`);
  console.log(`[test] systemd auto-restart: ${systemd.includes("Restart=always") && systemd.includes("WantedBy=multi-user.target")}`);
  console.log(`[test] install steps cover postgres/nginx/certbot: ${["PostgreSQL", "nginx", "certbot"].every((k) => deps.some((s) => s.label.toLowerCase().includes(k.toLowerCase())))}`);
  console.log(`[test] db plan creates role+db: ${db[0]!.cmd.includes("CREATE USER") && db[0]!.cmd.includes("CREATE DATABASE")}`);
  console.log(`[test] ssl has primary + standalone fallback: ${ssl.primary.cmd.includes("--nginx") && ssl.fallback.some((s) => s.cmd.includes("standalone"))}`);
  console.log(`[test] distro nginx paths: ${debianNginx.conf.includes("sites-available") && rhelNginx.conf.includes("conf.d")}`);
  console.log(`[test] canonical paths displayed: ${paths["app code"] === "/opt/mop-agent" && paths["systemd unit"] === "/etc/systemd/system/mop-agent.service"}`);

  const ok =
    !!os.family &&
    nginx.includes("proxy_pass http://127.0.0.1:3000") && nginx.includes('Connection "upgrade"') &&
    systemd.includes("Restart=always") &&
    (os.pkg ? ["PostgreSQL", "nginx", "certbot"].every((k) => deps.some((s) => s.label.toLowerCase().includes(k.toLowerCase()))) : true) &&
    db[0]!.cmd.includes("CREATE DATABASE") &&
    ssl.primary.cmd.includes("--nginx") && ssl.fallback.some((s) => s.cmd.includes("standalone")) &&
    debianNginx.conf.includes("sites-available") && rhelNginx.conf.includes("conf.d") &&
    paths["app code"] === "/opt/mop-agent" && paths["systemd unit"] === "/etc/systemd/system/mop-agent.service";

  console.log(`\n[test] ${ok ? "PASS ✅" : "FAIL ❌"}`);
  process.exit(ok ? 0 : 1);
}

main();
