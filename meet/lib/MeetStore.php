<?php

namespace Meet;

final class MeetStore
{
    private string $dataDir;

    public function __construct(?string $dataDir = null)
    {
        $this->dataDir = $dataDir ?? dirname(__DIR__) . '/data';
    }

    public function resolveSlug(string $rawSlug): string
    {
        return MeetFile::slugify($rawSlug);
    }

    public function slugExists(string $slug): bool
    {
        return $this->lookupIdBySlug($this->resolveSlug($slug)) !== null;
    }

    public function createMeeting(string $title = ''): array
    {
        do {
            $slug = MeetFile::generateRandomSlug();
        } while ($this->slugExists($slug));

        $meet = MeetFile::create($slug, $title);
        $this->save($meet);
        return $meet;
    }

    public function loadBySlug(string $rawSlug, bool $create = false): array
    {
        $slug = $this->resolveSlug($rawSlug);
        $id = $this->lookupIdBySlug($slug);

        if ($id === null) {
            if (!$create) {
                throw new \RuntimeException('Meeting not found', 404);
            }
            $meet = MeetFile::create($slug);
            $this->save($meet);
            return $meet;
        }

        return $this->loadById($id);
    }

    public function loadById(string $id): array
    {
        $path = $this->meetPath($id);
        if (!is_readable($path)) {
            throw new \RuntimeException('Meeting not found', 404);
        }
        $content = file_get_contents($path);
        if ($content === false) {
            throw new \RuntimeException('Unable to read meeting file');
        }
        return MeetFile::parse($content);
    }

    public function save(array $meet): array
    {
        $meet['updated'] = gmdate('c');
        $meet = MeetFile::normalize($meet);
        $path = $this->meetPath($meet['id']);

        $this->ensureDir(dirname($path));
        $this->writeLocked($path, MeetFile::serialize($meet));
        $this->writeAlias($meet['slug'], $meet['id']);

        return $meet;
    }

    public function update(string $id, callable $mutator): array
    {
        $path = $this->meetPath($id);
        $this->ensureDir(dirname($path));

        $fp = fopen($path, 'c+');
        if ($fp === false) {
            throw new \RuntimeException('Unable to open meeting file');
        }

        try {
            if (!flock($fp, LOCK_EX)) {
                throw new \RuntimeException('Unable to lock meeting file');
            }

            rewind($fp);
            $content = stream_get_contents($fp);
            $meet = MeetFile::parse($content ?: MeetFile::serialize(MeetFile::create('untitled')));
            $meet = $mutator($meet) ?? $meet;
            $meet['updated'] = gmdate('c');
            $meet = MeetFile::normalize($meet);
            $serialized = MeetFile::serialize($meet);

            ftruncate($fp, 0);
            rewind($fp);
            fwrite($fp, $serialized);
            fflush($fp);
            flock($fp, LOCK_UN);
        } finally {
            fclose($fp);
        }

        $this->writeAlias($meet['slug'], $meet['id']);
        return $meet;
    }

    public function publicView(array $meet): array
    {
        $suggestions = Availability::buildSuggestions($meet);
        $today = gmdate('Y-m-d');
        $rangeStart = max($meet['range_start'], $today);
        $rangeEnd = gmdate('Y-m-d', strtotime('+2 years'));
        $recurrenceDates = Recurrence::expand(
            $meet['recurrence'],
            $rangeStart,
            $rangeEnd
        );

        $rawTz = (string) ($meet['timezone'] ?? '');
        $normTz = Timezone::normalize($rawTz);

        return [
            'id' => $meet['id'],
            'slug' => $meet['slug'],
            'title' => $meet['title'],
            'created' => $meet['created'],
            'updated' => $meet['updated'],
            'duration_minutes' => $meet['duration_minutes'],
            'slot_granularity_minutes' => $meet['slot_granularity_minutes'],
            'range_start' => $rangeStart,
            'range_end' => $rangeEnd,
            'calendar_start' => $today,
            'recurrence' => $meet['recurrence'],
            'recurrence_label' => Recurrence::describe($meet['recurrence']),
            'recurrence_dates' => $recurrenceDates,
            'agenda' => $meet['agenda'],
            'decisions' => $meet['decisions'],
            'locations' => $meet['locations'],
            'attachments' => $meet['attachments'],
            'attendees' => array_map(fn ($a) => [
                'id' => $a['id'],
                'display_name' => $a['display_name'],
                'contact' => $a['contact'] ?? ($a['alias'] ?? ''),
                'initials' => $a['initials'] ?? '',
                'has_pin' => ($a['pin'] ?? '') !== '',
                'is_organizer' => !empty($a['organizer']),
            ], $meet['attendees']),
            'availability' => $meet['availability'],
            'location_preferences' => $meet['location_preferences'],
            'notes' => $meet['notes'],
            'show_weekends' => (bool) ($meet['show_weekends'] ?? false),
            'day_start' => $meet['day_start'] ?? '08:00',
            'day_end' => $meet['day_end'] ?? '20:00',
            'timezone' => $normTz,
            'timezone_needs_save' => $rawTz !== $normTz,
            'organizer_intro' => $meet['organizer_intro'] ?? '',
            'page_times_intro' => $meet['page_times_intro'] ?? '',
            'page_after_intro' => $meet['page_after_intro'] ?? '',
            'confirmed_slot' => $meet['confirmed_slot'],
            'confirmed_location' => $meet['confirmed_location'],
            'suggestions' => $suggestions,
        ];
    }

    public function listMeetingsForOrganizer(string $displayName, string $pin): array
    {
        return $this->listMeetingsForPerson($displayName, $pin);
    }

    public function listMeetingsForPerson(string $displayName, string $pin): array
    {
        $nameKey = strtolower(trim($displayName));
        $pin = preg_replace('/\D/', '', $pin) ?? '';
        if ($nameKey === '' || $pin === '') {
            return [];
        }

        $dir = $this->dataDir . '/meets';
        if (!is_dir($dir)) {
            return [];
        }

        $results = [];
        foreach (glob($dir . '/*.meet') ?: [] as $path) {
            $content = file_get_contents($path);
            if ($content === false) {
                continue;
            }
            try {
                $meet = MeetFile::parse($content);
            } catch (\Throwable) {
                continue;
            }
            foreach ($meet['attendees'] as $att) {
                if (strtolower(trim((string) ($att['display_name'] ?? ''))) !== $nameKey) {
                    continue;
                }
                if ((string) ($att['pin'] ?? '') !== $pin) {
                    continue;
                }
                $results[] = [
                    'title' => $meet['title'],
                    'slug' => $meet['slug'],
                ];
                break;
            }
        }

        usort($results, fn ($a, $b) => strcmp($a['title'], $b['title']));

        return $results;
    }

    private function findLocation(array $meet, string $id): array
    {
        foreach ($meet['locations'] as $loc) {
            if ($loc['id'] === $id) {
                return $loc;
            }
        }
        return ['id' => $id, 'label' => $id];
    }

    private function lookupIdBySlug(string $slug): ?string
    {
        $aliasPath = $this->aliasPath($slug);
        if (!is_readable($aliasPath)) {
            return null;
        }
        $id = trim((string) file_get_contents($aliasPath));
        return $id !== '' ? $id : null;
    }

    private function writeAlias(string $slug, string $id): void
    {
        $path = $this->aliasPath($slug);
        $this->ensureDir(dirname($path));
        file_put_contents($path, $id . "\n", LOCK_EX);
    }

    private function meetPath(string $id): string
    {
        $safe = preg_replace('/[^a-zA-Z0-9_\-]/', '', $id) ?? $id;
        return $this->dataDir . '/meets/' . $safe . '.meet';
    }

    private function aliasPath(string $slug): string
    {
        $safe = preg_replace('/[^a-z0-9\-]/', '', strtolower($slug)) ?? $slug;
        return $this->dataDir . '/aliases/' . $safe . '.alias';
    }

    private function ensureDir(string $dir): void
    {
        if (!is_dir($dir) && !mkdir($dir, 0775, true) && !is_dir($dir)) {
            throw new \RuntimeException('Unable to create data directory');
        }
    }

    private function writeLocked(string $path, string $content): void
    {
        $tmp = $path . '.tmp.' . bin2hex(random_bytes(4));
        if (file_put_contents($tmp, $content, LOCK_EX) === false) {
            throw new \RuntimeException('Unable to write meeting file');
        }
        if (!rename($tmp, $path)) {
            @unlink($tmp);
            throw new \RuntimeException('Unable to finalize meeting file');
        }
    }
}
