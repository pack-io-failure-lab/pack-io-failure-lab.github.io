import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const repositoryName = process.env.GITHUB_REPOSITORY?.split("/").at(-1);
const isGitHubPagesBuild = process.env.GITHUB_PAGES === "true";
const isRootPagesSite = repositoryName?.endsWith(".github.io");

export default defineConfig({
  // GitHub Pages project sites are served below /<repository-name>/, while
  // organization and user root sites (<owner>.github.io) are served at /.
  // Local builds also retain / so the static artifact can be inspected directly.
  base:
    isGitHubPagesBuild && repositoryName && !isRootPagesSite
      ? `/${repositoryName}/`
      : "/",
  plugins: [react()],
  build: {
    outDir: "dist-github-pages",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: fileURLToPath(new URL("./index.html", import.meta.url)),
      },
    },
  },
});
