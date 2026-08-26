# Meet Scheduler — UI hierarchy and text constants

**Build:** 1.8.47  
**Purpose:** Map pages → panels → panes, with **exact on-screen text** under each pane so amendments can be referenced by location and wording.

**Sources (on-screen pane/panel copy):** `meet/index.php`, `meet/assets/js/app.js`  
Tints from `meet/assets/css/style.css`.  
Also user-visible but outside this hierarchy: `meet/docs/OPERATIONS.md` (via `operations.php`), and API/toast error strings from `meet/api.php`.

**Convention:** Reproduce **full** on-screen text here (no ellipsis abbreviations). **Panels** are level-2 headings prefixed **Panel:**. **Panes** are level-3 headings prefixed **Pane:**.

### Legend

| Symbol | Meaning |
|--------|---------|
| **Panel** | One dashboard tab's working area (green is only the nav **buttons**, not the panel fill) |
| **Pane** | Bordered tinted region (or expandable block) |
| `[expand]` | Collapsible; open/closed remembered per meeting |
| `[secondary]` | Closed on first visit |
| *tint* | Semantic background colour |
| Disclosure | Collapsed **▶** and open **▼** use the same visual size |

**Tints (RGB next revision):** lavender = dates/times · clearer blue `#e0f2fe` = text · pink = people · teal places `#ccfbf1` = places · amber = attachments · light blue = create · lime find `#f7fee7` = find

**Pane IDs** (persisted): see § Pane ID reference at end.

### Timezone test (query string)

Browser timezone is normally `Intl.DateTimeFormat().resolvedOptions().timeZone`. For QA, append a **URL query parameter** (query string):

- `?meet_test_tz=Europe/Paris` on a fresh URL, or `&meet_test_tz=Europe/Paris` when other query params already exist.

When that parameter is present and valid, the site footer shows `{tz} (test)` (e.g. `Europe/Paris (test)`). Invalid values are ignored and the browser’s real timezone is used. The browser **cannot** read OS environment variables for a timezone override — only this query string (or the device/browser locale settings) applies.

Meeting **base timezone** is set from the **first attendee** (their client timezone on join). Bookable daily hours in Calendar Options are edited in the **viewer’s local timezone** and stored consistently (UTC / meeting wall) so everyone sees matching local times. There is **no** Calendar Options timezone-picker pane (`opts-timezone` removed). Base TZ left as-is (anchors stored day hours; slots are UTC; viewers see local).

---

## Landing page

### Site header
- Simon's Meeting Scheduler

### Create meeting *tint-create*

| Kind | Text |
|------|------|
| Heading | Find a meeting time everyone can make |
| Lead | Propose availability, compare overlaps, and agree on a place to meet. |
| Hint | Meeting locations can be online (URL) and physical (Simultaneously!). Times are shown to attendees in their local timezone (and UTC as 'reference'). |
| Dynamic | Your local time zone is {tz} — {local} and {utc} UTC |
| Label | Meeting title |
| Placeholder | Board review |
| Button | Create meeting |
| Hint | The **Create meeting** button generates a private link with a random URL (new meetings: 7-letter pronounceable code). **Save it and SEND to other proposed Attendees.** |

### Find my meetings *tint-find* (lime `#f7fee7`)

| Kind | Text |
|------|------|
| Heading | Find my meetings |
| Lead | Enter the **registered identity** (exactly as when you joined) and **passcode** for a list of matching meetings. |
| Label | Registered identity |
| Placeholder | e.g. Alice@gmail.com or Bob |
| Label | Passcode |
| Passcode title | Stored as all lowercase. Letters, numbers, spaces, and safe specials. 2 to 20 characters. Leading spaces stripped. |
| Passcode field | Password input with eye icon **inside** the field (Show / Hide); maxlength 20 |
| Button | List my meetings |
| Results (empty) | No meetings found for that name and passcode. Identity misspelt or Passcode not matching. |
| Results (count) | 1 meeting found / {N} meetings found |
| Results actions | Each row: meeting date · title link · **Delete** |
| Delete confirm | Are you sure you want to delete “{title}”? This cannot be undone. |
| Validation | Passcode must be 2 to 20 characters (letters, numbers, spaces, safe specials — not \|). |
| Passcode rule | Length 2–20 everywhere; never silently discarded — invalid length surfaces the validation error. |

### Site footer
- Build {version} · Local times · {tz} · Installation, Operations and Maintenance Guide
- With `meet_test_tz` query param: Build {version} · Local times · {tz} (test) · Installation, Operations and Maintenance Guide

### Scheduler shell (before render)
- Loading meeting…

---

## Meeting page header (always visible)

This is the persistent bar at the top of a meeting (title, actions, status, green nav). It is not named “Chrome” — that word means the browser’s own frame, and is easy to confuse with Google Chrome.

### Sticky header actions

Header action buttons are fully clickable (`pointer-events: auto`, elevated z-index). On narrow screens (max-width 700px) the action row stacks under the meeting title (single-column grid).

| Text | Notes |
|------|-------|
| More ▾ / Less ▴ | Narrow screens only. Title: Collapse/Expand for narrow screens |
| How to use this | Title: How to use this meeting scheduler |
| Copy meeting link | Title: Copy meeting link |

### Signed-in banner
- Currently signed in as **{name}** (Organiser \| Attendee)
- **No attendees yet** (when the meeting has no attendee rows)
- **No signed-in attendee** (when attendees exist but this browser is not signed in)
- Title: Manage attendee identities on the Attendees tab

### Status strip

**Description** stays its own expandable line. **Agenda items, Decisions, and Attachments** share **one** expandable heading with counts; expand to see all three sections.

Scheduled times always show **start and end** (end = start + meeting length) in the viewer’s timezone, plus UTC.

| Kind | Text |
|------|------|
| Label | Status: |
| Values | Entering organiser details · Entering attendee details · Scheduled · Rescheduled · Past · Summarised |
| Status tip | Status progresses as the meeting is set up: entering details → Scheduled (organiser sets a start) → Rescheduled if changed → Past / Summarised after the start. Organisers set and can change the scheduled time and location. |
| Time (scheduled) | Time: **{weekday date, start – end}** ({tz}) ({utc}) |
| Time (none) | No date and time selected |
| Recurrence | Recurrence: {label} — default **One-off** |
| Locations | Locations: {list} / Locations (proposed): {list} / No locations confirmed |
| Description (set) | Description: {preview up to 72 chars, then …} |
| Description (empty) | Description: none |
| Description empty body | No description yet — go to **Meeting Resources** to add one. |
| Combined summary | Agenda items ({N}) · Decisions ({D}) · Attachments ({A}) |
| Combined body — Agenda | **Agenda** + bullets, or **Agenda** — none yet. Go to **Meeting Resources** to add items. |
| Combined body — Decisions | **Decisions required** + bullets, or **Decisions required** — none yet. Go to **Meeting Resources** to add them. |
| Combined body — Attachments (URL) | Label as link **(opens in a new window)** |
| Combined body — Attachments (text) | {label} — text attachment; open **Meeting Resources** → **Attachments** for the full content. **TODO** check behaviour |
| Combined body — Attachments empty | **Attachments** — none yet. Go to **Meeting Resources** to add them. **TODO** check behaviour |

**Past** and **Summarised** are status labels (after the scheduled start; Summarised when attachments exist). There is **no** Past dashboard tab.

### Compact status (narrow + collapsed header)
- Status: {label} only (same STATUS tip).

### Dashboard nav (green buttons)

Nav aria-label: Meeting sections

On **touch** devices (`pointer: coarse` or `maxTouchPoints > 0`), horizontal swipe on the meeting content cycles dashboard tabs **circularly** (wraps from last to first and first to last). Swipe is not registered on desktop / non-touch UIs, and is ignored when the gesture starts on calendars, location/attendee scroll areas, or form controls.

| Button | Tooltip (exact) |
|--------|-----------------|
| Getting started | Step-by-step checklist for setting up this meeting. |
| Overview | Summary of the meeting — status, attendees, and best overlap times. |
| Attendees | Register yourself, add others, manage. |
| Locations | Propose locations, mark preferences. |
| My availability | Mark free slots. Each cell is one calendar slot; select consecutive slots for the full meeting length. Use «◀ ▶» beside dates to move by weekday. |
| Meeting Resources | Description, agenda, notes, attachments. |
| Calendar Options | Length, Calendar slot size, 1st/Last dates, Early/Latest times (Organiser R/W, else ReadOnly). |
| Confirm meeting choices | Group calendar and locations — click a start to save it; click again to clear. Confirm location preferences. |
| New meeting | Start a completely fresh meeting *(opens in a new tab)* |

### Panel: Help *(opens on “How to use this”)*

| Kind | Text |
|------|------|
| Title | How to use this meeting scheduler |
| Close (header) | Close (title: Close help panel) |
| Close (footer) | Close / Collapse (title: Close help panel) |
| Note | Most fields have tooltips on hover (may not show on mobile). Coloured panes group related topics — dates & times (lavender), free text (blue), people (pink), places (green), attachments (amber). |
| Organiser heading | Setting up a meeting (organiser) |
| Organiser step 1 | **Attendees** — add yourself first. You become the organiser. Optionally set a passcode so you can find this meeting from the home page later. |
| Organiser step 2 | **Calendar Options** — meeting length (whole meeting), calendar slot size (partial availability — must divide meeting length evenly), AM/PM half-day presets, bookable dates and daily hours (edited in your local timezone; stored consistently for everyone). Save when done. |
| Organiser step 3 | **Meeting Resources** — optional description, agenda, decisions, notes, attachments (preparation and post-meeting). |
| Organiser step 4 | **My availability** — mark when you are free. Select enough consecutive slots for the full meeting length if you can. Press *Save*. |
| Organiser step 5 | **Locations** — propose online and/or physical places; attendees vote which work for them. |
| Organiser step 6 | **Share the link** — *Copy meeting link* and send it to attendees. |
| Organiser step 7 | **Confirm meeting choices** — *Group calendar*: everyone’s marks on one grid. Organiser clicks a start to save it (click again to clear), and confirms location(s). Partial overlap is OK. |
| Attendee heading | Joining a meeting (attendee) |
| Attendee step 1 | Open the meeting link you were sent. You will see the meeting title and current status. |
| Attendee step 2 | Go to **Attendees**. If you are already listed, tick *Me* on your row and enter your passcode if prompted. If you are not listed, fill in the *Add new attendee* form with your name. |
| Attendee step 3 | Open **My availability** and mark every slot when you are free. Select enough consecutive slots to cover the full meeting if you can — finer slots mean you can also mark partial availability. Press *Save*. You can come back and update this any time — clicking a previously selected slot deselects it, so remember to save again. |
| Attendee step 4 | Open **Locations** to see any proposed venues. Click locations that work for you (blue means saved). Click again to remove. You can also propose a new location. |
| Attendee step 5 | Open **Confirm meeting choices** to see the *Group calendar* — how times overlap and what is scheduled. |
| Attendee step 6 | Check the top status line for the current scheduled time and location. |
| Attendee step 7 | Repeat any of these steps as the meeting evolves — there is no fixed order. |
| Footer | The **meeting link** is the only way back to this meeting unless you set a passcode. The *Find my meetings* option on the home page lets you look up a list of meetings **if** you know a registered name **and matching passcode.** |
| **TODO** | Expand Help panel copy further when Simon marks CHECK |

---

## Panel: Getting started

### Pane: Instructions for organisers and attendees `[expand]`

| Kind | Text |
|------|------|
| Panel title | Getting started |
| Summary | Instructions for organisers and attendees. Completed steps marked with a ✓ |
| Intro | Steps below are aimed at the meeting organiser. Attendees skip organiser-only steps. Essential steps for **all** attendees: sign in on **Attendees**, mark **My availability**, vote on **Locations**. |
| Intro (second) | For fuller guidance, open **How to use this** at the top of the page, or the [operations manual](operations.php) at the foot of the page. |

### Pane: Checklist steps

Completed steps show a leading ✓. Audience markers sit at the **start** of each step (not mid-sentence): first steps spell out **Everyone (E)** and **Organiser (O)**; later steps use **(E)**, **(O)**, or **(O/E)**.

**Calendar Options ✓** is set only after the organiser presses **Save** on Calendar Options (persisted per meeting in localStorage) — not merely by visiting the tab. Do not tick Calendar Options on first view with no edits.

| Step | Text |
|------|------|
| 1 Everyone (E) | **Go to Attendees** and **Add yourself as an attendee** — First attendee becomes Meeting Organiser by default and can give others Organiser privilege. |
| 2 Organiser (O) | **Set Calendar Options** — Organiser status required. Set **meeting length** (full meeting) and **calendar slot size** (partial availability — must divide meeting length evenly). Use **AM/PM presets** for half-day meetings if helpful. Also set earliest/latest dates, daily hours, weekends, and recurrence (future feature) if needed. **Go to Calendar Options** |
| 3 (O/E) | **(Optional)** **Go to Meeting Resources** and edit meeting's title, set / edit description, agenda, attachments, etc. |
| 4 (O/E) | **(Optional)** **Go to Attendees** — Add others as proposed attendees. Anyone with the link can add themselves and others. Organisers can grant Organiser to registered attendees. |
| 5 (E) | **Go to My availability** and select time slots that work for you. Select enough booking slots for partial or full availability. |
| 6 (E) | **Go to Locations** — Select/ Propose locations (Online and/or Physical) for attendees to vote on. Any attendee can propose locations. |
| 7 (O) | **Confirm meeting choices** — **Organiser status required to edit.** All can view. Click a start to save the meeting date and time (click again to clear). Confirm location(s). (Can be amended.) **Go to Confirm meeting choices** |
| 8 (E) | **Share the link** — Copy meeting link and send it to all attendees so they can open this meeting and enter their availability. Button: **Copy meeting link** |
| Done (complete) | **Setup complete.** You can keep using this checklist any time, or move on to Overview and the other tabs. |
| Done (incomplete) | This checklist stays visible at all times. |
| Link | **Go to Overview** — View a summary of current meeting details |

---

## Panel: Overview

| Kind | Text |
|------|------|
| Header | Overview — tap ▶ headings to expand |
| Hint | Coloured sections group topics — lavender dates/times, blue text, pink people, green places. |
| Expand title | Tap or click the triangle to expand/collapse |

### Pane: Time · Recurrence *tint-dates* (lavender)

| Kind | Text |
|------|------|
| Summary | Time · Recurrence |
| Time | **Scheduled time:** {start – end pair with tz + UTC} / None selected yet |
| Length | **Meeting length:** {dur} · **Calendar slot:** {slot} |
| Recurrence | **Recurrence:** {label} (default One-off) |

### Pane: Agenda and decisions *tint-text* (clearer blue `#e0f2fe`)

| Kind | Text |
|------|------|
| Summary | Agenda and decisions *(Set in Meeting Resources)* |
| Agenda | **Agenda:** {bullets} |
| Agenda empty | No agenda yet — go to **Meeting Resources** to set it. |
| Decisions | **Decisions required:** {bullets} |
| Decisions empty | No decisions listed yet — go to **Meeting Resources** to set them. |
| Notes | When notes HTML is set, it renders below agenda/decisions in this pane |

### Pane: Attendees *tint-people*

| Kind | Text |
|------|------|
| Summary | Attendees registered ({N}) · Availability entered ({count}) |
| Empty | No attendees registered yet. |
| Table columns | Name · Time slots / locations · Role (Organiser \| Attendee) |
| Column widths | Role narrow; Time slots / locations wider so stacked headings read clearly |
| Time slots / locations title | Availability slots marked and locations marked OK with me |

### Pane: Top start times *tint-dates* (lavender)

| Kind | Text |
|------|------|
| Summary | Top start times ({shown} of {total}) — best attendance |
| Line (full) | {time} — {n} of {total} free for full meeting ({dur}) |
| Line (mixed) | {time} — {n} of {total} for full {dur}; {p} partial |
| Line (partial) | {time} — {n} of {total} marked (partial overlap) |
| Hint | Confirm one with **Confirm meeting choices**. Includes times where everyone is free for the full meeting, and times with partial overlap. |
| Empty | No overlap times yet — attendees need to mark availability on **My availability**, then check **Confirm meeting choices**. |

### Pane: Top locations *tint-places* (teal `#ccfbf1`)

Teal places tint — locations no longer sit in the lavender Time pane.

| Kind | Text |
|------|------|
| Summary | Top locations ({shown} of {total}) — by popularity |
| Confirmed / proposed | **Confirmed locations:** / **Proposed locations:** {list} / None yet |
| Ranked line | {location} — {N} preference / preferences |
| Empty | No locations proposed yet. |

### Pane: Attachments *tint-assets*

**Always present** on Overview (preparation docs included — not limited to Past / Summarised). Opens by default when there is at least one attachment.

| Kind | Text |
|------|------|
| Summary | Attachments ({N}) |
| Empty | No attachments yet — add preparation or follow-up files in **Meeting Resources**. |

---

## Attendees

### Lead

| Who | Text |
|-----|------|
| Not signed in (no attendees yet) | Fill in the form below to add yourself. The first attendee becomes the meeting organiser. |
| Not signed in (attendees listed) | Toggle **Signed-in as** if you are listed (enter passcode if set), or add yourself below. |
| Signed-in attendee | Duplicate rows can be merged — expand **Merge duplicate attendees** if needed. |
| Signed-in organiser | Toggle Organiser rights for others. **Delete** removes a row. Expand **Merge duplicate attendees** if needed. |

### Identity bar
- **Edit identity** (title: Edit your display name, contact, or passcode)
- **Switch user** (title: Sign out on this browser)

### Registered attendees `att-registered`

| Kind | Text |
|------|------|
| Summary | **Registered attendees ({N})** / **Registered attendees (none yet)** |
| Table headers | Signed-in as · Name · Initials · Contact · Time slots / locations · Passcode · Organiser · Delete *(organiser)* |
| Signed-in as title | Toggle Signed-in as for this row |
| Organiser title | Toggle organiser rights |
| Column widths | Organiser narrow; Time slots / locations wider |
| Empty row | None yet |
| Passcode cell | Set / Not set |
| Sign-in titles | Sign in as this attendee / Sign out / Merge duplicate into your row |
| Delete | Delete (title: Remove this attendee from the meeting) |

### Add yourself as an attendee `att-add-first`

**No Myself / Someone else radios.** Behaviour:

- **Not signed in:** submitting saves the new person and signs you in as that person.
- **Signed in:** use **Add another attendee** instead — you stay signed in as the original person; the new person is saved with an optional passcode.
- **First add (no attendees yet):** non-collapsible pane (`pane-region tint-people`, not a `<details>`).
- **Later (attendees already exist, not signed in):** collapsible `att-add-first` details pane.

| Kind | Text |
|------|------|
| Summary | Add yourself as an attendee |
| Field guide | Display name: any text. Initials: default from display name. Contact optional: comma-separated email, URL, phone, or free text. Passcode optional — 2 to 20 characters: 0–9 a–z and safe specials (not \|). Leading spaces removed. Needed to find lost meeting links. |
| Labels | Display name · Initials (optional) · Passcode (optional) · Contact (optional) |
| Placeholders | e.g. name or email · For Find my meetings · email, URL, phone |
| Passcode title | 2 to 20 characters: 0–9 a–z and safe specials (not \|). Leading spaces removed. Needed to find lost meeting links. |
| Button | **Save Attendee Identity** |
| Validation | Passcode must be 2 to 20 characters (letters, numbers, spaces, safe specials — not \|). (Never silently discarded.) |

### Add another attendee `att-add` `[secondary]`

Shown when already signed in (or after attendees exist and the add-another path applies).

| Kind | Text |
|------|------|
| Summary | Add another attendee |
| Hint | They are not emailed — share the meeting link. They can sign in from the table (passcode required if you set one). You stay signed in as yourself. |
| Field guide | Same as Add yourself |
| Button | **Save Attendee Identity** (also on the summary row) |

### Edit my details

| Kind | Text |
|------|------|
| Title | Edit my details |
| Labels | Display name · Initials (optional) · Contact (optional) |
| Passcode label | **New passcode (optional)** / **Passcode (optional)** |
| Note | Already signed in — current passcode not required. 2 to 20 characters: 0–9 a–z and safe specials (not \|). Leading spaces removed. Needed to find lost meeting links. |
| Checkbox | Remove passcode |
| Placeholders | leave blank to keep / 2 to 20 characters |
| Buttons | **Save my details** · **Cancel** (title: Cancel and return without saving) |
| Validation | Passcode must be 2 to 20 characters (letters, numbers, spaces, safe specials — not \|). |

### Claim / sign-in form
- **{name}** — enter your passcode to sign in
- **{name}** — optionally set a passcode, then press Continue
- Passcode / Passcode (optional) · **Continue** · **Cancel** (title: Cancel and return)
- Passcode title: 2 to 20 characters: 0–9 a–z and safe specials (not \|). Leading spaces removed. Needed to find lost meeting links.

### Merge duplicate attendees `att-merge` `[secondary]`
- **Merge duplicate attendees**
- Keep row 1 / Remove row 2 · **Merge**
- Availability from the removed row is combined into the kept row.

### Continue (embed on My availability when not established)
- Continue to My availability → (title: Open My availability)
- Mark your availability on **My availability**.
- Add yourself above, then go to **My availability**.

---

## Panel: Locations

### Pane: Lead

| Who | Text |
|-----|------|
| Signed in | Proposed URLs or place names in the **top row** are added to the table. Tab out of an amended cell to save. |
| Signed in (2) | Toggle **OK with me** to record your preference. Tap/click overflow cells to expand; use **Copy** after expanding a link. |
| Not signed in | Proposed URLs or place names in the top row are added to the table. Sign in on Attendees to propose locations and mark OK with me. |

### Pane: Locations table *tint-places* (teal `#ccfbf1`)

Table sits in a horizontally scrollable wrapper (`.locations-table-scroll`). Well-formed http(s) URLs render as links; long/overflow cells use expand hit targets (`min-height` expand buttons). **OK with** = initials of voters; **OK with me** = your toggle (? / Yes).

| Kind | Text |
|------|------|
| Headers | Notes · Location · OK with · OK / with me · Confirmed *(Confirm meeting choices tab only)* |
| OK with title | Initials of attendees who marked OK with me |
| OK with me title | Toggle if this location works for you |
| Confirmed title | Organiser confirms for the meeting |
| Placeholders | New row first field (Notes): **Add new…** · Location: URL or place name |
| OK with me cell | ? · Yes |
| OK with me button titles | OK with me — saves immediately / Remove — OK with me |
| OK with me aria-label | OK with me |
| Confirm button title | Confirmed for meeting |
| Expand / Copy | Show full link (selects all for copy) · Show all (selects for copy) · Open · Copy (title: Copy link to clipboard) · Full link — selected for copy |

---

## Panel: My availability

### Pane: Mark when you are free `[expand]`

| Kind | Text |
|------|------|
| Summary | Mark when you are free (title: How to mark your availability on the calendar) |
| Body 1 | Each cell is one **calendar slot** ({slot}). Drag or tap to select. Use **Save** to write your selection to the meeting. Tap a selected slot again to deselect — save again after changes. |
| Body 2 | **Meeting length** is {dur}.{slotHint} Finer slots let you show partial availability if you cannot make the whole meeting. |
| slotHint (multi) | Select {N} consecutive {gran} slot(s) to cover the full {dur} meeting. |
| slotHint (single) | Each slot is {gran} — one slot covers the full meeting. |
| Slot colours | Solid blue tint = your selection (already saved, or matching what is saved). **Orange dashed** = new pick not saved yet. **Grey dashed** = you turned off a saved slot — still on the meeting until you Save. Light green = someone marked it (initials). A **+** means more people than fit in the cell. |
| Copy hint | **Copy / paste** uses days **as shown** (left → right). Empty marked days stay in the sequence. With weekends off, Fri then Mon are two adjacent steps. Mark headings → **Copy days** (reports every marked day) → mark first destination → **Paste** (runs forward on displayed days; OR into selection). **Invert days** flips blank ↔ orange dashed (solid saved unchanged). **Clear selection** restores last saved slots. Touch: ballistic swipe on the grid moves dates. |
| Nav hint | Use the date navigation (left of the grid) to move by day, screen, or jump to first/last bookable dates. |
| Hours | Meeting hours {start}–{end} (meeting base). Times at left show **your** local timezone ({tz}){; tap the second time to cycle other attendees’ timezones when recorded attendee timezones exist}. |

### Pane: Calendar grid *tint-dates*

**Day column headings stick to the viewport** under the sticky dashboard (`top: var(--sticky-h)`). They must not scroll off-screen. `.calendar` is a column flex (not a grid of header+body) so sticky is not trapped in a short grid row. Applies to **My availability** and **Group calendar**.

| Kind | Text |
|------|------|
| Gutter title | Day ◀▶ · screen «» · first/last ⇤⇥ |
| Nav buttons | ◀ Previous weekday · ▶ Next weekday · « Back one screen of dates · » Forward one screen of dates · ⇤ Jump to earliest bookable date · ⇥ Jump to latest bookable date |
| Day extras | today · recurring |
| Time labels | Local / test timezone on top (larger); optional alternate timezone below (smaller, underlined) — tap to cycle recorded attendee timezones |
| Time label title | Local time · tap second time to cycle attendee timezones *(when alternates exist)* |
| Alt timezone button title | {tz} — recorded attendee timezone — click for next |

### Pane: Save band (dual Save)

Shown when signed in. Buttons appear **above** the grid (form-save header) and again **below** the grid. All save-band buttons share the same height. Copy/clear actions use cancel-style (neutral) buttons; **Save** stays the primary action colour.

- **Save** (title: Write your current selection to the meeting (keeps new picks; removes grey dashed slots you turned off))
- **Clear selection** (title: Discard unsaved picks and pending removals — restore your last saved availability)
- **Copy days** (title: Copy already-saved times from day headings you have marked)
- **Paste** (title: Paste onto marked day headings as orange dashed candidates (then Save))
- **Invert days** (title: Copy this week’s saved times onto next week as candidates, then jump the view forward)
- Explain (above grid): **Save** keeps blue/orange picks and drops grey dashed. **Clear selection** undoes unsaved edits. Mark date headings → **Copy days** / **Paste**, or **Invert days**.
- Meta: Clipboard: {N} day pattern(s) ready to paste — mark target day column(s), then Paste. *(when clipboard set)*
- Meta: {N} slot(s) selected · {optional unsaved pick / to remove on Save / day marked notes} · drag or tap slots to select a range *(or “tap slots to select” on touch)* · {optional slotHint from meeting length / granularity}

**Copy / paste model:** Copy reads **already-saved** slots only. Paste adds **unsaved candidates** (orange dashed) until Save. Day → day or day → many: mark source day(s) → Copy days → mark target(s) → Paste (1 pattern → all targets; N patterns → N targets in order). Paste onto a day that already has saved slots: add candidates where not saved; leave already-saved hours unchanged. Off bookable / weekend: skip and warn that some times could not be replicated. **Clear selection** resets to saved-only. Day column headers are markable buttons styled like the old date labels (not blue action buttons). Turning off a saved slot shows **grey dashed** (pending remove) until Save — it does not look like a normal green “someone free” cell.

**Bookable range:** calendar opens at Calendar Options start date; ⇤ / ⇥ jump to Options start / end (if no Options end, ⇥ jumps to last marked availability). Day/week navigation stays within the Options bookable range when an end date is set. Days outside the range are not shown.

---

## Panel: Meeting Resources

### Pane: Lead
- Description, agenda, decisions, notes, and attachments — preparation and follow-up assets in one place.

Collapsible panes. Where edit is allowed, **Save** sits on the pane **summary** (title left, Save top-right via `pane-summary-with-save`) and again at the bottom of the pane body (**dual Save**). Attachments use **tab-out save only** (no Save on the summary).

### Pane: Description `mr-description` *tint-text* (clearer blue `#e0f2fe`)
- Summary: **Description for attendees** *(simple HTML — status bar & Overview)* · **Save** *(when signed in)*
- Placeholder: Add a short description for attendees — shown in the status bar and Overview.
- Bottom: **Save** / Sign in on Attendees to edit.

Format toolbar: **?** Help for meeting description · Bold · Italic · Paragraph · Line break · Link · List

Help body: Enter plain text or simple HTML. Tags not in the allowed list are stripped on save. Allowed: paragraphs, line breaks, bold, italic, links, and lists.

### Pane: Agenda & decisions `mr-agenda` `[secondary]` *tint-text*
- Summary: **Agenda & decisions** *(each line is a bullet on Overview and status strip)* · **Save** *(when signed in)*
- Agenda
- Decisions required
- Bottom: **Save**

### Pane: Notes `mr-notes` `[secondary]` *tint-text*
- Summary: **Notes** *(simple HTML — Overview)* · **Save** *(when signed in)*
- Notes (+ format toolbar without help toggle)
- Bottom: **Save**

### Pane: Attachments `mr-attachments` *tint-assets*
- Summary: **Attachments ({N})** *(no Save on summary)*
- Lead: Preparation or follow-up links/text. Edit a cell and tab out to save. Leading spaces on URLs are stripped.
- Columns: Label · Content
- Placeholders: New row first field (Label): **Add new…** · Content: URL or text (simple HTML)
- Empty (unsigned-in, none): No attachments yet.

---

## Panel: Calendar Options

### Pane: Lead
- **Don't forget to save after making changes.** Meeting length, Calendar slot size, Bookable dates and hours. *(when view-only: View only — organiser can edit.)*
- Each editable pane summary and pane body carry **Save** (no separate panel top/footer Save — avoids duplicate buttons stacked beside pane Saves).
- **All Save buttons on this tab do the same thing:** they submit the whole Calendar Options form (`update-settings`) — title, length, slot size, weekends, bookable dates, and daily hours together.
- Nav when no attendees yet: Back to Getting started · Next step: Attendees →
- Meeting base timezone is a **hidden** field (first attendee); there is **no** timezone-picker pane.

Saving Calendar Options is what marks Getting started step **Set Calendar Options** with ✓. After save, My availability jumps to the bookable start date.

### Pane: Meeting length & calendar `opts-length`

| Kind | Text |
|------|------|
| Summary | **Meeting length & calendar** · **Save** *(organiser)* |
| Fields | Title · Meeting length · Calendar slot size · Include weekends |
| Meeting length title | Minutes, 1.5h, 2,5h, or AM / PM (sets default bookable hours) |
| Meeting length placeholder | e.g. 60, 1.5h, AM, PM |
| Slot size title | Granularity for partial availability — must divide meeting length evenly |
| Slot size placeholder | e.g. 30, 15m |
| Weekends title | When off, Saturday and Sunday are hidden from calendar navigation |
| Hint | **Calendar slot size** is one granularity at which attendees can confirm availability to indicate partial attendance. Changing meeting length or slot size does **not** remap saved availability — attendees should review **My availability** and save again. |
| Extra when invalid | Slot size must divide meeting length evenly. |

### Pane: Bookable dates & daily hours `opts-booking`

| Kind | Text |
|------|------|
| Summary | **Bookable dates & daily hours** · **Save** *(organiser)* |
| Explain | Daily hours are edited in **your** local timezone ({tz}) and stored in UTC so everyone sees consistent local times. Meeting base timezone (first attendee): {meetingTz}. |
| Start date | Earliest date this meeting is open for scheduling. |
| Start time | Earliest start time each day in your local timezone. Label: Start time ({tz}) |
| End date | Latest date this meeting is open for scheduling. Leave blank for open-ended. Label: End date *(optional)* |
| End time | Latest end time each day in your local timezone. Label: End time ({tz}) |

### Pane: Recurrence (future feature) `opts-recurrence` `[secondary]`
- **Recurrence (future feature)**
- One-off scheduling only for now. Recurrence design is parked.

---

## Panel: Confirm meeting choices

Click behaviour (consistent everywhere — UI, Help, Getting started, Operations):

1. **First click** on a Group calendar slot **saves** that start immediately as the scheduled meeting start (end = start + meeting length).
2. **Second click on the same slot** **clears** the scheduled start.
3. **Click on a different slot** **reschedules** to the new start.

There is no separate session-only “propose” step and no separate Confirm button for time.

### Pane: Lead
- **Group calendar & location preferences** — everyone’s availability on one sparse grid (empty hours and days hidden). Click a start time to **set it immediately as the meeting start**; click the same start again to clear. Meeting length {dur}; slots {gran} each. Preferred locations below.

### Pane: Confirm a meeting date and time `group-time` *tint-dates*

**Day column headings stick to the viewport** under the sticky dashboard (same as My availability). Colour key sits **inside this pane**. A thicker horizontal line marks a gap where empty hours were omitted; a thicker vertical line marks a gap where empty days were omitted.

| Kind | Text |
|------|------|
| Summary | **Confirm a meeting date and time** (title: Click a start on the Group calendar to save or clear it) |
| Status (none) | **Meeting start:** none scheduled yet — click a slot below to save one *(organiser only when not org)* |
| Status (scheduled) | **Meeting scheduled:** {start – end pair with tz + UTC}. Click the same slot again to clear |
| Hint | Click a slot to set the meeting start (saves immediately). Click the same slot again to clear. Times use your timezone ({tz}) |
| Hours toggle | Hide empty hours / Show all hours (title: Show or hide hours with no availability marked) |
| Days toggle | Hide empty days / Show all days (title: Show or hide days with no availability marked) |
| Hidden hours | Empty time rows are hidden. Use "Show all hours" to display midnight-to-midnight. A thicker line marks a gap where hours were omitted. |
| Hidden days | Empty days are hidden. Use "Show all days" to show every day in range. A thicker vertical line marks a gap where days were omitted. |
| Initials note | **Initials** in cells show who marked that slot on My availability. |
| Time labels | Same local (+ optional cycling alt timezone) behaviour as My availability |
| Legend | Light green = all attendees available for full meeting if this start is chosen · Amber = all attendees, only partial meeting if this start is chosen · Purple = some attendees unavailable if this start is chosen · Dark green border = scheduled start |

### Pane: Confirm a meeting location `group-locations`

No whole-pane teal wash — row colours match the calendar key (all / some / none OK). **OK with me** column is hidden here (voters still show under **OK with**; mark preferences on the Locations tab).

| Kind | Text |
|------|------|
| Summary | **Confirm a meeting location** |
| Lead | Organiser: toggle **Confirmed** (multiple allowed, e.g. one Online and one Meeting Room — saves immediately). Attendees propose and mark **OK with me** on the Locations tab. Row colours match the calendar key (all / some / none OK with this location). URLs open in a new window and can be copied. |
| Table | Same locations table as Locations + **Confirmed** column (horizontal scroll); vote-tint rows; URL cells are links **and** Copy; **OK with me** column omitted |

**Removed:** Meeting link pane (`group-link`) — Copy meeting link remains in the sticky header.

---

## Operations guide

URL: `operations.php` — renders `docs/OPERATIONS.md` (not app UI panes). Linked from the site footer as **Installation, Operations and Maintenance Guide**, and from Getting started as **operations manual**.

---

## Pane ID reference

| Pane ID | Tab / context |
|---------|----------------|
| `att-registered` | Attendees — Registered attendees |
| `att-registered-cal` | My availability embed |
| `att-add` | Attendees — Add another attendee |
| `att-add-first` | Attendees — Add yourself (collapsible when attendees already exist) |
| `att-merge` | Attendees — Merge duplicates |
| `mr-description` | Meeting Resources — Description for attendees |
| `mr-agenda` | Meeting Resources — Agenda & decisions |
| `mr-notes` | Meeting Resources — Notes |
| `mr-attachments` | Meeting Resources — Attachments |
| `opts-length` | Calendar Options — Meeting length & calendar |
| `opts-booking` | Calendar Options — Bookable dates & daily hours |
| `opts-recurrence` | Calendar Options — Recurrence (future) |
| `group-time` | Confirm meeting choices — Confirm a meeting date and time |
| `group-locations` | Confirm meeting choices — Confirm a meeting location |

**Removed:** `opts-timezone` (Calendar hours & timezone picker — no longer in the UI). **Removed:** `group-link` (Meeting link pane on Confirm tab — use header Copy meeting link).

Overview and Getting started do not use persisted pane IDs. First-add attendee pane (no attendees yet) is a non-collapsible `pane-region` and has no pane ID. My availability calendar grid is a `pane-region` without a persisted pane ID.

---

## Amending text

To request a wording change, cite **section + pane + current text**, e.g.:

> Locations → Locations table, OK with me column: change **?** to **—** when unsigned in.

This file is the reference; code lives in `meet/assets/js/app.js` and `meet/index.php`.
