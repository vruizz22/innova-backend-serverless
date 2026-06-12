# Authorization model (v9)

Authorization is enforced in the **service layer** (as today). Supabase RLS is
reserved for tables read client-side via `supabase-js`; every NestJS endpoint
re-checks ownership server-side regardless of RLS.

## Identity

`SupabaseAuthGuard` (global `APP_GUARD`) validates the Supabase RS256 JWT and
attaches `req.user: SupabaseUser { supabaseUid, email, role, prismaUserId }`.
`RolesGuard` (global `APP_GUARD`) enforces `@Roles(...)` metadata. Routes are
authenticated by default; `@Public()` opts out.

`prismaUserId` is the `User.id`. Domain ownership is always resolved through the
**profile** row (`Teacher`/`Student`/`Parent`) via `userId`, never by trusting a
client-supplied id.

## Scope matrix

| Role | Scope | How it is enforced |
|---|---|---|
| `STUDENT` | Only `studentId === resolveStudent(jwt.prismaUserId).id` | `GuideSubmissionsService` resolves the student profile and filters every query by `studentId`; `loadPublishedGuideForStudent` also requires an `ACTIVE` `Enrollment` in the guide's course. Submissions are owner-checked on read/complete. |
| `TEACHER` | Only courses linked via `CourseTeacher` | `GuidesService.loadOwnedGuide` / `create` verify a `CourseTeacher` row for `(teacher.id, courseId)` before any read or mutation. `list` restricts to the teacher's course ids. |
| `PARENT` | Only children with `ParentLink.confirmedAt != null` | Parent endpoints (S14.2, pending) must filter by confirmed `ParentLink`. Parents **never** see submission photos or step-level detail (ADR-123) — aggregate summaries only. |
| `ADMIN` | Organization scope | Reserved; not used by the guides MVP endpoints. |

## Hard rules (ADR-119 / ADR-123)

- **Nothing is visible to students before `Guide.status = PUBLISHED`.** The
  student endpoints reject any guide whose status is not `PUBLISHED`.
- **The pauta (`GuideSolution`) is never exposed before `gradedAt`,** and only
  when `Guide.showSolutionAfterGrade = true` (`GuideSubmissionsService.getResults`).
- **Submission photos are private:** the student gets short-lived presigned PUT
  urls for their own keys only; teachers may read their course's photos; parents
  never receive photo urls.
- **No PII in SQS bodies** — only UUIDs, latex steps and statements.

## Audit checklist (M27)

- [ ] Student cannot read another student's submission/status/results.
- [ ] Teacher cannot read/mutate a guide of a course they don't teach.
- [ ] Parent cannot reach any photo url or step-level endpoint.
- [ ] Unauthenticated request to any `/guides` or `/student/*` route → 401.
- [ ] Cross-role token (student JWT on a teacher route) → 403 via `RolesGuard`.
