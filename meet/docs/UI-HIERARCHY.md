# Meet Scheduler — UI hierarchy and text constants

**Build:** 1.8.30  
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
| Hint | Meeting locations can be online (URL) or physical. Times are shown to attendees in local timezone and UTC. |
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
| Button | List my meetings |
| Results (empty) | No meetings found for that name and passcode. Check spelling and that you set a passcode when you registered. |
| Results (count) | 1 meeting found / {N} meetings found |

### Site footer
- Build {version} · Local times · {tz} · Installation, Operations and Maintenance Guide

---

## 2. Chrome (always visible on meeting page)

### Sticky header actions
| Text | Notes |
|------|-------|
| More ▾ / Less ▴ | Narrow screens only |
| How to use this | |
| Copy meeting link | |

### Signed-in banner
- Currently signed in as **{name}** ({Organiser|Attendee})

### Status strip
| Kind | Text |
|------|------|
| Label | Status: |
| Values | Entering organiser details · Entering attendee details · Scheduled · Rescheduled · Past · Summarised |
| Time (scheduled) | Time: {pair} |
| Time (proposed) | Time (proposed): {pair} |
| Time (none) | No date and time selected |
| Recurrence | Recurrence: {label} — default **One-off** |
| Locations | Locations: … / Locations (proposed): … / No locations confirmed |
| Description summary | Description: {preview} — fallback **Set in meeting resources.** |

### Dashboard nav (green buttons)
| Button | Tooltip (abbrev.) |
|--------|-------------------|
| Getting started | Step-by-step checklist |
| Overview | Summary — status, attendees, overlap times |
| Attendees | Register, add others, manage list |
| Locations | Propose locations, mark preferences |
| My availability | Mark free slots; ◀ ▶ beside dates |
| Meeting Resources | Description, agenda, notes, attachments |
| Calendar Options | Length, slot size, dates, hours. Organiser only. |
| Set confirmed meeting details | Group calendar; organiser picks start and location(s) |

### Help panel *(opens on “How to use this”)*
| Section | Text |
|---------|------|
| Title | How to use this meeting scheduler |
| Close | Close · Close / Collapse |
| Note | Most fields have tooltips on hover… Coloured panes group related topics — dates & times (lavender), free text (blue), people (pink), places (green), attachments (amber). |
| Organiser steps | Attendees · Calendar Options · Meeting Resources · My availability (Press *Save*) · Locations · Share the link · Set confirmed meeting details |
| Attendee steps | Open link · Attendees (Me / Add new) · My availability (Press *Save*) · Locations · Set confirmed · Check status line |
| Footer | Copy meeting link… Find my meetings… registered name and matching passcode. |

---

## 2.1 Getting started panel

| Location | Text |
|----------|------|
| Title | Getting started |
| [expand] summary | Instructions for organisers and attendees |
| Intro | Steps below are aimed at the meeting organiser… Essential steps: sign in on **Attendees**, mark **My availability**, vote on **Locations**. |
| Step 1 | **Go to Attendees** and **Add yourself as an attendee** — First attendee becomes Meeting Organiser… |
| Step 2 | **Set Calendar Options** — meeting length… calendar slot size… **Go to Calendar Options** |
| Step 3 | **(Optional)** **Go to Meeting Resources** — description, agenda, attachments… |
| Step 4 | **(Optional)** **Go to Attendees** — Add others… |
| Step 5 | **Go to My availability** — green navigation buttons (◀ ▶ beside dates)… |
| Step 6 | **Go to Locations** — Propose locations (Online and/or Physical)… |
| Step 7 | **Set Confirmed Meeting Details** — **Go to Set confirmed meeting details** |
| Step 8 | **Share the link** — **Copy meeting link** |
| Done | **Setup complete.** … / This checklist stays visible at all times. |
| Link | **Go to Overview** |

---

## 2.2 Overview panel

| Pane | Summary / key text |
|------|-------------------|
| Header | Overview — tap ▸ headings to expand |
| Hint | Coloured sections group topics — lavender dates/times, blue text, pink people, green places, amber attachments. |
| *tint-dates* Time · Recurrence · Locations | Scheduled time: / Proposed time: / None selected yet · Meeting length: · Calendar slot: · Recurrence: · Confirmed locations: / Proposed locations: / None yet |
| *tint-text* Agenda and decisions | Agenda: / No agenda yet — go to **Meeting Resources** · Decisions required: / No decisions listed yet… |
| *tint-people* Attendees | table: Name · Time slots / locations · Role |
| *tint-dates* Top start times | Top start times ({shown} of {total}) — best attendance · Confirm one with **Set confirmed meeting details**… |
| *tint-places* Top locations | Top locations ({shown} of {total}) — by popularity · {location} — {N} preference(s) |
| *tint-assets* Attachments | Attachments ({N}) — when past/summarised |

---

## 2.3 Attendees panel

| Pane ID | Summary / key text |
|---------|-------------------|
| Lead | Toggle sign-in… / Toggle Organiser rights… / Merge duplicate attendees… |
| `att-registered` | **Registered attendees ({N})** — Signed-in as · Name · Initials · Contact · Time slots / locations · Passcode · Organiser · Delete *(organiser)* |
| Passcode cell | Set / Not set |
| `att-add-first` / add form | **Add yourself as an attendee** · Myself / Someone else · Display name · Initials (opt.) · Passcode (optional) · Contact · **Save** |
| `att-add` | **Add another attendee** — Add **someone else**. Share the meeting link. |
| Edit form | **Edit my details** · Change passcode / Set passcode · Remove passcode… · **Save my details** · **Cancel** |
| Claim form | {name} — enter your passcode… / optionally set a passcode… · **Continue** · **Cancel** |
| `att-merge` | **Merge duplicate attendees** · Keep row 1 / Remove row 2 · **Merge** |

---

## 2.4 Locations panel

| Location | Text |
|----------|------|
| Lead (signed in) | Proposed URLs or place names in the **top row**… Tab out… Toggle **OK with me**… expand… **Copy** |
| Lead (not signed in) | …Sign in on Attendees to propose locations and mark OK with me. |
| Table headers | Notes · Location · OK with · OK with me · Confirmed *(Set confirmed tab only)* |
| Placeholders | Notes · URL or place name |
| OK with me cell | ? · Yes |
| Confirm button title | Confirmed for meeting |

---

## 2.5 My availability panel

| Pane | Text |
|------|------|
| [expand] Mark when you are free | Each cell is one **calendar slot**… Use **Save** in the band below… **Meeting length** is… **Initials**… date navigation… Meeting hours… |
| Nav buttons | ◀ ▶ « » ⇤ ⇥ · today · recurring |
| *tint-dates* Calendar grid | (slot cells — dynamic initials/counts) |
| Save band | **Save** · {N} slot(s) selected · drag or tap slots to select a range |

---

## 2.6 Meeting Resources panel

| Pane ID | Text |
|---------|------|
| Lead | Description, agenda, decisions, notes, and attachments — pre- and post-meeting assets in one place. |
| Description *tint-text* | **Description for attendees (simple HTML — status bar & Overview)** · placeholder · **Save** |
| `mr-agenda` | **Agenda & decisions** · Agenda (each line…) · Decisions required (each line…) · **Save** |
| `mr-notes` | **Notes** · Notes (simple HTML) · **Save** |
| Attachments *tint-assets* | **Attachments** — links or text… · columns Label · Content · placeholders · No attachments yet. |

Format toolbar (description/agenda/notes): Bold · Italic · Paragraph · Line break · Link · List · ? Help for {topic}

---

## 2.7 Calendar Options panel

| Pane ID | Text |
|---------|------|
| Lead | **Don't forget to save after making changes.** Meeting length, calendar slot size, bookable dates and hours. View only — organiser can edit. |
| Header/footer | **Save** |
| `opts-length` | **Meeting length & calendar** · Title · Meeting length · Calendar slot size · Include weekends · slot-size hint paragraph |
| `opts-booking` | **Bookable dates & daily hours** · Start date · Start time · End date (optional) · End time |
| `opts-timezone` | **Calendar hours & timezone** · timezone summary line · explanatory paragraph · Timezone |
| `opts-recurrence` `[secondary]` | **Recurrence (future feature)** · One-off scheduling only for now. Recurrence design is parked. |

---

## 2.8 Set confirmed meeting details panel

| Pane ID | Text |
|---------|------|
| Lead | **Group calendar** — everyone's availability on one grid. Meeting length… slots… |
| `group-link` *tint-text* | **Meeting link** · **Copy meeting link** |
| `group-time` *tint-dates* | **Proposed meeting time** · Accept date: {time|None proposed} or **Accepted:** {time} (disabled when already scheduled) · Click a slot to set… · **Currently selected meeting start:** · Hide empty hours / Show all hours |
| Legend | Light green = all attendees, full meeting · Amber = partial · Purple = some · Dark green border = selected start |
| `group-locations` *tint-places* | **Proposed locations** · Organiser: toggle **Confirmed** (multiple allowed…) · same locations table as §2.4 + **Confirmed** column |

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
