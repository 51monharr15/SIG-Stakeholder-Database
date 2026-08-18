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

## Files in the tree — where things live

In Cursor’s file explorer, expand **`meet`** itself (the folder), not only `assets`, `data`, and `lib`.

Several important files sit **directly under `meet/`** (same level as `index.php`):

| File | What it is |
|------|------------|
| `index.php` | Home page (“Find my meetings”, create meeting) |
| `operations.php` | Operations guide (footer link) |
| `favicon.svg` | Browser tab icon |
| `api.php` | Server API |
| `VERSION` | Build number in footer |

**If you do not see `operations.php` or `favicon.svg`:** your local clone is probably behind. Run `git pull` on branch `cursor/meet-scheduler-ca2b` (see above). They were added in recent builds.

UI wording on the **home page** (e.g. “registered identity”) is in **`meet/index.php`**.

Most in-app labels and meeting UI text are in **`meet/assets/js/app.js`**.

## Editing files yourself (not read-only)

Your Git clone on your PC is a **normal editable workspace** — the same files the Cloud Agent changes on GitHub.

**Typical loop:**

1. **Pull** latest: `git pull` (so you and the agent start from the same code).
2. **Edit** files in Cursor (or any editor).
3. **Commit and push** your changes:
   ```bat
   git add meet/index.php
   git commit -m "Tweak Find my meetings wording"
   git push
   ```
4. On another machine (or before FTP): `git pull` again.
5. **FTP** the changed files under `meet/` to the server (F5 refresh in FileZilla first).

You are **not** limited to pull-only. **Push** sends your edits to GitHub; **pull** brings down the agent’s (or your other machine’s) edits. If you both edit the same file, Git may ask you to pull and merge first — pull, resolve any conflict, then push.

**Deploy path:** edit locally → commit → push → pull on deploy PC → FTP `meet/` → hard refresh browser.

## Useful git commands (minimal)

| Command | What it does |
|---------|----------------|
| `git status` | Shows changed files |
| `git pull` | Download latest from GitHub |
| `git add <file>` | Stage your edits |
| `git commit -m "message"` | Save a snapshot locally |
| `git push` | Upload your commits to GitHub |
| `git log --oneline -5` | Last 5 commits |
