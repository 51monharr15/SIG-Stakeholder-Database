<?php

namespace Meet;

/** Normalize IANA timezone ids; map common abbreviations organisers often type. */
final class Timezone
{
  /** @var array<string, string> */
  private const ALIASES = [
    'EDT' => 'America/New_York',
    'EST' => 'America/New_York',
    'CDT' => 'America/Chicago',
    'CST' => 'America/Chicago',
    'MDT' => 'America/Denver',
    'MST' => 'America/Denver',
    'PDT' => 'America/Los_Angeles',
    'PST' => 'America/Los_Angeles',
    'BST' => 'Europe/London',
    'GMT' => 'UTC',
    'UTC' => 'UTC',
  ];

  public static function normalize(string $raw, string $fallback = 'UTC'): string
  {
    $raw = trim($raw);
    if ($raw === '') {
      return self::isValid($fallback) ? $fallback : 'UTC';
    }

    $upper = strtoupper($raw);
    if (isset(self::ALIASES[$upper])) {
      return self::ALIASES[$upper];
    }

    if (self::isValid($raw)) {
      return $raw;
    }

    return self::isValid($fallback) ? $fallback : 'UTC';
  }

  public static function isValid(string $id): bool
  {
    if ($id === '') {
      return false;
    }
    try {
      new \DateTimeZone($id);
      return true;
    } catch (\Exception) {
      return false;
    }
  }
}
