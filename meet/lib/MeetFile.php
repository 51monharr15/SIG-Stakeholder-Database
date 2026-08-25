<?php

namespace Meet;

/**
 * Human-readable plain-text meeting record (@meet v1).
 */
final class MeetFile
{
    public const VERSION = 1;

    public static function create(string $slug, string $title = ''): array
    {
        $now = gmdate('c');
        $id = self::generateId();

        return [
            'version' => self::VERSION,
            'id' => $id,
            'slug' => $slug,
            'title' => $title !== '' ? $title : self::titleFromSlug($slug),
            'created' => $now,
            'updated' => $now,
            'duration_minutes' => 60,
            'slot_granularity_minutes' => 30,
            'range_start' => gmdate('Y-m-d'),
            'range_end' => '2099-12-31',
            'recurrence' => ['type' => 'none'],
            'agenda' => [],
            'decisions' => [],
            'locations' => [],
            'attachments' => [],
            'attendees' => [],
            'availability' => [],
            'location_preferences' => [],
            'notes' => '',
            'show_weekends' => false,
            'day_start' => '09:00',
            'day_end' => '16:00',
            'am_start' => '09:00',
            'am_end' => '12:00',
            'pm_start' => '12:00',
            'pm_end' => '16:00',
            'timezone' => '',
            'recorded_timezones' => [],
            'organizer_intro' => '',
            'page_times_intro' => '',
            'page_after_intro' => '',
            'confirmed_slot' => null,
            'confirmed_location' => null,
            'confirmed_location_physical' => null,
            'confirmed_location_online' => null,
            'confirmed_location_ids' => [],
            'app_version' => '1.8.45',
        ];
    }

    public static function parse(string $content): array
    {
        $lines = preg_split('/\r\n|\r|\n/', $content) ?: [];
        $meet = null;
        $section = null;
        $buffer = [];

        foreach ($lines as $line) {
            if (preg_match('/^@meet\s+v(\d+)\s*$/', $line, $m)) {
                $meet = ['version' => (int) $m[1]];
                continue;
            }
            if ($meet === null) {
                continue;
            }

            if (preg_match('/^@@\s+(\w+)\s*$/', $line, $m)) {
                self::flushSection($meet, $section, $buffer);
                $section = strtolower($m[1]);
                $buffer = [];
                continue;
            }

            if ($section === null) {
                if (preg_match('/^([^:]+):\s*(.*)$/', $line, $m)) {
                    $key = strtolower(trim($m[1]));
                    $value = trim($m[2]);
                    $meet[$key] = self::castScalar($key, $value);
                }
                continue;
            }

            $trimmed = trim($line);
            if ($trimmed === '' || str_starts_with($trimmed, '#')) {
                continue;
            }
            $buffer[] = $trimmed;
        }

        self::flushSection($meet, $section, $buffer);

        if ($meet === null) {
            throw new \RuntimeException('Invalid meet file: missing @meet header');
        }

        return self::normalize($meet);
    }

    public static function serialize(array $meet): string
    {
        $meet = self::normalize($meet);
        $out = ["@meet v{$meet['version']}"];
        $header = [
            'id', 'slug', 'title', 'created', 'updated', 'app_version',
            'duration_minutes', 'slot_granularity_minutes',
            'range_start', 'range_end',
            'show_weekends', 'day_start', 'day_end', 'timezone',
            'am_start', 'am_end', 'pm_start', 'pm_end',
        ];
        foreach ($header as $key) {
            if (!array_key_exists($key, $meet) || $meet[$key] === null || $meet[$key] === '') {
                continue;
            }
            $out[] = self::headerKey($key) . ': ' . self::scalarToString($meet[$key]);
        }

        if (!empty($meet['confirmed_slot'])) {
            $out[] = 'confirmed_slot: ' . $meet['confirmed_slot'];
        }
        $recordedTzs = array_values(array_filter(array_map('strval', $meet['recorded_timezones'] ?? [])));
        if ($recordedTzs !== []) {
            $out[] = 'recorded_timezones: ' . implode(',', $recordedTzs);
        }
        // Prefer explicit dual fields; keep legacy confirmed_location for older readers.
        $phys = trim((string) ($meet['confirmed_location_physical'] ?? ''));
        $online = trim((string) ($meet['confirmed_location_online'] ?? ''));
        $legacy = trim((string) ($meet['confirmed_location'] ?? ''));
        if ($phys !== '') {
            $out[] = 'confirmed_location_physical: ' . $phys;
        }
        if ($online !== '') {
            $out[] = 'confirmed_location_online: ' . $online;
        }
        $compat = $online !== '' ? $online : ($phys !== '' ? $phys : $legacy);
        if ($compat !== '') {
            $out[] = 'confirmed_location: ' . $compat;
        }
        $confirmedIds = array_values(array_filter(array_map(
            'strval',
            $meet['confirmed_location_ids'] ?? []
        )));
        if ($confirmedIds !== []) {
            $out[] = 'confirmed_location_ids: ' . implode(',', $confirmedIds);
        }

        $out[] = '';
        $out[] = '@@ recurrence';
        foreach (self::recurrenceLines($meet['recurrence'] ?? ['type' => 'none']) as $line) {
            $out[] = $line;
        }

        $out[] = '';
        $out[] = '@@ agenda';
        foreach ($meet['agenda'] as $item) {
            $out[] = '- ' . self::sanitizeListItem($item);
        }

        $out[] = '';
        $out[] = '@@ decisions';
        foreach ($meet['decisions'] as $item) {
            $out[] = '- ' . self::sanitizeListItem($item);
        }

        $out[] = '';
        $out[] = '@@ notes';
        if (($meet['notes'] ?? '') !== '') {
            foreach (preg_split('/\r\n|\r|\n/', (string) $meet['notes']) as $line) {
                $out[] = self::sanitizeSectionLine($line);
            }
        }

        $out[] = '';
        $out[] = '@@ locations';
        foreach ($meet['locations'] as $loc) {
            $out[] = self::pipe([
                $loc['id'],
                self::sanitizePipeField($loc['label']),
                self::sanitizePipeField($loc['kind'] ?? 'other'),
                self::sanitizePipeField($loc['detail'] ?? ''),
            ]);
        }

        $out[] = '';
        $out[] = '@@ attachments';
        foreach ($meet['attachments'] as $att) {
            $out[] = self::pipe([
                $att['id'],
                self::sanitizePipeField($att['type']),
                self::sanitizePipeField($att['label']),
                $att['type'] === 'text' ? base64_encode($att['body'] ?? '') : self::sanitizePipeField($att['url'] ?? ''),
            ]);
        }

        $out[] = '';
        $out[] = '@@ attendees';
        foreach ($meet['attendees'] as $att) {
            $out[] = self::pipe([
                $att['id'],
                self::sanitizePipeField($att['display_name']),
                self::sanitizePipeField($att['contact'] ?? ($att['alias'] ?? '')),
                self::sanitizePipeField($att['initials'] ?? ''),
                self::sanitizePipeField($att['pin'] ?? ''),
                !empty($att['organizer']) ? '1' : '0',
            ]);
        }

        $out[] = '';
        $out[] = '@@ organizer_intro';
        if (($meet['organizer_intro'] ?? '') !== '') {
            foreach (preg_split('/\r\n|\r|\n/', (string) $meet['organizer_intro']) as $line) {
                $out[] = self::sanitizeSectionLine($line);
            }
        }

        $out[] = '';
        $out[] = '@@ page_times_intro';
        if (($meet['page_times_intro'] ?? '') !== '') {
            foreach (preg_split('/\r\n|\r|\n/', (string) $meet['page_times_intro']) as $line) {
                $out[] = self::sanitizeSectionLine($line);
            }
        }

        $out[] = '';
        $out[] = '@@ page_after_intro';
        if (($meet['page_after_intro'] ?? '') !== '') {
            foreach (preg_split('/\r\n|\r|\n/', (string) $meet['page_after_intro']) as $line) {
                $out[] = self::sanitizeSectionLine($line);
            }
        }

        $out[] = '';
        $out[] = '@@ availability';
        foreach ($meet['availability'] as $slot => $attendeeIds) {
            $out[] = $slot . ' | ' . implode(',', $attendeeIds);
        }

        $out[] = '';
        $out[] = '@@ location_prefs';
        foreach ($meet['location_preferences'] as $attendeeId => $locationIds) {
            $out[] = $attendeeId . ' | ' . implode(',', $locationIds);
        }

        return implode("\n", $out) . "\n";
    }

    private static function flushSection(array &$meet, ?string $section, array $buffer): void
    {
        if ($section === null) {
            return;
        }

        switch ($section) {
            case 'recurrence':
                $meet['recurrence'] = self::parseRecurrence($buffer);
                break;
            case 'agenda':
                $meet['agenda'] = self::parseBullets($buffer);
                break;
            case 'decisions':
                $meet['decisions'] = self::parseBullets($buffer);
                break;
            case 'notes':
                $meet['notes'] = implode("\n", $buffer);
                break;
            case 'locations':
                $meet['locations'] = array_map(function (string $line) {
                    $parts = self::splitPipe($line);
                    return [
                        'id' => $parts[0] ?? self::generateId('loc'),
                        'label' => $parts[1] ?? 'Location',
                        'kind' => $parts[2] ?? 'other',
                        'detail' => $parts[3] ?? '',
                    ];
                }, $buffer);
                break;
            case 'attachments':
                $meet['attachments'] = array_map(function (string $line) {
                    $parts = self::splitPipe($line);
                    $type = $parts[1] ?? 'url';
                    $item = [
                        'id' => $parts[0] ?? self::generateId('att'),
                        'type' => $type,
                        'label' => $parts[2] ?? 'Attachment',
                    ];
                    $payload = $parts[3] ?? '';
                    if ($type === 'text') {
                        $item['body'] = base64_decode($payload, true) ?: $payload;
                    } else {
                        $item['url'] = $payload;
                    }
                    return $item;
                }, $buffer);
                break;
            case 'attendees':
                $meet['attendees'] = array_map(function (string $line) {
                    $parts = self::splitPipe($line);
                    return [
                        'id' => $parts[0] ?? self::generateId('usr'),
                        'display_name' => $parts[1] ?? 'Guest',
                        'contact' => $parts[2] ?? '',
                        'initials' => $parts[3] ?? '',
                        'pin' => $parts[4] ?? '',
                        'organizer' => in_array(strtolower($parts[5] ?? ''), ['1', 'true', 'yes'], true),
                    ];
                }, $buffer);
                break;
            case 'organizer_intro':
                $meet['organizer_intro'] = implode("\n", $buffer);
                break;
            case 'page_times_intro':
                $meet['page_times_intro'] = implode("\n", $buffer);
                break;
            case 'page_after_intro':
                $meet['page_after_intro'] = implode("\n", $buffer);
                break;
            case 'availability':
                $availability = [];
                foreach ($buffer as $line) {
                    if (!str_contains($line, '|')) {
                        continue;
                    }
                    [$slot, $ids] = array_map('trim', explode('|', $line, 2));
                    $availability[$slot] = array_values(array_filter(array_map('trim', explode(',', $ids))));
                }
                $meet['availability'] = $availability;
                break;
            case 'location_prefs':
                $prefs = [];
                foreach ($buffer as $line) {
                    if (!str_contains($line, '|')) {
                        continue;
                    }
                    [$attendeeId, $ids] = array_map('trim', explode('|', $line, 2));
                    $prefs[$attendeeId] = array_values(array_filter(array_map('trim', explode(',', $ids))));
                }
                $meet['location_preferences'] = $prefs;
                break;
        }
    }

    private static function parseRecurrence(array $lines): array
    {
        $data = ['type' => 'none'];
        foreach ($lines as $line) {
            if (!str_contains($line, ':')) {
                continue;
            }
            [$key, $value] = array_map('trim', explode(':', $line, 2));
            $data[strtolower($key)] = self::castScalar(strtolower($key), $value);
        }
        return $data;
    }

    private static function recurrenceLines(array $recurrence): array
    {
        if (($recurrence['type'] ?? 'none') === 'none') {
            return ['type: none'];
        }
        $lines = [];
        foreach ($recurrence as $key => $value) {
            if ($value === null || $value === '') {
                continue;
            }
            $lines[] = $key . ': ' . self::scalarToString($value);
        }
        return $lines ?: ['type: none'];
    }

    private static function parseBullets(array $lines): array
    {
        $items = [];
        foreach ($lines as $line) {
            $items[] = ltrim($line, "- \t");
        }
        return $items;
    }

    public static function normalize(array $meet): array
    {
        $defaults = self::create($meet['slug'] ?? 'untitled');
        foreach ($defaults as $key => $value) {
            if (!array_key_exists($key, $meet)) {
                $meet[$key] = $value;
            }
        }
        $meet['version'] = (int) ($meet['version'] ?? self::VERSION);
        $meet['duration_minutes'] = (int) $meet['duration_minutes'];
        $meet['slot_granularity_minutes'] = (int) $meet['slot_granularity_minutes'];
        $meet['agenda'] = array_values($meet['agenda'] ?? []);
        $meet['decisions'] = array_values($meet['decisions'] ?? []);
        $meet['locations'] = array_values($meet['locations'] ?? []);
        $meet['attachments'] = array_values($meet['attachments'] ?? []);
        $meet['attendees'] = array_values($meet['attendees'] ?? []);
        $meet['availability'] = $meet['availability'] ?? [];
        $meet['location_preferences'] = $meet['location_preferences'] ?? [];
        $meet['recurrence'] = $meet['recurrence'] ?? ['type' => 'none'];
        $meet['show_weekends'] = (bool) ($meet['show_weekends'] ?? false);
        $meet['day_start'] = $meet['day_start'] ?? '09:00';
        $meet['day_end'] = $meet['day_end'] ?? '16:00';
        $meet['am_start'] = $meet['am_start'] ?? '09:00';
        $meet['am_end'] = $meet['am_end'] ?? '12:00';
        $meet['pm_start'] = $meet['pm_start'] ?? '12:00';
        $meet['pm_end'] = $meet['pm_end'] ?? '16:00';
        $meet['timezone'] = Timezone::normalize((string) ($meet['timezone'] ?? ''));
        $rawRecorded = $meet['recorded_timezones'] ?? [];
        if (is_string($rawRecorded)) {
            $rawRecorded = array_map('trim', explode(',', $rawRecorded));
        }
        $meet['recorded_timezones'] = array_values(array_unique(array_filter(array_map(
            static fn ($z) => Timezone::normalize((string) $z),
            is_array($rawRecorded) ? $rawRecorded : []
        ), static fn ($z) => $z !== '')));
        $meet['organizer_intro'] = $meet['organizer_intro'] ?? '';
        $meet['page_times_intro'] = $meet['page_times_intro'] ?? '';
        $meet['page_after_intro'] = $meet['page_after_intro'] ?? '';
        $meet['confirmed_location_physical'] = $meet['confirmed_location_physical'] ?? null;
        $meet['confirmed_location_online'] = $meet['confirmed_location_online'] ?? null;
        $meet['app_version'] = trim((string) ($meet['app_version'] ?? ''));
        $rawIds = $meet['confirmed_location_ids'] ?? [];
        if (is_string($rawIds)) {
            $rawIds = array_map('trim', explode(',', $rawIds));
        }
        $meet['confirmed_location_ids'] = array_values(array_unique(array_filter(array_map(
            'strval',
            is_array($rawIds) ? $rawIds : []
        ))));
        // Migrate legacy single confirmed_location into physical/online by kind.
        $legacy = trim((string) ($meet['confirmed_location'] ?? ''));
        if ($legacy !== '') {
            $phys = trim((string) ($meet['confirmed_location_physical'] ?? ''));
            $online = trim((string) ($meet['confirmed_location_online'] ?? ''));
            if ($phys === '' && $online === '') {
                $kind = 'other';
                foreach ($meet['locations'] as $loc) {
                    if (($loc['id'] ?? '') === $legacy) {
                        $kind = (string) ($loc['kind'] ?? 'other');
                        break;
                    }
                }
                if ($kind === 'hybrid') {
                    $meet['confirmed_location_online'] = $legacy;
                    $meet['confirmed_location_physical'] = $legacy;
                } elseif (in_array($kind, ['video', 'phone'], true)) {
                    $meet['confirmed_location_online'] = $legacy;
                } else {
                    $meet['confirmed_location_physical'] = $legacy;
                }
            }
        }
        if ($meet['confirmed_location_ids'] === []) {
            foreach (['confirmed_location_online', 'confirmed_location_physical', 'confirmed_location'] as $key) {
                $id = trim((string) ($meet[$key] ?? ''));
                if ($id !== '' && !in_array($id, $meet['confirmed_location_ids'], true)) {
                    $meet['confirmed_location_ids'][] = $id;
                }
            }
        }
        foreach ($meet['attendees'] as &$attendee) {
            if (!isset($attendee['contact']) && isset($attendee['alias'])) {
                $attendee['contact'] = $attendee['alias'];
            }
            $attendee['contact'] = $attendee['contact'] ?? '';
            $attendee['initials'] = $attendee['initials'] ?? '';
            $attendee['pin'] = self::normalizePasscode((string) ($attendee['pin'] ?? ''));
            $attendee['organizer'] = !empty($attendee['organizer']);
        }
        unset($attendee);
        self::sanitizeAttendanceData($meet);
        return $meet;
    }

    /** Drop availability and location prefs for removed attendees. */
    public static function sanitizeAttendanceData(array &$meet): void
    {
        $valid = array_flip(array_column($meet['attendees'] ?? [], 'id'));
        foreach ($meet['availability'] as $slot => $ids) {
            $filtered = array_values(array_filter(
                is_array($ids) ? $ids : [],
                static fn ($id) => isset($valid[(string) $id])
            ));
            if ($filtered === []) {
                unset($meet['availability'][$slot]);
            } else {
                $meet['availability'][$slot] = $filtered;
            }
        }
        foreach (array_keys($meet['location_preferences'] ?? []) as $attendeeId) {
            if (!isset($valid[$attendeeId])) {
                unset($meet['location_preferences'][$attendeeId]);
            }
        }
    }

    /** @return string|null Error message, or null if valid. */
    public static function validateDurationSlot(int $duration, int $slot): ?string
    {
        if ($duration < 1) {
            return 'Meeting length must be at least 1 minute.';
        }
        if ($slot < 1) {
            return 'Calendar slot size must be at least 1 minute.';
        }
        if ($duration % $slot !== 0) {
            return 'Calendar slot size must divide meeting length evenly.';
        }

        return null;
    }

    private static function castScalar(string $key, string $value): mixed
    {
        if ($key === 'show_weekends') {
            return in_array(strtolower($value), ['1', 'true', 'yes', 'on'], true);
        }
        if (in_array($key, ['duration_minutes', 'slot_granularity_minutes', 'version', 'nth', 'interval', 'day', 'weekday', 'count'], true)) {
            return (int) $value;
        }
        if (in_array($key, ['weekdays'], true)) {
            return array_map('intval', array_filter(array_map('trim', explode(',', $value))));
        }
        if ($key === 'confirmed_location_ids') {
            return array_values(array_filter(array_map('trim', explode(',', $value))));
        }
        if ($key === 'recorded_timezones') {
            return array_values(array_filter(array_map('trim', explode(',', $value))));
        }
        return $value;
    }

    /** Prevent user text from breaking the plain-text file format on save. */
    public static function sanitizeListItem(string $item): string
    {
        return self::sanitizeSectionLine(str_replace(["\r\n", "\r", "\n"], ' ', $item));
    }

    public static function sanitizeSectionLine(string $line): string
    {
        $line = trim($line);
        if ($line === '') {
            return '';
        }
        if (preg_match('/^@@\s+\w+\s*$/', $line)) {
            return '# ' . $line;
        }
        if (preg_match('/^@meet\s+v\d+\s*$/', $line)) {
            return '# ' . $line;
        }
        return $line;
    }

    public static function sanitizePipeField(string $value): string
    {
        return trim(str_replace('|', '/', (string) $value));
    }

    /** Sanitize stored passcode on load (no length wipe — preserves legacy short codes). */
    public static function normalizePasscode(string $pin): string
    {
        $pin = strtolower(trim($pin));
        $pin = preg_replace('/[|\r\n\t]/', '', $pin) ?? '';
        $pin = preg_replace('/[^\x20-\x7e]/', '', $pin) ?? '';
        return preg_replace('/ {2,}/', ' ', $pin) ?? '';
    }

    public static function sanitizeHeaderValue(string $value): string
    {
        return self::sanitizeListItem((string) $value);
    }

    private static function scalarToString(mixed $value): string
    {
        if (is_bool($value)) {
            return $value ? 'true' : 'false';
        }
        if (is_array($value)) {
            return implode(',', $value);
        }
        return self::sanitizeHeaderValue((string) $value);
    }

    private static function headerKey(string $key): string
    {
        return str_replace('_', '_', $key);
    }

    private static function pipe(array $parts): string
    {
        return implode(' | ', $parts);
    }

    private static function splitPipe(string $line): array
    {
        return array_map('trim', explode('|', $line));
    }

    public static function generateId(string $prefix = 'meet'): string
    {
        return $prefix . '_' . bin2hex(random_bytes(6));
    }

    public static function generateRandomSlug(): string
    {
        // Pronounceable 7-letter pattern: C V C C V C C (lowercase a–z only).
        $cons = 'bcdfghjklmnpqrstvwxz';
        $vow = 'aeiou';
        $pattern = ['c', 'v', 'c', 'c', 'v', 'c', 'c'];
        $out = '';
        foreach ($pattern as $kind) {
            $alphabet = $kind === 'v' ? $vow : $cons;
            $out .= $alphabet[random_int(0, strlen($alphabet) - 1)];
        }
        return $out;
    }

    public static function slugify(string $input): string
    {
        $slug = strtolower(trim($input));
        $slug = preg_replace('/[^a-z0-9]+/', '-', $slug) ?? '';
        $slug = trim($slug, '-');
        return $slug !== '' ? $slug : 'meet-' . substr(bin2hex(random_bytes(3)), 0, 6);
    }

    public static function titleFromSlug(string $slug): string
    {
        return ucwords(str_replace(['-', '_'], ' ', $slug));
    }
}
