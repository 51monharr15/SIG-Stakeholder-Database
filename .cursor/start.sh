#!/usr/bin/env bash
# Per-boot startup for the SIG Stakeholder Database dev environment:
#   1. bring up the local MariaDB daemon (idempotent)
#   2. serve the app with PHP's built-in web server in the foreground
# lusers.php is then reachable at http://localhost:8080/lusers.php
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$HERE/.." && pwd)"

bash "$HERE/start-mariadb.sh"

echo "Serving $REPO_ROOT on http://0.0.0.0:8080 (open /lusers.php)"
exec php -S 0.0.0.0:8080 -t "$REPO_ROOT"
