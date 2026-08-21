# Editing Meet Scheduler on your Windows PC

## Three copies of the code (important)

| Copy | Where | Who updates it |
|------|--------|----------------|
| **1. Cloud Agent** | Cursor’s server (the workspace in the agent chat) | The agent, or you if you edit there |
| **2. Your PC** | Your `git clone` folder on Windows | `git pull` and your own edits |
| **3. Live website** | Your host via FileZilla | FTP upload from your PC |

These are **not the same folder**. Editing in the agent chat does **not** change files on your PC or your localhost until code is **pushed to GitHub** and you **`git pull`** on Windows (or you edit the Windows files directly).

## Two different “operations” files

| File | What it is |
|------|------------|
| `meet/docs/OPERATIONS.md` | **The** operations guide (edit this file only) |
| `meet/operations.php` | Thin viewer: shows that Markdown in the browser |
| `meet/lib/Parsedown.php` | Helper that turns Markdown into HTML |

`git pull` may have downloaded `docs/OPERATIONS.md` but not `operations.php` if you are on an old commit or the wrong branch. You need branch `cursor/meet-scheduler-ca2b` and a recent pull.

## One-time: get fully up to date on Windows

Open **Git Bash**, go to your clone (change the path to yours):

```bash
cd /c/Users/YOURNAME/path/to/SIG-Stakeholder-Database
git fetch
git checkout cursor/meet-scheduler-ca2b
git pull
```

Check these exist:

```bash
ls meet/operations.php meet/favicon.svg meet/docs/OPERATIONS.md
cat meet/VERSION
```

You should see build **1.6.12** (or newer) in `VERSION`.

## Edit on your PC (so localhost F5 works)

1. In Cursor, open the folder **`SIG-Stakeholder-Database`** on your **Windows disk** (File → Open Folder), not only the Cloud Agent chat workspace.
2. Edit e.g. `meet/index.php` and **Save**.
3. Refresh the browser that points at **that same folder** (your local PHP server / XAMPP / etc.).

If localhost still shows old text, your web server is serving a **different directory** — find which folder Apache/PHP uses and edit that one, or copy files there.

## After you edit: save to Git (copy these commands)

In Git Bash, in your clone folder:

```bash
cd /c/Users/YOURNAME/path/to/SIG-Stakeholder-Database
git status
```

You should see `meet/index.php` listed as modified.

```bash
git add meet/index.php
git commit -m "Wording change on home page"
git push
```

- **`git status`** — what changed  
- **`git add`** — stage your file for commit  
- **`git commit`** — save a snapshot locally  
- **`git push`** — upload to GitHub (so the agent and other machines can pull it)

## Deploy to your live server

After commit (optional) or at least after saving locally:

1. FileZilla: **F5** on local `meet` folder  
2. Upload changed files under `meet/`  
3. Hard refresh the live site (Ctrl+F5)

## If you edited in the Cloud Agent chat instead

Those edits live on Cursor’s server until pushed. Ask the agent to commit and push, **or** ignore that copy and edit `meet/index.php` on your Windows clone as above.
