# Where did `git clone` put the files?

When you run `git clone` it creates a **new folder** with the repository name, inside whatever folder you were in at the time.

Example — if you opened Command Prompt and ran:

```bat
cd %USERPROFILE%\Documents
git clone https://github.com/51monharr15/SIG-Stakeholder-Database.git
```

The files are here:

```text
C:\Users\YOURNAME\Documents\SIG-Stakeholder-Database\
```

The Meet Scheduler app is in:

```text
...\SIG-Stakeholder-Database\meet\
```

## How to find it

### Command Prompt / PowerShell

```bat
cd %USERPROFILE%
dir /s /b SIG-Stakeholder-Database 2>nul
```

Or search in File Explorer for `SIG-Stakeholder-Database`.

### GitHub Desktop

After cloning, click **Repository → Show in Explorer** (or **Show in Finder** on Mac).

## Get the latest Meet Scheduler code

The scheduler may be on a branch until merged. To switch branch:

```bat
cd path\to\SIG-Stakeholder-Database
git fetch
git checkout cursor/meet-scheduler-ca2b
git pull
```

After the pull request is merged into `main`, you can stay on `main`:

```bat
git checkout main
git pull
```

## What to upload to your web server

Upload the **`meet`** folder contents (see [UPDATING.md](UPDATING.md)). Do **not** overwrite `meet/data/` on the server.

## Useful git commands (minimal)

| Command | What it does |
|---------|----------------|
| `git status` | Shows changed files |
| `git pull` | Download latest from GitHub |
| `git log --oneline -5` | Last 5 commits |

You do not need to commit or push unless you are changing code yourself.
