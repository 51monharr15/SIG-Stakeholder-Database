<?php

require __DIR__ . '/lib/autoload.php';

use Meet\MeetFile;
use Meet\MeetStore;
use Meet\Response;

header('X-Content-Type-Options: nosniff');

$store = new MeetStore();

try {
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    $action = $_GET['action'] ?? '';

    if ($method === 'GET' && $action === '') {
        $slug = $_GET['slug'] ?? '';
        if ($slug === '') {
            Response::error('Missing slug', 400);
        }
        $meet = $store->loadBySlug($slug, true);
        Response::json(['ok' => true, 'meet' => $store->publicView($meet)]);
    }

    if ($method === 'POST') {
        $input = json_decode(file_get_contents('php://input') ?: '{}', true);
        if (!is_array($input)) {
            Response::error('Invalid JSON body');
        }
        $action = $input['action'] ?? $action;
        $slug = $input['slug'] ?? ($_GET['slug'] ?? '');

        switch ($action) {
            case 'create':
                handleCreate($store, $input);
                break;
            case 'join':
                handleJoin($store, $slug, $input);
                break;
            case 'save_availability':
                handleSaveAvailability($store, $slug, $input);
                break;
            case 'update_meta':
                handleUpdateMeta($store, $slug, $input);
                break;
            case 'add_location':
                handleAddLocation($store, $slug, $input);
                break;
            case 'save_location_prefs':
                handleSaveLocationPrefs($store, $slug, $input);
                break;
            case 'add_attachment':
                handleAddAttachment($store, $slug, $input);
                break;
            case 'confirm':
                handleConfirm($store, $slug, $input);
                break;
            default:
                Response::error('Unknown action', 400);
        }
    }

    Response::error('Not found', 404);
} catch (\RuntimeException $e) {
    $code = (int) $e->getCode();
    if ($code < 400 || $code > 599) {
        $code = 500;
    }
    Response::error($e->getMessage(), $code);
} catch (\Throwable $e) {
    Response::error('Server error', 500);
}

function handleCreate(MeetStore $store, array $input): void
{
    $slug = MeetFile::slugify((string) ($input['slug'] ?? ''));
    if ($slug === '') {
        Response::error('Slug is required');
    }

    $meet = MeetFile::create($slug, (string) ($input['title'] ?? ''));
    if (!empty($input['range_start'])) {
        $meet['range_start'] = $input['range_start'];
    }
    if (!empty($input['range_end'])) {
        $meet['range_end'] = $input['range_end'];
    }
    if (!empty($input['duration_minutes'])) {
        $meet['duration_minutes'] = (int) $input['duration_minutes'];
    }
    if (!empty($input['recurrence']) && is_array($input['recurrence'])) {
        $meet['recurrence'] = $input['recurrence'];
    }

    $store->save($meet);
    Response::json(['ok' => true, 'meet' => $store->publicView($meet)]);
}

function handleJoin(MeetStore $store, string $slug, array $input): void
{
    $displayName = trim((string) ($input['display_name'] ?? ''));
    if ($displayName === '') {
        Response::error('Display name is required');
    }

    $meet = $store->loadBySlug($slug);
    $attendeeId = trim((string) ($input['attendee_id'] ?? ''));
    $alias = trim((string) ($input['contact'] ?? ($input['alias'] ?? '')));
    $initials = strtoupper(trim((string) ($input['initials'] ?? '')));

    $resolvedId = null;
    $meet = $store->update($meet['id'], function (array $m) use ($displayName, $attendeeId, $alias, $initials, &$resolvedId) {
        $idx = attendeeIndexById($m['attendees'], $attendeeId);
        if ($idx !== null) {
            applyAttendeeJoin($m['attendees'][$idx], $displayName, $alias, $initials);
            $resolvedId = $m['attendees'][$idx]['id'];
            return $m;
        }

        $matchedId = matchExistingAttendee($m['attendees'], $displayName, $alias, $initials);
        if ($matchedId !== null) {
            $idx = attendeeIndexById($m['attendees'], $matchedId);
            if ($idx !== null) {
                applyAttendeeJoin($m['attendees'][$idx], $displayName, $alias, $initials);
                $resolvedId = $matchedId;
                return $m;
            }
        }

        $resolvedId = MeetFile::generateId('usr');
        $m['attendees'][] = [
            'id' => $resolvedId,
            'display_name' => $displayName,
            'contact' => $alias,
            'initials' => $initials,
        ];
        return $m;
    });

    Response::json([
        'ok' => true,
        'attendee_id' => $resolvedId,
        'meet' => $store->publicView($meet),
    ]);
}

/** @param array<int, array<string, mixed>> $attendees */
function attendeeIndexById(array $attendees, string $id): ?int
{
    if ($id === '') {
        return null;
    }
    foreach ($attendees as $i => $att) {
        if (($att['id'] ?? '') === $id) {
            return $i;
        }
    }
    return null;
}

/** @param array<string, mixed> $attendee */
function applyAttendeeJoin(array &$attendee, string $displayName, string $contact, string $initials): void
{
    $attendee['display_name'] = $displayName;
    if ($contact !== '') {
        $attendee['contact'] = $contact;
    }
    if ($initials !== '') {
        $attendee['initials'] = $initials;
    }
}

/**
 * Reuse an existing row when the join clearly refers to the same person.
 *
 * @param array<int, array<string, mixed>> $attendees
 */
function matchExistingAttendee(array $attendees, string $displayName, string $contact, string $initials): ?string
{
    $nameKey = strtolower($displayName);
    $contactKey = strtolower($contact);
    $initialsKey = strtoupper($initials);

    if ($contactKey !== '') {
        $matches = [];
        foreach ($attendees as $att) {
            if (strtolower(trim((string) ($att['contact'] ?? ''))) === $contactKey) {
                $matches[] = $att['id'];
            }
        }
        if (count($matches) === 1) {
            return $matches[0];
        }
    }

    if ($initialsKey !== '') {
        $matches = [];
        foreach ($attendees as $att) {
            if (strtolower(trim((string) ($att['display_name'] ?? ''))) === $nameKey
                && strtoupper(trim((string) ($att['initials'] ?? ''))) === $initialsKey) {
                $matches[] = $att['id'];
            }
        }
        if (count($matches) === 1) {
            return $matches[0];
        }
    }

    $matches = [];
    foreach ($attendees as $att) {
        if (strtolower(trim((string) ($att['display_name'] ?? ''))) === $nameKey) {
            $matches[] = $att['id'];
        }
    }
    if (count($matches) === 1) {
        return $matches[0];
    }

    return null;
}

function handleSaveAvailability(MeetStore $store, string $slug, array $input): void
{
    $attendeeId = trim((string) ($input['attendee_id'] ?? ''));
    $slots = $input['slots'] ?? [];
    if ($attendeeId === '' || !is_array($slots)) {
        Response::error('attendee_id and slots array required');
    }

    $meet = $store->loadBySlug($slug);
    $meet = $store->update($meet['id'], function (array $m) use ($attendeeId, $slots) {
        foreach ($m['availability'] as $slot => $ids) {
            $m['availability'][$slot] = array_values(array_filter($ids, fn ($id) => $id !== $attendeeId));
            if ($m['availability'][$slot] === []) {
                unset($m['availability'][$slot]);
            }
        }
        foreach ($slots as $slot) {
            $slot = trim((string) $slot);
            if ($slot === '') {
                continue;
            }
            $m['availability'][$slot] = $m['availability'][$slot] ?? [];
            if (!in_array($attendeeId, $m['availability'][$slot], true)) {
                $m['availability'][$slot][] = $attendeeId;
            }
        }
        return $m;
    });

    Response::json(['ok' => true, 'meet' => $store->publicView($meet)]);
}

function handleUpdateMeta(MeetStore $store, string $slug, array $input): void
{
    $meet = $store->loadBySlug($slug);
    $meet = $store->update($meet['id'], function (array $m) use ($input) {
        $fields = [
            'title', 'notes', 'range_start', 'range_end',
            'duration_minutes', 'slot_granularity_minutes',
            'day_start', 'day_end', 'timezone',
            'organizer_intro', 'page_times_intro', 'page_after_intro',
        ];
        foreach ($fields as $field) {
            if (array_key_exists($field, $input)) {
                $m[$field] = $input[$field];
            }
        }
        if (array_key_exists('show_weekends', $input)) {
            $m['show_weekends'] = (bool) $input['show_weekends'];
        }
        if (!empty($input['agenda']) && is_array($input['agenda'])) {
            $m['agenda'] = array_values(array_filter(array_map('trim', $input['agenda'])));
        }
        if (!empty($input['decisions']) && is_array($input['decisions'])) {
            $m['decisions'] = array_values(array_filter(array_map('trim', $input['decisions'])));
        }
        if (!empty($input['recurrence']) && is_array($input['recurrence'])) {
            $m['recurrence'] = $input['recurrence'];
        }
        return $m;
    });

    Response::json(['ok' => true, 'meet' => $store->publicView($meet)]);
}

function handleAddLocation(MeetStore $store, string $slug, array $input): void
{
    $label = trim((string) ($input['label'] ?? ''));
    if ($label === '') {
        Response::error('Location label required');
    }

    $meet = $store->loadBySlug($slug);
    $location = [
        'id' => MeetFile::generateId('loc'),
        'label' => $label,
        'kind' => trim((string) ($input['kind'] ?? 'other')),
        'detail' => trim((string) ($input['detail'] ?? '')),
    ];

    $meet = $store->update($meet['id'], function (array $m) use ($location) {
        $m['locations'][] = $location;
        return $m;
    });

    Response::json(['ok' => true, 'location' => $location, 'meet' => $store->publicView($meet)]);
}

function handleSaveLocationPrefs(MeetStore $store, string $slug, array $input): void
{
    $attendeeId = trim((string) ($input['attendee_id'] ?? ''));
    $locationIds = $input['location_ids'] ?? [];
    if ($attendeeId === '' || !is_array($locationIds)) {
        Response::error('attendee_id and location_ids required');
    }

    $meet = $store->loadBySlug($slug);
    $meet = $store->update($meet['id'], function (array $m) use ($attendeeId, $locationIds) {
        $m['location_preferences'][$attendeeId] = array_values(array_unique(array_map('strval', $locationIds)));
        return $m;
    });

    Response::json(['ok' => true, 'meet' => $store->publicView($meet)]);
}

function handleAddAttachment(MeetStore $store, string $slug, array $input): void
{
    $label = trim((string) ($input['label'] ?? ''));
    $type = trim((string) ($input['type'] ?? 'url'));
    if ($label === '' || !in_array($type, ['url', 'text'], true)) {
        Response::error('Valid label and type (url|text) required');
    }

    $attachment = [
        'id' => MeetFile::generateId('doc'),
        'type' => $type,
        'label' => $label,
    ];
    if ($type === 'url') {
        $attachment['url'] = trim((string) ($input['url'] ?? ''));
    } else {
        $attachment['body'] = (string) ($input['body'] ?? '');
    }

    $meet = $store->loadBySlug($slug);
    $meet = $store->update($meet['id'], function (array $m) use ($attachment) {
        $m['attachments'][] = $attachment;
        return $m;
    });

    Response::json(['ok' => true, 'attachment' => $attachment, 'meet' => $store->publicView($meet)]);
}

function handleConfirm(MeetStore $store, string $slug, array $input): void
{
    $meet = $store->loadBySlug($slug);
    $meet = $store->update($meet['id'], function (array $m) use ($input) {
        if (!empty($input['confirmed_slot'])) {
            $m['confirmed_slot'] = trim((string) $input['confirmed_slot']);
        }
        if (!empty($input['confirmed_location'])) {
            $m['confirmed_location'] = trim((string) $input['confirmed_location']);
        }
        return $m;
    });

    Response::json(['ok' => true, 'meet' => $store->publicView($meet)]);
}
