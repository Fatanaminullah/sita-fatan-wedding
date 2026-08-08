# Invitation UI Brief — "Paper Theatre"

The guest-facing invitation at `sitafatan.wedding/to/[token]`. This file is the
UI authority for that surface. Approved 2026-08-09 after brainstorming with the
owner. Sections get built **one at a time**, each as a coded comp at 390px
first, approved by the owner, then productionised.

Status: nothing built yet. Build order at the bottom.

> This surface deliberately does NOT follow `DESIGN.md`. That file governs the
> admin app ("The Operations Room") and its own rules say wedding motifs belong
> here, not there. This brief is the equivalent document for the guest surface.

---

## 1. The thesis

**The website is the guest's walk from the street to their seat.**

A wedding reception is staged: there is a door you are received at, a room you
are led into, a moment you are seated for. The site plays that walk as a toy
paper theatre: flat layers of coloured paper cut and stacked in depth, red
velvet curtains, one chandelier lighting the whole page.

Every section is a place along the walk. **The metaphor is felt, never
labelled**: no section is ever captioned "The Foyer". Headings stay plain
(Bride and Groom, Dress Code, RSVP); the spatial storytelling happens in the
composition, light and motion underneath.

| Section | The place it is built as |
|---|---|
| Gate | The front door |
| Verse | The foyer |
| Bride and groom | The portrait corridor |
| Event details | The ballroom doors |
| Countdown | The clock |
| Dress code | The cloakroom |
| Gallery | The picture wall |
| RSVP | The guest book table |
| Gift | The angpao box |
| Wishes | The wish cards |
| Closing | The ballroom |

## 2. Palette — exact, non-negotiable

```css
--deep-red:   #8A0F1A;  /* the ground; whole sections; the doors; the curtains */
--shadow-red: #5C0A12;  /* layers behind layers; recesses; fold shadows */
--peach:      #F6D4BC;  /* paper flats catching light; mid planes */
--cream:      #F7F0E6;  /* ONLY objects a guest would physically hold:
                           name card, plaques, wish notes, the guest book */
--light:      #FFE9C8;  /* LIGHT ONLY: glow, leaks, highlights.
                           Never a fill, never a border, never text color */
--ink:        #2B1113;  /* type on cream/peach */
```

**Rules:**

- Deep red is the dominant colour by area. It owns whole sections. If a
  viewport reads mostly cream, the balance is wrong.
- **No gold as a material, ever.** No gold text, borders, foil textures or
  metallic gradients. Warm gold exists on this site only as `--light` falling
  from the chandelier onto a surface.
- Cream is reserved for holdable paper objects. A cream section background is
  a mistake.

## 3. Typography

| Role | Face | Notes |
|---|---|---|
| Display | **Bodoni Moda** (Google Fonts, via `next/font`) | Names, section titles, the closing. Use the thick-thin contrast at large sizes; it catches the lighting concept. |
| Text + UI | **Archivo** | Body, labels, buttons, forms. |
| The date block | **Archivo Expanded/Condensed, heavy** | `10 10 26` stacked as a three-line graphic object, mirroring the printed suite's stacked numerals. |

**No script or calligraphy anywhere. Absolute rule.** Script is the default
wedding-site signal; refusing it is what makes this look designed. The printed
suite already carries script; the site is the modern member of the family.

## 4. The anti-list

Never, in any section: florals or botanical illustration · script fonts · gold
foil or metallic gradients · cream page backgrounds · photographic or stock
backgrounds · soft blurred blob shadows · glassmorphism · centred-serif-over-
photo hero. Paper here is cut with a blade: shadows are hard-edged with tight
offsets, never soft and stickery.

## 5. Layout and responsiveness

- **Mobile-first, composed at 390px.** One column. The whole walk is tuned for
  a thumb-scroll. This is where most guests will be.
- **Tablet (768px) and desktop (1440px) are required and real**, but they are
  the same design on a wider stage: the column holds, the theatre frame
  (curtains, arch edges, side shadows) gets more room to breathe at the edges.
  No desktop-only features, no alternate layouts.
- Nothing scrolls horizontally at any width.
- Tap targets ≥ 44px. Guests are 20 to 80 years old, one-handed.
- Type readable without zoom; body no smaller than 16px on phone.

## 6. Motion grammar

- **Lenis** smooth scroll + **GSAP ScrollTrigger** drive everything below the
  gate: reveals, parallax layer rates, pins.
- Depth = stacking + offset + hard shadow + layers moving at different scroll
  rates. Never perspective-rendered rooms outside the gate.
- The only WebGL is the gate (three.js). Everything after is DOM/SVG.
- `prefers-reduced-motion`: kill the dolly, parallax and idle animations; every
  section renders its end state. The site must be fully usable static.
- Music starts on the gate tap (the one legal audio gesture), persistent
  mute toggle fixed in a corner ever after.

## 7. The chandelier — the site's sun

One chandelier lights the entire page. It appears twice, same object, two
materials:

1. **In the gate (WebGL):** instanced crystal, real light, glimpsed through
   the transom above the doors, passed under during the pull-through.
2. **The rest of the scroll (SVG):** drawn, faceted, fixed at the top of the
   viewport forever. Its light is implemented as CSS gradients falling down
   each section: highlights on upward-facing surfaces, shadows beneath
   objects. The handoff between the two at the end of the gate must be
   seamless — matched position, matched glow.

This is what makes eleven sections read as one continuous room.

## 8. Sections — UI spec, in scroll order

### 8.1 Gate (the front door) — the only 3D

Full viewport, scroll locked until entered.

- **Stage frame (DOM/SVG around the canvas):** stone arch silhouette at the
  outer edges; red velvet curtains tied back with tassels framing the scene.
  Curtains are *drawn*, theatre-poster style: layered SVG folds shaded in
  deep-red/shadow-red gradients. Stylised, not photoreal.
- **Transom above the doors:** chandelier glowing through, `--light`.
- **Canvas centre:** two tall panelled double doors, deep red lacquer, four
  recessed panels per leaf, long plain vertical handles, clearcoat sheen,
  warm light leaking at the seam and threshold.
- **Cream card at eye height:** "To: Bapak/Ibu [Guest Name]" (from the token),
  one button: **Enter**.
- **On tap:** music starts → doors swing inward → camera dollies through →
  light floods → WebGL chandelier hands off to the fixed SVG chandelier →
  canvas unmounts. Guest lands in the foyer.
- Loader: a seam of light widening between the closed doors.
- No-token / invalid-token visitors never reach this page (route 404s).

### 8.2 Verse (the foyer)

The site goes silent. Deliberately near-empty; the stillness only works
because the door was loud. Deep red field, chandelier above, one soft shaft of
light down the centre. **Al-A'raf 189** in Arabic with English translation
beneath, centred in the light, held with very generous space above and below.
No parallax, nothing moves except a slow breathing of the light.

⚠️ The Arabic text is **never** written by an AI from memory. Sourced from a
verified Quran source, checked by Fatan and Sita against a mushaf before ship.

### 8.3 Bride and groom (the portrait corridor)

Parallax switches on: layered flats sliding at different rates, depth arrives.
Two cream cards mounted on the red wall: portrait photo, full name in Bodoni,
beneath it "Putri dari Bapak [—] dan Ibu [—]" / "Putra dari Bapak [—] dan Ibu
[—]". Side by side ≥768px, stacked on phone, slight tilt as they pass.

### 8.4 Event details (the ballroom doors) — token-personalised

Cut-paper door shapes, one per **invited** event only:

- Invited to both → two doors, Akad left, Resepsi right.
- Invited to one → **one door, centred. The other event is never mentioned,
  never greyed out, never hinted.** Absence is silent; a "not invited" state
  reads as exclusion.

Each door carries a cream plaque: event name, date, time, venue, address, and
an **Open in Maps** button. Below: a smaller cream card with 3–4 numbered
parking steps and a second button, **Directions to parking**, deep-linking to
the parking entrance rather than the venue pin.

### 8.5 Countdown (the clock)

`10 10 26` enormous, stacked, heavy condensed Archivo — a graphic object, not
a line of text. Live countdown beneath in tabular figures (days / hours /
minutes). **Add to calendar** button (.ics). After the wedding: the block
stays, countdown swaps to a single thank-you line.

### 8.6 Dress code (the cloakroom)

Paper strips hanging from a drawn rail, like fabric swatches: deep red, peach,
cream. Two or three lines on what to wear. Swatches are the content — guests
screenshot them for a tailor.

### 8.7 Gallery (the picture wall)

Framed photos on cream mounts hung on the red wall, two or three depth planes,
mixed portrait/landscape. Tap opens a lightbox. **Greybox placeholders at
correct aspect ratios until the 24 Aug prewedding shoot delivers**; photos
swap in via config, no code change.

### 8.8 RSVP (the guest book) — has an upstream dependency

An open cream book/card on a surface. Per invited event: attending / not
attending, pax adjustable **downward only** from the allocated maximum. One
primary button. After submit the section permanently shows the confirmed
answer instead of the form (returning guests see their state).

⚠️ Depends on `src/domain/rsvp.ts` + the rsvp server action (guest-app
Phase 2, not yet built). The section reuses that action; RSVP logic is never
duplicated here. Build this section last.

### 8.9 Gift (the angpao box)

A closed deep red paper box, clearly tappable. Opens to: QRIS code on a cream
card + **one** bank account line + copy-to-clipboard. Copy feedback inline
("Copied"), no toast library.

### 8.10 Wishes (the wish cards) — token-tied

Short form: one message field (the name comes from the token, not typed).
Below, the wall: cream cards at slight random rotations, name + message,
newest first. Only token-holders can post → no anonymous spam, no moderation
surface needed. Needs one new table (`invitation_wishes`) with insert-by-token
and public-read within the invitation.

### 8.11 Closing (the ballroom)

The payoff and the only section allowed to feel enormous. Fullest, deepest
red. The commissioned monogram (placeholder until it arrives), "Sita & Fatan"
in Bodoni at maximum scale, 10 October 2026, `#NoHeSITAtionJustFATAN`, one
thank-you line.

## 9. Persistent elements

- SVG chandelier fixed top-of-viewport (from end of gate onward).
- Mute toggle, fixed corner, state remembered.
- No bottom nav in v1: the walk is linear by design. Revisit only if guests
  demonstrably struggle to find RSVP.

## 10. What the owner supplies (never invent these)

Venue names, addresses, times · parents' full names · verified Arabic +
translation of Al-A'raf 189 · QRIS image + bank account · one licensed music
track (~2–4MB) · prewedding photos (after 24 Aug) · the commissioned monogram
(SVG + single-colour variant + source + exact colours, arriving ~mid-Aug) ·
the final deep red hex if it ever differs from `#8A0F1A`.

## 11. Build order

Each item = concept already approved here → coded comp at 390px → owner
approves on a real phone → productionise. Do not batch sections.

1. **Gate prototype** — standalone `prototypes/gate/index.html`, three.js via
   CDN, self-contained. The full tap → open → pull-through moment. This is
   the technical and artistic risk; prove it first.
2. Verse + the persistent SVG chandelier (establishes the light system every
   later section uses)
3. Closing (cheap, sets the type scale ceiling)
4. Countdown
5. Bride and groom (first parallax section; establishes the layer grammar)
6. Event details (token personalisation plumbing)
7. Dress code
8. Gallery (greyboxes)
9. Gift
10. Wishes (new table + form)
11. RSVP (blocked on guest-app Phase 2 rsvp domain — build when it exists)
12. Route shell: `/to/[token]`, token lookup, 404, `TZ` correctness, music,
    reduced-motion pass, real-device performance pass

## 12. Engineering guardrails

- New route group in this repo; **three.js must never enter the admin bundle**
  (dynamic import, route-scoped).
- No invitation deploys on 10 October 2026.
- Mid-range Android is the performance target: gate scene ≤ ~100k triangles,
  1–2 lights, no heavy postprocessing; render loop pauses when idle.
- Fonts self-hosted via `next/font`. No third-party requests beyond Supabase.
- Prototypes live in `prototypes/`, clearly outside production routes.
