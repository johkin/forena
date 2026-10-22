import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const proxy = {
  "/api": "http://127.0.0.1:8080", "/actuator": "http://127.0.0.1:8080",
  "/oauth2": "http://127.0.0.1:8080",
  "/.well-known/oauth-authorization-server": "http://127.0.0.1:8080",
  "/.well-known/oauth-protected-resource": "http://127.0.0.1:8080",
};
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) }, dedupe: ["react", "react-dom"] },
  server: { port: 3000, strictPort: true, proxy, fs: { allow: [".."] } },
  preview: { port: 3000, strictPort: true, proxy },
});
