/**
 * Smoke test: installer library (detect + generators + plans). Pure, no side effects.
 *   npx tsx scripts/smoke-installer.mts
 */
import {
  detectOS, renderNginxVhost, renderNginxTlsVhost, renderSystemdUnit, planInstallDeps, planSsl,
  nginxPaths, installPaths, isValidDomain, isValidEmail, isValidPort,
} from "../installer/lib.mjs";

function main() {
  const os = detectOS();
  console.log(`[test] detected: ${os.pretty} family=${os.family} pkg=${os.pkg ? "yes" : "no"}`);

  const nginx = renderNginxVhost({ domain: "agent.example.com", port: "3000" });
  const systemd = renderSystemdUnit({ appDir: "/opt/mop-agent", port: "3000", user: "root" });
  const deps = os.pkg ? planInstallDeps(os) : [];
  const ssl = planSsl({ domain: "agent.example.com", email: "a@example.com" });
  const tlsNginx = renderNginxTlsVhost({ domain: "agent.example.com", port: "3000" });
  const debianNginx = nginxPaths("debian");
  const rhelNginx = nginxPaths("rhel");
  const paths = installPaths("/opt/mop-agent", "debian");

  console.log(`[test] nginx has proxy_pass+ws-upgrade: ${nginx.includes("proxy_pass http://127.0.0.1:3000") && nginx.includes('Connection "upgrade"')}`);
  console.log(`[test] systemd auto-restart: ${systemd.includes("Restart=always") && systemd.includes("WantedBy=multi-user.target")}`);
  console.log(`[test] install steps cover nginx/certbot only: ${["nginx", "certbot"].every((k) => deps.some((s) => s.label.toLowerCase().includes(k))) && !deps.some((s) => s.label.includes("PostgreSQL"))}`);
  console.log(`[test] ssl has primary + standalone fallback: ${ssl.primary.cmd.includes("--nginx") && ssl.fallback.some((s) => s.cmd.includes("standalone"))}`);
  console.log(`[test] fallback TLS vhost has cert + redirect: ${tlsNginx.includes("fullchain.pem") && tlsNginx.includes("return 301 https://")}`);
  console.log(`[test] input validation: ${isValidDomain("agent.example.com") && !isValidDomain("bad;rm") && isValidEmail("a@example.com") && !isValidEmail("bad;@x.com") && isValidPort("3000") && !isValidPort("70000")}`);
  console.log(`[test] distro nginx paths: ${debianNginx.conf.includes("sites-available") && rhelNginx.conf.includes("conf.d")}`);
  console.log(`[test] canonical paths displayed: ${paths["app code"] === "/opt/mop-agent" && paths["systemd unit"] === "/etc/systemd/system/mop-agent.service"}`);

  const ok =
    !!os.family &&
    nginx.includes("proxy_pass http://127.0.0.1:3000") && nginx.includes('Connection "upgrade"') &&
    systemd.includes("Restart=always") &&
    (os.pkg ? ["nginx", "certbot"].every((k) => deps.some((s) => s.label.toLowerCase().includes(k))) && !deps.some((s) => s.label.includes("PostgreSQL")) : true) &&
    ssl.primary.cmd.includes("--nginx") && ssl.fallback.some((s) => s.cmd.includes("standalone")) &&
    tlsNginx.includes("fullchain.pem") && tlsNginx.includes("return 301 https://") &&
    isValidDomain("agent.example.com") && !isValidDomain("bad;rm") &&
    isValidEmail("a@example.com") && !isValidEmail("bad;@x.com") &&
    isValidPort("3000") && !isValidPort("70000") &&
    debianNginx.conf.includes("sites-available") && rhelNginx.conf.includes("conf.d") &&
    paths["app code"] === "/opt/mop-agent" && paths["systemd unit"] === "/etc/systemd/system/mop-agent.service";

  console.log(`\n[test] ${ok ? "PASS ✅" : "FAIL ❌"}`);
  process.exit(ok ? 0 : 1);
}

main();
