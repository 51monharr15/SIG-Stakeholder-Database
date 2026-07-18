# SIG-Stakeholder-Database

PHP tools for the SIG forum / stakeholder data.

## Files

- `sig-users.php` — sortable, paginated list of forum users
- `sig-users-config.example.php` — template for this page’s database settings
- `sig-users-config.php` — **your private settings** (create this on the server; never put it on GitHub)

The config file is named `sig-users-config.php` on purpose so it does not clash with another app’s `config.php`.

## Setup on the web server

1. Upload `sig-users.php` and `sig-users-config.example.php`.
2. On the server, copy `sig-users-config.example.php` to `sig-users-config.php`.
3. Edit `sig-users-config.php` and put in the real database name, user, and password.
4. Open `sig-users.php` in the browser.
