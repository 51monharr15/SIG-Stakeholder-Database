# Local test environment (PHP on your PC)

Use this to try changes before uploading via FTP.

## Prerequisites

- PHP 8.1+ installed (`php -v` in Command Prompt)
- The repo cloned or ZIP extracted on your machine

## Start the test server

Open Command Prompt or PowerShell:

```bat
cd path\to\SIG-Stakeholder-Database\meet
php -S localhost:8080
```

Leave that window open. The server runs until you press Ctrl+C.

## Open in browser

- Home: http://localhost:8080/
- Test meeting: http://localhost:8080/?my-test-meeting

Create a meeting, join as a user, mark some slots, save — same as on the live server.

## Where local data is stored

Test meetings are saved to:

```text
meet\data\meets\
meet\data\aliases\
```

These are **only on your PC**. They are not uploaded unless you copy them to the server (usually you should not).

## Testing after an update

1. Stop the server (Ctrl+C).
2. Replace app files (keep your local `data\` if you want to keep test meetings).
3. Start `php -S localhost:8080` again.
4. Hard-refresh the browser (Ctrl+F5).

## PHP not found?

- Windows: install from https://windows.php.net/download/ or use XAMPP/WAMP.
- With XAMPP, `php.exe` is often at `C:\xampp\php\php.exe` — use the full path in the command above.

## Differences from Apache

- Pretty URLs (`/meet/slug`) need Apache `mod_rewrite`. Locally use `http://localhost:8080/?slug-name`.
- Built-in PHP server is fine for development; production should stay on Apache as you have now.
