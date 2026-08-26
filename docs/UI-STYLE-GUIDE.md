# UI style guide — principles, rules, and hierarchy

**Purpose:** A **generic** guide for interactive applications. Principles first; rules are how principles become a consistent experience so lessons learned in one place apply in parallel places.

**Provenance:** Distilled from product work with Simon (Meet Scheduler and related apps, 2026). Product-specific colours, panel names, and copy live in that product’s **UI hierarchy** doc — not here.

**How to use this file**

1. Apply **Principles** on every change.  
2. Follow **Rules / heuristics** unless the owner grants an exception (ask first).  
3. Keep a **plain-English UI hierarchy** for the app under development (required — see §4).  
4. When the owner marks something a standing **rule**, it stays until they change it.

---

## 1. Principles (standing)

These are the north star. If a rule conflicts with a principle, fix the rule — do not silently break the principle.

### P1 — First use assumes no knowledge

A user knows nothing on first use. They need clear on-screen hints and ready access to guides (help, getting started, operations). Do not require tribal knowledge to complete a basic task.

### P2 — Same job, same behaviour

When a user meets a similar function, it should work the same way as before — **or** the UI must say **how and why** it differs. Silent inconsistency is a defect.

### P3 — Controls near need; minimise scroll

Put controls where they are needed. For long content, **duplicate** critical controls (e.g. Save above and below) so the user does not hunt or scroll blindly. Same action, same label.

### P4 — No silent failure; honest errors

Never behave inconsistently in silence. Report errors clearly, with enough diagnosis that a user (or supporter) can act: what failed, what to try, and where more detail lives (message, code, log) when relevant.

### P5 — Colour carries meaning

Use colour **semantically**. Extend conventions so what the user learned applies in new contexts where parallels exist. Decoration without meaning is noise.

### P6 — Help recedes as mastery grows

A user learns through consistency and then needs less help. Help must **stay available** but should **recede** and occupy less space for returning users (collapsed instructions, remembered open/closed, secondary panes default closed when dense).

### P7 — Compact UI; clear borders; clear state

Use the minimum space that still works. Border functions clearly so actions and regions separate. Display **state changes** clearly (saved vs draft vs pending remove vs other people’s marks — never ambiguous).

---

## 2. From principles → rules (heuristics)

Rules exist so parallel contexts teach transferable lessons. Prefer a short, stable set of roles and patterns over one-off cleverness.

### Learning and help — from P1, P6

| Rule | Practice |
|------|----------|
| **R1** | First-run paths show what to do next (empty states name the next panel/action). |
| **R2** | Durable guides exist (in-app help + operations/manual) and stay reachable from the product. |
| **R3** | Long how-to text starts collapsed or secondary on narrow/return visits; remember open/closed when it helps. |
| **R4** | Where content appears elsewhere, put a short **where displayed** hint on the pane title (not repeated on every field). |

### Consistency — from P2

| Rule | Practice |
|------|----------|
| **R5** | Same control role → same look, placement family, and save model across panels. |
| **R6** | If behaviour must differ, say so next to the control (e.g. “saves immediately” vs “then Save”). |
| **R7** | Parallel layouts share one pattern (e.g. calendar toolbars: view controls left, explainer right; action bands left-aligned). |

### Placement and density — from P3, P7

| Rule | Practice |
|------|----------|
| **R8** | **Left-align** compact forms, tables, pane titles, and calendar/action bands unless a documented pattern says otherwise (e.g. pane summary: title left, Save on the summary’s right). |
| **R9** | **Dual placement:** critical Save (and matching critical actions) above **and** below long panes/grids — same label. |
| **R10** | Prefer **pane-local** Saves over a stack of duplicate panel-level Saves beside every pane. |
| **R11** | When a short control column sits beside taller explainer text, **bottom-align** the controls with the text (toward the content they affect), not top-align. |
| **R12** | Match heights in a single button band. Primary vs secondary roles stay visually distinct. |
| **R13** | Default: **no cards**. Cards only when they are the interaction container. Border regions (panes) to separate jobs — do not invent vague extra chrome layers. |
| **R14** | One job per section: one purpose, one headline, usually one short supporting line. |

### Honesty and errors — from P4

| Rule | Practice |
|------|----------|
| **R15** | Never silently discard user input. Surface validation errors; keep `maxlength`, instructions, and messages in agreement. |
| **R16** | Destructive or hard-to-undo actions need confirmation. |
| **R17** | Errors name the problem and the next step; include codes/log pointers in the hierarchy when the product has them. |
| **R18** | Sparse views may hide empty rows/columns; offer **Show all…** and mark gaps so omission is visible. |

### Colour and state — from P5, P7

| Rule | Practice |
|------|----------|
| **R19** | Assign tints/accents to **kinds** of content or action (time, people, places, text, files, create, find, success, warning, destructive). Reuse the mapping; do not invent a new tint per screen. |
| **R20** | Nav colour is for **navigation controls**, not washing whole panels. |
| **R21** | Primary (often blue) = commits stored data. Neutral/cancel = secondary or reversible. Disabled is clearly muted. |
| **R22** | Distinguish at least: **committed**, **draft/candidate**, **pending removal**, **other people’s marks**. Pending removal must not look like empty or “others marked”. Explain in a legend when non-obvious. |
| **R23** | Non-action controls (e.g. day headings used as toggles) must not inherit primary button paint. |

### Forms and tables — from P2, P7

| Rule | Practice |
|------|----------|
| **R24** | **Standing:** new-row first field placeholder is **Add new…** unless the owner specifies otherwise. Ask before exceptions. |
| **R25** | Wide tables/grids: scroll inside the pane on small screens. |
| **R26** | Overflow: expand-to-read / copy beats truncating important URLs/text with “…” alone. |

### Save models — from P2, P4

| Rule | Practice |
|------|----------|
| **R27** | **Construct-then-Save** for multi-field / multi-cell work; **immediate save** for single toggles that are the decision — label immediate saves. |
| **R28** | Do not mix save models on one control without saying so. If two mechanisms feel redundant, discuss before changing. |

### Wording — from P1, P2

| Rule | Practice |
|------|----------|
| **R29** | Hierarchy docs quote **full** on-screen text (no ellipsis abbreviations in the reference). |
| **R30** | Empty states say what to do next. Audience markers (Everyone / Organiser) at the **start** of steps. |
| **R31** | Drop obsolete verbs when behaviour changes. Help/ops docs must match live behaviour. |

### Motifs to avoid by default (visual)

Do not default to common generic “AI product” looks unless the brand asks: purple-on-white / purple–indigo gradients as a default theme; cream + serif + terracotta as a default recipe; broadsheet hairline density as a default; unmotivated dark mode, glow, pill clusters, multi-layer shadows, emoji decoration.

### Motion

Use motion for presence and hierarchy (open/close, sticky context), not noise. Disclosure markers (▶ / ▼) should be the **same visual size**.

---

## 3. Structure vocabulary (generic)

Use plain nesting names so docs and code match:

| Term | Meaning |
|------|---------|
| **Page** | A full screen or route |
| **Panel** | One primary working area (often one dashboard tab). One job per panel. |
| **Pane** | A bordered/tinted or expandable block *inside* a panel |
| **Page header (always visible)** | Persistent identity/actions — do **not** call this “chrome” in user-facing docs |

Prefer: page → panel → pane → controls. Product hierarchy docs label **Panel:** / **Pane:** headings clearly.

---

## 4. Required artefact — plain-English UI hierarchy

**Always** maintain a markdown hierarchy for the application under development. Purpose: make external adjustments (copy, tooltips, errors) easy without spelunking code.

### What it must contain

Reproduce **full** on-screen (and user-visible) text — no `…` abbreviations in tables:

- Panel / pane structure and titles  
- Default values and placeholders  
- Button labels and **tooltips** (`title` / accessible names)  
- Hints, legends, empty states  
- **Error messages**, codes, log formats/locations, expected responses, and remedies (when the product has them)  
- Media in the UI (icons, legend chips, status colours) described in plain English  

### Conventions

- **Panels** = Markdown H2 (`## Panel: …`)  
- **Panes** = Markdown H3 (`### Pane: …`)  
- Primary strings still live in real templates; the hierarchy **mirrors** them for review and amendment  
- When the owner uploads an amended hierarchy, treat inline wording as intended UI changes; sync code and doc together  

Product-specific colour hex values and tint names belong in that product hierarchy (or theme file), with kinds mapped consistently to **R19–R22**.

---

## 5. Agent / collaborator checklist (before ship)

Re-read **§1 Principles** and **§2 Rules** before layout or copy edits. Then:

- [ ] Parallel contexts still behave the same — or differences are labelled (**P2 / R5–R7**)  
- [ ] Controls sit by need; dual Save where scroll would hide actions (**P3 / R9**)  
- [ ] Left-align titles and action bands; bottom-align short controls beside tall explainers (**R8 / R11**)  
- [ ] Errors are clear; no silent discard (**P4 / R15–R17**)  
- [ ] Colour/state semantics hold; legend if needed (**P5 / R19–R22**)  
- [ ] Help available but not dominating return visits (**P6 / R3**)  
- [ ] Compact; borders clear; state changes obvious (**P7**)  
- [ ] Hierarchy doc updated with full strings / tooltips / errors  
- [ ] Desktop and narrow widths usable  

---

## 6. Working preferences (collaboration)

- **Rule** = standing until the owner changes it; ask before exceptions.  
- Announce process or deploy-path changes **before** acting.  
- Do not deploy to live systems unless explicitly asked.  
- Scratch / DevNotes uploads are instructions — do not commit as product docs unless asked.  
- Prefer one long-lived working line for a product’s UI hierarchy work over surprise branch splits, unless agreed.  
- Handoff in the owner’s deploy vocabulary (version file, pull, publish) when that is their routine.  
- When the owner says **hold till agreed**, do not implement those items; confirm understanding first.

---

## 7. What this guide is not

- Not a brand book for one product’s exact hex palette.  
- Not a component-library API.  
- Not permission to add cards, gradients, or dark mode “for polish” without a product reason.

**When in doubt:** first-use clarity, transferable consistency, controls by need, honest errors, semantic colour, help that recedes, compact bordered UI with unmistakable state — and a complete hierarchy doc.
