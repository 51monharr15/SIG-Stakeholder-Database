#!/usr/bin/env bash
# Start the local MariaDB daemon if it is not already running, then wait
# until it accepts connections. Idempotent: safe to call from install and
# from every boot via start.
set -euo pipefail

sudo mkdir -p /var/run/mysqld /var/lib/mysql
sudo chown -R mysql:mysql /var/run/mysqld /var/lib/mysql

# Initialize the data directory only on a truly empty volume.
if [ ! -d /var/lib/mysql/mysql ]; then
  sudo mariadb-install-db --user=mysql --datadir=/var/lib/mysql \
    --auth-root-authentication-method=socket >/dev/null 2>&1 || true
fi

if ! sudo mysqladmin ping >/dev/null 2>&1; then
  sudo -b mysqld_safe --datadir=/var/lib/mysql >/tmp/mariadb.log 2>&1
fi

for _ in $(seq 1 30); do
  if sudo mysqladmin ping >/dev/null 2>&1; then
    echo "MariaDB is up."
    exit 0
  fi
  sleep 1
done

echo "MariaDB failed to start; see /tmp/mariadb.log" >&2
sudo tail -n 40 /tmp/mariadb.log >&2 || true
exit 1
