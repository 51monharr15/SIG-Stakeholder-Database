# Speech-to-text
Silently correct speech-to-text errors from context. Only ask when something is actually ambiguous.

# Environment
- Flarum + MariaDB on cPanel; FTPS deploy; crontab editor (no SSH).
- Forum: https://stroke.logicalmodel.net
- Sibling utilities share local `config.php` with `lusers.php` (never commit secrets).
- New DB tables OK; do not alter Flarum core tables.
- Live site: dry-run / allowlist before real sends.
- Flarum scheduler (`php flarum schedule:run`) is separate forum plumbing; email jobs use their own cron lines.
