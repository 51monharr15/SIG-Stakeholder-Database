# Meet Scheduler — UI hierarchy

**Build:** 1.8.22  
**Generated:** reference map of pages → panels → panes (as implemented in the app).

### Legend

| Symbol | Meaning |
|--------|---------|
| **Panel** | Bordered tab working area (`.panel.stack`) — one visible per green dashboard button |
| **Pane** | Bordered, semantically tinted region (or expandable block treated as a pane) |
| `[expand]` | Expandable/collapsible (▸ collapsed / ▼ open); state remembered per meeting |
| `[secondary]` | Secondary pane — closed on first visit to the tab |
| *tint* | Semantic background colour |

**Semantic tints:** lavender = dates/times · blue = free text · pink = people · green = places · amber = attachments · light blue = create · light green = find

---

## 1. Landing page

URL: `/` (no meeting slug)

- **Site header** — brand link
- **Main** (`wrap-landing`, full width)
  - **Pane: Create meeting** *tint-create*
    - Title and intro text
    - Create meeting form (meeting title)
    - Save-link hint
  - **Pane: Find my meetings** *tint-find*
    - Registered identity + passcode (side by side)
    - List my meetings button
    - Results table (after search)
- **Site footer** — build version, operations guide link

---

## 2. Meeting scheduler

URL: meeting link (e.g. `?=slug`)

### 2.0 Chrome (always visible; not a tab panel)

- **Sticky header**
  - Meeting title
  - Actions: More/Less (narrow screens) · How to use this · Copy meeting link
  - Signed-in banner (when signed in)
  - Status strip (time, recurrence, locations)
  - **Dashboard nav** — green tab buttons:
    - Getting started
    - Overview
    - Attendees
    - Locations
    - My availability
    - Meeting Resources
    - Calendar Options
    - Set confirmed meeting details
- **Help panel** `[expand]` — opens below header when “How to use this” clicked
  - Organiser steps column
  - Attendee steps column
  - Footer notes (copy link, find my meetings)
- **Tab working area** (`meet-content`) — one panel below at a time

---

### 2.1 Getting started

**Panel:** Getting started

- Page title: Getting started
- **[expand] Instructions for organisers and attendees**
- **Setup checklist** (numbered steps, not tinted panes)
  1. Attendees — add yourself
  2. Calendar Options
  3. (Optional) Meeting Resources
  4. (Optional) Add other attendees
  5. My availability
  6. Locations
  7. Set confirmed meeting details
  8. Share the link (Copy meeting link)
- Setup complete / persistent checklist note
- Link: Go to Overview

---

### 2.2 Overview

**Panel:** Overview

- Page title + colour hint
- **[expand] Time · Recurrence · Locations** *tint-dates*
- **[expand] Agenda and decisions** *tint-text*
- **[expand] Attendees registered · Availability entered** *tint-people*
  - Attendee summary table
- **[expand] Top start times — best attendance** *tint-dates*
- **[expand] Top locations — by popularity** *tint-places*
- **[expand] Attachments** *tint-assets* *(when past/summarised and attachments exist)*

---

### 2.3 Attendees

**Panel:** Attendees (no duplicate page title — lead text only)

- Lead text (sign-in / merge hints)

**When no attendees yet and not signed in:**

- **[expand] Add yourself as an attendee** *tint-people*

**Otherwise:**

- **[expand] Registered attendees** *tint-people* — pane id: `att-registered`
  - Edit identity · Switch user *(when signed in)*
  - **Attendee table** (scrolls inside pane)
    - Columns: Signed-in as · Name · Initials · Contact · Time slots/locations · Passcode · Organiser *(organiser only)*
  - **Claim passcode form** *(when signing in to a row)*
  - **Edit my details form** *(when editing identity)*
- **[expand] Add another attendee** *tint-people* `[secondary]` — pane id: `att-add` *(signed in only)*
- **[expand] Add yourself as an attendee** *tint-people* — pane id: `att-add-first` *(not signed in, attendees already exist)*
- **[expand] Merge duplicate attendees** *tint-people* `[secondary]` — pane id: `att-merge` *(organiser only)*

**Also embedded on My availability** (when meeting has no attendees yet) — same attendee structure inside a collapsible **Registered attendees** wrapper, not a separate tab panel.

---

### 2.4 Locations

**Panel:** Locations

- Lead text (how to add rows, OK with me, expand/copy)
- **Pane: Locations table** *tint-places*
  - Top row: add new (tab out to save)
  - Columns: Notes · Location · OK with · OK with me
  - *(Confirm column appears on Set confirmed tab copy of this table)*

---

### 2.5 My availability

**Panel:** My availability *(calendar-panel)*

- **Instructions band** *tint-instruct*
  - **[expand] Mark when you are free**
- **Attendees block** `[expand]` *(only when meeting not yet established)* — see §2.3 embed
- **Save row** (top) — Save my availability + slot count
- **Pane: Calendar grid** *tint-dates*
  - Date navigation (◀ ▶ « » ⇤ ⇥)
  - Day headers
  - Time labels + slot cells
- **Save band** *tint-action*
  - Save my availability + slot count

---

### 2.6 Meeting Resources

**Panel:** Meeting Resources

- Lead text
- **Pane: Description for attendees** *tint-text* — Save
- **[expand] Agenda & decisions** *tint-text* — pane id: `mr-agenda` — Save
- **[expand] Notes** *tint-text* — pane id: `mr-notes` — Save
- **Pane: Attachments** *tint-assets*
  - Table: Label · Content (top row adds on tab out)
  - URLs auto-detected in content; pre- and post-meeting assets

---

### 2.7 Calendar Options

**Panel:** Calendar Options

- Lead text + Save (organiser)
- Setup nav buttons *(when no attendees yet)*
- Form: update-settings
  - **[expand] Meeting length & calendar** *tint-dates* — pane id: `opts-length`
    - Title · Meeting length · Calendar slot size · Include weekends
  - **[expand] Bookable dates & daily hours** *tint-dates* — pane id: `opts-booking`
    - Start date · Start time · End date · End time (2×2 grid)
  - **[expand] Calendar hours & timezone** *tint-dates* — pane id: `opts-timezone`
  - **[expand] Recurrence (future feature)** *tint-dates* `[secondary]` — pane id: `opts-recurrence`
- Save calendar options (bottom)

---

### 2.8 Set confirmed meeting details

**Panel:** Set confirmed meeting details

- Lead text (group calendar summary)
- **[expand] Meeting link** *(collapsible, not tinted)*
- **[expand] Proposed meeting time** *tint-dates* — pane id: `group-time`
  - Accept date button (top & bottom)
  - Selected start display · Show/hide empty hours
  - Group calendar grid
- **Slot legend** (colour chips — not a pane)
- **[expand] Proposed locations** *tint-places* — pane id: `group-locations`
  - Locations table + Confirm column (organiser)

---

## 3. Operations guide

URL: `operations.php`

- **Documentation viewer** (`ops-wrap`) — renders `docs/OPERATIONS.md`
  - Back link
  - Markdown body (headings, lists, tables — not app panes)
  - Build footer

No panel/pane structure; content mirrors app concepts in prose (including UI consistency audit at end of OPERATIONS.md).

---

## Pane ID reference (persisted open/closed state)

| Pane ID | Tab / context |
|---------|----------------|
| `att-registered` | Attendees tab — Registered attendees |
| `att-registered-cal` | My availability embed |
| `att-add` | Attendees — Add another attendee |
| `att-add-first` | Attendees — Add yourself (when others exist) |
| `att-merge` | Attendees — Merge duplicates |
| `mr-agenda` | Meeting Resources — Agenda & decisions |
| `mr-notes` | Meeting Resources — Notes |
| `opts-length` | Calendar Options — Meeting length & calendar |
| `opts-booking` | Calendar Options — Bookable dates & daily hours |
| `opts-timezone` | Calendar Options — Calendar hours & timezone |
| `opts-recurrence` | Calendar Options — Recurrence (future) |
| `group-time` | Set confirmed — Proposed meeting time |
| `group-locations` | Set confirmed — Proposed locations |

Overview and Getting started sections do not use persisted pane IDs.
