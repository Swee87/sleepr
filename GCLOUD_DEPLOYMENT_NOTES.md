# Google Cloud Setup & Deployment Notes — Sleepr

A full record of everything done to get the sleepr microservices app onto Google Cloud, in order, including the problems hit and how they were fixed. Nothing omitted.

## 1. Installing the Google Cloud CLI

The Google Cloud SDK was installed on Windows via the official installer (`GoogleCloudSDKInstaller.exe`). It installs to:

```
C:\Users\HP\AppData\Local\Google\Cloud SDK\google-cloud-sdk
```

The installer adds `...\google-cloud-sdk\bin` to the **User PATH** environment variable automatically.

### Problem: `gcloud` not recognized

Any terminal window (PowerShell or `cmd.exe`) that was already open **before** the installer ran does not pick up the new PATH — it keeps the environment it started with. Running `gcloud` in an old window fails with:

```
gcloud : The term 'gcloud' is not recognized...
```

**Fix:** either close and reopen the terminal, or refresh PATH in the current session without closing it:

```powershell
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
```

This exact problem came up **twice** in this setup — once for plain `gcloud` commands, and again later for `docker` when it needed to find the `docker-credential-gcloud` helper binary that also lives in that same `bin` folder. Same cause, same fix both times.

## 2. Authenticating

Confirmed already authenticated via:

```
gcloud auth list
```

```
Credentialed Accounts
ACTIVE: *
ACCOUNT: elijahog99@gmail.com
```

### `gcloud auth login` vs `gcloud auth application-default login`

These are two different things and only one was needed here:

- **`gcloud auth login`** — authenticates the `gcloud` CLI itself. This is what lets `gcloud run deploy`, `gcloud container clusters ...`, `gcloud artifacts ...`, `kubectl` (via gcloud), etc. work. **This is the one in use.**
- **`gcloud auth application-default login`** — sets up separate "Application Default Credentials" used by client libraries running *inside app code* (e.g. a Node script importing `@google-cloud/storage`). **Not needed here** — the sleepr codebase doesn't use any `@google-cloud/*` client libraries; notifications talks to Brevo's HTTP API and payments talks to Paystack's HTTP API, both via plain `axios`/`HttpModule`.

## 3. Picking a Google Cloud project

### Problem: project-creation quota exceeded

Ran `gcloud init` → chose "Create a new project" → entered `sleepr-app-2026` as the project ID → failed:

```
The project cannot be created because you have exceeded your allotted project quota.
```

The account already had 12 existing projects, which hit the account's project-creation limit.

### Attempted fix: delete an unused project

Listed all projects with `gcloud projects list`. Found 6 projects all named **"My First Project"**, all created within a few hours of each other on 2025-08-06 — clearly unused defaults. Deleted one:

```
gcloud projects delete hopeful-adapter-468209-c9 --quiet
```

Output confirmed a **30-day recovery window** (undelete is possible until then):

```
gcloud projects undelete hopeful-adapter-468209-c9
```

### Important quirk discovered

Deleting a project does **not** immediately free up quota. Google Cloud counts soft-deleted (pending-deletion) projects against your quota for the entire 30-day recovery window. Retrying project creation right after the delete failed with the exact same quota error.

### Actual resolution: reuse an existing project

Rather than wait ~30 days, decided to reuse an existing project instead of creating a new one.

- First set active project to `secret-455221`:
  ```
  gcloud config set project secret-455221
  ```
- Checked billing status on it:
  ```
  gcloud beta billing projects describe secret-455221
  ```
  Result: `billingEnabled: false`. Most deployment services (Cloud Run, GKE, Compute Engine) require billing, so this project wasn't usable as-is.

- Billing was then manually enabled on a different project, **`coop-457500`** ("COOP"), via the Cloud Console. Confirmed via:
  ```
  gcloud beta billing projects describe coop-457500
  ```
  Result: `billingEnabled: true`, tied to billing account `01F2EE-09D385-4759FC`.

- Switched the active project to it:
  ```
  gcloud config set project coop-457500
  ```

### Safety check before using `coop-457500`

Before deploying anything into it, checked what already existed in that project so as not to collide with unrelated work:

```
gcloud services list --enabled
gcloud container clusters list
gcloud run services list --platform=managed
gcloud compute instances list
```

Findings: `coop-457500` already had BigQuery/Analytics/Data-related APIs enabled (looks like an existing data/analytics workload), but **zero** usage of Compute Engine, GKE, or Cloud Run, and Artifact Registry was enabled but empty at the time. Conclusion: safe to deploy sleepr into this project without disturbing whatever COOP's existing purpose is.

**Current gcloud config as of writing:**
```
account = elijahog99@gmail.com
project = coop-457500
```

## 4. Artifact Registry (Docker image storage)

Four Docker-format repositories already existed in `coop-457500`, region `us-east4` (created independently, not by me):

| Repository | Format | Location |
|---|---|---|
| `auth` | DOCKER | us-east4 |
| `notifications` | DOCKER | us-east4 |
| `payment` | DOCKER | us-east4 |
| `reservations` | DOCKER | us-east4 |

Listed with:
```
gcloud artifacts repositories list
```
(optionally scoped: `gcloud artifacts repositories list --location=us-east4`)

**Naming inconsistency flagged:** the local app folder is `apps/payments` (plural), but the Artifact Registry repo is named `payment` (singular). This is not a bug, just something to stay consistent about — every payments-related build/tag/push command must target `.../payment/...`, not `.../payments/...`.

## 5. Authorizing Docker to push to Artifact Registry

Docker doesn't know how to authenticate to a Google-hosted registry on its own. `gcloud auth configure-docker` registers a credential helper in `~/.docker/config.json` that shells out to `gcloud` for credentials automatically.

```
gcloud auth configure-docker us-east4-docker.pkg.dev
```

### Problem hit: line-continuation syntax

The command was initially pasted with a Unix-style trailing backslash (`\`) to split it across two lines, e.g.:
```
gcloud auth configure-docker \
    us-east4-docker.pkg.dev
```
This works in bash but **not** in `cmd.exe`, where `\` is just a literal character, not a line continuation. It broke the command into two separate (broken) commands. Fix: run it on a single line (or use `^` for continuation in `cmd.exe`, or a backtick `` ` `` in PowerShell).

### Problem hit: `docker-credential-gcloud` not found

After configuring, the first `docker push` failed with:
```
error getting credentials - err: exec: "docker-credential-gcloud": executable file not found in %PATH%
```
Cause: same PATH staleness issue as Section 1 — the terminal window running `docker push` was opened before the Cloud SDK's `bin` folder (which contains `docker-credential-gcloud.cmd`) was added to PATH. Fix: reopen the terminal (or refresh `$env:Path` as shown above).

## 6. Building, tagging, and pushing images

Each service's `Dockerfile` is a multi-stage build (`development` → `production`) that expects the **build context to be the monorepo root**, not the individual app folder — it does `COPY . .` and later runs the built output from `dist/apps/<service>/main.js`. This means `-f <path-to-Dockerfile>` must point into `apps/<service>/Dockerfile`, but the trailing context path argument must be the repo root.

### Problem hit: `-f` given a directory instead of a file

First attempt (from inside `apps/reservations`):
```
docker build -t reservations -f . ../../
```
This passes `.` (a directory) as the Dockerfile path, which is invalid — `-f` needs the actual file. Error:
```
failed to read dockerfile: read ...: is a directory
```
**Fix** — run from the repo root and point `-f` at the actual Dockerfile:
```powershell
cd C:\Users\HP\Desktop\Nestjs\sleepr
docker build -t reservations -f apps/reservations/Dockerfile .
```
(equivalently, from inside `apps/reservations`: `docker build -t reservations -f Dockerfile ../../`)

### Problem hit: `docker image push` with no argument

```
docker image push
docker: 'docker image push' requires 1 argument
```
Needs the exact name+tag you built/tagged, e.g.:
```
docker image push us-east4-docker.pkg.dev/coop-457500/reservations/production
```

### Full working sequence per service

Run from the repo root (`C:\Users\HP\Desktop\Nestjs\sleepr`):

**Reservations** (done, pushed successfully — 9 layers pushed, digest `sha256:75b06f3...`):
```powershell
docker build -t reservations -f apps/reservations/Dockerfile .
docker tag reservations us-east4-docker.pkg.dev/coop-457500/reservations/production
docker push us-east4-docker.pkg.dev/coop-457500/reservations/production
```

**Auth:**
```powershell
docker build -t auth -f apps/auth/Dockerfile .
docker tag auth us-east4-docker.pkg.dev/coop-457500/auth/production
docker push us-east4-docker.pkg.dev/coop-457500/auth/production
```

**Notifications:**
```powershell
docker build -t notifications -f apps/notifications/Dockerfile .
docker tag notifications us-east4-docker.pkg.dev/coop-457500/notifications/production
docker push us-east4-docker.pkg.dev/coop-457500/notifications/production
```

**Payments** (note: repo name is `payment`, singular):
```powershell
docker build -t payments -f apps/payments/Dockerfile .
docker tag payments us-east4-docker.pkg.dev/coop-457500/payment/production
docker push us-east4-docker.pkg.dev/coop-457500/payment/production
```

> Note: no explicit `:TAG` was given on any tag/push command, so Docker defaults to `:latest`. The word `production` here is being used as the **image name** within each repo (i.e. `<repo>/production:latest`), not as a version tag. That's a valid pattern but worth keeping consistent across all four services rather than mixing naming styles later.

## 7. Dockerfile rewrite: narrower `COPY`s + `nest-cli.json` fix

After the initial reservations push succeeded (Section 6), the `apps/reservations/Dockerfile` was independently rewritten to copy only what's needed for that service (`tsconfig.json`, `apps/reservations`, `libs`) instead of the whole repo via `COPY . .` — a build-cache optimization. This introduced two new problems, both fixed:

### Problem: typo in the COPY path

```
COPY app/reservations ./apps/reservations
```
`app/reservations` (singular) doesn't exist — the real directory is `apps/reservations` (plural). Build failed with:
```
failed to compute cache key: ... "/app/reservations": not found
```
**Fix:** corrected to `COPY apps/reservations ./apps/reservations`.

### Problem: `nest-cli.json` never copied into the image

Even after the typo fix, `RUN npm run build` (i.e. `nest build`) failed with TypeScript errors from a stale test file:
```
apps/reservations/test/app.e2e-spec.ts:4:36 - error TS2307: Cannot find module './../src/reservations.module'
```
Root cause: the Dockerfile copies `tsconfig.json` but never `nest-cli.json`. Without `nest-cli.json`, `nest build` doesn't know it's a monorepo and doesn't pick up `apps/reservations/tsconfig.app.json` (which correctly excludes `test/**` and `*.spec.ts`). Instead it fell back to the bare root `tsconfig.json`, which has no exclusions, so it swept in `apps/reservations/test/app.e2e-spec.ts` — a leftover test file from before the codebase was renamed from plural (`reservations`) to singular (`reservation`) naming, so it references a module that no longer exists.

**Fix:** added `COPY nest-cli.json nest-cli.json` to the Dockerfile, right alongside the `tsconfig.json` copy. With it present, `nest build` correctly uses each app's `tsconfig.app.json` and the stale test file is excluded from the build entirely.

Final working `apps/reservations/Dockerfile` development stage:
```dockerfile
FROM node:22-alpine AS development
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install --legacy-peer-deps
COPY tsconfig.json tsconfig.json
COPY nest-cli.json nest-cli.json
COPY apps/reservations ./apps/reservations
COPY libs libs
RUN npm run build
CMD ["npm", "run", "start:dev"]
```

### Applied the same corrected pattern to auth, notifications, and payments

The `auth`, `notifications`, and `payments` Dockerfiles originally used the simple `COPY . .` approach (which worked fine, no bugs) but were rewritten to match reservations' narrower, per-service pattern for consistency — each now copies `tsconfig.json`, `nest-cli.json`, its own `apps/<service>` folder, and `libs`, then runs `npm run build <service>`. Checked `.dockerignore` (`node_modules`, `dist`, `.git`, `*.md`) — none of it conflicts with these copies. All three apps' `tsconfig.app.json` files were confirmed to already exclude `test/**` and `*.spec.ts`, same as reservations, so none of them are exposed to the same stale-test-file trap.

Note: a separate, pre-existing bug was found but **not** fixed — `apps/reservations/test/app.e2e-spec.ts` still imports a nonexistent `reservations.module` (plural) instead of the real `reservation.module` (singular). It doesn't affect the Docker build (excluded via `tsconfig.app.json`), but it would fail if `npm run test:e2e` is ever run for reservations outside Docker.

## 8. The rebuild/push/redeploy loop (important for ongoing work)

Pushing an image to Artifact Registry does **not** automatically update anything already running. This is a fully manual pipeline right now — there is no CI/CD wired up yet. Every time code changes in any service, all of these steps must be repeated for that service:

1. **Rebuild** the image — picks up the new code:
   ```powershell
   docker build -t auth -f apps/auth/Dockerfile .
   ```
2. **Tag** it again (reusing `production`, or incrementing a version tag):
   ```powershell
   docker tag auth us-east4-docker.pkg.dev/coop-457500/auth/production
   ```
3. **Push** it to Artifact Registry — this only updates the image sitting in the registry, nothing live:
   ```powershell
   docker push us-east4-docker.pkg.dev/coop-457500/auth/production
   ```
4. **Redeploy** — whatever is actually running (once a deployment target is chosen and something is live) is pinned to whatever image tag it was told to run at deploy time. Pushing a new `production` tag does not make a running Cloud Run service or GKE deployment pick it up automatically. That requires an explicit redeploy/rollout step, e.g.:
   ```powershell
   gcloud run deploy auth --image us-east4-docker.pkg.dev/coop-457500/auth/production   # if Cloud Run
   # or a `kubectl rollout restart` / re-apply, if GKE
   ```

Doing this by hand for 4 services on every change will get tedious fast. Once a deployment target is chosen and each service has been deployed at least once, the natural next step is wiring up **Cloud Build** (or another CI) so a `git push` triggers build → push → deploy automatically, instead of running these steps manually each time.

## 9. Per-service `package.json` for leaner production images

Until now, every Dockerfile's **production** stage installed from the root `package.json` — meaning e.g. the `auth` image was carrying `bullmq`, `ioredis`, `@nestjs/bullmq` and every other dependency belonging to the other three services, even though it never uses them. Decided to give each service its own minimal `package.json`, but scoped narrowly:

- **Chosen approach**: "Docker-only" minimal split — each service gets a lean `package.json` with just its own runtime dependencies, used only in the Dockerfile's **production** stage. Local dev (`nest start`, npm scripts, tsconfig path aliases) stays untouched.
- **Explicitly ruled out**: a full pnpm-workspace split (making each app a truly independent workspace package with `@app/common` as a real `workspace:*` dependency) — bigger change, more risk, not needed just to shrink image size.

Created `apps/{auth,notifications,payments,reservations}/package.json`, each built by tracing every `import` statement across that app's `src/` **and** the shared `libs/common` code it pulls in via the `@app/common` path alias (since that code compiles directly into the app's bundle and its dependencies must be present at runtime too). Result:

- `auth` — `@nestjs/jwt`, `@nestjs/passport`, `passport`, `passport-jwt`, `passport-local`, `bcryptjs`, `cookie-parser`, `express`, plus the shared baseline (`@nestjs/common/core/config/platform-express`, `mongoose`, `class-validator`, `class-transformer`, `joi`, `nestjs-pino`, `pino-http`, `pino-pretty`, `reflect-metadata`, `rxjs`)
- `notifications` — `@nestjs/axios`, `axios`, plus the shared baseline
- `payments` — `@nestjs/axios`, `axios`, `@nestjs/bullmq`, `bullmq`, `ioredis`, `@nestjs/mongoose`, `mongoose`, `express`, plus the shared baseline
- `reservations` — `@nestjs/mapped-types`, `@nestjs/mongoose`, `mongoose`, `cookie-parser`, plus the shared baseline

Updated all four Dockerfiles' **production stage only**:
```dockerfile
COPY apps/<service>/package.json ./package.json
RUN npm install --omit=dev --legacy-peer-deps
```
(previously `COPY package*.json ./`, which pulled in the root file). The **development/build stage was left untouched** — it still installs from the root `package.json` since `nest build` needs the full monorepo toolchain — but since multi-stage builds discard that stage after copying out `dist/`, only the lean per-service dependency set ends up in what actually ships.

Verified the glob `package*.json` in each Dockerfile's development stage still resolves against the **build context root**, not the per-app folder, so it wasn't accidentally picking up the new nested `apps/<service>/package.json` files — confirmed no collision.

### Side effect: `.gitignore` fix

`pnpm-workspace.yaml` already declared `apps/*` as workspace packages (pre-existing, from before this session). Now that real `package.json` files exist under `apps/*`, `pnpm install` at the repo root registers them as workspace members and creates `node_modules` folders inside each `apps/<service>` directory. The old `.gitignore` had:
```
/node_modules
```
anchored with a leading `/`, meaning it only ignored the **root** `node_modules` — the new nested ones under `apps/*/node_modules` would have been tracked by git. Fixed by removing the anchor:
```
node_modules
```
now matches at any depth.

## 10. `pnpm install`: antivirus file-locking saga

Running `pnpm install` after adding the new per-service `package.json` files (Section 9) triggered a long series of `EPERM` errors, one per file, e.g.:
```
EPERM: operation not permitted, open 'C:\Users\HP\Desktop\Nestjs\sleepr\apps\notifications\node_modules\.bin\pino-pretty.ps1'
```
then later, after retries, a *different* file each time (`ts-script.ps1`, `node-gyp-build-optional-packages.ps1/.CMD`, `napi-postinstall.CMD`, `pino.ps1`, `uuid.ps1`, `webpack.ps1/.CMD`, `schematics.ps1`, ...) — confirming this wasn't a one-off fluke tied to a single file, but something locking **every newly-written `.bin` shim script** the instant pnpm created it.

### Investigation

- Checked for leftover Node dev-server processes that might be holding a file lock (`nest start --watch` etc.) — found 8 running Node processes, but all were unrelated `chrome-devtools-mcp` helper processes, not sleepr dev servers. Ruled out.
- Checked whether the project's Desktop folder was OneDrive-redirected (Known Folder Move), which commonly causes exactly this kind of lock — confirmed it was **not** a reparse point, so OneDrive KFM was ruled out too.
- Tried the standard Windows Defender fix:
  ```powershell
  Add-MpPreference -ExclusionPath "C:\Users\HP\Desktop\Nestjs\sleepr"
  ```
  Failed with `0x800106ba`. Checked `root\SecurityCenter2` via CIM and found **two** registered AV products: Windows Defender (in a passive/limited role) and a third-party AV, **Reason Cybersecurity** — which explained why the Defender-specific cmdlet couldn't apply an exclusion; Defender wasn't the active real-time scanner.

### Resolution

No verified CLI/exclusion syntax was available for Reason Cybersecurity specifically (didn't want to fabricate a command for security software), so used a brute-force retry loop instead — since each failure was a momentary per-file lock and pnpm made monotonic forward progress (a different, later file each time), repeated retries eventually got all the way through:
```powershell
for ($i = 1; $i -le 30; $i++) {
    Write-Host "Attempt $i..."
    pnpm install
    if ($LASTEXITCODE -eq 0) { Write-Host "Success!"; break }
    Start-Sleep -Seconds 1
}
```
Took roughly 20 total attempts across a few rounds of this loop before finishing clean:
```
Done in 6.2s using pnpm v10.32.1
Success!
```
`pnpm install` now completes successfully, recognizing all 5 workspace projects (root + `auth`, `notifications`, `payments`, `reservations`).

**Not resolved**: Reason Cybersecurity's real-time protection is still active and will likely cause the same slow grind on any future `pnpm install` that needs to create new `.bin` shims (e.g. after adding a new dependency). The clean long-term fix is pausing/excluding via Reason Cybersecurity's own UI (not Defender's), which wasn't completed — the user wasn't sure of its exact menu layout and the retry-loop workaround got the immediate task done instead. Also worth independently confirming Reason Cybersecurity is something intentionally installed, since it's a lesser-known AV sometimes bundled silently with other software.

## 11. `cloudbuild.yaml`: fixed and completed for all four services

The existing `cloudbuild.yaml` only covered `reservations`, and had two real bugs:

1. **Invalid YAML formatting** — `-name:"gcr.io/cloud-builders/docker"` was missing the required space after `-` and after `:` (needs to be `- name: "..."`). Would likely have been rejected by Cloud Build's parser outright.
2. **Wrong `docker push` syntax** — the push step had `args: ["push", "-t", "...:production"]`. `docker push` doesn't take a `-t` flag at all (that's a `build`/`tag` flag); this would have failed immediately.

Rewrote the file to fix both bugs and add build+push steps for `auth`, `notifications`, and `payments` (using the same Artifact Registry paths already established manually — `payment` singular for the payments repo). The four builds run in parallel (`waitFor: ['-']` on each `build-*` step), with each `push-*` step waiting only on its own build, rather than running all 8 steps strictly sequentially.

**Not yet done**: the Cloud Build API isn't enabled on `coop-457500` yet (checked via `gcloud services list --enabled` — only `artifactregistry.googleapis.com` shows up). Needs:
```powershell
gcloud services enable cloudbuild.googleapis.com
```
before `gcloud builds submit --config=cloudbuild.yaml .` can actually run. Not yet triggered — file has been fixed/completed but not executed against real Cloud Build.

## 12. What's still undecided / not done yet

- **Deployment target** — not yet chosen. Options discussed: Cloud Run (simpler, scales to zero, no cluster) vs GKE (matches the original reference repo's k8s manifests, more control, more ongoing cost/complexity). No decision made yet.
- **Auth, Notifications, Payments images** — build/tag/push commands given above but not yet confirmed run with the new per-service `package.json` production stage (Reservations is the only one confirmed pushed so far, and that was before the package.json split — worth re-pushing it too for consistency).
- **Payment vs payments naming** — not yet resolved; currently living with the Artifact Registry repo named `payment` while the codebase folder is `payments`.
- **Environment variables / secrets for deployed services** (Mongo URI, JWT secret, Paystack keys, Brevo API key, Redis connection) — not yet wired into any deployment config (Cloud Run env vars / k8s secrets, whichever target gets picked).
- **CI/CD** — `cloudbuild.yaml` is now fixed and covers all four services, but the Cloud Build API isn't enabled yet and the config has never actually been run (`gcloud builds submit`). Nothing automated yet — every push so far has been manual `docker build`/`tag`/`push`.
- **Stale reservations e2e test** (`apps/reservations/test/app.e2e-spec.ts`) — still references the old plural `reservations.module`; not fixed yet, doesn't block Docker builds but will fail if run directly.
- **Reason Cybersecurity exclusion** — not configured; future `pnpm install` runs that create new `.bin` shims may hit the same slow EPERM-retry grind described in Section 10 until this is addressed properly.
