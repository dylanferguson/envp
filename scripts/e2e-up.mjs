import { execFileSync } from "node:child_process";

const env = {
  ...process.env,
  COMPOSE_PROJECT_NAME: process.env.COMPOSE_PROJECT_NAME || "envp-e2e",
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

compose("up", "--build", "--wait");
setInterval(() => {}, 1 << 30);
