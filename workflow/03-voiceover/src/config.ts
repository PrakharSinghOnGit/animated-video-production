import fs from "fs";
import path from "path";

export const CONFIG = {
  // Default active video project in workspace/
  defaultVideo: process.env.ACTIVE_VIDEO || "VID01_Currency_Market",

  // Root workspace directory
  workspaceDir: fs.existsSync(path.resolve(process.cwd(), "workspace"))
    ? path.resolve(process.cwd(), "workspace")
    : path.resolve(__dirname, "../../../workspace"),
};
