import { config } from "@gribbet/vite-config";
import { mergeConfig } from "vite-plus";

export default mergeConfig(config, {
  lint: {
    rules: {
      "typescript/unbound-method": "off",
    },
  },
});
