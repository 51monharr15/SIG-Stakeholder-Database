-- Development schema and seed data for the SIG Stakeholder Database.
-- Idempotent: safe to run on every install.

CREATE DATABASE IF NOT EXISTS `sig`
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'sig'@'127.0.0.1' IDENTIFIED BY 'sig';
CREATE USER IF NOT EXISTS 'sig'@'localhost' IDENTIFIED BY 'sig';
GRANT ALL PRIVILEGES ON `sig`.* TO 'sig'@'127.0.0.1';
GRANT ALL PRIVILEGES ON `sig`.* TO 'sig'@'localhost';
FLUSH PRIVILEGES;

USE `sig`;

-- Mirrors the columns lusers.php selects/sorts on.
CREATE TABLE IF NOT EXISTS `users` (
  `id`           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `username`     VARCHAR(100) NOT NULL,
  `nickname`     VARCHAR(100) DEFAULT NULL,
  `email`        VARCHAR(190) DEFAULT NULL,
  `joined_at`    DATETIME DEFAULT NULL,
  `last_seen_at` DATETIME DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_username` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed a spread of joined/last-seen values so pagination and the
-- "<1hr / Nh / Nd" last-seen formatting are visibly exercised.
INSERT IGNORE INTO `users` (`username`, `nickname`, `email`, `joined_at`, `last_seen_at`) VALUES
  ('ada',       'Ada Lovelace',      'ada@example.org',       '2023-01-15 09:00:00', NOW() - INTERVAL 10 MINUTE),
  ('alan',      'Alan Turing',       'alan@example.org',      '2023-02-20 11:30:00', NOW() - INTERVAL 3 HOUR),
  ('grace',     'Grace Hopper',      'grace@example.org',     '2023-03-05 14:15:00', NOW() - INTERVAL 2 DAY),
  ('linus',     'Linus Torvalds',    'linus@example.org',     '2023-05-11 08:45:00', NOW() - INTERVAL 45 MINUTE),
  ('margaret',  'Margaret Hamilton', 'margaret@example.org',  '2023-06-30 16:20:00', NOW() - INTERVAL 5 DAY),
  ('dennis',    'Dennis Ritchie',    'dennis@example.org',    '2023-07-14 10:05:00', NOW() - INTERVAL 20 HOUR),
  ('ken',       'Ken Thompson',      'ken@example.org',       '2023-08-01 12:00:00', NOW() - INTERVAL 90 DAY),
  ('barbara',   'Barbara Liskov',    'barbara@example.org',   '2023-09-19 13:40:00', NOW() - INTERVAL 1 HOUR),
  ('edsger',    'Edsger Dijkstra',   'edsger@example.org',    '2023-10-22 07:25:00', NULL),
  ('donald',    'Donald Knuth',      'donald@example.org',    '2023-11-30 18:10:00', NOW() - INTERVAL 12 HOUR),
  ('tim',       'Tim Berners-Lee',   'tim@example.org',       '2024-01-08 09:55:00', NOW() - INTERVAL 4 DAY),
  ('vint',      'Vint Cerf',         'vint@example.org',      '2024-02-17 15:35:00', NOW() - INTERVAL 30 MINUTE),
  ('radia',     'Radia Perlman',     'radia@example.org',     '2024-03-25 11:11:00', NOW() - INTERVAL 8 HOUR),
  ('bjarne',    'Bjarne Stroustrup', 'bjarne@example.org',    '2024-04-02 10:30:00', NOW() - INTERVAL 15 DAY),
  ('guido',     'Guido van Rossum',  'guido@example.org',     '2024-05-19 14:50:00', NOW() - INTERVAL 5 MINUTE);
