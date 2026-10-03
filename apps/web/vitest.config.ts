import { defineConfig } from "vitest/config";

// Apart from vite.config.ts on purpose: that one loads the Cloudflare and
// TanStack Start plugins, which a test of pure modules neither needs nor
// can run, and `vite build` never reads this file.
export default defineConfig({
	resolve: {
		tsconfigPaths: true,
	},
	test: {
		include: ["src/**/*.test.ts"],
	},
});
