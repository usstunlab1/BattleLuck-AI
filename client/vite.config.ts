import { defineConfig } from "vite";
const defaultRemoteUrl = "https://ais-pre-ddtfjbzbgpc2mlkz7nqvra-782381585235.europe-west2.run.app";
export default defineConfig({
  server: {
    port: 5174,
    proxy: {
      "/battleluck-api": {
        target: process.env.VITE_REMOTE_BASE_URL || defaultRemoteUrl,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/battleluck-api/, "")
      }
    }
  }
});
