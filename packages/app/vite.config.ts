import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages serves the site under the repository name.
export default defineConfig({
  base: "/pf2-combat/",
  plugins: [react()],
  publicDir: "../../data-public",
});
