import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// drizzle-kit 默认只读 .env，这里指定从 Next 的 .env.local 取 DATABASE_URL
config({ path: ".env.local" });

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
});
