import { defineConfig } from "@gribbet/vite-config";

export default defineConfig({
  lint: {
    rules: {
      "typescript/no-misused-promises": "off",
      "typescript/no-useless-default-assignment": "off",
      "typescript/unbound-method": "off",
      "unicorn/no-new-array": "off",
    },
  },
});
