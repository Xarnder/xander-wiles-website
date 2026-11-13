import adapter from "@sveltejs/adapter-static";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    sveltekit({
      compilerOptions: {
        // Force runes mode for the project, except for libraries. Can be removed in svelte 6.
        runes: ({ filename }) =>
          filename.split(/[/\\]/).includes("node_modules") ? undefined : true,
      },
      adapter: adapter({
        pages: "dist",
        assets: "dist",
        fallback: undefined,
        strict: true,
      }),
      // Empty base + relative asset URLs so the built app works under /pages/Tax-Helper/
      // on the main site (same approach as Fighter-Jet / z-image-turbo-sveltekit).
      paths: {
        base: "",
        relative: true,
      },
    }),
  ],
});
