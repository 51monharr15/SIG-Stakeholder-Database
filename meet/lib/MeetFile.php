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
            'day_start' => '08:00',
            'day_end' => '20:00',
            'timezone' => '',
            'organizer_intro' => '',
            'page_times_intro' => '',
            'page_after_intro' => '',
            'confirmed_slot' => null,
            'confirmed_location' => null,
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
            'id', 'slug', 'title', 'created', 'updated',
            'duration_minutes', 'slot_granularity_minutes',
            'range_start', 'range_end', 'notes',
            'show_weekends', 'day_start', 'day_end', 'timezone',
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
        if (!empty($meet['confirmed_location'])) {
            $out[] = 'confirmed_location: ' . $meet['confirmed_location'];
        }

        $out[] = '';
        $out[] = '@@ recurrence';
        foreach (self::recurrenceLines($meet['recurrence'] ?? ['type' => 'none']) as $line) {
            $out[] = $line;
        }

        $out[] = '';
        $out[] = '@@ agenda';
        foreach ($meet['agenda'] as $item) {
            $out[] = '- ' . $item;
        }

        $out[] = '';
        $out[] = '@@ decisions';
        foreach ($meet['decisions'] as $item) {
            $out[] = '- ' . $item;
        }

        $out[] = '';
        $out[] = '@@ locations';
        foreach ($meet['locations'] as $loc) {
            $out[] = self::pipe([
                $loc['id'],
                $loc['label'],
                $loc['kind'] ?? 'other',
                $loc['detail'] ?? '',
            ]);
        }

        $out[] = '';
        $out[] = '@@ attachments';
        foreach ($meet['attachments'] as $att) {
            $out[] = self::pipe([
                $att['id'],
                $att['type'],
                $att['label'],
                $att['type'] === 'text' ? base64_encode($att['body'] ?? '') : ($att['url'] ?? ''),
            ]);
        }

        $out[] = '';
        $out[] = '@@ attendees';
        foreach ($meet['attendees'] as $att) {
            $out[] = self::pipe([
                $att['id'],
                $att['display_name'],
                $att['contact'] ?? ($att['alias'] ?? ''),
                $att['initials'] ?? '',
                $att['pin'] ?? '',
                !empty($att['organizer']) ? '1' : '0',
            ]);
        }

        $out[] = '';
        $out[] = '@@ organizer_intro';
        if (($meet['organizer_intro'] ?? '') !== '') {
            $out[] = $meet['organizer_intro'];
        }

        $out[] = '';
        $out[] = '@@ page_times_intro';
        if (($meet['page_times_intro'] ?? '') !== '') {
            $out[] = $meet['page_times_intro'];
        }

        $out[] = '';
        $out[] = '@@ page_after_intro';
        if (($meet['page_after_intro'] ?? '') !== '') {
            $out[] = $meet['page_after_intro'];
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
        $meet['day_start'] = $meet['day_start'] ?? '08:00';
        $meet['day_end'] = $meet['day_end'] ?? '20:00';
        $meet['timezone'] = $meet['timezone'] ?? '';
        $meet['organizer_intro'] = $meet['organizer_intro'] ?? '';
        $meet['page_times_intro'] = $meet['page_times_intro'] ?? '';
        $meet['page_after_intro'] = $meet['page_after_intro'] ?? '';
        foreach ($meet['attendees'] as &$attendee) {
            if (!isset($attendee['contact']) && isset($attendee['alias'])) {
                $attendee['contact'] = $attendee['alias'];
            }
            $attendee['contact'] = $attendee['contact'] ?? '';
            $attendee['initials'] = $attendee['initials'] ?? '';
            $attendee['pin'] = preg_replace('/\D/', '', (string) ($attendee['pin'] ?? ''));
            $attendee['organizer'] = !empty($attendee['organizer']);
        }
        unset($attendee);
        return $meet;
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
        return $value;
    }

    private static function scalarToString(mixed $value): string
    {
        if (is_bool($value)) {
            return $value ? 'true' : 'false';
        }
        if (is_array($value)) {
            return implode(',', $value);
        }
        return (string) $value;
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
        return substr(bin2hex(random_bytes(6)), 0, 12);
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
