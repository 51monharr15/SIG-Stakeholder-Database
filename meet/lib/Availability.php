<?php

namespace Meet;

/**
 * Overlap and partial-availability analysis for meeting windows.
 */
final class Availability
{
    /**
     * @return array{slots: array<int, array<string, mixed>>, partial_slots: array<int, array<string, mixed>>, locations: array}
     */
    public static function buildSuggestions(array $meet): array
    {
        $duration = max(1, (int) ($meet['duration_minutes'] ?? 60));
        $granularity = max(1, (int) ($meet['slot_granularity_minutes'] ?? 30));
        $attendeeIds = array_column($meet['attendees'] ?? [], 'id');
        $total = count($attendeeIds);

        $starts = array_keys($meet['availability'] ?? []);
        $full = [];
        $partial = [];

        foreach ($starts as $startIso) {
            $window = self::windowSlotKeys($startIso, $duration, $granularity);
            if ($window === []) {
                continue;
            }
            $windowLen = count($window);
            $coverage = [];
            foreach ($attendeeIds as $aid) {
                $n = 0;
                foreach ($window as $slot) {
                    $key = self::resolveSlotKey($meet['availability'], $slot);
                    if ($key !== null && in_array($aid, $meet['availability'][$key] ?? [], true)) {
                        $n++;
                    }
                }
                $coverage[$aid] = $n;
            }

            $fullAttendees = [];
            $partialAttendees = [];
            foreach ($coverage as $aid => $n) {
                if ($n === $windowLen) {
                    $fullAttendees[] = $aid;
                } elseif ($n > 0) {
                    $partialAttendees[] = [
                        'id' => $aid,
                        'slots_marked' => $n,
                        'slots_needed' => $windowLen,
                    ];
                }
            }

            $absent = [];
            foreach ($coverage as $aid => $n) {
                if ($n === 0) {
                    $absent[] = $aid;
                }
            }

            if ($total > 0 && count($fullAttendees) === $total) {
                $full[] = [
                    'slot' => $startIso,
                    'count' => $total,
                    'attendees' => $fullAttendees,
                    'kind' => 'full',
                ];
            } elseif (count($fullAttendees) > 0 || count($partialAttendees) > 0) {
                $partial[] = [
                    'slot' => $startIso,
                    'attendees_full' => $fullAttendees,
                    'attendees_partial' => $partialAttendees,
                    'attendees_absent' => $absent,
                    'slots_needed' => $windowLen,
                    'kind' => 'partial',
                ];
            }
        }

        usort($full, fn ($a, $b) => strcmp($a['slot'], $b['slot']));
        usort($partial, fn ($a, $b) => strcmp($a['slot'], $b['slot']));

        $locationCounts = [];
        foreach ($meet['location_preferences'] ?? [] as $attendeeId => $locationIds) {
            foreach ($locationIds as $locId) {
                $locationCounts[$locId] = ($locationCounts[$locId] ?? 0) + 1;
            }
        }
        arsort($locationCounts);

        $bestLocations = [];
        foreach (array_slice($locationCounts, 0, 5, true) as $locId => $count) {
            $label = $locId;
            foreach ($meet['locations'] ?? [] as $loc) {
                if (($loc['id'] ?? '') === $locId) {
                    $label = $loc['label'] ?? $locId;
                    break;
                }
            }
            $bestLocations[] = ['id' => $locId, 'label' => $label, 'count' => $count];
        }

        return [
            'slots' => array_slice($full, 0, 20),
            'partial_slots' => array_slice($partial, 0, 20),
            'locations' => $bestLocations,
        ];
    }

    /**
     * @return list<string>
     */
    public static function windowSlotKeys(string $startIso, int $durationMinutes, int $granularityMinutes): array
    {
        try {
            $start = new \DateTimeImmutable($startIso);
        } catch (\Exception) {
            return [];
        }

        $steps = (int) max(1, ceil($durationMinutes / $granularityMinutes));
        $slots = [];
        for ($i = 0; $i < $steps; $i++) {
            $dt = $start->modify('+' . ($i * $granularityMinutes) . ' minutes')->setTimezone(new \DateTimeZone('UTC'));
            $slots[] = $dt->format('Y-m-d\TH:i:s') . '.000Z';
        }

        return $slots;
    }

    /** @param array<string, list<string>> $availability */
    private static function resolveSlotKey(array $availability, string $iso): ?string
    {
        if (isset($availability[$iso])) {
            return $iso;
        }
        try {
            $target = (new \DateTimeImmutable($iso))->getTimestamp();
            foreach (array_keys($availability) as $key) {
                if ((new \DateTimeImmutable($key))->getTimestamp() === $target) {
                    return $key;
                }
            }
        } catch (\Exception) {
            return null;
        }
        return null;
    }
}
