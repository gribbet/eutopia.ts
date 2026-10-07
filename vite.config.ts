import { defineConfig } from "@gribbet/vite-config";

export default defineConfig({
  lint: {
    rules: {
      "typescript/unbound-method": "off",
    },
  },
});
