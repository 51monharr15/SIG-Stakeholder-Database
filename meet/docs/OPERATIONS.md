# Installation, Operations and Maintenance Guide

How to run and use the meeting scheduler — for organisers, attendees, and anyone installing or maintaining a copy.
Simon's Version
## Contents

1. [Operations — using the scheduler](#operations)
2. [Maintenance](#maintenance)
3. [Installation](#installation)

## Operations — using the scheduler {#operations}

### Buttons (colour meaning)

- **Blue** — an action that saves or changes meeting data (Save, Accept proposed start, Add attendee, Copy meeting link).
- **Green** — navigation (dashboard tabs, “Go to…”).
- **Light grey / neutral** — Cancel or Close (still clickable).
- **Muted grey** — disabled but visible. Hover or long-press for “Disabled because …”.

### Setting up a meeting (organiser)

1. On the **landing page**, enter a title and press **Create meeting**. Save the private URL. Use **Find my meetings** (full-width pane below) with registered identity and passcode.
2. Use **Getting started** for the checklist, or open tabs directly.
3. **Meeting options** — edit title and description, meeting length, calendar slot duration, weekends, recurrence, and the earliest/latest date and daily hours.
4. **Attendees** — add yourself first (you become organiser). Optionally set a **passcode** (2–20 characters, stored as lowercase) so you can use *Find my meetings* later.
5. Optionally add other proposed attendees and grant organiser rights. Anyone with the link can also add themselves. An identity without a passcode can be claimed by anyone.
6. **My availability** — mark free slots; save any time. Clicking a selected slot deselects it — save again after changes.
7. **Locations** — propose online or physical places and mark which work for you. Initials show who has OK’d each location.
8. **Copy meeting link** and send it so others can record availability, locations, agenda, and attachments.
9. On **Set confirmed meeting details**, click a start slot (proposed), choose a location, then press **Accept proposed start as scheduled start time**. Status becomes *Scheduled* (or *Rescheduled* if you change it later).

### Joining a meeting (attendee)

1. Open the meeting link. Status is shown at the top of every page.
2. On **Attendees**, press *This is me* or add yourself. Use your passcode if prompted.
3. Mark availability on **My availability**; vote or propose on **Locations**.
4. Open **Set confirmed meeting details** to see overlaps (organisers set the scheduled time; the accept button is disabled for others).
5. Use **Meeting Resources** for description, agenda, decisions, notes, and **attachments** (pre- and post-meeting assets — links or text in one table).

### Dashboard tabs

- **Getting started** — Persistent setup checklist for organisers.
- **Overview** — Summary: status, description, agenda, attendees, best start times, location popularity.
- **Attendees** — Register, claim identity, edit details and passcode, organiser roles.
- **My availability** — Your free times on the calendar grid.
- **Set confirmed meeting details** — Overlap view and organiser scheduling. Selecting a confirmed meeting time requires organiser status.
- **Locations** — Propose and vote; see who OK’d each place.
- **Meeting Resources** — Description, agenda, decisions, notes, attachments (all meeting assets).
- **Calendar Options** — Meeting length, slot size, bookable dates and hours, timezone (organiser edits; others may view read-only).

### Passcodes {#passcodes}

A passcode protects your attendee row and lets you find meetings from the landing page without the URL.

- 2 to 20 characters: letters, digits, spaces, and safe specials (not `|`). Stored as all lowercase.
- *Find my meetings* needs registered name **and** passcode.
- Change or remove it under **Edit my details** on Attendees.

> **Warning:** Passcodes are not strong security. Anyone with the meeting link can see the attendee list. They cannot claim a passcode-protected row without the passcode.

### Status values

- **Entering organiser details** — no attendees yet.
- **Entering attendee details** — attendees present; time/location not yet accepted.
- **Scheduled** — organiser accepted a start time and both an Online and a Physical confirmed location (a Hybrid proposal can supply both).
- **Rescheduled** — organiser changed a previously scheduled time or location.
- **Past** — current time is after the scheduled start.
- **Summarised** — past, and attachments exist.

### Pane colours (semantic)

Coloured panes group related topics consistently across the app:

| Tint | Meaning | Examples |
|------|---------|----------|
| Lavender | Dates & times | Calendar Options date/time fields, calendar grids, proposed time |
| Blue | Free text | Description, agenda, decisions, notes |
| Pink | People | Attendees table and forms |
| Green | Places | Locations (online and physical are both places) |
| Amber | Attachments | Meeting Resources attachment table |
| Light blue / green | Landing page | Create meeting / Find my meetings panes |

Expandable panes show **▸** when collapsed and **▼** when open. Pane open/closed state is remembered per meeting.

> **Tip:** Design note for maintainers: availability is stored in UTC; the calendar grid hours use the meeting timezone so everyone marks the same slots. Each person also sees times in their browser timezone.

## Maintenance {#maintenance}

- Meeting data lives under `meet/data/meets/` as plain-text `.meet` files. Back up that directory.
- Do not put `|` characters in passcodes or pipe-separated fields — they break the file format.
- After deploying updates, hard-refresh browsers (Ctrl+F5) so `app.js` and `style.css` reload.
- Housekeeping idea (future): delete old meetings from *Find my meetings* after the confirmed date (or last availability date) has passed, re-checking name + passcode.

## Installation {#installation}

> **Warning:** **Not a hardened application.** Meet Scheduler is built for trusted groups sharing a private link. It aims to stop easy mistakes (wrong pane, accidental edits by non-organisers), not to resist a determined attacker who has the meeting URL or crafts API requests. Do not use it where strong authentication, audit trails, or hostile-user security are required.

### Local PHP test server

Serve from the `meet` directory (the folder that contains `index.php`), not its parent:

```bat
cd path\to\SIG-Stakeholder-Database\meet
php -S localhost:8000
```

Open `http://localhost:8000/`. Requires PHP 8.1+.

### Production

Deploy the `meet` tree to your web server (Apache recommended). Ensure `meet/data/` is writable by the web user. Pretty URLs are optional; query-string links like `?=slug` always work.

### Editing this guide

This page is generated from **`docs/OPERATIONS.md`**. Edit that Markdown file only — do not maintain a second copy of the guide text.

---

## UI consistency audit (maintainers)

Rules applied across the scheduler interface. After UI changes, walk each screen against this list.

### Structure

- **Landing page** — two panes: Create meeting (tint-create), Find my meetings (tint-find, full width; identity and passcode side by side).
- **Tab working area** — green dashboard button names the destination; inside, brief lead text only (no duplicate title).
- **Panes** — bordered, semantically tinted regions; tables and wide grids scroll inside the pane, not the window.
- **Expand/collapse** — ▸ / ▼ on expandable panes; state persisted per meeting; first visit: main panes open; secondary panes (Add another attendee, Merge duplicates) closed; Overview and Getting started excepted.

### Semantic tints

- **Dates & times** — Calendar Options, My availability grid pane, Set confirmed time, Overview time blocks.
- **Free text** — Description, agenda/decisions, notes.
- **People** — Attendees registered table (includes Edit identity / Switch), separate panes for Add another attendee and Merge duplicates.
- **Places** — Locations table (URL or place name; online = physical category).
- **Attachments** — single table (label + content); URLs auto-detected; malformed URLs warned; no separate Records UI.

### Behaviour

- Checklist ticks only when the user completes a real in-app action (e.g. share step ticks on Copy meeting link, not a manual “mark done” button).
- Save buttons labelled **Save** only on Meeting Resources panes.
- Remove dead/unreachable UI code when found.

### Documentation alignment

- **How to use this** — mentions pane colour meanings.
- **Getting started** — brief colour hint; steps reference attachments (not Records).
- This audit list — update when rules change.
