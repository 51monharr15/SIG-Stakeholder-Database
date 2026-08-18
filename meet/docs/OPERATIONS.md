# Meet Scheduler — operations guide

How to install, deploy, and use the meet scheduler day to day.

## What this is

A self-contained PHP app under `meet/`. No MySQL. Each meeting is a plain-text file in `meet/data/meets/*.meet`.

## Install from Git

```bash
git clone https://github.com/51monharr15/SIG-Stakeholder-Database.git
cd SIG-Stakeholder-Database
git checkout cursor/meet-scheduler-ca2b   # until merged to main
```

Deploy **only** the `meet/` folder to your web server (e.g. `public_html/meet/`).

Requirements:

- PHP 8.1+
- Apache (or equivalent) with `meet/data/` writable by PHP
- Do **not** expose `meet/data/` over HTTP (`.htaccess` blocks it)

See also: [GIT.md](../GIT.md) · [UPDATING.md](../UPDATING.md) · [LOCAL-TEST.md](../LOCAL-TEST.md)

## Deploy updates

1. `git pull` in your local clone
2. Upload changed files under `meet/` via FTP/FileZilla (or git-ftp if configured)
3. **Never overwrite** `meet/data/` on the server — that is live meeting data
4. Hard-refresh the browser (Ctrl+F5); check footer **Build x.y.z**

## Typical workflow (in tab order)

### New meeting (no attendees yet)

1. **Set meeting options** — length, grid step, timezone, recurrence, meeting text
2. **Choose calendar times** — attendees sign in and mark when they are free
3. **Meeting availability & confirm** — see overlaps; organiser finalises time and location
4. **After meeting** — attachments, recordings, summaries

### Meeting already in use

1. **Add users & choose times** — sign in, register, mark availability
2. **Meeting availability & confirm**
3. **After meeting**
4. **Reset meeting options** (organisers only, far right)

## Roles

| Action | Anyone | Signed-in attendee | Organiser |
|--------|--------|-------------------|-----------|
| Mark availability on calendar | | ✓ | ✓ |
| Propose a location | ✓ | ✓ | ✓ |
| Mark location preferences (lozenges) | | ✓ | ✓ |
| Remove a proposed location | | | ✓ |
| Finalise time & location | | | ✓ |
| Change meeting options | | | ✓ |
| Edit agenda / decisions / notes | ✓ | ✓ | ✓ |

**Calendar** saves *your* availability only. It does **not** set the final meeting time.

**Final time:** Meeting availability → **Use as meeting start** → Locations & final time → choose **Final location** → **Finalise**.

**Location lozenges** = your preferences. **Final location** dropdown = organiser’s decision.

## Find my meetings (home page)

Expand **Find my meetings**, enter the **name and PIN** used when registering for a meeting. Works for any attendee with a PIN set.

## File format safety

Meetings use `@meet v1` text files. Delimiters include:

- `@@ section` headers (e.g. `@@ agenda`)
- `|` in pipe-separated rows (attendees, locations)
- `- ` bullet lines for agenda items

On save, the server **sanitises** user text so accidents are unlikely:

- Newlines in agenda/decisions items are collapsed to spaces
- Lines that look like `@@ section` are prefixed with `# `
- Pipe characters `|` in names/labels are replaced with `/`
- Notes are stored in a `@@ notes` section (not the header)

HTML in notes and meeting intros is displayed through a sanitiser in the browser; it is not executed as scripts.

## Where help lives

| Kind | Where |
|------|--------|
| Short labels on screen | Tab names, section headings, status line |
| One-line hints | Grey `meta` paragraphs under headings |
| Expandable help | `? Help for …` toggles (meeting text, calendar times) |
| Tooltips | Hover on badges, format toolbar, location lozenges |
| This guide | `meet/docs/OPERATIONS.md` — also open in the browser as **Operations guide** in the footer (`meet/operations.php`) |
| Technical reference | `meet/README.md`, `lib/MeetFile.php` |

When you ask a question in testing and we agree wording, it should go **on screen** first (prompt or tooltip), then **here** if it is workflow or policy, not only in chat.

## Git documentation conventions

Common layout in Git repositories:

| File / folder | Purpose |
|---------------|---------|
| `README.md` (root or `meet/`) | First thing people read: what it is, quick start, links |
| `docs/` | Longer guides (this file) |
| `CONTRIBUTING.md` | How to contribute code (optional) |
| `CHANGELOG.md` | Version history (optional; we use `VERSION` + commits) |

This project keeps meet-specific docs under `meet/` because the repo also contains other SIG material.

## Data folders (`meet/data/`)

| Folder | Purpose |
|--------|---------|
| `meets/` | One `.meet` file per meeting (the real data) |
| `aliases/` | Maps the random link code (slug) to the meeting file ID — **still required** |

The link you share (e.g. `?abc123def456`) is looked up via `data/aliases/{slug}.alias`, which points to `data/meets/{id}.meet`. This is not an old “meeting name alias” feature; do not delete the `aliases` folder while meetings exist.
