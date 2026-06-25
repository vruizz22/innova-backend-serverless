```markdown
# innova-backend-serverless Development Patterns

> Auto-generated skill from repository analysis

## Overview

This skill teaches the core development patterns, coding conventions, and collaborative workflows used in the `innova-backend-serverless` TypeScript codebase. The repository is organized into domain modules, uses conventional commits, and relies on Prisma for database management. It features robust testing with Jest and emphasizes maintainable, modular code without a heavyweight framework.

## Coding Conventions

- **File Naming:**  
  Use `camelCase` for filenames (e.g., `userController.ts`, `practiceRecommend.service.ts`).

- **Import Style:**  
  Both default and named imports are used, but prefer named imports for clarity.
  ```ts
  import { UserService } from './userService';
  import config from '../config';
  ```

- **Export Style:**  
  Prefer named exports for modules and services.
  ```ts
  // Good
  export class UserService { ... }

  // Also acceptable
  export { UserService };
  ```

- **Commit Messages:**  
  Follow [Conventional Commits](https://www.conventionalcommits.org/):
  - `feat:` for new features
  - `fix:` for bug fixes
  - `refactor:` for code improvements
  - `chore:` for maintenance
  - `ci:` for CI/CD changes
  - `docs:` for documentation

- **Directory Structure:**  
  - Domain modules in `src/modules/[feature]/`
  - Shared types in `src/shared/domain/`
  - Database schema and seeds in `prisma/`

## Workflows

### Add New Module or Feature
**Trigger:** When introducing a new business domain or major feature with full CRUD or workflow support  
**Command:** `/new-module`

1. Create new controller file(s) in `src/modules/[feature]/`
2. Create new service file(s) in `src/modules/[feature]/`
3. Add DTOs in `src/modules/[feature]/dto/`
4. Register the module in `src/modules/[feature]/[feature].module.ts`
5. Write corresponding `*.spec.ts` test files for controller/service
6. Optionally update shared domain/types if needed

**Example:**
```ts
// src/modules/attempts/attempts.controller.ts
import { AttemptsService } from './attempts.service';

export class AttemptsController {
  constructor(private readonly attemptsService: AttemptsService) {}
  // ...
}
```

### Database Schema Migration and Seed Update
**Trigger:** When adding/modifying database tables/columns and updating seed/demo data  
**Command:** `/new-table`

1. Edit `prisma/schema.prisma` to define new/changed tables or fields
2. Generate a new migration in `prisma/migrations/`
3. Update `prisma/seed.ts` and/or `prisma/demo-identities.ts` for new data
4. Optionally update `prisma.config.ts`
5. Commit all related files together

**Example:**
```prisma
model Guide {
  id        String   @id @default(uuid())
  title     String
  content   String
  createdAt DateTime @default(now())
}
```

### CI/CD Workflow Update
**Trigger:** When changing build/test/deploy automation or adding new CI/CD steps  
**Command:** `/update-ci`

1. Edit or add `.github/workflows/*.yml` files
2. Commit with `ci:` or `chore(ci):` prefix

**Example:**
```yaml
# .github/workflows/deploy.yml
name: Deploy
on: [push]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: npm ci
      - run: npm run build
      - run: npm run deploy
```

### Add or Update Shared Domain Types
**Trigger:** When introducing new domain constants or enums used by multiple features  
**Command:** `/update-domain-types`

1. Edit or regenerate `src/shared/domain/*.generated.ts`
2. Optionally update modules/services that consume these types

**Example:**
```ts
// src/shared/domain/error-tags.generated.ts
export enum ErrorTags {
  NotFound = 'NOT_FOUND',
  Validation = 'VALIDATION_ERROR',
  // ...
}
```

## Testing Patterns

- **Framework:** Jest
- **File Pattern:** Test files are named `*.spec.ts` and placed alongside the code under test.
- **Typical Structure:**
  ```ts
  // src/modules/guides/guides.service.spec.ts
  import { GuidesService } from './guides.service';

  describe('GuidesService', () => {
    it('should create a guide', async () => {
      // Arrange
      // Act
      // Assert
    });
  });
  ```

## Commands

| Command             | Purpose                                                      |
|---------------------|--------------------------------------------------------------|
| /new-module         | Scaffold a new domain module or major feature                |
| /new-table          | Add or modify database tables and update seed/demo data      |
| /update-ci          | Update or add CI/CD workflow files                           |
| /update-domain-types| Add or update shared/generated domain types                  |
```