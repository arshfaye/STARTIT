// Bundles the real STARTIT components into a single-file preview.
//   bun preview/build.ts cdn   -> preview/dist/startit.html (React/Lucide/Tailwind from CDN)
//   bun preview/build.ts test  -> preview/dist/test.html     (fully offline smoke test)
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const mode = process.argv[2] === "test" ? "test" : "cdn";
const root = join(import.meta.dir, "..");
const out = join(root, "preview", "dist");
mkdirSync(out, { recursive: true });

const ICONS = readFileSync(join(root, "preview", "icons.txt"), "utf8").trim().split(/\s+/);

const shims: Record<string, string> = {
  cdn: "",
  test: "",
};

const plugin = {
  name: "globals",
  setup(build: any) {
    const virt = (filter: RegExp, contents: string) => {
      build.onResolve({ filter }, (a: any) => ({ path: a.path, namespace: "virt" }));
      build.onLoad({ filter, namespace: "virt" }, () => ({ contents, loader: "js" }));
    };
    virt(/^web-push$/, "export default {};");
    // Cloud sync is a Next.js-only feature; the preview runs on browser storage.
    virt(/^@supabase\/supabase-js$/, "export const createClient = () => { throw new Error('Supabase is not available in the preview'); };");
    // React and icons are bundled into the page so nothing external can block startup.
    // Icons come from the Lucide set in react-icons; three Lucide names changed upstream.
    const RENAMED: Record<string, string> = { AlertTriangle: "TriangleAlert", CheckCircle2: "CircleCheck", Code2: "CodeXml" };
    virt(
      /^lucide-react$/,
      `import * as Lu from "react-icons/lu";
       const fb = () => null;
       ${ICONS.map((n) => `export const ${n} = Lu.Lu${RENAMED[n] ?? n} || fb;`).join("\n")}`,
    );
  },
};

const result = await Bun.build({
  entrypoints: [join(root, "preview", "entry.tsx")],
  target: "browser",
  minify: true,
  define: { "process.env.NODE_ENV": '"production"' },
  plugins: [plugin],
});
if (!result.success) {
  for (const l of result.logs) console.error(l);
  process.exit(1);
}
const js = (await result.outputs[0].text()).replace(/<\/script/gi, "<\\/script");

const globals = readFileSync(join(root, "app", "globals.css"), "utf8");
// Transpile the real tailwind.config.ts to plain JS for the Tailwind play CDN.
const twSrc = readFileSync(join(root, "tailwind.config.ts"), "utf8").replace(/^import.*$/gm, "");
const twConfig =
  new Bun.Transpiler({ loader: "ts" }).transformSync(twSrc).replace(/export\s*\{[^}]*\};?|export default \w+;?/g, "") +
  "\nif (window.tailwind) tailwind.config = config;";

const head = `<title>STARTIT Founder OS</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500;600;700&display=swap">
<style>
  :root { --font-geist-sans: "Geist"; --font-geist-mono: "Geist Mono"; }
  body { font-family: "Geist", "Inter", ui-sans-serif, system-ui, sans-serif; }
  #root > .min-h-screen header > div, #root > .min-h-screen main {
    padding-left: max(16px, env(safe-area-inset-left, 0px));
    padding-right: max(16px, env(safe-area-inset-right, 0px));
  }
  @media (min-width: 640px) {
    #root > .min-h-screen header > div, #root > .min-h-screen main { padding-left: max(32px, env(safe-area-inset-left, 0px)); padding-right: max(32px, env(safe-area-inset-right, 0px)); }
  }
  body::before { content: ""; position: fixed; inset: 0 0 auto; height: env(safe-area-inset-top, 0px); z-index: 40; background: rgb(var(--bg)); }
  header.sticky { top: env(safe-area-inset-top, 0px) !important; }
  #boot { display:grid; place-items:center; min-height:60vh; font: 500 13px system-ui, sans-serif; color: rgb(var(--fg-muted)); }
</style>`;

let html: string;
if (mode === "cdn") {
  html = `${head}
<script src="https://cdn.tailwindcss.com/3.4.17"></script>
<script>${twConfig}</script>
<style type="text/tailwindcss">${globals}</style>
<div id="root"><div id="boot">LOADING STARTIT…</div></div>
<script>${js}</script>`;
} else {
  html = `<!doctype html><html><head><meta charset="utf-8">${head}</head><body><div id="root"></div><script>${js}</script></body></html>`;
}
const file = join(out, mode === "cdn" ? "startit.html" : "test.html");
writeFileSync(file, html);
console.log(`${mode}: ${file} (${(html.length / 1024).toFixed(0)} KB)`);
void shims;
