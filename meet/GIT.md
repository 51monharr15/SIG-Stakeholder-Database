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

The scheduler is on branch `cursor/meet-scheduler-ca2b` until merged:

```bat
cd path\to\SIG-Stakeholder-Database
git fetch
git checkout cursor/meet-scheduler-ca2b
git pull
```

After merge to `main`:

```bat
git checkout main
git pull
```

## Multiple working copies (alpha / beta)

`git pull` only updates **the folder you are in**. Each clone is independent.

Example — two test folders on your PC:

```bat
cd %USERPROFILE%\Documents
git clone -b cursor/meet-scheduler-ca2b https://github.com/51monharr15/SIG-Stakeholder-Database.git meet-alpha
git clone -b cursor/meet-scheduler-ca2b https://github.com/51monharr15/SIG-Stakeholder-Database.git meet-beta
```

- Work in `meet-alpha`, run `git pull` there as often as you like.
- When stable, `cd` to `meet-beta`, run `git pull` once — that copy jumps to whatever is latest on the branch (e.g. build 1.5.9 → 1.6.2).
- You do **not** need to stay in one directory name; only the **current working directory** matters for `git pull`.

`(cd ~/SIG-Stakeholder-Database && git pull)` in Git Bash runs pull in that path and returns to wherever you were — useful from any directory.

## What to upload to your web server

Upload the **`meet`** folder (see [UPDATING.md](UPDATING.md)).

## Useful git commands (minimal)

| Command | What it does |
|---------|----------------|
| `git status` | Shows changed files |
| `git pull` | Download latest from GitHub |
| `git log --oneline -5` | Last 5 commits |

You do not need to commit or push unless you are changing code yourself.
