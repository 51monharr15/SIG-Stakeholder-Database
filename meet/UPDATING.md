# Updating Meet Scheduler on your web server

## Rule one

**Never overwrite `meet/data/`** on the server. That folder contains your live meeting files.

## FTP update (recommended)

1. Download the latest code (ZIP from GitHub, or `git pull` on your PC — see [GIT.md](GIT.md)).
2. Back up server `meet/data/` if you want extra safety.
3. Upload everything inside `meet/` **except** `data/`:
   - `index.php`, `api.php`, `.htaccess`
   - `assets/` (replace whole folder)
   - `lib/` (replace whole folder)
   - `README.md`, `GIT.md`, `UPDATING.md`, `LOCAL-TEST.md`
4. Leave server `meet/data/meets/` and `meet/data/aliases/` untouched.

## After updating

1. Open `/meet/` in your browser.
2. Hard-refresh (Ctrl+F5) so new CSS/JS load.
3. Open an existing meeting and confirm availability still shows.

## If something breaks

Restore your backup of `meet/data/` and re-upload the previous version of the app files from an old ZIP.

## Version check

Each update changes files under `assets/js/app.js` and `lib/`. There is no version number in the UI yet; use the git commit date or PR number from GitHub when asking for support.
