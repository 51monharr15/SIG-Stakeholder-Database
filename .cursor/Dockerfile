# Base image for the SIG Stakeholder Database dev environment.
# Provides PHP (with PDO MySQL) and a local MariaDB server. Repository source
# is checked out separately by Cursor, so it is intentionally not copied here.
FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        git \
        sudo \
        php-cli \
        php-mysql \
        mariadb-server \
        mariadb-client \
    && rm -rf /var/lib/apt/lists/*

# Ubuntu 24.04 ships a default non-root `ubuntu` user (UID 1000). Give it
# passwordless sudo so install/start can manage the local MariaDB daemon.
RUN echo 'ubuntu ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/ubuntu \
    && chmod 0440 /etc/sudoers.d/ubuntu

USER ubuntu
