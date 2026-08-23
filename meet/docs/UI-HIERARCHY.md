# Meet Scheduler — UI hierarchy

**Build:** 1.8.23  
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
    - Title, intro text, local-time hint
    - Form `#create-form`: meeting title input · **Create meeting** button
    - Hint: save the private link
  - **Pane: Find my meetings** *tint-find*
    - Registered identity + passcode (side by side)
    - Passcode: `type="password"` with eye toggle (`#find-pin-toggle`)
    - **List my meetings** button
    - Results table (newest first): date · title link
- **Site footer** — build version, operations guide link

---

## 2. Meeting scheduler

URL: meeting link (e.g. `?=slug`)

### 2.0 Chrome (always visible; not a tab panel)

- **Sticky header**
  - Meeting title
  - Actions (uniform height): More/Less (narrow) · How to use this · Copy meeting link
  - Signed-in banner (when signed in)
  - Status strip: status · time · recurrence · locations (no “proposed” when locations confirmed)
  - **Dashboard nav** — green tab buttons, two-row wrap (no horizontal scroll)
- **Help panel** — opens below header when “How to use this” clicked
  - Organiser / attendee step columns
  - Footer notes (copy link, find my meetings)
- **Tab working area** (`meet-content`) — one panel below at a time

---

### 2.1 Getting started

**Panel:** Getting started

- Page title: Getting started
- **[expand] Instructions for organisers and attendees**
- **Setup checklist** (numbered steps)
  1. Attendees — add yourself
  2. Calendar Options
  3. (Optional) Meeting Resources
  4. (Optional) Add other attendees
  5. My availability — mentions green navigation buttons (◀ ▶)
  6. Locations
  7. Set confirmed meeting details
  8. Share the link (Copy meeting link — checklist tick on copy)
- Setup complete note · Go to Overview link

---

### 2.2 Overview

**Panel:** Overview

- Page title + colour hint
- **[expand] Time · Recurrence · Locations** *tint-dates*
- **[expand] Agenda and decisions** *tint-text*
- **[expand] Attendees registered · Availability entered** *tint-people* — summary table
- **[expand] Top start times — best attendance** *tint-dates*
- **[expand] Top locations — by popularity** *tint-places*
- **[expand] Attachments** *tint-assets* *(when past/summarised and attachments exist)*

---

### 2.3 Attendees

**Panel:** Attendees

- Lead text (sign-in / merge hints)
- **[expand] Registered attendees** *tint-people* — pane id: `att-registered`
  - Attendee table (scrolls inside pane)
  - Claim passcode / edit identity forms
- **[expand] Add another attendee** *tint-people* `[secondary]` — `att-add`
- **[expand] Add yourself as an attendee** *tint-people* — `att-add-first`
- **[expand] Merge duplicate attendees** *tint-people* `[secondary]` — `att-merge`

Embedded on **My availability** when meeting not established — `att-registered-cal`.

---

### 2.4 Locations

**Panel:** Locations

- Lead text (add rows, OK with me, expand/copy)
- **Pane: Locations table** *tint-places* (horizontal scroll when needed)
  - Columns: Notes · Location · OK with · OK with me · Confirmed *(Set confirmed tab only)*
  - Location field: well-formed URL → link; malformed URL heuristic → confirm save as text; else plain text
  - OK with me: **?** when no preference · **Yes** when selected (not “No”)

---

### 2.5 My availability

**Panel:** My availability *(calendar-panel)*

- **Instructions band** — **[expand] Mark when you are free**
- **Attendees block** *(when meeting not established)* — see §2.3
- **Pane: Calendar grid** *tint-dates* — nav not sticky inside pane
  - Date navigation (◀ ▶ « » ⇤ ⇥) · day headers · slot cells
- **Save band** — **Save** button + slot count (no redundant top save)

---

### 2.6 Meeting Resources

**Panel:** Meeting Resources

- **Pane: Description for attendees** *tint-text* — Save
- **[expand] Agenda & decisions** *tint-text* — `mr-agenda` — Save
- **[expand] Notes** *tint-text* — `mr-notes` — Save
- **Pane: Attachments** *tint-assets* — table scrolls inside pane

---

### 2.7 Calendar Options

**Panel:** Calendar Options

- Lead text + **Save** (header, `form="update-settings-form"`)
- Form `#update-settings-form`
  - **[expand] Meeting length & calendar** *tint-dates* — `opts-length`
  - **[expand] Bookable dates & daily hours** *tint-dates* — `opts-booking` (2×2 grid)
  - **[expand] Calendar hours & timezone** *tint-dates* — `opts-timezone`
  - **[expand] Recurrence (future feature)** *tint-dates* `[secondary]` — `opts-recurrence`
- **Save** (footer)

---

### 2.8 Set confirmed meeting details

**Panel:** Set confirmed meeting details

- Lead text (group calendar summary)
- **[expand] Meeting link** *tint-text* — pane id: `group-link` — share input + Copy meeting link
- **[expand] Proposed meeting time** *tint-dates* — `group-time` — expand state persisted; Show all hours does not collapse panes
  - Accept date · group calendar grid
- **Slot legend** (colour chips)
- **[expand] Proposed locations** *tint-places* — `group-locations`
  - Organiser hint: toggle **Confirmed** (multiple allowed)
  - Table with **Confirmed** column; OK with me **?** / **Yes**

---

## 3. Operations guide

URL: `operations.php` — renders `docs/OPERATIONS.md` (includes UI consistency audit).

---

## Pane ID reference (persisted open/closed state)

| Pane ID | Tab / context |
|---------|----------------|
| `att-registered` | Attendees — Registered attendees |
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
| `group-link` | Set confirmed — Meeting link |
| `group-time` | Set confirmed — Proposed meeting time |
| `group-locations` | Set confirmed — Proposed locations |

Overview and Getting started sections do not use persisted pane IDs.

See also `docs/DevNotes_1.8.22.md` for the annotated feedback that drove the 1.8.23 changes.
