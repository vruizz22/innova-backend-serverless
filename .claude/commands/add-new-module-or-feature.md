---
name: add-new-module-or-feature
description: Workflow command scaffold for add-new-module-or-feature in innova-backend-serverless.
allowed_tools: ["Bash", "Read", "Write", "Grep", "Glob"]
---

# /add-new-module-or-feature

Use this workflow when working on **add-new-module-or-feature** in `innova-backend-serverless`.

## Goal

Adds a new domain module or significant feature (e.g., admin error-tags, attempts ad-hoc flow, guides CRUD, practice recommend). Typically includes controller, service, DTOs, module registration, and tests.

## Common Files

- `src/modules/*/*.controller.ts`
- `src/modules/*/*.service.ts`
- `src/modules/*/*.module.ts`
- `src/modules/*/dto/*.dto.ts`
- `src/modules/*/*.controller.spec.ts`
- `src/modules/*/*.service.spec.ts`

## Suggested Sequence

1. Understand the current state and failure mode before editing.
2. Make the smallest coherent change that satisfies the workflow goal.
3. Run the most relevant verification for touched files.
4. Summarize what changed and what still needs review.

## Typical Commit Signals

- Create new controller file(s) in src/modules/[feature]/
- Create new service file(s) in src/modules/[feature]/
- Add DTOs in src/modules/[feature]/dto/
- Add or update module registration in src/modules/[feature]/[feature].module.ts
- Write corresponding *.spec.ts test files for controller/service

## Notes

- Treat this as a scaffold, not a hard-coded script.
- Update the command if the workflow evolves materially.