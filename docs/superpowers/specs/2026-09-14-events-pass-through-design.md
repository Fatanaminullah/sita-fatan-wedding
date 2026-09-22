# Events section: the pass-through

The rebuild of the events section of the guest invitation at `/to/[slug]`.
Closes item 10 of `docs/INVITATION_FEEDBACK.md` ("section event perlu konsep
lain yang lebih wah, saat ini terlalu basic").

Approved by the owner on a real phone on 2026-09-13, as a coded comp at
390px (private artifact, `claude.ai/code/artifact/b718d712-…`, version 3).
This document records what was approved so the production port has an
authority other than the comp's source.

## Why the tilt cards lost

The section is the only one on the page carrying information a guest has to
act on (which event, when, where, the Maps link) and the only token
personalised one. It was also the most generic: a hover-tilt card over a
photograph, which is a stock pattern, sitting between sections that had each
been rebuilt several times. Sita's "too basic" was that contrast.

Her bar, per the owner, is the countdown: type doing something type should
not. That is also the cheapest register to buy, because type moving is
transforms on DOM nodes, and the section sits close enough to the vow's ring
canvas (its observer margin is `200% 0px 250%`) that a WebGL concept would
risk two live canvases at once on a mid-range Android.

One constraint fell out of the register: **events sits immediately before
countdown, and countdown owns digits.** Any concept built on the numerals
would read as the countdown's warm-up. So the section owns the words instead,
the venue names, at architectural scale.

## The score

One "door" per event the guest is invited to. Each door is 300lvh tall (200 as designed; raised on 2026-09-16 so the arrived room holds for about 123vh, see the hold row) and
holds a 100lvh stage with `position: sticky`, the way the vow holds the
screen, so the pass-through is scrubbed over 100lvh of native scroll. No GSAP
pin.

**Opener** (once, above the first door): the date label in oxblood and the
personal line, *"We have kept two places in your name."* The old display
headline is gone; the venue name is the display type now, and two pieces of
display type competing was part of the problem.

**The wall** (the door scrolls into view): the venue name in Instrument
Serif, uppercase, each line fitted to touch both gutters whatever the width.
`MASJID / ISTIQLAL`; `LUXUS / GRAND / BALLROOM`. Above it, small, the event
kind. Nothing else on screen. Ink on stone for the Akad, ivory on charcoal
for the Resepsi.

**The pass-through** (stage held, progress 0.10 to 0.72): the lines are
grouped into an upper half and a lower half. The halves scale to 2.4 and
part, the upper growing up from its bottom edge, the lower growing down from
its top, until each is entirely off the stage. Behind them the photograph
opens from a door-height slit to full bleed, and its dimming lifts. You end
up inside the venue. The name of the place was the door to the place.

**Arrival** (progress 0.72): the practical block rises into the lower third,
time giant, then the clock range, the venue name small and scannable, the
address, the Maps button. This is a one-shot tween on the page's standard
ease, not scrubbed: the spectacle is over and the part a guest reads should
arrive calmly and complete. It reverses if they scroll back above 0.64.

**Morning to night.** The Resepsi door's ground is charcoal, its wall ivory.
A two-event guest travels from stone to charcoal inside one section, which
is the arc `theme.ts` says the whole page runs on. A one-event guest gets one
door in the colour of their time of day.

## Structure

```
events.tsx        the section: opener + one EventDoor per invited event
event-door.tsx    one door: wall, aperture, details, its own timeline
content.ts        + wall line split per event, + the opener copy
invitation.css    .inv-events (overlap kept), .inv-door* (new), .inv-event* (gone)
```

Content additions in `content.ts`:

- `WeddingEvent.wall: { up: string[]; down: string[] }`, the display lines
  and which half each belongs to. Lines are content, not layout: the split
  decides how big the wall reads.
- `EVENTS_COPY.places(pax)`, the personal line, moved out of the component.
  `content.ts` says "edit here, not in the sections" and the section had
  been carrying its own copy.

Markup of one door:

```
article.inv-door[.inv-door--night]
  div.inv-door__stage            sticky, 100lvh, overflow clip
    div.inv-door__photo          the aperture; scaled down to a slit
      img (next/image, fill)     counter-scaled so the picture never squashes
      div.inv-door__wash         legibility gradient, bottom up
      div.inv-door__dim          charcoal, opacity 0.55 -> 0
    div.inv-door__wall
      p.inv-label.inv-door__kind
      h2.inv-door__name[aria-label=venue]
        span.inv-door__up   > span.inv-door__line > span.inv-door__ink
        span.inv-door__down > span.inv-door__line > span.inv-door__ink
    div.inv-door__details        absolute, lower third, ivory
```

## Rules the comp established

These are the things that went wrong in comp versions 1 and 2, written down
so the port cannot repeat them.

1. **Every grid on the way down to the lines is `grid-template-columns:
   minmax(0, 1fr)`.** An `auto` track grows to its widest unfitted line, so
   the fit measures against the very text it is fitting; whichever line is
   widest at the raw size measures equal to the wall and never changes size.
   This is what cropped LUXUS GRAND.
2. **The fit measures the ink, not the line.** `.inv-door__ink` is
   `inline-block`; a block can be stretched by its container, an inline-block
   cannot. Set 100px, read the ink's `offsetWidth`, scale, then read once
   more and correct if rounding pushed it past the gutter.
3. **Exit distances are measured, not guessed.** The upper half travels
   until its bottom edge is 24px above the stage, the lower until its top
   edge is 24px below it, computed from `offsetTop` (transform-free) as
   GSAP function-based values with `invalidateOnRefresh`. "170% of its own
   height" left half the wall on screen over the details.
4. **Opacity belongs to the reveal alone.** The details' muted lines are
   muted by colour (`rgba` ivory), never by `opacity`, or their rule
   out-cascades the resting `opacity: 0`.
5. **Fonts are refitted when they land.** Fit on mount, again on
   `document.fonts.ready`, again on `loadingdone`, and on a width change of
   the wall; each refit calls `ScrollTrigger.refresh()` so the exits
   re-measure.
6. **The aperture is transforms only.** The outer box scales from
   `(0.1, 0.62)` to `(1, 1)` and the image is counter-scaled by the inverse
   with a 1.12 push-in that settles to 1, applied from one proxy tween's
   `onUpdate` through `quickSetter`s made once, so the product stays exact
   mid-way and nothing is allocated per frame. `clip-path` would be simpler
   and is the one thing here that could cost frames on a mid-range Android
   GPU; it is deliberately not used.

The review of the first port added three more:

7. **The details are anchored to the small viewport.** The stage is
   100lvh, so its bottom is under the browser toolbar whenever that is
   expanded. The details' offset is `100lvh - 100svh` plus a clearance of
   at least 4.75rem, which also keeps the Maps button out of the RSVP pill's
   band on a 320px phone. Same hazard `.inv-couple__chrome` solves.
8. **Hidden means `visibility: hidden`.** The details rest at `opacity: 0`
   and `visibility: hidden`, and the arrival uses `autoAlpha`, so the Maps
   button is not in the tab order while it cannot be seen.
9. **The arrival is keyed to the scrubbed playhead.** The trigger's raw
   progress leads the scrubbed timeline by up to 0.35s, so a flick would
   start the arrival while the halves were still over the details. The
   thresholds read `tl.progress()` instead. And the arrival animates a
   wrapper around the Maps button, never the button, because GSAP leaves an
   inline transform behind that would beat `.inv-btn:active`.

## Motion timeline

Scrubbed timeline, `scrub: 0.35`, `start: 'top top'`, `end: 'bottom bottom'`
on the door, total duration 1.05 mapped to the 100lvh hold.

| at | target | to | duration | ease |
|---|---|---|---|---|
| 0.06 | photo | opacity 1 | 0.10 | none |
| 0.10 | aperture proxy | t 1 | 0.60 | `EASE_INOUT` |
| 0.12 | kind label | opacity 0 | 0.14 | none |
| 0.12 | upper half | y exit, scale 2.4 | 0.60 | `power2.in` |
| 0.12 | lower half | y exit, scale 2.4 | 0.60 | `power2.in` |
| 0.32 | dim | opacity 0 | 0.45 | none |
| 0.77 | (hold) | | 1.23 (was 0.28; 2026-09-16) | |

Arrival: separate paused timeline, details children `opacity 1, y 0`,
1.0s `EASE_OUT`, stagger 0.07. Played when progress > 0.72, reversed below
0.64.

`will-change: transform` on the halves, the photo box and the image only
while the door's trigger is active (class `is-active` from `onToggle`).

## Reduced motion

`MOTION_REDUCED` branch renders the end state: photo full and lit, wall
hidden, details visible. CSS under `prefers-reduced-motion: reduce` drops the
door to `height: auto` and the stage to `position: relative`, so nobody
scrolls 100lvh through a held frame that does nothing.

## Performance budget

- No new canvas. No new dependency. SplitText was available and is not
  needed: the split is by line, authored in content.
- Per door: about a dozen transformed elements, two ScrollTriggers' worth of
  work (one scrub, one arrival), one `next/image`.
- Animated properties: `transform` and `opacity` only. No `filter`, no
  `clip-path`, no `box-shadow`, no layout properties.
- Font-size changes happen only in the fit, which runs on mount, font load
  and resize, never on scroll.
- Scroll length: about 240lvh for one event, 440lvh for two, against the old
  100lvh minimum. Accepted by the owner. The lever, if a device says it
  drags, is the door height.

## The overlap with the couple section

`.inv-events` keeps `margin-top: -100lvh` and `z-index: 3`: the section
still slides over the held couple. The `min-height: 100lvh` patch from item
11 is no longer needed, because the first door alone is 200lvh and opaque,
so a one-card guest's section covers the screen it overlaps by construction.

## Out of scope

- The photograph preload mismatch: `preload.ts` warms `/venues/*.jpg` while
  `next/image` requests `/_next/image?url=…`, so the loader does not actually
  warm what the section renders. Pre-existing, not introduced here, worth its
  own change.
- `clip-path` for the aperture, if a device test ever shows it free.
- Any change to the venue photographs themselves.

## Verification

Code: `npm run lint`, `npx tsc --noEmit`, `npm run build`. No domain logic is
added, so no unit test; per `CLAUDE.md`, no component test.

Screen, on the owner's phone, against the production route: the walls touch
both gutters on both doors; the pass-through ends with nothing over the
details; the Resepsi photograph is present; frame rate on the mid-range
Android through the pass-through; whether scaled type goes visibly soft
mid-scrub. The comp proved the first three in Chromium; the last two need a
device.
