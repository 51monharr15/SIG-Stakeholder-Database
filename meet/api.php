<?php

require __DIR__ . '/lib/autoload.php';

use Meet\MeetFile;
use Meet\MeetStore;
use Meet\Response;
use Meet\Timezone;

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
            case 'list_meetings':
                handleListMeetings($store, $input);
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
            case 'update_location':
                handleUpdateLocation($store, $slug, $input);
                break;
            case 'remove_location':
                handleRemoveLocation($store, $slug, $input);
                break;
            case 'save_location_prefs':
                handleSaveLocationPrefs($store, $slug, $input);
                break;
            case 'add_attachment':
                handleAddAttachment($store, $slug, $input);
                break;
            case 'update_attachment':
                handleUpdateAttachment($store, $slug, $input);
                break;
            case 'remove_attachment':
                handleRemoveAttachment($store, $slug, $input);
                break;
            case 'confirm':
                handleConfirm($store, $slug, $input);
                break;
            case 'add_attendee':
                handleAddAttendee($store, $slug, $input);
                break;
            case 'update_attendee':
                handleUpdateAttendee($store, $slug, $input);
                break;
            case 'remove_attendee':
                handleRemoveAttendee($store, $slug, $input);
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
    error_log('meet api.php: ' . $e->getMessage() . ' in ' . $e->getFile() . ':' . $e->getLine());
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
    $clientTz = trim((string) ($input['timezone'] ?? ($input['client_timezone'] ?? '')));
    if ($clientTz !== '') {
        $meet['timezone'] = Timezone::normalize($clientTz);
    }
    $store->save($meet);
    Response::json(['ok' => true, 'slug' => $meet['slug'], 'meet' => $store->publicView($meet)]);
}

function handleListMeetings(MeetStore $store, array $input): void
{
    $displayName = trim((string) ($input['display_name'] ?? ''));
    $pin = trim((string) ($input['pin'] ?? ''));
    if ($displayName === '' || $pin === '') {
        Response::error('Name and PIN are required');
    }

    $meetings = $store->listMeetingsForOrganizer($displayName, $pin);
    Response::json(['ok' => true, 'meetings' => $meetings]);
}

function handleJoin(MeetStore $store, string $slug, array $input): void
{
    $displayName = trim((string) ($input['display_name'] ?? ''));
    if ($displayName === '') {
        Response::error('Display name is required');
    }

    $meet = $store->loadBySlug($slug);
    $attendeeId = trim((string) ($input['attendee_id'] ?? ''));
    $alias = validateContactField(trim((string) ($input['contact'] ?? ($input['alias'] ?? ''))));
    $initials = strtoupper(trim((string) ($input['initials'] ?? '')));
    $pin = trim((string) ($input['pin'] ?? ''));

    $resolvedId = null;
    $clientTz = trim((string) ($input['client_timezone'] ?? ($input['timezone'] ?? '')));
    $meet = $store->update($meet['id'], function (array $m) use ($displayName, $attendeeId, $alias, $initials, $pin, $clientTz, &$resolvedId) {
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
        if ($isFirst || !Timezone::isValid((string) ($m['timezone'] ?? ''))) {
            $m['timezone'] = Timezone::normalize((string) ($m['timezone'] ?? ''), $clientTz !== '' ? $clientTz : 'UTC');
        }
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
    if ($actingId === '') {
        Response::error('acting_attendee_id required');
    }

    $meet = $store->loadBySlug($slug);
    if (!in_array($actingId, array_column($meet['attendees'], 'id'), true)) {
        Response::error('acting_attendee_id not found');
    }

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
    $pin = sanitizePasscode($pin);
    if ($pin === '') {
        return false;
    }
    return $pin === sanitizePasscode((string) ($attendee['pin'] ?? ''));
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
function clearAttendeePin(array &$attendee): void
{
    $attendee['pin'] = '';
}

/** @param array<string, mixed> $attendee */
function maybeSetAttendeePin(array &$attendee, string $pin): void
{
    if ($pin === '' || attendeeHasPin($attendee)) {
        return;
    }
    setAttendeePin($attendee, $pin);
}

/** Fold case and strip unsafe characters. Does not enforce length (legacy codes). */
function sanitizePasscode(string $pin): string
{
    return MeetFile::normalizePasscode($pin);
}

/** Sanitize and require length 2–20 for newly set passcodes. */
function normalizePin(string $pin): string
{
    $pin = sanitizePasscode($pin);
    $len = strlen($pin);
    if ($len < 2 || $len > 20) {
        return '';
    }
    return $pin;
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

/** @param array<string, mixed> $meet */
function removeAttendeeFromMeet(array &$meet, string $attendeeId): void
{
    if (attendeeIndexById($meet['attendees'], $attendeeId) === null) {
        throw new \RuntimeException('Attendee not found', 404);
    }
    if (count($meet['attendees']) <= 1) {
        throw new \RuntimeException('Cannot remove the only attendee', 400);
    }

    foreach ($meet['availability'] as $slot => $ids) {
        $meet['availability'][$slot] = array_values(array_filter($ids, fn ($id) => $id !== $attendeeId));
        if ($meet['availability'][$slot] === []) {
            unset($meet['availability'][$slot]);
        }
    }

    unset($meet['location_preferences'][$attendeeId]);

    $meet['attendees'] = array_values(array_filter(
        $meet['attendees'],
        fn ($att) => ($att['id'] ?? '') !== $attendeeId
    ));
}

function handleRemoveAttendee(MeetStore $store, string $slug, array $input): void
{
    $actingId = trim((string) ($input['acting_attendee_id'] ?? ''));
    $targetId = trim((string) ($input['attendee_id'] ?? ''));
    if ($actingId === '' || $targetId === '') {
        Response::error('acting_attendee_id and attendee_id required');
    }

    $meet = $store->loadBySlug($slug);
    requireActingOrganizer($meet, $actingId);

    $meet = $store->update($meet['id'], function (array $m) use ($targetId) {
        removeAttendeeFromMeet($m, $targetId);
    });

    Response::json([
        'ok' => true,
        'meet' => $store->publicView($meet),
    ]);
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
    $organizerFields = [
        'title', 'duration_minutes', 'slot_granularity_minutes', 'day_start', 'day_end',
        'timezone', 'show_weekends', 'organizer_intro', 'page_times_intro', 'page_after_intro',
        'range_start', 'range_end', 'recurrence',
        'am_start', 'am_end', 'pm_start', 'pm_end',
    ];
    $needsOrganizer = false;
    foreach ($organizerFields as $field) {
        if (array_key_exists($field, $input)) {
            $needsOrganizer = true;
            break;
        }
    }
    if ($needsOrganizer && count($meet['attendees']) > 0) {
        requireActingOrganizer($meet, trim((string) ($input['acting_attendee_id'] ?? '')));
    }

    $meet = $store->update($meet['id'], function (array $m) use ($input) {
        $fields = [
            'title', 'notes', 'range_start', 'range_end',
            'duration_minutes', 'slot_granularity_minutes',
            'day_start', 'day_end', 'timezone',
            'am_start', 'am_end', 'pm_start', 'pm_end',
            'organizer_intro', 'page_times_intro', 'page_after_intro',
        ];
        foreach ($fields as $field) {
            if (array_key_exists($field, $input)) {
                $m[$field] = $input[$field];
            }
        }
        if (array_key_exists('timezone', $input)) {
            $m['timezone'] = Timezone::normalize((string) $input['timezone']);
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
        $duration = (int) ($m['duration_minutes'] ?? 60);
        $slot = (int) ($m['slot_granularity_minutes'] ?? 30);
        $slotErr = MeetFile::validateDurationSlot($duration, $slot);
        if ($slotErr !== null) {
            throw new \RuntimeException($slotErr, 400);
        }
        return $m;
    });

    Response::json(['ok' => true, 'meet' => $store->publicView($meet)]);
}

function isRowLocationInput(array $input): bool
{
    return array_key_exists('location_text', $input)
        || array_key_exists('online_url', $input)
        || array_key_exists('physical_text', $input)
        || array_key_exists('notes', $input);
}

/** @return array{online: string, physical: string} */
function parseLocationTextField(string $text): array
{
    $text = trim($text);
    if ($text === '') {
        return ['online' => '', 'physical' => ''];
    }
    if (preg_match('#^https?://#i', $text)) {
        $url = normalizeAttachmentUrl($text);
        if (!preg_match('#^https?://#i', $url)) {
            throw new \RuntimeException('Location URL must be a well-formed web address (http:// or https://).', 400);
        }

        return ['online' => $url, 'physical' => ''];
    }
    if (looksLikeMalformedLocationUrl($text)) {
        return ['online' => '', 'physical' => $text];
    }

    return ['online' => '', 'physical' => $text];
}

function looksLikeMalformedLocationUrl(string $text): bool
{
    $markers = ['/', '.', 'ww', ':', 'ttp'];
    $count = 0;
    foreach ($markers as $m) {
        if (str_contains($text, $m)) {
            $count++;
        }
    }

    return $count >= 3;
}

/** @return array{id: string, label: string, kind: string, detail: string} */
function buildRowLocation(array $input, ?string $existingId = null): array
{
    $notes = trim((string) ($input['notes'] ?? $input['label'] ?? ''));
    if (array_key_exists('location_text', $input)) {
        $parsed = parseLocationTextField((string) ($input['location_text'] ?? ''));
        $online = $parsed['online'];
        $physical = $parsed['physical'];
    } else {
        $online = trim((string) ($input['online_url'] ?? ''));
        $physical = trim((string) ($input['physical_text'] ?? ''));
    }
    if ($online === '' && $physical === '') {
        throw new \RuntimeException('Enter a location (URL or place name).', 400);
    }
    if ($online !== '') {
        $online = normalizeAttachmentUrl($online);
        if (!preg_match('#^https?://#i', $online)) {
            throw new \RuntimeException('Location URL must be a well-formed web address (http:// or https://).', 400);
        }
    }
    $label = $notes !== '' ? $notes : ($online !== '' ? 'Online' : 'Physical');

    return [
        'id' => $existingId ?? MeetFile::generateId('loc'),
        'label' => $label,
        'kind' => 'row',
        'detail' => json_encode(['online' => $online, 'physical' => $physical], JSON_UNESCAPED_UNICODE),
    ];
}

function handleAddLocation(MeetStore $store, string $slug, array $input): void
{
    $meet = $store->loadBySlug($slug);

    if (isRowLocationInput($input)) {
        $location = buildRowLocation($input);
    } else {
        $label = trim((string) ($input['label'] ?? ''));
        if ($label === '') {
            Response::error('Location label required');
        }

        $kind = trim((string) ($input['kind'] ?? 'other'));
        $detail = trim((string) ($input['detail'] ?? ''));
        if ($kind === 'video' && $detail === '') {
            $detail = 'Link to be added';
        }

        $location = [
            'id' => MeetFile::generateId('loc'),
            'label' => $label,
            'kind' => $kind,
            'detail' => $detail,
        ];

        if (in_array($location['kind'], ['video', 'hybrid'], true) && $location['detail'] !== '') {
            $location['detail'] = normalizeLocationDetail($location['kind'], $location['detail']);
        }
    }

    $meet = $store->update($meet['id'], function (array $m) use ($location) {
        $m['locations'][] = $location;
        return $m;
    });

    Response::json(['ok' => true, 'location' => $location, 'meet' => $store->publicView($meet)]);
}

function handleUpdateLocation(MeetStore $store, string $slug, array $input): void
{
    $locationId = trim((string) ($input['location_id'] ?? ''));
    if ($locationId === '') {
        Response::error('location_id required');
    }

    $meet = $store->loadBySlug($slug);

    if (isRowLocationInput($input)) {
        $location = buildRowLocation($input, $locationId);
        $meet = $store->update($meet['id'], function (array $m) use ($locationId, $location) {
            $found = false;
            foreach ($m['locations'] as &$loc) {
                if (($loc['id'] ?? '') !== $locationId) {
                    continue;
                }
                $found = true;
                $loc['label'] = $location['label'];
                $loc['kind'] = $location['kind'];
                $loc['detail'] = $location['detail'];
                break;
            }
            unset($loc);
            if (!$found) {
                throw new \RuntimeException('Location not found', 404);
            }
            return $m;
        });
    } else {
        $label = trim((string) ($input['label'] ?? ''));
        $kind = trim((string) ($input['kind'] ?? ''));
        $detail = trim((string) ($input['detail'] ?? ''));
        if ($label === '') {
            Response::error('label required');
        }
        if ($kind === '') {
            Response::error('kind required');
        }
        if ($kind === 'video' && $detail === '') {
            $detail = 'Link to be added';
        }

        $meet = $store->update($meet['id'], function (array $m) use ($locationId, $label, $kind, $detail) {
            $found = false;
            foreach ($m['locations'] as &$loc) {
                if (($loc['id'] ?? '') !== $locationId) {
                    continue;
                }
                $found = true;
                $loc['label'] = $label;
                $loc['kind'] = $kind;
                $loc['detail'] = $detail;
                if (in_array($kind, ['video', 'hybrid'], true) && $detail !== '') {
                    $loc['detail'] = normalizeLocationDetail($kind, $detail);
                }
                break;
            }
            unset($loc);
            if (!$found) {
                throw new \RuntimeException('Location not found', 404);
            }
            return $m;
        });
    }

    Response::json(['ok' => true, 'meet' => $store->publicView($meet)]);
}

function handleRemoveLocation(MeetStore $store, string $slug, array $input): void
{
    $actingId = trim((string) ($input['acting_attendee_id'] ?? ''));
    $locationId = trim((string) ($input['location_id'] ?? ''));
    if ($locationId === '') {
        Response::error('location_id required');
    }

    $meet = $store->loadBySlug($slug);
    requireActingOrganizer($meet, $actingId);

    $meet = $store->update($meet['id'], function (array $m) use ($locationId) {
        $confirmedIds = array_values(array_unique(array_filter(array_map(
            'strval',
            $m['confirmed_location_ids'] ?? []
        ))));
        foreach (['confirmed_location', 'confirmed_location_physical', 'confirmed_location_online'] as $legacyKey) {
            $legacyId = trim((string) ($m[$legacyKey] ?? ''));
            if ($legacyId !== '' && !in_array($legacyId, $confirmedIds, true)) {
                $confirmedIds[] = $legacyId;
            }
        }
        if (in_array($locationId, $confirmedIds, true)) {
            throw new \RuntimeException('Cannot delete a confirmed location. Clear it from Set confirmed meeting details first, then remove this one.', 400);
        }
        $m['locations'] = array_values(array_filter(
            $m['locations'],
            fn ($loc) => ($loc['id'] ?? '') !== $locationId
        ));
        foreach ($m['location_preferences'] as $attendeeId => $ids) {
            $m['location_preferences'][$attendeeId] = array_values(array_filter(
                $ids,
                fn ($id) => $id !== $locationId
            ));
        }
        return $m;
    });

    Response::json(['ok' => true, 'meet' => $store->publicView($meet)]);
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
        $attachment['url'] = normalizeAttachmentUrl(trim((string) ($input['url'] ?? '')));
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

function handleUpdateAttachment(MeetStore $store, string $slug, array $input): void
{
    $attachmentId = trim((string) ($input['attachment_id'] ?? ''));
    $label = trim((string) ($input['label'] ?? ''));
    if ($attachmentId === '' || $label === '') {
        Response::error('attachment_id and label required');
    }

    $meet = $store->loadBySlug($slug);
    $meet = $store->update($meet['id'], function (array $m) use ($attachmentId, $label, $input) {
        $found = false;
        foreach ($m['attachments'] as &$att) {
            if (($att['id'] ?? '') !== $attachmentId) {
                continue;
            }
            $found = true;
            $att['label'] = $label;
            if (array_key_exists('url', $input)) {
                $att['type'] = 'url';
                $att['url'] = normalizeAttachmentUrl(trim((string) $input['url']));
                unset($att['body']);
            }
            if (array_key_exists('body', $input)) {
                $att['type'] = 'text';
                $att['body'] = (string) $input['body'];
                unset($att['url']);
            }
            break;
        }
        unset($att);
        if (!$found) {
            throw new \RuntimeException('Attachment not found', 404);
        }
        return $m;
    });

    Response::json(['ok' => true, 'meet' => $store->publicView($meet)]);
}

function handleRemoveAttachment(MeetStore $store, string $slug, array $input): void
{
    $attachmentId = trim((string) ($input['attachment_id'] ?? ''));
    if ($attachmentId === '') {
        Response::error('attachment_id required');
    }

    $meet = $store->loadBySlug($slug);
    $meet = $store->update($meet['id'], function (array $m) use ($attachmentId) {
        $before = count($m['attachments']);
        $m['attachments'] = array_values(array_filter(
            $m['attachments'],
            static fn ($att) => ($att['id'] ?? '') !== $attachmentId
        ));
        if (count($m['attachments']) === $before) {
            throw new \RuntimeException('Attachment not found', 404);
        }
        return $m;
    });

    Response::json(['ok' => true, 'meet' => $store->publicView($meet)]);
}

function normalizeAttachmentUrl(string $url): string
{
    $url = trim($url);
    if ($url === '') {
        return '';
    }
    if (preg_match('#^https?://#i', $url)) {
        return $url;
    }
    if (str_starts_with($url, '//')) {
        return 'https:' . $url;
    }
    return 'https://' . ltrim($url, '/');
}

function normalizeLocationDetail(string $kind, string $detail): string
{
    $detail = trim($detail);
    if ($detail === '') {
        return '';
    }

    if ($kind === 'video') {
        $url = normalizeAttachmentUrl($detail);
        if (!preg_match('#^https?://#i', $url)) {
            Response::error('Online locations need a well-formed URL (e.g. https://meet.example.com/room).');
        }
        return $url;
    }

    if (!preg_match('#https?://#i', $detail)) {
        return $detail;
    }

    if (!preg_match('#(https?://[^\s·]+)#i', $detail, $matches)) {
        Response::error('Hybrid online link must be a well-formed URL (e.g. https://meet.example.com/room).');
    }

    $url = normalizeAttachmentUrl($matches[1]);
    if (!preg_match('#^https?://#i', $url)) {
        Response::error('Hybrid online link must be a well-formed URL (e.g. https://meet.example.com/room).');
    }

    // PHP 8+: str_replace's 4th arg is &$count (by reference) — never pass a literal.
    $suffix = trim(str_replace($matches[1], '', $detail));
    $suffix = trim(preg_replace('#^·\s*#', '', $suffix) ?? $suffix);

    return $suffix !== '' ? $url . ' · ' . $suffix : $url;
}

function handleConfirm(MeetStore $store, string $slug, array $input): void
{
    $meet = $store->loadBySlug($slug);
    if (count($meet['attendees']) > 0) {
        requireActingOrganizer($meet, trim((string) ($input['acting_attendee_id'] ?? '')));
    }
    $meet = $store->update($meet['id'], function (array $m) use ($input) {
        if (!empty($input['confirmed_slot'])) {
            $m['confirmed_slot'] = trim((string) $input['confirmed_slot']);
        }
        if (array_key_exists('confirmed_location_ids', $input)) {
            $ids = $input['confirmed_location_ids'];
            if (!is_array($ids)) {
                Response::error('confirmed_location_ids must be an array');
            }
            $ids = array_values(array_unique(array_filter(array_map('strval', $ids))));
            $m['confirmed_location_ids'] = $ids;
            $m['confirmed_location'] = $ids[0] ?? null;
            $m['confirmed_location_online'] = null;
            $m['confirmed_location_physical'] = null;
        } elseif (array_key_exists('confirmed_location_physical', $input)
            || array_key_exists('confirmed_location_online', $input)) {
            $phys = trim((string) ($input['confirmed_location_physical'] ?? ''));
            $online = trim((string) ($input['confirmed_location_online'] ?? ''));
            $m['confirmed_location_physical'] = $phys !== '' ? $phys : null;
            $m['confirmed_location_online'] = $online !== '' ? $online : null;
            $m['confirmed_location'] = $online !== '' ? $online : ($phys !== '' ? $phys : null);
            $ids = [];
            foreach ([$online, $phys] as $id) {
                if ($id !== '' && !in_array($id, $ids, true)) {
                    $ids[] = $id;
                }
            }
            $m['confirmed_location_ids'] = $ids;
        } elseif (!empty($input['confirmed_location'])) {
            // Legacy single-field confirm: map by kind.
            $id = trim((string) $input['confirmed_location']);
            $kind = 'other';
            foreach ($m['locations'] as $loc) {
                if (($loc['id'] ?? '') === $id) {
                    $kind = (string) ($loc['kind'] ?? 'other');
                    break;
                }
            }
            if ($kind === 'hybrid') {
                $m['confirmed_location_physical'] = $id;
                $m['confirmed_location_online'] = $id;
            } elseif (in_array($kind, ['video', 'phone'], true)) {
                $m['confirmed_location_online'] = $id;
            } else {
                $m['confirmed_location_physical'] = $id;
            }
            $m['confirmed_location'] = $id;
            $m['confirmed_location_ids'] = array_values(array_unique(array_filter([$id])));
        }
        return $m;
    });

    Response::json(['ok' => true, 'meet' => $store->publicView($meet)]);
}

function handleAddAttendee(MeetStore $store, string $slug, array $input): void
{
    $actingId = trim((string) ($input['acting_attendee_id'] ?? ''));
    $displayName = trim((string) ($input['display_name'] ?? ''));
    if ($displayName === '') {
        Response::error('Display name is required');
    }

    $meet = $store->loadBySlug($slug);
    requireActingOrganizer($meet, $actingId);

    $contact = validateContactField(trim((string) ($input['contact'] ?? '')));
    $initials = strtoupper(trim((string) ($input['initials'] ?? '')));
    $newId = MeetFile::generateId('usr');

    $meet = $store->update($meet['id'], function (array $m) use ($displayName, $contact, $initials, $newId) {
        $m['attendees'][] = [
            'id' => $newId,
            'display_name' => $displayName,
            'contact' => $contact,
            'initials' => $initials,
            'pin' => '',
            'organizer' => false,
        ];
        return $m;
    });

    Response::json([
        'ok' => true,
        'attendee_id' => $newId,
        'meet' => $store->publicView($meet),
    ]);
}

function handleUpdateAttendee(MeetStore $store, string $slug, array $input): void
{
    $actingId = trim((string) ($input['acting_attendee_id'] ?? ''));
    $targetId = trim((string) ($input['attendee_id'] ?? $actingId));
    if ($actingId === '') {
        Response::error('acting_attendee_id required', 403);
    }

    $displayName = trim((string) ($input['display_name'] ?? ''));
    if ($displayName === '') {
        Response::error('Display name is required');
    }

    $contact = validateContactField(trim((string) ($input['contact'] ?? '')));
    $initials = strtoupper(trim((string) ($input['initials'] ?? '')));
    $newPin = trim((string) ($input['new_pin'] ?? ''));
    $currentPin = trim((string) ($input['current_pin'] ?? ''));
    $clearPin = isset($input['clear_pin']) && (bool) $input['clear_pin'];

    $meet = $store->loadBySlug($slug);
    if ($targetId !== $actingId) {
        requireActingOrganizer($meet, $actingId);
    }

    $skipCurrentPin = isset($input['skip_current_pin']) && (bool) $input['skip_current_pin'] && $targetId === $actingId;

    $meet = $store->update($meet['id'], function (array $m) use ($targetId, $displayName, $contact, $initials, $newPin, $currentPin, $clearPin, $skipCurrentPin) {
        $idx = attendeeIndexById($m['attendees'], $targetId);
        if ($idx === null) {
            throw new \RuntimeException('Attendee not found', 404);
        }
        $m['attendees'][$idx]['display_name'] = $displayName;
        $m['attendees'][$idx]['contact'] = $contact;
        $m['attendees'][$idx]['initials'] = $initials !== '' ? $initials : attendeeInitialsFromName($displayName);

        if ($newPin !== '' || $clearPin) {
            $att = &$m['attendees'][$idx];
            // When the signed-in user edits their own row, do not require re-entering the current passcode.
            if (attendeeHasPin($att) && !$skipCurrentPin) {
                if (!verifyAttendeePin($att, $currentPin)) {
                    throw new \RuntimeException('Current PIN is incorrect', 403);
                }
            }
            if ($clearPin) {
                clearAttendeePin($att);
            } else {
                setAttendeePin($att, $newPin);
            }
        }

        return $m;
    });

    Response::json(['ok' => true, 'meet' => $store->publicView($meet)]);
}

function validateContactField(string $contact): string
{
    if ($contact === '') {
        return '';
    }
    foreach (array_map('trim', explode(',', $contact)) as $part) {
        if ($part !== '' && str_contains($part, '@') && filter_var($part, FILTER_VALIDATE_EMAIL) === false) {
            Response::error('Contact must be a valid email and/or phone number (comma-separated OK)');
        }
    }
    return $contact;
}

function attendeeInitialsFromName(string $name): string
{
    $parts = preg_split('/\s+/', trim($name)) ?: [];
    $initials = '';
    foreach ($parts as $part) {
        if ($part !== '') {
            $initials .= strtoupper($part[0]);
        }
    }
    return substr($initials, 0, 3);
}

/** @param array<string, mixed> $meet */
function requireActingOrganizer(array $meet, string $actingId): void
{
    if ($actingId === '') {
        throw new \RuntimeException('acting_attendee_id required', 403);
    }
    if (!attendeeIsOrganizer($meet['attendees'], $actingId)) {
        throw new \RuntimeException('Only a meeting organiser can do this', 403);
    }
}
