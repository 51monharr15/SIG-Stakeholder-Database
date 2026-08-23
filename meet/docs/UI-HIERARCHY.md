# Meet Scheduler — UI hierarchy and text constants

**Build:** 1.8.31  
**Purpose:** Map pages → panels → panes, with **exact on-screen text** under each pane so amendments can be referenced by location and wording.

**Sources (on-screen pane/panel copy):** `meet/index.php`, `meet/assets/js/app.js`  
Also user-visible but outside this hierarchy: `meet/docs/OPERATIONS.md` (via `operations.php`), and API/toast error strings from `meet/api.php`.

**Convention:** Reproduce **full** on-screen text here (no ellipsis abbreviations) so reviews and amendments stay unambiguous.

### Legend

| Symbol | Meaning |
|--------|---------|
| **Panel** | One green dashboard tab's working area |
| **Pane** | Bordered tinted region (or expandable block) |
| `[expand]` | Collapsible; open/closed remembered per meeting |
| `[secondary]` | Closed on first visit |
| *tint* | Semantic background colour |

**Tints:** lavender = dates/times · blue = text · pink = people · green = places · amber = attachments · light blue = create · light green = find

**Pane IDs** (persisted): see § Pane ID reference at end.

---

## 1. Landing page

### Site header
- Simon's Meeting Scheduler

### Pane: Create meeting *tint-create*
| Kind | Text |
|------|------|
| Heading | Find a meeting time everyone can make |
| Lead | Propose availability, compare overlaps, and agree on a place to meet. |
| Hint | Meeting locations can be online (URL) and physical (Simultaneously!). Times are shown to attendees in their local timezone (and UTC as 'reference'). |
| Dynamic | Your local time zone is {tz} — {local} and {utc} UTC |
| Label | Meeting title |
| Placeholder | Board review |
| Button | Create meeting |
| Hint | The **Create meeting** button generates a private link with a random URL. **Save it.** |

### Pane: Find my meetings *tint-find*
| Kind | Text |
|------|------|
| Heading | Find my meetings |
| Lead | Enter the **registered identity** (exactly as when you joined) and **passcode** for a list of matching meetings. |
| Label | Registered identity |
| Placeholder | e.g. Alice@gmail.com or Bob |
| Label | Passcode |
| Passcode input title | Stored as all lowercase. Letters, numbers, spaces, and safe specials. 2 to 20 characters. |
| Reveal button title / aria | Show or hide passcode / Show passcode (toggles to Hide passcode) |
| Button | List my meetings |
| Results (empty) | No meetings found for that name and passcode. Check spelling and that you set a passcode when you registered. |
| Results (count) | 1 meeting found / {N} meetings found |
| Validation | Enter a passcode of 2 to 20 characters. |

### Site footer
- Build {version} · Local times · {tz} · Installation, Operations and Maintenance Guide

### Scheduler shell (before render)
- Loading meeting…

---

## 2. Chrome (always visible on meeting page)

### Sticky header actions
| Text | Notes |
|------|-------|
| More ▾ / Less ▴ | Narrow screens only; title: Collapse/Expand for narrow screens |
| How to use this | title: How to use this meeting scheduler |
| Copy meeting link | title: Copy meeting link |

### Signed-in banner
- Currently signed in as **{name}** (Organiser \| Attendee)
- title: Manage attendee identities on the Attendees tab

### Status strip
| Kind | Text |
|------|------|
| Label | Status: |
| Values | Entering organiser details · Entering attendee details · Scheduled · Rescheduled · Past · Summarised |
| Status tip | Status progresses as the meeting is set up: entering details → Scheduled (organiser accepted a start) → Rescheduled if changed → Past / Summarised after the start. Organisers set and can change the accepted time and location. |
| Time (scheduled) | Time: {pair} |
| Time (proposed) | Time (proposed): {pair} |
| Time (none) | No date and time selected |
| Recurrence | Recurrence: {label} — default **One-off** |
| Locations | Locations: {list} / Locations (proposed): {list} / No locations confirmed |
| Description summary | Description: {preview} — fallback **Set in meeting resources.** |
| Description empty body | No description yet — set one in **Meeting Resources**. |

### Dashboard nav (green buttons)
| Button | Tooltip (exact) |
|--------|-----------------|
| Getting started | Step-by-step checklist for setting up this meeting. |
| Overview | Summary of the meeting — status, attendees, and best overlap times. |
| Attendees | Register yourself, add others, and manage the attendee list. |
| Locations | Propose meeting locations and mark your preferences. |
| My availability | Mark when you are free. Each cell is one calendar slot; select consecutive slots for the full meeting length. Use «◀ ▶» beside dates to move by weekday. |
| Meeting Resources | Description, agenda, decisions, notes, and attachments (pre- and post-meeting assets). |
| Calendar Options | Meeting length (minutes, hours, or AM/PM), calendar slot size (partial availability), bookable dates and hours. Organiser only. |
| Set confirmed meeting details | Group calendar: everyone’s availability on one grid. Organiser picks start time (partial overlap OK) and location(s). Use ◀ ▶ beside dates to move by weekday. |

Nav aria-label: Meeting sections

### Help panel *(opens on “How to use this”)*
| Section | Text |
|---------|------|
| Title | How to use this meeting scheduler |
| Close | Close (title: Close help panel) |
| Close footer | Close / Collapse (title: Close help panel) |
| Note | Most fields have tooltips on hover (may not show on mobile). Coloured panes group related topics — dates & times (lavender), free text (blue), people (pink), places (green), attachments (amber). |
| Organiser heading | Setting up a meeting (organiser) |
| Organiser step 1 | **Attendees** — add yourself first. You become the organiser. Optionally set a passcode so you can find this meeting from the home page later. |
| Organiser step 2 | **Calendar Options** — meeting length (whole meeting), calendar slot size (partial availability — must divide meeting length evenly), AM/PM half-day presets, bookable dates and daily hours, timezone. Save when done. |
| Organiser step 3 | **Meeting Resources** — optional description, agenda, decisions, notes, attachments (pre- and post-meeting). |
| Organiser step 4 | **My availability** — mark when you are free. Select enough consecutive slots for the full meeting length if you can. Press *Save*. |
| Organiser step 5 | **Locations** — propose online and/or physical places; attendees vote which work for them. |
| Organiser step 6 | **Share the link** — *Copy meeting link* and send it to attendees. |
| Organiser step 7 | **Set confirmed meeting details** — *Group calendar*: everyone’s marks on one grid. Organiser picks start and location(s), then accepts. Partial overlap is OK. |
| Attendee heading | Joining a meeting (attendee) |
| Attendee step 1 | Open the meeting link you were sent. You will see the meeting title and current status. |
| Attendee step 2 | Go to **Attendees**. If you are already listed, tick *Me* on your row and enter your passcode if prompted. If you are not listed, fill in the *Add new attendee* form with your name. |
| Attendee step 3 | Open **My availability** and mark every slot when you are free. Select enough consecutive slots to cover the full meeting if you can — finer slots mean you can also mark partial availability. Press *Save*. You can come back and update this any time — clicking a previously selected slot deselects it, so remember to save again. |
| Attendee step 4 | Open **Locations** to see any proposed venues. Click locations that work for you (blue means saved). Click again to remove. You can also propose a new location. |
| Attendee step 5 | Open **Set confirmed meeting details** to see the *Group calendar* — how times overlap and what is proposed or scheduled. |
| Attendee step 6 | Check the top status line for the current scheduled time and location. |
| Attendee step 7 | Repeat any of these steps as the meeting evolves — there is no fixed order. |
| Footer | The **Copy meeting link** button copies the meeting link. Save the link — it is the only way back to this meeting unless you set a passcode. The *Find my meetings* option on the home page lets you look up a meeting but requires a registered name and matching passcode. |

---

## 2.1 Getting started panel

| Location | Text |
|----------|------|
| Title | Getting started |
| [expand] summary | Instructions for organisers and attendees |
| Intro | Steps below are aimed at the meeting organiser. Attendees can skip organiser-only steps — full details in **How to use this** above. Essential steps for all Attendees: sign in on **Attendees**, mark **My availability**, vote on **Locations**. Optionally review everything! |
| Intro (second) | For fuller guidance, open **How to use this** at the top of the page, or the [operations manual](operations.php). |
| Step 1 | **Go to Attendees** and **Add yourself** — First attendee becomes first Meeting Organiser by default and can give others Organiser privilege. |
| Step 2 | **Set Calendar Options** — Organiser status required. Set **meeting length** (full meeting) and **calendar slot size** (partial availability — must divide meeting length evenly). Use **AM/PM presets** for half-day meetings if helpful. Also set earliest/latest dates, daily hours, weekends, and recurrence if needed. **Go to Calendar Options** |
| Step 3 | **(Optional)** **Go to Meeting Resources** — Set/edit title, description, agenda, attachments, etc. |
| Step 4 | **(Optional)** **Go to Attendees** — Add others as proposed attendees. Anyone with the link can add themselves and others. Organisers can grant Organiser to registered attendees. |
| Step 5 | **Go to My availability** and select slots when you are free — use the green navigation buttons (◀ ▶ beside dates) to move by day or screen. Select enough consecutive slots to cover the full meeting if you can. |
| Step 6 | **Go to Locations** — Select/ Propose locations (Online and Physical) for attendees to vote on. Any attendee can propose locations. Organisers can (re-)select a confirmed location at any time. |
| Step 7 | **Set Confirmed Meeting Details** — Organiser status required. Pick an agreed meeting date, time and location(s). (Can be amended.) **Go to Set confirmed meeting details** |
| Step 8 | **Share the link** — Copy meeting link and send it to all attendees so they can open this meeting and enter their availability. Button: **Copy meeting link** |
| Done (complete) | **Setup complete.** You can keep using this checklist any time, or move on to Overview and the other tabs. |
| Done (incomplete) | This checklist stays visible at all times. |
| Link | **Go to Overview** |

*(Completed steps show a leading ✓ on the step title.)*

---

## 2.2 Overview panel

| Pane | Summary / key text |
|------|-------------------|
| Header | Overview — tap ▸ headings to expand |
| Hint | Coloured sections group topics — lavender dates/times, blue text, pink people, green places, amber attachments. |
| *tint-dates* Time · Recurrence · Locations | summary title: Tap or click the triangle to expand/collapse |
| | **Scheduled time:** / **Proposed time:** {pair} \| {pair} (proposed) \| None selected yet |
| | **Meeting length:** {dur} · **Calendar slot:** {slot} |
| | **Recurrence:** {label} (default One-off) |
| | **Confirmed locations:** / **Proposed locations:** {list} \| None yet |
| *tint-text* Agenda and decisions | Agenda and decisions *(Set in Meeting Resources)* |
| | **Agenda:** {bullets} / No agenda yet — go to **Meeting Resources** to set it. |
| | **Decisions required:** {bullets} / No decisions listed yet — go to **Meeting Resources** to set them. |
| *tint-people* Attendees | Attendees registered ({N}) · Availability entered ({count}) |
| | Empty: No attendees registered yet. |
| | Table columns: Name · Time slots / locations · Role (Organiser \| Attendee) |
| *tint-dates* Top start times | Top start times ({shown} of {total}) — best attendance |
| | Suggestion lines: {time} — {n} of {total} free for full meeting ({dur}) / {n} of {total} for full {dur}; {p} partial / {n} of {total} marked (partial overlap) |
| | Confirm one with **Set confirmed meeting details**. Includes times where everyone is free for the full meeting, and times with partial overlap. |
| | Empty: No overlap times yet — attendees need to mark availability on **My availability**, then check **Set confirmed meeting details**. |
| *tint-places* Top locations | Top locations ({shown} of {total}) — by popularity |
| | {location} — {N} preference / preferences |
| | Empty: No locations proposed yet. |
| *tint-assets* Attachments | Attachments ({N}) — when past/summarised |

---

## 2.3 Attendees panel

| Pane ID | Summary / key text |
|---------|-------------------|
| Lead (signed in, organiser) | Toggle Organiser rights for others. **Delete** removes a row. Expand **Merge duplicate attendees** if needed. |
| Lead (signed in, attendee) | Duplicate rows can be merged — expand **Merge duplicate attendees** if needed. |
| Lead (not signed in) | Toggle sign-in if you are listed (enter passcode if set), or add yourself below. |
| Identity bar | **Edit identity** (title: Edit your display name, contact, or passcode) · **Switch user** (title: Sign out on this browser) |
| `att-registered` | **Registered attendees ({N})** / **Registered attendees (none yet)** |
| Table headers | Signed-in as · Name · Initials · Contact · Time slots / locations · Passcode · Organiser · Delete *(organiser)* |
| Time slots / locations head title | Availability slots marked and locations marked OK with me |
| Empty row | None yet |
| Passcode cell | Set / Not set |
| Sign-in toggle titles | Sign in as this attendee / Sign out / Merge duplicate into your row |
| Delete | Delete (title: Remove this attendee from the meeting) |
| `att-add-first` | **Add yourself as an attendee** · Save |
| Add first lead | Add yourself as an attendee, or propose someone else. |
| Mode choices | Myself / Someone else |
| Field guide | Display name: any text. Initials: default from display name. Contact optional: comma-separated email, URL, phone, or free text. Passcode: optional — 0–9 a–z and safe specials (not \|). Leading spaces removed. Needed to find lost meeting links. |
| Propose hint | They are not emailed — share the meeting link with them. They tick **Me** on their row to sign in. |
| Labels | Display name · Initials (opt.) · Passcode (optional) · Contact (opt.) |
| Placeholders | e.g. name or email · For Find my meetings · email, phone (first-add) / email, URL, phone (add-another) |
| Button | Save |
| `att-add` `[secondary]` | **Add another attendee** — Add **someone else**. Share the meeting link with them. |
| Edit form | **Edit my details** |
| | Display name · Initials (opt.) · Contact (opt.) |
| | **Change passcode** / **Set passcode** |
| | You are already signed in — current passcode is not required. Leave blank to keep your existing passcode. |
| | Remove passcode instead of setting a new one |
| | New passcode / Passcode · placeholder: leave blank to keep |
| | **Save my details** · **Cancel** |
| Claim form | **{name}** — enter your passcode to sign in / optionally set a passcode, then press Continue |
| | Passcode / Passcode (optional) · **Continue** · **Cancel** |
| `att-merge` `[secondary]` | **Merge duplicate attendees** · Keep row 1 / Remove row 2 · **Merge** |
| | Availability from the removed row is combined into the kept row. |
| Continue (embed) | Continue to My availability → · Mark your availability on **My availability**. / Add yourself above, then go to **My availability**. |

---

## 2.4 Locations panel

| Location | Text |
|----------|------|
| Lead (signed in) | Proposed URLs or place names in the **top row** are added to the table. Tab out of an amended cell to save. |
| | Toggle **OK with me** to record your preference. Tap/click overflow cells to expand; use **Copy** after expanding a link. |
| Lead (not signed in) | Proposed URLs or place names in the top row are added to the table. Sign in on Attendees to propose locations and mark OK with me. |
| Table headers | Notes · Location · OK with · OK with me · Confirmed *(Set confirmed tab only)* |
| Header titles | OK with: Initials of attendees who marked OK with me · OK with me: Toggle if this location works for you · Confirmed: Organiser confirms for the meeting |
| Placeholders | Notes · URL or place name |
| OK with me cell | ? · Yes |
| OK with me button titles | OK with me — saves immediately / Remove — OK with me |
| Confirm button title | Confirmed for meeting |
| Expand / Copy | Show full link (selects all for copy) · Show all (selects for copy) · Open · Copy (title: Copy link to clipboard) · Full link — selected for copy |

---

## 2.5 My availability panel

| Pane | Text |
|------|------|
| [expand] summary | Mark when you are free (title: How to mark your availability on the calendar) |
| Expand body | Each cell is one **calendar slot** ({slot}). Drag or tap to select. Use **Save** in the band below the grid. Tap a selected slot again to deselect — save again after changes. |
| | **Meeting length** is {dur}.{slotHint} Finer slots let you show partial availability if you cannot make the whole meeting. |
| | slotHint (multi): Select {N} consecutive {gran} slot(s) to cover the full {dur} meeting. |
| | slotHint (single): Each slot is {gran} — one slot covers the full meeting. |
| | **Initials** show who else chose that slot. A **+** means more people than fit in the cell. |
| | Use the date navigation (left of the grid) to move by day, screen, or jump to first/last bookable dates. |
| | Meeting hours {start}–{end} in **{meetingTz}** (and UTC). Your browser timezone: **{tz}**. |
| Nav gutter title | Day ◀▶ · screen «» · first/last ⇤⇥ |
| Nav buttons | ◀ Previous weekday · ▶ Next weekday · « Back one screen of dates · » Forward one screen of dates · ⇤ Jump to earliest bookable date · ⇥ Jump to latest bookable date |
| Day head extras | today · recurring |
| *tint-dates* Calendar grid | (slot cells — dynamic initials/counts) |
| Save band | **Save** (title: Save your currently selected availability slots to the meeting) · {N} slot(s) selected · drag or tap slots to select a range *(or “tap slots to select” on touch)* |

---

## 2.6 Meeting Resources panel

| Pane ID | Text |
|---------|------|
| Lead | Description, agenda, decisions, notes, and attachments — pre- and post-meeting assets in one place. |
| Description *tint-text* | **Description for attendees** *(simple HTML — status bar & Overview)* |
| | Placeholder: Add a short description for attendees — shown in the status bar and Overview. |
| | **Save** / Sign in on Attendees to edit. |
| `mr-agenda` | **Agenda & decisions** |
| | Agenda *(each line is a bullet on Overview)* · Decisions required *(each line is a bullet on Overview)* · **Save** |
| `mr-notes` | **Notes** |
| | Notes *(simple HTML)* · **Save** |
| Attachments *tint-assets* | Attachments — links or text (recordings, transcripts, summaries). Top row adds on tab out. |
| | Columns: Label · Content |
| | Placeholders: Label · URL or text (simple HTML) |
| | Empty (unsigned, none): No attachments yet. |

Format toolbar (description; notes omit Help): **?** Help for meeting description · Bold · Italic · Paragraph · Line break · Link · List

Help body: Enter plain text or simple HTML. Tags not in the allowed list are stripped on save. Allowed: paragraphs, line breaks, bold, italic, links, and lists.

---

## 2.7 Calendar Options panel

| Pane ID | Text |
|---------|------|
| Lead | **Don't forget to save after making changes.** Meeting length, Calendar slot size, Bookable dates and hours. *(when view-only: View only — organiser can edit.)* |
| Header/footer | **Save** |
| Nav (no attendees yet) | Back to Getting started · Next step: Attendees → |
| `opts-length` | **Meeting length & calendar** |
| | Title |
| | Meeting length (title: Minutes, 1.5h, 2,5h, or AM / PM (sets default bookable hours); placeholder: e.g. 60, 1.5h, AM, PM) |
| | Calendar slot size (title: Granularity for partial availability — must divide meeting length evenly; placeholder: e.g. 30, 15m) |
| | Include weekends (title: When off, Saturday and Sunday are hidden from calendar navigation) |
| | Hint: **Calendar slot size** is one granularity at which attendees can confirm availability to indicate partial attendance. *(optional: Slot size must divide meeting length evenly.)* Changing meeting length or slot size does **not** remap saved availability — attendees should review **My availability** and save again. |
| `opts-booking` | **Bookable dates & daily hours** |
| | Start date (title: Earliest date this meeting is open for scheduling.) |
| | Start time *({meetingTz})* (title: Earliest start time on the calendar grid each day (meeting timezone).) |
| | End date *(optional)* (title: Latest date this meeting is open for scheduling. Leave blank for open-ended.) |
| | End time *({meetingTz})* (title: Latest end time on the calendar grid each day (meeting timezone).) |
| `opts-timezone` | **Calendar hours & timezone** |
| | Summary line: {tz} · {day_start}–{day_end} · {range_start} – {range_end\|open-ended} |
| | Times on the calendar grid are shown in each person’s local timezone (and UTC in slot details). The timezone below defines which wall-clock hours {day_start}–{day_end} refer to — everyone marks the same underlying slots. |
| | Timezone |
| `opts-recurrence` `[secondary]` | **Recurrence (future feature)** |
| | One-off scheduling only for now. Recurrence design is parked. |

---

## 2.8 Set confirmed meeting details panel

| Pane ID | Text |
|---------|------|
| Lead | **Group calendar** — everyone’s availability on one grid. Meeting length {dur}; slots {gran} each.{slotHint} |
| `group-link` *tint-text* | **Meeting link** (title: Share this link so others can open the meeting) · **Copy meeting link** (title: Copy meeting link to clipboard) |
| `group-time` *tint-dates* | **Proposed meeting time** (title: Pick a meeting start from the Group calendar) |
| Accept button (proposed) | Accept date: {time} |
| Accept button (none) | Accept date: None proposed |
| Accept button (already scheduled) | Accepted: {time} |
| Accept titles | Accept this start as the scheduled time / Accept this new start as the scheduled time (reschedules the meeting) / Select a start slot below first / This start is already scheduled / Organiser status required |
| | Click a slot to set the proposed start. Click again to clear. Times shown in your timezone and UTC. |
| | **Currently selected meeting start:** {pair} / none selected yet — tap a slot below to set it |
| | Hide empty hours / Show all hours (title: Show or hide hours with no availability marked) |
| | Empty time rows are hidden. Use "Show all hours" to display midnight-to-midnight. |
| Initials note | **Initials** in cells show who marked that slot on My availability. |
| Legend | Light green = all attendees, full meeting |
| | Amber = all attendees, partial meeting |
| | Purple = some attendees available |
| | Dark green border = selected start |
| Legend titles | Every attendee marked enough consecutive slots for the full meeting length · Everyone marked something at this start, but not all for the full meeting length · Some but not all attendees marked this start · Your current proposed start before Accept |
| `group-locations` *tint-places* | **Proposed locations** |
| | Organiser: toggle **Confirmed** (multiple allowed, e.g. one Online and one Meeting Room — saves immediately). Attendees propose and mark **OK with me** using the Locations tab. |
| | Same locations table as §2.4 + **Confirmed** column |

---

## 3. Operations guide

URL: `operations.php` — renders `docs/OPERATIONS.md` (not app UI panes).

---

## Pane ID reference

| Pane ID | Tab / context |
|---------|----------------|
| `att-registered` | Attendees — Registered attendees |
| `att-registered-cal` | My availability embed |
| `att-add` | Attendees — Add another attendee |
| `att-add-first` | Attendees — Add yourself |
| `att-merge` | Attendees — Merge duplicates |
| `mr-agenda` | Meeting Resources — Agenda & decisions |
| `mr-notes` | Meeting Resources — Notes |
| `opts-length` | Calendar Options — Meeting length & calendar |
| `opts-booking` | Calendar Options — Bookable dates & daily hours |
| `opts-timezone` | Calendar Options — Calendar hours & timezone |
| `opts-recurrence` | Calendar Options — Recurrence (future) |
| `group-link` | Set confirmed — Meeting link |
| `group-time` | Set confirmed — Proposed meeting time |
| `group-locations` | Set confirmed — Proposed locations |

Overview and Getting started do not use persisted pane IDs.

---

## Amending text

To request a wording change, cite **section + pane + current text**, e.g.:

> §2.4 Locations panel, OK with me column: change **?** to **—** when unsigned in.

This file is the reference; code lives in `meet/assets/js/app.js` and `meet/index.php`.
