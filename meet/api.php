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
        $meet = $store->loadBySlug($slug, false);
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
            case 'claim':
                handleClaim($store, $slug, $input);
                break;
            case 'merge_attendees':
                handleMergeAttendees($store, $slug, $input);
                break;
            case 'set_organizer':
                handleSetOrganizer($store, $slug, $input);
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
    $title = trim((string) ($input['title'] ?? ''));
    $meet = $store->createMeeting($title);
    if (!empty($input['duration_minutes'])) {
        $meet['duration_minutes'] = (int) $input['duration_minutes'];
    }
    if (!empty($input['recurrence']) && is_array($input['recurrence'])) {
        $meet['recurrence'] = $input['recurrence'];
    }
    $store->save($meet);
    Response::json(['ok' => true, 'slug' => $meet['slug'], 'meet' => $store->publicView($meet)]);
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
    $pin = trim((string) ($input['pin'] ?? ''));

    $resolvedId = null;
    $meet = $store->update($meet['id'], function (array $m) use ($displayName, $attendeeId, $alias, $initials, $pin, &$resolvedId) {
        $idx = attendeeIndexById($m['attendees'], $attendeeId);
        if ($idx !== null) {
            applyAttendeeJoin($m['attendees'][$idx], $displayName, $alias, $initials);
            maybeSetAttendeePin($m['attendees'][$idx], $pin);
            $resolvedId = $m['attendees'][$idx]['id'];
            return $m;
        }

        $matchedId = matchExistingAttendee($m['attendees'], $displayName, $alias, $initials);
        if ($matchedId !== null) {
            $idx = attendeeIndexById($m['attendees'], $matchedId);
            if ($idx !== null) {
                applyAttendeeJoin($m['attendees'][$idx], $displayName, $alias, $initials);
                maybeSetAttendeePin($m['attendees'][$idx], $pin);
                $resolvedId = $matchedId;
                return $m;
            }
        }

        $resolvedId = MeetFile::generateId('usr');
        $isFirst = count($m['attendees']) === 0;
        $newAttendee = [
            'id' => $resolvedId,
            'display_name' => $displayName,
            'contact' => $alias,
            'initials' => $initials,
            'pin' => '',
            'organizer' => $isFirst,
        ];
        maybeSetAttendeePin($newAttendee, $pin);
        $m['attendees'][] = $newAttendee;
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

function handleClaim(MeetStore $store, string $slug, array $input): void
{
    $attendeeId = trim((string) ($input['attendee_id'] ?? ''));
    $pin = trim((string) ($input['pin'] ?? ''));
    if ($attendeeId === '') {
        Response::error('attendee_id required');
    }

    $meet = $store->loadBySlug($slug);
    $meet = $store->update($meet['id'], function (array $m) use ($attendeeId, $pin) {
        $idx = attendeeIndexById($m['attendees'], $attendeeId);
        if ($idx === null) {
            throw new \RuntimeException('Attendee not found', 404);
        }
        $att = &$m['attendees'][$idx];
        if (!attendeeHasPin($att)) {
            if ($pin !== '') {
                setAttendeePin($att, $pin);
            }
            return $m;
        }
        if (!verifyAttendeePin($att, $pin)) {
            throw new \RuntimeException('Incorrect PIN for this attendee', 403);
        }
        return $m;
    });

    Response::json([
        'ok' => true,
        'attendee_id' => $attendeeId,
        'meet' => $store->publicView($meet),
    ]);
}

function handleMergeAttendees(MeetStore $store, string $slug, array $input): void
{
    $keepId = trim((string) ($input['keep_id'] ?? ''));
    $removeId = trim((string) ($input['remove_id'] ?? ''));
    $actingId = trim((string) ($input['acting_attendee_id'] ?? ''));
    $pin = trim((string) ($input['pin'] ?? ''));
    if ($keepId === '' || $removeId === '' || $keepId === $removeId) {
        Response::error('keep_id and remove_id required and must differ');
    }
    if ($actingId === '' || !in_array($actingId, array_column($m['attendees'], 'id'), true)) {
        Response::error('acting_attendee_id required');
    }

    $meet = $store->loadBySlug($slug);
    $meet = $store->update($meet['id'], function (array $m) use ($keepId, $removeId, $actingId, $pin) {
        $keepIdx = attendeeIndexById($m['attendees'], $keepId);
        $removeIdx = attendeeIndexById($m['attendees'], $removeId);
        if ($keepIdx === null || $removeIdx === null) {
            throw new \RuntimeException('Attendee not found', 404);
        }
        $remove = $m['attendees'][$removeIdx];
        $actingIsOrganizer = attendeeIsOrganizer($m['attendees'], $actingId);

        if ($actingIsOrganizer) {
            mergeAttendeeRows($m, $keepId, $removeId);
            return $m;
        }

        if ($actingId !== $keepId && $actingId !== $removeId) {
            throw new \RuntimeException('acting_attendee_id must be keep_id or remove_id', 403);
        }

        if (attendeeHasPin($remove)) {
            if (!verifyAttendeePin($remove, $pin)) {
                throw new \RuntimeException('PIN required to merge the duplicate row', 403);
            }
        } elseif ($actingId !== $keepId) {
            throw new \RuntimeException('Only the row you are keeping can merge an unsecured duplicate', 403);
        }
        mergeAttendeeRows($m, $keepId, $removeId);
        return $m;
    });

    Response::json([
        'ok' => true,
        'attendee_id' => $keepId,
        'meet' => $store->publicView($meet),
    ]);
}

/** @param array<string, mixed> $attendee */
function attendeeHasPin(array $attendee): bool
{
    return ($attendee['pin'] ?? '') !== '';
}

/** @param array<string, mixed> $attendee */
function verifyAttendeePin(array $attendee, string $pin): bool
{
    if (!attendeeHasPin($attendee)) {
        return true;
    }
    $pin = normalizePin($pin);
    if ($pin === '') {
        return false;
    }
    return $pin === (string) ($attendee['pin'] ?? '');
}

/** @param array<string, mixed> $attendee */
function setAttendeePin(array &$attendee, string $pin): void
{
    $pin = normalizePin($pin);
    if ($pin === '') {
        return;
    }
    $attendee['pin'] = $pin;
}

/** @param array<string, mixed> $attendee */
function maybeSetAttendeePin(array &$attendee, string $pin): void
{
    if ($pin === '' || attendeeHasPin($attendee)) {
        return;
    }
    setAttendeePin($attendee, $pin);
}

function normalizePin(string $pin): string
{
    return preg_replace('/\D/', '', $pin) ?? '';
}

/** @param array<int, array<string, mixed>> $attendees */
function attendeeIsOrganizer(array $attendees, string $id): bool
{
    $idx = attendeeIndexById($attendees, $id);
    if ($idx === null) {
        return false;
    }
    return !empty($attendees[$idx]['organizer']);
}

function handleSetOrganizer(MeetStore $store, string $slug, array $input): void
{
    $actingId = trim((string) ($input['acting_attendee_id'] ?? ''));
    $targetId = trim((string) ($input['attendee_id'] ?? ''));
    $organizer = !empty($input['organizer']);
    if ($actingId === '' || $targetId === '') {
        Response::error('acting_attendee_id and attendee_id required');
    }

    $meet = $store->loadBySlug($slug);
    $meet = $store->update($meet['id'], function (array $m) use ($actingId, $targetId, $organizer) {
        if (!attendeeIsOrganizer($m['attendees'], $actingId)) {
            throw new \RuntimeException('Only a meeting organiser can change organiser flags', 403);
        }
        $targetIdx = attendeeIndexById($m['attendees'], $targetId);
        if ($targetIdx === null) {
            throw new \RuntimeException('Attendee not found', 404);
        }
        if (!$organizer && !empty($m['attendees'][$targetIdx]['organizer'])) {
            $others = 0;
            foreach ($m['attendees'] as $att) {
                if (!empty($att['organizer']) && ($att['id'] ?? '') !== $targetId) {
                    $others++;
                }
            }
            if ($others === 0) {
                throw new \RuntimeException('At least one meeting organiser is required', 400);
            }
        }
        $m['attendees'][$targetIdx]['organizer'] = $organizer;
        return $m;
    });

    Response::json(['ok' => true, 'meet' => $store->publicView($meet)]);
}

/** @param array<string, mixed> $meet */
function mergeAttendeeRows(array &$meet, string $keepId, string $removeId): void
{
    foreach ($meet['availability'] as $slot => $ids) {
        $hadRemove = in_array($removeId, $ids, true);
        $ids = array_values(array_filter($ids, fn ($id) => $id !== $removeId));
        if ($hadRemove && !in_array($keepId, $ids, true)) {
            $ids[] = $keepId;
        }
        if ($ids === []) {
            unset($meet['availability'][$slot]);
        } else {
            $meet['availability'][$slot] = $ids;
        }
    }

    $removePrefs = $meet['location_preferences'][$removeId] ?? [];
    $keepPrefs = $meet['location_preferences'][$keepId] ?? [];
    $meet['location_preferences'][$keepId] = array_values(array_unique(array_merge($keepPrefs, $removePrefs)));
    unset($meet['location_preferences'][$removeId]);

    $meet['attendees'] = array_values(array_filter(
        $meet['attendees'],
        fn ($att) => ($att['id'] ?? '') !== $removeId
    ));
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
