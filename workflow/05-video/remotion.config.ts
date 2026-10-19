/**
 * Remotion Configuration
 * All configuration options: https://remotion.dev/docs/config
 */

import fs from "fs";
import path from "path";
import { Config } from "@remotion/cli/config";

Config.setRspack(true);
Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
Config.setDefaultPremountInSeconds(2);

function findRepoRoot(startDir: string): string {
  let cur = path.resolve(startDir);
  while (cur !== path.dirname(cur)) {
    if (fs.existsSync(path.join(cur, "packages/kit/src/index.ts"))) {
      return cur;
    }
    cur = path.dirname(cur);
  }
  return startDir;
}

const repoRoot = findRepoRoot(process.cwd());
const kitIndex = path.join(repoRoot, "packages/kit/src/index.ts");

Config.overrideRspackConfig((current) => {
  return {
    ...current,
    resolve: {
      ...current.resolve,
      alias: {
        ...(current.resolve?.alias || {}),
        "@wealthgap/kit": kitIndex,
      },
      extensions: [
        ...(current.resolve?.extensions || [".ts", ".tsx", ".js", ".jsx", ".json"]),
      ],
    },
  };
});
