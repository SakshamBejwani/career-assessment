# Design system and UX decisions

The interface was designed with a written brief and reviewed against a list of "generic template" defaults to avoid, then checked with screenshots at desktop (1440 px) and phone (390 px) widths. This document records those decisions so new work stays consistent.

## Brief

- **Subject:** psychology-based self-assessment for career and study choices, delivered by a counselling institute in India.
- **Audience:** students aged about 14–22, and the parents who usually pay.
- **Primary job:** choose a questionnaire, answer honestly without exam-style stress, pay, and receive a report the family trusts.
- **Tone:** calm, plain and non-clinical. "There are no right answers" is said where it matters, and results never claim to diagnose or guarantee anything.

## Signature element

The **Holland hexagon**, the classic six-sided diagram of interest theory (R I A S E C), is the one memorable visual:

- **Brand mark** (`components/brand/HexMark.tsx`): a hexagon outline with a marigold dot on the top vertex.
- **Landing hero** (`components/brand/HeroHexagon.tsx`): the outline draws in once on load and an illustrative profile settles inside. This is the only automatic animation on the site, and it is skipped under `prefers-reduced-motion`.
- **Assessment glyphs** (`components/brand/AssessmentGlyph.tsx`): each glyph previews the shape of that questionnaire's real result. Four preference balances for personality, the hexagon for interests, four tiles for learning modes. They are not decoration.

Everything else is deliberately quiet. Spend boldness in one place.

## Colour tokens

Defined once in `src/app/globals.css` (`@theme`) and mirrored in `src/server/reports/template.tsx` (`const C`) for the PDF. **Change both together.**

| Token | Hex | Use |
|---|---|---|
| `ink` | `#17213A` | Text, primary buttons, selected answers |
| `ink-soft` | `#2A3655` | Primary button hover |
| `slate` | `#4A5468` | Secondary text |
| `muted` | `#646C7E` | Hints, minor metadata |
| `rule` / `rule-strong` | `#D5DBE4` / `#B9C2D0` | Dividers, borders, unselected controls |
| `mist` | `#EEF1F5` | Page background |
| `paper` | `#FFFFFF` | Surfaces: answer plates, forms, panels, chart tracks |
| `marigold` / `marigold-soft` | `#E9A23B` / `#FBEDD6` | The single accent: progress, focus ring, step numbers, preview notes. Decorative or large-text use only (not body-text contrast) |
| `data` / `data-tint` | `#2A62C9` / `#C8D5EE` | Charts only. One series per chart; the tint marks the non-preferred side of a personality pair |
| `good` / `alert` (+ `-soft`) | `#0C7A2F` / `#B42318` | Status only, always paired with an icon or text label, never colour alone |

**Deliberately avoided:** warm cream backgrounds with a terracotta accent, near-black with neon accents, generic SaaS card grids with identical shadows, all-caps eyebrow labels, and `→` appended to buttons. These read as templated.

## Typography

One family, **Lexend**, chosen because it was designed around research into reading proficiency. That suits young readers and a learning-style product. It's loaded from `@fontsource` packages (no external font requests), and the PDF uses the same faces from `assets/fonts/` (OFL licence included).

| Role | Face | Where |
|---|---|---|
| Display | Lexend Exa 600 (wide) | `h1`–`h3`, short question stems, section titles |
| Hero numerals and type letters | Lexend Mega 600 (extra wide) | Personality type letters, "How it works" step numbers, hexagon letters |
| Body | Lexend 300/400/500 | Everything else |

Rules:

- **Long prompts use the body face.** In `QuestionRunner`, prompts over 80 characters (the VARK scenarios) switch from the wide display face to the reading face at a smaller size, so they stay readable on phones.
- Keep line length under about 70 characters (`prose-measure`, `max-w-[..ch]`).
- Use sentence case everywhere. Don't emphasise a single word in a headline.

## Layout patterns

- **Landing:** hero (headline left, hexagon right), questionnaires as **rows** separated by rules (not cards), "How it works" as a numbered sequence (it is one), and an ink panel stating what the report can and can't tell you.
- **Answering (focus mode):** minimal header aligned to the content column, a thin sticky progress bar, one question per screen, large answer plates (at least 48 px tall) with lettered bubbles. Single choice advances automatically after 260 ms; multi-select needs a Next press. Keys: A–D or 1–4 to answer, Enter or → for next, ← for back. RIASEC shows one interest area per step with its "Are you / Can you / Like to" groups, as on the source form.
- **Status:** a vertical timeline of the real steps (submitted, report prepared, payment, sent), with the payment panel above it when payment is due.
- **Results:** the same content as the PDF (both come from `buildReportData`). Measured results, then "What your results describe", then insights in a separate white panel, then the disclaimer and provenance.
- **Admin:** dense and utilitarian, same tokens; tables scroll horizontally on small screens.

## Charts

These follow the data-visualisation rules used throughout the project:

- One series per chart in `data` blue, with every bar or point labelled with its value. No legends needed.
- **Personality:** a split bar per pair (preferred side solid, other side tint, 2 px gap) with a centre line marking an even split.
- **Interests:** a hexagon radar with rings at 4, 8 and 12 (the source's band edges), plus ranked bars with "n of 12, band".
- **Learning:** four bars scaled to the 12 possible answers.
- Chart text uses ink/slate tokens, never the series colour.
- Every web chart has a screen-reader table (`sr-only`) and SVG `<title>` tooltips.

## Copy style

- Plain verbs, active voice, sentence case. Buttons say exactly what happens ("Start the questionnaire", "Submit my answers", "Download PDF").
- Errors say what went wrong and what to do, without apologising, and include a reference code when it comes from the server.
- Never imply that a result is a career recommendation. Career-related text is always labelled as a starting point for exploration with a counsellor.

## Accessibility checklist (target: WCAG 2.2 AA)

- Visible focus ring (3 px marigold) on every interactive element.
- Form fields have labels; errors are linked with `aria-describedby` and the first invalid field gets focus.
- Answer plates use `role="radio"` / `role="checkbox"` with `aria-checked`; progress has `role="progressbar"`; save state is `aria-live`.
- The heading receives focus when the question changes, so screen readers announce it.
- Works at 320 px wide and 200% zoom; no horizontal scrolling except admin tables.
- `prefers-reduced-motion` disables the hero animation and transitions.

## Checking your changes

Run the browser walkthrough (`scripts/ui-walkthrough.mjs`, see DEVELOPMENT.md section 8) and look at every screenshot at both widths before merging UI work.
