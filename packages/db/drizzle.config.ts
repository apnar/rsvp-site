import { defineConfig } from "drizzle-kit";

// Migrations are generated here with `pnpm run db:generate` and applied to
// Cloudflare D1 with wrangler (`pnpm run db:migrate:local` / `db:migrate:remote`
// in apps/web), which reads the .sql files from `out`.
export default defineConfig({
	schema: "./src/schema",
	out: "./src/migrations",
	dialect: "sqlite",
});
