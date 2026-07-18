# SIG-Stakeholder-Database

PHP tools for the SIG forum / stakeholder data.

## Files

- `sig-users.php` — sortable, paginated list of forum users
- `config.example.php` — template for database settings
- `config.php` — **your private settings** (create this on the server; never put it on GitHub)

## Setup on the web server

1. Upload `sig-users.php` and `config.example.php`.
2. On the server, copy `config.example.php` to `config.php`.
3. Edit `config.php` and put in the real database name, user, and password.
4. Open `sig-users.php` in the browser.
