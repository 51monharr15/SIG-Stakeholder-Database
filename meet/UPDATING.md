# Updating Meet Scheduler

## FTP upload

1. `git pull` in your local clone (see [GIT.md](GIT.md)).
2. Upload everything inside `meet/` to your server’s `meet/` folder — including **new files** at the meet root (see below).
3. Hard-refresh the browser (Ctrl+F5).

**Do not overwrite** `meet/data/` on the server (your live meetings live there).

## New files (recent builds)

If you upload file-by-file, make sure these are on the server as well as the usual `assets/`, `lib/`, and `index.php`:

| File | Purpose |
|------|---------|
| `operations.php` | Operations guide page (footer link) |
| `favicon.svg` | Calendar icon in the browser tab |
| `docs/OPERATIONS.md` | Source text for the operations guide |

## Version check

The footer shows **Build x.y.z** (from `meet/VERSION`).
