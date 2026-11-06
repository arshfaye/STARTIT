import { createRoot } from "react-dom/client";
import AppShell from "@/components/AppShell";

const el = document.getElementById("root")!;
const show = (msg: string) => {
  const boot = document.getElementById("boot");
  if (boot) boot.textContent = "STARTIT couldn't start: " + msg;
};
window.addEventListener("error", (e) => show(e.message));

try {
  createRoot(el).render(<AppShell />);
} catch (e) {
  show(String(e));
}
