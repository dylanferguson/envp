import "../src/web/app.css";
import { mount } from "svelte";
import StepTree from "../src/web/StepTree.svelte";

const STEPS = ["paste", "encrypt", "send", "link"] as const;
const TREE = [
  { step: "paste", twig: "├── ", label: "enter .env" },
  { step: "encrypt", twig: "│   ├── ", label: "encrypting .env locally" },
  { step: "send", twig: "│   ├── ", label: "sending ciphertext to server" },
  { step: "link", twig: "│   └── ", label: "share link ready" },
] as const;

const params = new URLSearchParams(location.search);
const at = params.get("at") ?? "link";

mount(StepTree, {
  target: document.getElementById("app")!,
  props: {
    steps: STEPS,
    lines: TREE,
    at,
    kind: "hold",
  },
});

document.documentElement.style.background = "#08090b";
