<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/3f25ce78-d25d-44b7-9cc6-e4fc575c6f6c

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Database changes

Migrations live in `drizzle/` and are tracked in the database's `drizzle.__drizzle_migrations` table.
`drizzle/0000_baseline.sql` is the full schema as of the rounds/scoring release and is already recorded as applied in production.
Older hand-written migrations are kept for reference in `drizzle_archive/` and are not used.

1. Edit `src/db/schema.ts`.
2. `npm run db:generate` writes a numbered SQL file in `drizzle/`. Read it, and add any data-copy steps before columns or tables are dropped. For a data-only change, run `npx drizzle-kit generate --custom --name <name>` and write the SQL yourself.
3. Run `npm run db:migrate` against a local or restored copy of the database first and check the result.
4. Run `npm run db:migrate` against production.

Don't use `drizzle-kit push` on production. It syncs the schema directly, skips any data steps, and drops tables or columns that are missing from `schema.ts`.
