# UI style guide — preferences distilled for reuse

**Provenance:** Distilled from product preferences developed with Simon while building Meet Scheduler (2026).  
**Purpose:** A **general** style and interaction guide for other apps — principles first. Product-specific colour mappings (e.g. “lavender = dates in the scheduler”) belong in that product’s own hierarchy or theme file, not here.

When a preference was marked a standing **rule**, treat it as default until explicitly changed. If an exception seems needed, ask first.

---

## 1. Structure before decoration

### Panels and panes

- **Panel** — one primary working area (often one dashboard tab or major section). One job per panel.
- **Pane** — a bordered, tinted region (or expandable block) *inside* a panel. Groups related fields or a single concern.
- Prefer a clear nesting: page → panel → pane → controls. Do not invent extra chrome layers with vague names.
- Avoid jargon for persistent UI frames (e.g. do not call the app header “chrome” in user-facing copy — it confuses browser chrome / brand names). Prefer plain labels such as “page header (always visible)”.

### One job per section

- Each section should have **one purpose**, one headline, and usually one short supporting sentence.
- Do not pack stats, schedules, promos, and secondary marketing into the first viewport of a landing or promotional surface.
- On branded or landing surfaces: brand first; one composition, not a dashboard (unless the product *is* a dashboard).

### Hierarchy documentation (when the product keeps one)

- Maintain a hierarchy doc that maps **panels → panes** with **full on-screen text** (no ellipsis abbreviations in the reference). Reviews and amendments stay unambiguous.
- In that doc, label headings so navigation is obvious (e.g. prefix **Panel:** / **Pane:**).
- When the owner uploads amended hierarchy copy, treat inline wording as intended UI changes, then sync code and doc together.
- Primary UI strings live in the real templates/sources of truth; the hierarchy doc mirrors them — it is not a second product.

---

## 2. Colour as a semantic system

**Principle:** Use colour **consistently as meaning**, not as decoration.

- Assign tints (and accent roles) to **kinds of content or action**, and reuse those assignments everywhere that kind appears.
- Examples of *kinds* (choose names that fit the product): time/scheduling, free text, people, places, files/attachments, create, find/search, success, warning, destructive.
- Do **not** invent a new tint for each screen. If two panes share a kind, they share a tint.
- Nav colour is for **navigation controls**, not for washing an entire panel.
- Primary action colour (often blue) = commits or changes stored data. Neutral/cancel styling = secondary or reversible actions that should not look like “the” submit.
- State on interactive cells (selected, draft, pending remove, shared/other-person) must be **visually distinct and explained**. Never let “turned off but not yet saved” look like “someone else marked this” or “empty”.
- Prefer CSS variables (or theme tokens) for the palette so meaning stays stable when hex values change.

Product theme files may list concrete hex values; this guide only requires that the **mapping is documented and consistent**.

---

## 3. Visual design preferences

### Atmosphere and layout

- Avoid flat, single-colour page backgrounds as the only surface; use light structure (tinted panes, subtle borders) so regions read as places.
- Default: **no cards**. Cards only when they are the container for a user interaction. If removing border, shadow, background, or radius does not hurt interaction or understanding, it should not be a card.
- No hero overlays (floating badges, promo stickers, info chips on top of hero media) on promotional surfaces.
- Full-bleed hero only where the product is promotional; do not default to inset media cards or collages unless the design system requires it.
- Reduce clutter: avoid pill clusters, stat strips, icon rows, and competing text blocks in one viewport.

### Typography

- Prefer expressive, purposeful fonts over default stacks (Inter, Roboto, Arial, system-only) on branded surfaces.
- Labels should remain readable when they fit on one line; do not wrap labels unnecessarily.
- Left-align compact forms and tables unless there is a clear reason not to.
- Avoid redundant summary + lead that say the same thing twice.

### Motifs to avoid by default

Do not default to common AI-generated looks unless the brand explicitly wants them:

- Purple-on-white or purple-to-indigo gradient themes as a generic “product” look
- Warm cream background with high-contrast serif + terracotta accent as a default recipe
- Broadsheet / dense newspaper layouts with hairline rules and zero radius as a default
- Unmotivated dark mode, glow effects, rounded-full pills, multi-layer shadows, emoji decoration

### Motion

- Use motion for presence and hierarchy (open/close, sticky context), not noise.
- Disclosure markers (collapsed vs open) should be the **same visual size** (e.g. ▶ and ▼), not a tiny chevron vs a large triangle.

---

## 4. Controls and buttons

### Button roles

Keep a small, consistent set of roles:

| Role | Use for |
|------|---------|
| **Primary / action** | Save, create, confirm — changes stored data |
| **Nav** | Move between sections (distinct from primary) |
| **Cancel / secondary** | Dismiss, clear selection, non-committing tools |
| **Disabled** | Clearly muted; never look identical to primary |

- Interactive elements that are **not** primary actions (e.g. date column headers used as toggles) must **not** inherit primary button paint (coloured fill + inverted text). Style them as their content type (labels, heads) with an affordance (outline, cursor, hover).
- Match heights in a button band when several actions sit in one row.
- Tooltips (`title`) should state what happens, including save consequences (“…then Save”, “restores last saved…”).

### Dual placement

- For long panes or grids, put the same primary **Save** (and critical actions) both **above and below** the content when scrolling would otherwise hide them — same action, same label.
- Prefer **pane-local** Saves over a stack of duplicate panel-level Saves beside every pane.
- When several Save buttons on one panel all submit the **same** form, say so in help text so users are not hunting for different meanings.

---

## 5. Forms, tables, and placeholders

### Standing rule — new-row placeholders

When a table’s **first row** is for adding a new entry, the **first field’s placeholder** is **Add new…** (unless the product owner specifies other wording). Apply on every such table; ask before any exception.

### Tables

- Prefer pane-local scroll for wide tables and grids (scroll inside the pane, not the whole window), especially on small screens.
- Column widths should match content: narrow columns for short enums (role, yes/no); give room to headings that need two lines of meaning.
- Overflow cells: expand-to-read / copy patterns beat truncating with “…” in the live UI when the value is a URL or long text.
- Do not hide destructive actions without confirmation when the loss is hard to undo (“Are you sure…?”).

### Validation

- Instructions, `maxlength`, and validation messages must **agree**.
- Never **silently discard** user input (e.g. a typed passcode or field that fails a rule). Surface the error.
- Leading/trailing normalisation (trim, lowercase) is fine if documented next to the field.

### WHERE DISPLAYED hints

- Pane titles for content that appears elsewhere should carry a short **where displayed** hint (e.g. “simple HTML — status bar & Overview”), consolidated on the title rather than repeated on every field when all fields share the destination.

---

## 6. Save models and state honesty

### Explicit vs immediate save

- **Construct-then-Save** fits multi-field options and calendars: user builds a selection, then commits.
- **Immediate save** fits single toggles that are themselves the decision (e.g. confirm location, preference chip) — say “saves immediately” in the UI.
- Do not mix models in the same control without saying so. If two mechanisms feel redundant (tab-out save vs Save button for the same kind of field), **discuss before changing**.

### Draft / pending / saved

Visual language must distinguish at least:

1. **Committed** — what is stored
2. **Draft / candidate** — selected or pasted, not yet saved
3. **Pending removal** — was committed; user turned it off; still stored until Save

Pending removal must **not** reuse the “other people marked this” or “empty” look. Prefer a dedicated style (e.g. muted + dashed) plus legend text.

### Copy / paste of structured data

When copying user-authored structure (days, rows, blocks):

- **Copy** from **already saved** source of truth, not from unsaved drafts (unless the product explicitly defines otherwise).
- **Paste** as **unsaved candidates** until Save.
- Skip impossible targets (out of range, hidden) and **warn** that some items could not be replicated.
- Prefer clear verbs: Copy / Paste / Clear selection — and a one-line explanation next to the button band.

---

## 7. Navigation and orientation

- Sticky context that identifies columns or sections (e.g. day headings over a grid) must remain visible while the body scrolls; do not trap sticky headers inside overflow-hidden panes.
- Sparse views may hide empty rows/columns; offer **Show all…** and mark gaps (thicker boundary) where items were omitted so the calendar/list does not silently look contiguous.
- Deep-link or remember pane open/closed state per entity when it helps return visits; default secondary panes closed on first visit if the panel is dense.

---

## 8. Wording and help

- Use the product’s real words on screen; hierarchy docs quote them in full.
- Correct obvious typos in notes when applying to UI; keep the owner’s intended meaning.
- Audience markers (Everyone / Organiser / similar) belong at the **start** of steps, not mid-sentence.
- Drop obsolete verbs when behaviour changes (e.g. remove “Propose” from titles if proposing no longer exists).
- Empty states should say **what to do next** and which panel to open — not only “None”.
- Help panels and operations guides are part of the product surface; keep them consistent with UI behaviour (click-to-save, clear-on-second-click, etc.).

---

## 9. Identity and trust (multi-user tools)

- Be explicit who the browser is acting as; toggles for “signed-in as” beat ambiguous Myself / Someone else radios when the rules are simple.
- Unsigned-in add → become that person; already signed-in add-another → stay as original. Document the rule once and stick to it.
- Passcodes / shared secrets: length and character rules shown wherever they are entered; find-by-identity flows need matching credentials — do not invent silent failures.

---

## 10. Compact layout checklist (before ship)

- [ ] Left-aligned forms/tables where appropriate  
- [ ] No redundant summary/lead duplication  
- [ ] Labels unwrapped when they fit  
- [ ] Pane tints match content kind  
- [ ] Primary vs secondary button roles correct  
- [ ] Non-action controls not painted as primary buttons  
- [ ] Saved / draft / pending-remove states distinct and legend documented  
- [ ] Destructive actions confirmed  
- [ ] New-row first placeholder is **Add new…** (or agreed exception)  
- [ ] Hierarchy / copy doc updated with full strings if the product keeps one  
- [ ] Works on desktop and narrow/mobile widths  

---

## 11. Working preferences (how these rules are applied)

These are collaboration defaults that keep the style guide enforceable:

- When the owner says **rule**, it is standing until they change it; ask before exceptions.
- Announce and explain process or filing/deploy path changes **before** acting.
- Do not deploy to live systems unless explicitly asked.
- Scratch notes / DevNotes uploads are instructions — do not commit them as product docs unless asked.
- Prefer one long-lived working line for a product’s UI hierarchy work over surprise branch splits, unless agreed.
- Handoff in the owner’s deploy vocabulary (version file, pull, publish) rather than git jargon as the primary message.

---

## 12. What this guide is not

- Not a brand book for a single product’s exact hex palette.
- Not a component library API.
- Not permission to add cards, gradients, or dark mode “for polish” without a product reason.

When in doubt: **clear structure, honest state, semantic colour, few button roles, full copy in the reference doc.**
