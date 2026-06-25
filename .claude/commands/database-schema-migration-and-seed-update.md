---
name: database-schema-migration-and-seed-update
description: Workflow command scaffold for database-schema-migration-and-seed-update in innova-backend-serverless.
allowed_tools: ["Bash", "Read", "Write", "Grep", "Glob"]
---

# /database-schema-migration-and-seed-update

Use this workflow when working on **database-schema-migration-and-seed-update** in `innova-backend-serverless`.

## Goal

Introduces new database tables or fields, updates Prisma schema, generates migrations, and updates seed/demo data.

## Common Files

- `prisma/schema.prisma`
- `prisma/migrations/*/migration.sql`
- `prisma/seed.ts`
- `prisma/demo-identities.ts`
- `prisma.config.ts`

## Suggested Sequence

1. Understand the current state and failure mode before editing.
2. Make the smallest coherent change that satisfies the workflow goal.
3. Run the most relevant verification for touched files.
4. Summarize what changed and what still needs review.

## Typical Commit Signals

- Edit prisma/schema.prisma to define new/changed tables or fields
- Generate new migration in prisma/migrations/
- Update prisma/seed.ts and/or prisma/demo-identities.ts for new data
- Optionally update prisma.config.ts
- Commit all related files together

## Notes

- Treat this as a scaffold, not a hard-coded script.
- Update the command if the workflow evolves materially.