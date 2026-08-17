<?php

namespace Meet;

/**
 * Generates candidate meeting dates from recurrence rules.
 */
final class Recurrence
{
    public static function expand(array $recurrence, string $rangeStart, string $rangeEnd, int $max = 200): array
    {
        $type = $recurrence['type'] ?? 'none';
        if ($type === 'none') {
            return [];
        }

        $start = new \DateTimeImmutable($rangeStart . ' 00:00:00', new \DateTimeZone('UTC'));
        $end = new \DateTimeImmutable($rangeEnd . ' 23:59:59', new \DateTimeZone('UTC'));
        $dates = [];

        switch ($type) {
            case 'daily':
                $dates = self::daily($start, $end, (int) ($recurrence['interval'] ?? 1));
                break;
            case 'weekly':
                $dates = self::weekly($start, $end, (int) ($recurrence['interval'] ?? 1), $recurrence['weekdays'] ?? [1]);
                break;
            case 'monthly_day':
                $dates = self::monthlyDay($start, $end, (int) ($recurrence['day'] ?? 1), (int) ($recurrence['interval'] ?? 1));
                break;
            case 'monthly_nth_weekday':
                $dates = self::monthlyNthWeekday(
                    $start,
                    $end,
                    (int) ($recurrence['weekday'] ?? 1),
                    (int) ($recurrence['nth'] ?? 1),
                    (int) ($recurrence['interval'] ?? 1)
                );
                break;
            case 'friday_13th':
                $dates = self::friday13th($start, $end);
                break;
            case 'custom_dates':
                foreach ($recurrence['dates'] ?? [] as $date) {
                    $d = new \DateTimeImmutable($date, new \DateTimeZone('UTC'));
                    if ($d >= $start && $d <= $end) {
                        $dates[] = $d->format('Y-m-d');
                    }
                }
                break;
        }

        $dates = array_values(array_unique($dates));
        sort($dates);
        return array_slice($dates, 0, $max);
    }

    public static function describe(array $recurrence): string
    {
        $type = $recurrence['type'] ?? 'none';
        $weekdayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

        return match ($type) {
            'none' => 'One-off (no recurrence)',
            'daily' => 'Every ' . max(1, (int) ($recurrence['interval'] ?? 1)) . ' day(s)',
            'weekly' => self::describeWeekly($recurrence, $weekdayNames),
            'monthly_day' => 'The ' . self::ordinalDay((int) ($recurrence['day'] ?? 1)) . ' of ' . self::monthsLabel((int) ($recurrence['interval'] ?? 1)),
            'monthly_nth_weekday' => self::nthLabel((int) ($recurrence['nth'] ?? 1)) . ' '
                . ($weekdayNames[(int) ($recurrence['weekday'] ?? 1)] ?? 'weekday')
                . ' of ' . self::monthsLabel((int) ($recurrence['interval'] ?? 1)),
            'friday_13th' => 'Every Friday the 13th',
            'custom_dates' => 'Specific dates (' . count($recurrence['dates'] ?? []) . ')',
            default => 'Custom recurrence',
        };
    }

    private static function describeWeekly(array $recurrence, array $weekdayNames): string
    {
        $days = [];
        foreach ($recurrence['weekdays'] ?? [1] as $d) {
            $days[] = $weekdayNames[(int) $d] ?? (string) $d;
        }
        return 'Every ' . max(1, (int) ($recurrence['interval'] ?? 1)) . ' week(s) on ' . implode(', ', $days);
    }

    private static function daily(\DateTimeImmutable $start, \DateTimeImmutable $end, int $interval): array
    {
        $dates = [];
        $cursor = $start;
        while ($cursor <= $end) {
            $dates[] = $cursor->format('Y-m-d');
            $cursor = $cursor->modify('+' . max(1, $interval) . ' days');
        }
        return $dates;
    }

    private static function weekly(\DateTimeImmutable $start, \DateTimeImmutable $end, int $interval, array $weekdays): array
    {
        $dates = [];
        $weekStart = $start->modify('monday this week');
        $cursor = $weekStart;
        $weekIndex = 0;

        while ($cursor <= $end->modify('+7 days')) {
            if ($weekIndex % max(1, $interval) === 0) {
                foreach ($weekdays as $weekday) {
                    $day = $cursor->modify('+' . (((int) $weekday + 7 - 1) % 7) . ' days');
                    if ($day >= $start && $day <= $end) {
                        $dates[] = $day->format('Y-m-d');
                    }
                }
            }
            $cursor = $cursor->modify('+7 days');
            $weekIndex++;
        }
        return $dates;
    }

    private static function monthlyDay(\DateTimeImmutable $start, \DateTimeImmutable $end, int $day, int $interval): array
    {
        $dates = [];
        $cursor = $start->modify('first day of this month');
        $monthIndex = 0;

        while ($cursor <= $end) {
            if ($monthIndex % max(1, $interval) === 0) {
                $lastDay = (int) $cursor->format('t');
                $useDay = min(max(1, $day), $lastDay);
                $candidate = $cursor->setDate((int) $cursor->format('Y'), (int) $cursor->format('m'), $useDay);
                if ($candidate >= $start && $candidate <= $end) {
                    $dates[] = $candidate->format('Y-m-d');
                }
            }
            $cursor = $cursor->modify('first day of next month');
            $monthIndex++;
        }
        return $dates;
    }

    private static function monthlyNthWeekday(
        \DateTimeImmutable $start,
        \DateTimeImmutable $end,
        int $weekday,
        int $nth,
        int $interval
    ): array {
        $dates = [];
        $cursor = $start->modify('first day of this month');
        $monthIndex = 0;

        while ($cursor <= $end) {
            if ($monthIndex % max(1, $interval) === 0) {
                $candidate = self::nthWeekdayOfMonth($cursor, $weekday, $nth);
                if ($candidate && $candidate >= $start && $candidate <= $end) {
                    $dates[] = $candidate->format('Y-m-d');
                }
            }
            $cursor = $cursor->modify('first day of next month');
            $monthIndex++;
        }
        return $dates;
    }

    private static function nthWeekdayOfMonth(\DateTimeImmutable $monthStart, int $weekday, int $nth): ?\DateTimeImmutable
    {
        if ($nth > 0) {
            $first = $monthStart;
            $offset = ((int) $weekday - (int) $first->format('w') + 7) % 7;
            $candidate = $first->modify('+' . $offset . ' days')->modify('+' . ($nth - 1) . ' weeks');
            if ($candidate->format('m') === $monthStart->format('m')) {
                return $candidate;
            }
            return null;
        }

        $last = $monthStart->modify('last day of this month');
        $offset = ((int) $last->format('w') - (int) $weekday + 7) % 7;
        return $last->modify('-' . $offset . ' days');
    }

    private static function friday13th(\DateTimeImmutable $start, \DateTimeImmutable $end): array
    {
        $dates = [];
        $year = (int) $start->format('Y');
        $endYear = (int) $end->format('Y');

        for ($y = $year; $y <= $endYear; $y++) {
            for ($m = 1; $m <= 12; $m++) {
                $candidate = \DateTimeImmutable::createFromFormat('Y-n-j', "$y-$m-13", new \DateTimeZone('UTC'));
                if (!$candidate) {
                    continue;
                }
                if ((int) $candidate->format('w') === 5 && $candidate >= $start && $candidate <= $end) {
                    $dates[] = $candidate->format('Y-m-d');
                }
            }
        }
        return $dates;
    }

    private static function nthLabel(int $nth): string
    {
        return match ($nth) {
            1 => '1st',
            2 => '2nd',
            3 => '3rd',
            4 => '4th',
            5 => '5th',
            -1 => 'last',
            default => $nth . 'th',
        };
    }

    private static function ordinalDay(int $day): string
    {
        return match ($day) {
            1, 21, 31 => $day . 'st',
            2, 22 => $day . 'nd',
            3, 23 => $day . 'rd',
            default => $day . 'th',
        };
    }

    private static function monthsLabel(int $interval): string
    {
        $n = max(1, $interval);
        return $n === 1 ? 'every month' : "every {$n} months";
    }
}
