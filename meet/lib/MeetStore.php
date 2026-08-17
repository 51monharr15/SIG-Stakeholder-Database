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

    public function loadBySlug(string $rawSlug, bool $create = true): array
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
        $suggestions = $this->buildSuggestions($meet);
        $recurrenceDates = Recurrence::expand(
            $meet['recurrence'],
            $meet['range_start'],
            $meet['range_end']
        );

        return [
            'id' => $meet['id'],
            'slug' => $meet['slug'],
            'title' => $meet['title'],
            'created' => $meet['created'],
            'updated' => $meet['updated'],
            'duration_minutes' => $meet['duration_minutes'],
            'slot_granularity_minutes' => $meet['slot_granularity_minutes'],
            'range_start' => $meet['range_start'],
            'range_end' => $meet['range_end'],
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
            ], $meet['attendees']),
            'availability' => $meet['availability'],
            'location_preferences' => $meet['location_preferences'],
            'notes' => $meet['notes'],
            'show_weekends' => (bool) ($meet['show_weekends'] ?? false),
            'day_start' => $meet['day_start'] ?? '08:00',
            'day_end' => $meet['day_end'] ?? '20:00',
            'timezone' => $meet['timezone'] ?? '',
            'organizer_intro' => $meet['organizer_intro'] ?? '',
            'page_times_intro' => $meet['page_times_intro'] ?? '',
            'page_after_intro' => $meet['page_after_intro'] ?? '',
            'confirmed_slot' => $meet['confirmed_slot'],
            'confirmed_location' => $meet['confirmed_location'],
            'suggestions' => $suggestions,
        ];
    }

    private function buildSuggestions(array $meet): array
    {
        $slotCounts = [];
        foreach ($meet['availability'] as $slot => $attendeeIds) {
            $slotCounts[$slot] = count($attendeeIds);
        }
        arsort($slotCounts);

        $locationCounts = [];
        foreach ($meet['location_preferences'] as $attendeeId => $locationIds) {
            foreach ($locationIds as $locId) {
                $locationCounts[$locId] = ($locationCounts[$locId] ?? 0) + 1;
            }
        }
        arsort($locationCounts);

        $bestSlots = [];
        foreach (array_slice($slotCounts, 0, 10, true) as $slot => $count) {
            $bestSlots[] = ['slot' => $slot, 'count' => $count, 'attendees' => $meet['availability'][$slot] ?? []];
        }

        $bestLocations = [];
        foreach (array_slice($locationCounts, 0, 5, true) as $locId => $count) {
            $loc = $this->findLocation($meet, $locId);
            $bestLocations[] = [
                'id' => $locId,
                'label' => $loc['label'] ?? $locId,
                'count' => $count,
            ];
        }

        return [
            'slots' => $bestSlots,
            'locations' => $bestLocations,
        ];
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
