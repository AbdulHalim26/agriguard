# Phase 0A — Security & data stabilization

## Release status

Local implementation only. **Do not deploy or activate without the prerequisites
below.** No migration, production account operation, credential change, commit,
push, or deployment was performed as part of this implementation.

The legacy phone-derived passwords remain a production risk until an authorized
operator retires them. Removing the old UI alone does not disable Supabase's
public password authentication endpoint.

## Authentication activation prerequisites — BLOCKED externally

1. Use an isolated local/staging Supabase project first. Configure native **Phone
   Auth and a real SMS provider**. Review provider delivery, OTP expiration/rate
   limits and actual token AMR claims. No application OTP simulation is provided.
2. Inventory legacy accounts privately. Match each verified phone to the existing
   `auth.users.id` and `profiles.id`; preserve field/report foreign keys and officer
   roles. Phone linking must use operator-verified ownership. Do not create a new
   UUID for an existing farmer/PPL/Dinas account.
3. Pin the same normalized phone in Auth and the profile. Application and database
   gates require both a Supabase-validated phone OTP session and this identity
   match. This also prevents a stolen old password from rebinding privileged data
   access to an attacker's phone. Audit historical role/phone/group changes;
   previously compromised profile values cannot be inferred or repaired safely.
4. After proving account recovery and native OTP login, have the authorized
   operator retire predictable password access and revoke compromised legacy
   sessions. This is a separate credential-affecting action requiring approval;
   no mass password rotation, Auth provider change, or account mutation is included.
5. Apply `supabase/migrations/0010_phase0a_security.sql` to the isolated project,
   after migrations 0001–0009, and execute the rollback-only SQL tests. Exercise
   native registration, login, onboarding, logout, existing-user recovery, farmer
   submission, assigned-PPL approval/rejection and Dinas access end to end.
6. Only after those checks, coordinate a reviewed release/migration window. Set
   server-only `AUTH_PHONE_OTP_ENABLED=true` in that approved environment. Its
   default is disabled. Existing `OTP_MODE`/WA gateway settings no longer enable
   application authentication. No production configuration was changed locally.

Required existing server configuration names: `SUPABASE_SERVICE_ROLE_KEY`,
`AI_API_URL`; public configuration names: `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`. Never copy their values into reports or fixtures.

## Database changes (not applied here)

- Restrictive phone-OTP/identity policies protect business tables and photos,
  including direct REST access with old password-only JWTs.
- Profile clients can update `full_name` only. The narrow onboarding RPC validates
  invitations and prevents arbitrary group switching. Signup always creates a
  farmer profile and ignores client role/group/phone metadata.
- PPL access is limited to the assigned Poktan; Dinas retains cross-group access.
  Valid same-Poktan farmer report visibility is preserved.
- Report inserts/evidence updates use validated server operations. Browser insert,
  update and delete privileges on reports are revoked.
- `verify_damage_report` derives reviewer identity, enforces role/group and pending
  state, locks the report and records the decision/audit atomically. Finalized
  reports cannot be changed by a later decision or asynchronous AI retry.
- `ai_analyses` stores immutable server-written, user/photo-bound inference
  receipts. Existing reports retain their original values, tagged
  `legacy_unverified`; new reports distinguish manual, pending and server AI.
- Photo paths are content-addressed, immutable, and checked on interrupted retry.
  The current FastAPI model, `/predict` contract, flood rules and geofence
  calculation were not changed.

## Offline compatibility and recovery

The existing `agriguard-offline` version-1 database and stores are retained.
Additional metadata is optional; no queue rewrite or destructive migration occurs.

- Only the server-confirmed current account is synchronized, rechecked before
  every upload. Account changes cancel the flight; logout clears only the current
  identity pointer, never queued reports/photos.
- HTTP 400/403/409/422 entries remain stored and require explicit retry via the
  existing sync button. Network/401/429/5xx failures remain retryable.
- Success requires a matching report ID, account and idempotency-key acknowledgement.
  Successful rows are marked synced; blobs remain locally available for recovery.
- An AI outage retains both the durable pending server report and local queue
  entry. Retrying the same key fills the pending analysis without another report.
- Legacy AI numeric fields are not trusted. They trigger fresh server inference;
  legacy status-only manual entries are labeled manual. Invalid legacy mock-user
  IDs/non-UUID keys remain stored for operator-assisted recovery, never silently
  assigned to another real account or automatically renumbered.
- Field caches are now keyed by account. The old unscoped field cache is preserved
  but not reused across accounts. Open the scan page online once per account to
  populate its scoped cache before offline work.
- For blocked records, verify the owner, server acknowledgement and error before
  any manual repair. No automatic deletion/discard operation was added. Retained
  successful blobs can consume device storage; a reviewed retention/export policy
  is future work.
- IndexedDB photos remain unencrypted in the same browser profile. Account-scoped
  application queries prevent cross-account sync, but do not provide at-rest
  isolation from someone with direct access to that browser's storage/DevTools.

## Verification

Safe local commands:

```sh
npm run test:security
./node_modules/.bin/tsc --noEmit --incremental false
npm run build
git diff --check
```

Node tests use the existing TypeScript compiler and Node's test runner, with
stubbed Supabase/storage/network boundaries. They do not send SMS, access production
or prove deployed RLS. SQL checks are in `supabase/tests/phase0a_security.sql` and
require an isolated test database plus the explicit session setting
`agriguard.local_security_tests=enabled`. They create synthetic fixtures inside a
transaction and end with `ROLLBACK`.

Database execution, real SMS delivery, deployed grants/policies, browser IndexedDB
persistence and end-to-end production behavior must remain **UNVERIFIED** until
their respective infrastructure checks are performed. Use the repository's Node
24 engine for release validation; local toolchain differences must be recorded.

### Local results

- `npm run test:security`: **27 passed**, using synthetic fixtures and stubbed
  service boundaries (no real SMS, database, or AI inference requests).
- TypeScript `--noEmit --incremental false`: passed.
- Next.js production build: passed; expected `DYNAMIC_SERVER_USAGE` diagnostics
  identify cookie-dependent routes. No deployment was performed.
- `git diff --check`: passed.
- Local toolchain: Node **26.8.1**, npm **11.19.0**. Release-engine Node 24 checks
  and the SQL/browser/provider integration checks remain unverified.
- No `psql` or Docker executable was available. The SQL suite was **not executed**;
  source review and TypeScript tests are not substitutes for database enforcement.
