# SIG-Stakeholder-Database

Utilities for the Flarum community on **stroke.logicalmodel.net**. They share one local `config.php` (not in git).

| File | Role |
|---|---|
| `lusers.php` | Browser user list |
| `cron/welcome_new_users.php` | Daily welcome emails |
| `cron/reengage_inactive.php` | Weekly inactive digests (tiered tone) |
| `cron/install_mail_tables.php` | Creates `sig_mail_log` / `sig_mail_prefs` only |
| `config.example.php` | Template for server `config.php` |

## First-time setup (cPanel / FTPS)

1. Copy `config.example.php` → `config.php` and fill DB + SMTP + forum URL.
2. Upload this repo beside your existing `config.php` / `lusers.php`.
3. One-shot in cron (or run once then remove):  
   `/usr/local/bin/php /home/USER/.../cron/install_mail_tables.php`
4. Keep `mail.dry_run` true and/or set `mail.allowlist` to your address.
5. Dry-run:  
   `php cron/welcome_new_users.php --dry-run`  
   `php cron/reengage_inactive.php --dry-run --limit=20`
6. When ready: add `--send` (and set `mail.dry_run` false, or rely on `--send`).

## Suggested crontab

```text
# Daily welcome ~09:15
15 9 * * * /usr/local/bin/php /home/USER/path/cron/welcome_new_users.php --send >> /home/USER/logs/sig-welcome.log 2>&1

# Weekly re-engage (n=30) Monday 10:15
15 10 * * 1 /usr/local/bin/php /home/USER/path/cron/reengage_inactive.php --send --n-days=30 >> /home/USER/logs/sig-reengage.log 2>&1

# Optional deeper pass (n=180) first Monday-ish monthly — or weekly with larger n
15 11 1 * * /usr/local/bin/php /home/USER/path/cron/reengage_inactive.php --send --n-days=180 >> /home/USER/logs/sig-reengage-180.log 2>&1
```

Adjust PHP and paths to match cPanel. Scripts refuse non-CLI HTTP hits.
