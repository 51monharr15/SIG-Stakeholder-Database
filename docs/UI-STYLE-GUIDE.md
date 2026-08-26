# UI style guide — principles, rules, and hierarchy

**Purpose:** A **generic** guide for interactive applications. Principles first; rules are how principles become a consistent experience so lessons learned in one context apply in parallel contexts.

**Provenance:** Distilled from product work with Simon (Meet Scheduler and related apps, 2026). **Product-specific** numbers, labels, and edge answers live in that product’s **UI hierarchy** doc. This file keeps only the transferable **principle** and **interpretation**.

**How to use this file**

1. Apply **Principles** on every change.  
2. Follow **Rules / heuristics** unless the owner grants an exception (**ask first**).  
3. Keep a **plain-English UI hierarchy** for the app under development (required — see §5).  
4. When the owner marks something a standing **RULE**, capture **principle + interpretation**, generalise beyond the exemplar, apply everywhere parallel, then **audit** before commit.

---

## 1. What “RULE” means (meta)

When the owner says **RULE** (or “as a rule” / “apply as a rule”):

| Expectation | Meaning |
|-------------|---------|
| **Standing** | It stays until they change it. Not optional flavour. |
| **General case** | An exemplar (one pane, one table) implies **all parallel places**, including ones not yet discussed. |
| **Principle + interpretation** | Record *why* (principle) and *what to do* (interpretation). Product specifics go in the product hierarchy. |
| **Apply then audit** | Implement, then check similar panes/code paths for the same rule before commit. Ask before inventing an exception. |
| **Transfer** | Rules exist so users (and builders) reuse lessons across parallel contexts. |

---

## 2. Principles (standing)

If a rule conflicts with a principle, fix the rule — do not silently break the principle.

### P1 — First use assumes no knowledge

A user knows nothing on first use. They need clear on-screen hints and ready access to guides (help, getting started, operations). Do not require tribal knowledge to complete a basic task.

### P2 — Same job, same behaviour

When a user meets a similar function, it should work the same way as before — **or** the UI must say **how and why** it differs. Silent inconsistency is a defect. Exemplars generalise to all parallels.

### P3 — Controls near need; minimise scroll

Put controls where they are needed. For long content, **duplicate** critical controls (e.g. Save above and below) so the user does not hunt or scroll blindly. Same action, same label.

### P4 — No silent failure; honest errors

Never behave inconsistently in silence. Report errors clearly, with enough diagnosis that a user (or supporter) can act: what failed, what to try, and where more detail lives (message, code, log) when relevant. Never silently discard or truncate input that violates a constraint.

### P5 — Colour carries meaning

Use colour **semantically**. Extend conventions so what the user learned applies in new contexts where parallels exist. Decoration without meaning is noise.

### P6 — Help recedes as mastery grows

A user learns through consistency and then needs less help. Help must **stay available** but should **recede** and occupy less space for returning users (collapsed instructions, remembered open/closed, secondary panes default closed when dense).

### P7 — Compact UI; clear borders; clear state

Use the minimum space that still works. Border functions clearly so actions and regions separate. Do not spend space on redundant titles/buttons that repeat what the control already is. Display **state changes** clearly.

### P8 — Constraints and edge cases are declared behaviour

Where settings can conflict, or a pattern can produce invalid/hidden outcomes, the product must **define**, **enforce**, and **explain** what happens — not skip silently. (Product hierarchy states the concrete numbers and fall-through answers.)

---

## 3. From principles → rules (heuristics)

Each rule: **principle** it serves → **interpretation** (generic practice). Product examples in parentheses are illustrations only.

### Learning and help — P1, P6

| Rule | Principle | Interpretation |
|------|-----------|----------------|
| **R1** | P1 | First-run paths show what to do next (empty states name the next panel/action). |
| **R2** | P1 | Durable guides exist (in-app help + operations/manual) and stay reachable. |
| **R3** | P6 | Long how-to starts collapsed/secondary on narrow or return visits; remember open/closed when it helps. |
| **R4** | P1, P7 | Where content appears elsewhere, one short **where displayed** hint on the pane title — not repeated on every field. |

### Consistency — P2

| Rule | Principle | Interpretation |
|------|-----------|----------------|
| **R5** | P2 | Same control role → same look, placement family, and save model across panels. |
| **R6** | P2 | If behaviour must differ, say so next to the control (e.g. “saves immediately” vs “then Save”). |
| **R7** | P2 | Parallel layouts share one pattern (e.g. calendar toolbars: view controls left, explainer right; action bands left-aligned). |
| **R8** | P2, §1 | After fixing an exemplar, search and fix **all parallel** panes/controls; audit before commit. |

### Placement and density — P3, P7

| Rule | Principle | Interpretation |
|------|-----------|----------------|
| **R9** | P7 | **Left-align** compact forms, tables, pane titles, and action bands unless a documented pattern says otherwise (e.g. pane summary: title left, Save on the summary’s right). |
| **R10** | P3 | **Dual placement:** critical Save (and matching critical actions) above **and** below long panes/grids — same label. |
| **R11** | P3 | Prefer **pane-local** Saves; do not stack redundant panel-level Saves that restate the pane name. |
| **R12** | P3, P7 | Short control column beside taller explainer → **bottom-align** controls with the text (toward the content they affect), not top-align. |
| **R13** | P3 | Match heights in one button band. Primary vs secondary roles stay visually distinct. |
| **R14** | P7 | Default: **no cards**. Cards only as the interaction container. Border panes to separate jobs — no vague extra chrome. |
| **R15** | P7 | One job per section: one purpose, one headline, usually one short supporting line. No redundant summary that repeats the lead. |
| **R16** | P7 | Expandable panes: caret/triangle on the title; do not waste a second “Add …” control when the body already provides add (see **R25**). |
| **R17** | P3 | Sticky context that identifies columns/sections stays visible while the body scrolls (e.g. day headings over a grid). Do not trap sticky headers inside overflow that scrolls them away. |

### Honesty, constraints, edges — P4, P8

| Rule | Principle | Interpretation |
|------|-----------|----------------|
| **R18** | P4 | Never silently discard user input. Instructions, `maxlength`, and validation messages must **agree**. |
| **R19** | P4 | Destructive or hard-to-undo actions need confirmation. |
| **R20** | P4 | Errors name the problem and the next step; hierarchy records codes/logs/remedies when the product has them. |
| **R21** | P4, P8 | Impossible combinations of settings are rejected with a clear message (e.g. one quantity must divide another evenly — product states the fields). |
| **R22** | P8 | Patterns that can hit invalid/hidden days or slots need a **stated** fall-through (product hierarchy defines which); never silent omit without a rule. |
| **R23** | P4, P7 | Sparse views may hide empty rows/columns; offer **Show all…** and mark gaps so omission is visible. Horizontal overflow must not hide controls with no cue that more exists off-screen. |

### Colour and state — P5, P7

| Rule | Principle | Interpretation |
|------|-----------|----------------|
| **R24** | P5 | Assign tints/accents to **kinds** of content or action; reuse the mapping; do not invent a new tint per screen. |
| **R25** | P5 | Nav colour is for **navigation controls**, not washing whole panels. |
| **R26** | P5 | Primary (often blue) = commits stored data. Neutral/cancel = secondary. Disabled clearly muted. |
| **R27** | P7 | Distinguish at least: **committed**, **draft/candidate**, **pending removal**, **other people’s marks**. Pending removal ≠ empty ≠ “others marked”. Legend when non-obvious. |
| **R28** | P5 | Non-action controls (e.g. column headings used as toggles) must not inherit primary button paint. |

### Forms and tables — P2, P7

| Rule | Principle | Interpretation |
|------|-----------|----------------|
| **R29** | P2, P7 | **Standing:** when a table’s **first row** adds a new entry, the **first field’s placeholder** is **Add new…** (agreed shorter form of “add new entry here”). Ask before any other wording. |
| **R30** | P7 | That first row **is** the add affordance — do not also spend a heading row on “Add …” + caret that adds no value. Blur/tab-out/explicit Add on mobile as the product defines. |
| **R31** | P7 | Wide tables/grids: scroll inside the pane on small screens; column widths match content. |
| **R32** | P7 | Overflow: expand-to-read / copy beats truncating important URLs/text with “…” alone. |

### Save models — P2, P4

| Rule | Principle | Interpretation |
|------|-----------|----------------|
| **R33** | P2 | **Construct-then-Save** for multi-field work; **immediate save** for single toggles that are the decision — label immediate saves. |
| **R34** | P2 | Do not mix save models on one control without saying so. Discuss before changing redundant mechanisms. |

### Wording — P1, P2

| Rule | Principle | Interpretation |
|------|-----------|----------------|
| **R35** | P1 | Hierarchy docs quote **full** on-screen text (no ellipsis abbreviations in the reference). |
| **R36** | P1 | Empty states say what to do next. Audience markers at the **start** of steps. |
| **R37** | P2 | Drop obsolete verbs when behaviour changes. Help/ops docs must match live behaviour. Labels unwrap when they fit. |

### Motifs to avoid by default (visual)

Do not default to common generic “AI product” looks unless the brand asks: purple-on-white / purple–indigo gradients; cream + serif + terracotta recipe; broadsheet hairline density; unmotivated dark mode, glow, pill clusters, multi-layer shadows, emoji decoration.

### Motion

Use motion for presence and hierarchy (open/close, sticky context), not noise. Disclosure markers (▶ / ▼) same visual size.

---

## 4. Structure vocabulary (generic)

| Term | Meaning |
|------|---------|
| **Page** | A full screen or route |
| **Panel** | One primary working area (often one dashboard tab). One job per panel. |
| **Pane** | A bordered/tinted or expandable block *inside* a panel |
| **Page header (always visible)** | Persistent identity/actions — not “chrome” in user-facing docs |

Prefer: page → panel → pane → controls.

---

## 5. Required artefact — plain-English UI hierarchy

**Always** maintain a markdown hierarchy for the app under development so externals (copy, tooltips, errors) can be amended without spelunking code.

### Must contain (full text — no `…` in tables)

- Panel / pane structure and titles  
- Default values and placeholders  
- Button labels and **tooltips**  
- Hints, legends, empty states  
- **Error messages**, codes, log formats/locations, responses, remedies  
- Media in the UI described in plain English  
- **Product-specific** constraint numbers and edge fall-throughs (instances of **P8 / R21–R22**)

### Conventions

- **Panels** = `## Panel: …` · **Panes** = `### Pane: …`  
- Templates remain source of truth; hierarchy mirrors them  
- Owner-uploaded hierarchy wording = intended UI changes — sync code and doc  

Colour hex / tint names: product hierarchy or theme file, mapped to **R24–R28**.

Append a short **rule-audit checklist** to the product operations/manual (or hierarchy) so apply-then-audit stays visible.

---

## 6. Agent / collaborator checklist (before ship)

Re-read **§1–§3**. Then:

- [ ] Every standing **RULE** touched this change: principle + interpretation recorded; exemplar generalised (**R8**)  
- [ ] Parallel contexts same — or difference labelled (**P2**)  
- [ ] Controls by need; dual Save where scroll would hide (**R10**)  
- [ ] Left-align titles/bands; bottom-align controls beside tall explainers (**R9 / R12**)  
- [ ] No silent discard; constraints explained (**P4 / P8 / R18 / R21**)  
- [ ] Colour/state honest; legend if needed (**R24–R28**)  
- [ ] Help available but not dominating return visits (**P6**)  
- [ ] Compact; no redundant Add chrome when first row adds (**R29–R30**)  
- [ ] Hierarchy updated (full strings, tooltips, errors, product edges)  
- [ ] Desktop and narrow widths; no silent off-screen controls (**R23**)  

---

## 7. Working preferences (collaboration)

- **RULE** = standing; ask before exceptions; generalise exemplars; audit parallels.  
- Announce process or deploy-path changes **before** acting.  
- Do not deploy to live systems unless asked.  
- DevNotes / scratch uploads = instructions — do not commit as product docs unless asked.  
- Prefer one long-lived working line for UI hierarchy work unless agreed otherwise.  
- Handoff in the owner’s deploy vocabulary when that is their routine.  
- **Hold till agreed** = confirm understanding; do not implement those items yet.

---

## 8. What this guide is not

- Not a brand book for one product’s hex palette.  
- Not a component-library API.  
- Not a dump of product-only numbers (those belong in the product hierarchy under the principles above).  
- Not permission to add cards, gradients, or dark mode “for polish” without a product reason.

**When in doubt:** first-use clarity, transferable consistency, controls by need, honest errors and declared edges, semantic colour, help that recedes, compact bordered UI with unmistakable state — and a complete hierarchy doc.
