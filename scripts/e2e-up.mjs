import { execFileSync } from "node:child_process";

const gitCommit =
  process.env.GIT_COMMIT || execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();

const env = {
  ...process.env,
  COMPOSE_PROJECT_NAME: process.env.COMPOSE_PROJECT_NAME || "envp-e2e",
  GIT_COMMIT: gitCommit,
};
const compose = (...args) =>
  execFileSync("docker", ["compose", ...args], { env, stdio: "inherit" });

function down() {
  compose("down", "--volumes");
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    down();
    process.exit(0);
  });
}

compose("up", ...(process.env.E2E_SKIP_BUILD ? ["--wait"] : ["--build", "--wait"]));
setInterval(() => {}, 1 << 30);
