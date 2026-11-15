import path from "node:path";

export const logoDirectory =
  process.env.LOGO_STORAGE_DIR?.trim() ||
  path.resolve(process.cwd(), "..", "..", "storage", "logos");
