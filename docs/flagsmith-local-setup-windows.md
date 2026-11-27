# Flagsmith Local Setup (Windows)

Use this guide to verify the local Flagsmith setup for the Cancel-Flow Experiment.

**Current status (27 Nov 2026):** the user reports local setup is complete and the `cancel-flow` project, `cancel_flow` flag, and `control`/`pause`/`discount` variants already exist. This guide is now for verification and recovery. Do not recreate or alter existing Flagsmith resources. The individual live dashboard/CLI checks below were not re-run in this review.

## 1. Prerequisites

- Docker Desktop installed and running.
- Flagsmith CLI installed.
- Windows CMD or PowerShell available.

## 2. Start Flagsmith with Docker Compose

Open CMD or PowerShell and create a folder for the local Flagsmith setup:

```bat
mkdir D:\FlagSmith-Hackathon
cd /d D:\FlagSmith-Hackathon
```

Download the official Docker Compose file:

```bat
curl -o docker-compose.yml https://raw.githubusercontent.com/Flagsmith/flagsmith/main/docker-compose.yml
```

Start Flagsmith:

```bat
docker compose -f docker-compose.yml up -d
```

Check the containers:

```bat
docker compose ps
```

Open the dashboard:

```text
http://localhost:8000
```

On the first launch, use **Get Started** on the Welcome screen to create the admin account and organisation.

> Keep the Docker Compose file and its data volumes. Use `docker compose down` to stop the services without deleting the stored data. Do not use `docker compose down -v` unless you intentionally want to delete the local data.

## 3. Verify the existing project and warehouse

1. Sign in at `http://localhost:8000`.
2. Open the existing `cancel-flow` project; do not create a duplicate.
3. Open the environment already used by the application; do not create a replacement environment for this check.
4. Open **Environment Settings → Warehouse**.
5. Confirm that the existing Flagsmith database warehouse connection shows **Connected**. Do not change its configuration as part of this verification.
6. If ingestion needs a smoke check, use a unique synthetic identity and an approved test event; do not reuse test identities in an experiment.

For this project, the local URLs are:

```dotenv
FLAGSMITH_SDK_API_URL=http://localhost:8000/api/v1/
FLAGSMITH_EVENTS_URL=http://localhost:8000/api/
```

## 4. Install and connect the Flagsmith CLI

On Windows, install the CLI from PowerShell:

```powershell
irm https://raw.githubusercontent.com/Flagsmith/flagsmith-cli/main/install.ps1 | iex
```

Open a new terminal and check the version:

```bat
flagsmith --version
```

Create an **Organisation Master API Key** in the local Flagsmith dashboard. Do not use the server-side environment key for CLI authentication.

In Windows CMD, set the local API URL and master key. Replace the placeholder with your own key:

```bat
set FLAGSMITH_API_URL=http://localhost:8000
set FLAGSMITH_API_KEY_localhost_8000=PASTE_MASTER_API_KEY_HERE
```

Check the CLI configuration:

```bat
flagsmith config
```

The API should show `http://localhost:8000`.

Verify that the CLI can see the project:

```bat
flagsmith project list
```

Expected project:

```text
cancel-flow
```

> `set` applies only to the current CMD window. To persist these values for future terminals, use `setx` and then open a new terminal:
>
> ```bat
> setx FLAGSMITH_API_URL http://localhost:8000
> setx FLAGSMITH_API_KEY_localhost_8000 PASTE_MASTER_API_KEY_HERE
> ```
>
> Never commit or share the Master API Key.

## 5. Bind the CLI to the project environment

List the project's environments:

```bat
flagsmith environment list --project cancel-flow
```

Copy the environment key from the output, then run:

```bat
flagsmith init --project cancel-flow --environment PASTE_ENVIRONMENT_KEY_HERE
```

Check the configuration:

```bat
flagsmith config
```

The project and environment should now be selected for this repository.

## 6. Verify the existing experiment flag

The `cancel_flow` flag and its variants already exist in the configured environment. Inspect them with:

```bat
flagsmith feature get cancel_flow --json
flagsmith flag list
```

Expected configuration:

- Flag: `cancel_flow`
- Default value: `control`
- Variants: `pause` and `discount`
- Variant keys: `pause` and `discount`

If the project or flag is missing from the selected environment, stop and verify the CLI environment selection with the project owner. Do not recreate it.

## 7. Configure the application environment file

In the application repository, create `.env`:

```dotenv
FLAGSMITH_SDK_API_URL=http://localhost:8000/api/v1/
FLAGSMITH_EVENTS_URL=http://localhost:8000/api/
FLAGSMITH_SERVER_KEY=PASTE_SERVER_SIDE_ENVIRONMENT_KEY_HERE
```

Use the **server-side environment key** from the Flagsmith environment settings. Do not put the Organisation Master API Key in this file.

Create `.env.example` with placeholders:

```dotenv
FLAGSMITH_SDK_API_URL=http://localhost:8000/api/v1/
FLAGSMITH_EVENTS_URL=http://localhost:8000/api/
FLAGSMITH_SERVER_KEY=your-server-side-environment-key
```

Add the following to `.gitignore`:

```gitignore
# Secrets
.env
.env.*
!.env.example

# Node.js
node_modules/
dist/

# OS
.DS_Store
Thumbs.db
```

Before committing, check:

```bat
git status
```

Make sure `.env` is not listed.

## 8. Useful Docker commands

Run these from the folder containing `docker-compose.yml`.

```bat
docker compose ps
```

Show live logs:

```bat
docker compose logs -f
```

Show Flagsmith API logs:

```bat
docker compose logs -f flagsmith
```

Stop services without deleting data:

```bat
docker compose down
```

Start services again:

```bat
docker compose up -d
```

Delete containers and stored volumes (this removes local data):

```bat
docker compose down -v
```

## 9. Local setup completion checklist

The user reports that local setup is complete. Treat this list as a manual verification checklist; unmarked items were not independently verified in the latest review.

- [ ] Docker Desktop is running.
- [ ] Flagsmith containers are running.
- [ ] Dashboard opens at `http://localhost:8000`.
- [ ] Admin account and organisation are created.
- [ ] `cancel-flow` project and environment exist.
- [ ] Flagsmith database warehouse shows **Connected**.
- [ ] **Send your first event** succeeds.
- [ ] CLI points to `http://localhost:8000`.
- [ ] `flagsmith project list` shows `cancel-flow`.
- [ ] CLI is initialized for the correct environment.
- [ ] `cancel_flow` flag exists with `pause` and `discount` variants.
- [ ] Application `.env` contains the local SDK URLs and server-side environment key.
- [ ] `.env` is ignored by Git.

## Notes

- The first Docker Compose file used in the setup started the core Flagsmith services. The migration container may stop after completing successfully; that is expected.
- The exact number of running containers depends on the Compose file version. Check service health with `docker compose ps` rather than relying on a fixed container count.
- The local Flagsmith database warehouse is the warehouse mode selected for this project.
- Keep the Organisation Master API Key and server-side environment key private.
