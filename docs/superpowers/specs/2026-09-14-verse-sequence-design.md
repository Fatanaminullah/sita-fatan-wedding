# The verse as the cover's second act

The rework of the verse on the guest invitation at `/to/[slug]`. The verse
stops being a scroll-scrubbed section and becomes a timed sequence that
plays the moment the letter is opened.

The owner's own idea, approved on his phone on 2026-09-14 as a coded comp
(private artifact `claude.ai/code/artifact/db903a09-…`, version 2), with one
change made on the phone: no Continue button, a scroll cue instead.

## How it got here

Three treatments were built and rejected before this one, and the reasons
are the design constraints of this section:

1. **A drop of oxblood ink blooming on charcoal.** Rejected: red on black is
   wrong under a verse of the Qur'an, whatever the craft. No pigment.
2. **Morning light through a lattice screen.** Rejected as worse.
3. The owner's proposal, this document.

Two constraints from the code shaped every attempt. The vow's ring canvas
mounts on an IntersectionObserver with `rootMargin: 200% 0px 250%`, and the
vow overlaps the section above it by `-100lvh`, so the ring's WebGL context
is already live while a guest is reading the verse: nothing here may open a
second GL context or run a per-frame effect. And the vow's stone sheet needs
a different ground to slide up over, which is why the verse could never
become paper.

## The sequence

The page is locked at the cover, as it always was.

1. The guest drags the letter past the threshold, or taps "or tap here to
   open". **The music starts inside that gesture.**
2. The letter lifts away (unchanged).
3. The cover's top label fades. The photograph goes soft and dark over 1.5s:
   a cross-fade, by opacity alone, to a copy of the same image drawn at a
   twenty-fourth of its size and scaled back up, so bilinear scaling does the
   blurring and no filter ever runs. A charcoal dim settles at 0.62 so ivory
   type holds on a bright photograph.
4. The verse arrives word by word at a reading pace: 0.2s stagger, 0.9s per
   word, about five seconds for its 23 words. Then the source line.
5. The scroll cue appears, the capsule and falling dot the cover already had,
   and **the page lets go of the scroll.** Nothing moves by itself.
6. The guest scrolls. The cover is held for a second screen, and the vow's
   stone sheet slides up over the softened photograph exactly as it used to
   slide up over the verse's charcoal.

**Any attempt to scroll during the verse finishes it at once** (wheel,
touchmove, ArrowDown, PageDown, Space). Nobody is held through an animation
they did not ask for; the impatient guest gets the verse instantly.

Reduced motion: the end state, immediately, and the cue.

## Why no button

The comp had a Continue button, and the owner's question on the phone was
the right one: when the button delivers a guest to the vow, how do they
know to scroll? Every held section on this page reveals its content by
scroll, so any section a guest is *teleported* to looks empty. The vow at
progress zero has its words at `scaleY: 0` and the ring above the top edge.

A button that targets a section top is therefore wrong on this page, and
the fix that keeps a button (scroll to a "peek", the sheet a third of the
way up) was built and worked. The owner chose the simpler thing: no button.
The cue the cover already used, and the guest's own thumb.

**Rule for the future:** no control on this page scrolls to a section top.

## Structure

```
cover.tsx         the section, held: photo, soft copy, dim, wash, the verse
                  layer, the letter, the hint and the cue; the sequence
paper-sheet.tsx   + onRelease(opening), fired synchronously in pointerup
paper-letter.tsx  passes onRelease through
persistent.tsx    Music is a forwardRef exposing start(); play() in the gesture
invitation.tsx    entered (sections mount) and read (scroll unlocks) are now
                  two states; Verse is gone from the walk
invitation.css    .inv-cover-wrap, sticky cover, soft/dim/verse layers;
                  the .inv-verse* block removed
verse.tsx         deleted
page.tsx          scroll restoration pinned before the page can restore it
```

## The music, and why it moves

The old chain was: sheet leaves → `onOpened` from inside the paper's frame
loop → `setEntered(true)` → an effect in `Music` calls `audio.play()`. That
call is outside any gesture's call stack. Chrome tolerates it (activation
lasts about five seconds); **iOS Safari refuses it silently**, and the
`.catch(() => {})` swallowed the refusal. Nobody had noticed because
`MUSIC_SRC` is still `null`.

`PaperSheet` decides whether a release opens the sheet synchronously in its
`pointerup` handler (`liftTarget > 0.33 || liftVel > 0.9`). `onRelease(true)`
fires there, the cover calls `onGesture`, and `Music.start()` calls
`play()` inside the gesture. The tap button and the fallback letter's button
do the same in their click handlers. The old effect on `entered` stays as a
harmless fallback.

The comp proved the timing with a WebAudio chime scheduled after the paper
had left; the production path is the HTMLAudio element itself, which is the
same rule (a `play()` inside the gesture activates the element).

## Scroll restoration

Chromium restores a previous scroll position within about sixty
milliseconds of load, as soon as the document is tall enough, before any
script at the bottom of the page runs. A guest who reloads mid-page would
land under the lock at a random section with no way back. The guard
(`history.scrollRestoration = 'manual'` and a scroll to the top) is an
inline script rendered before the page's content, so it is parsed first.
Found in the comp; it applies to the real page identically.

## Performance

- No canvas per frame. The soft copy is painted once, at open, from the
  already-loaded cover image. Everything that moves is opacity and
  transform.
- No new dependency, no new GL context. The ring canvas is live throughout
  and this adds nothing it has to share the GPU with.
- The old verse section's scrubbed timeline and its 360lvh of scroll are
  gone; the page is shorter by 160lvh.

## Not done, deliberately

- **The vow's entry state.** Its words start at `scaleY: 0` and the ring
  above the edge, so a guest who lands on it without scrolling into it sees
  empty stone. Without a button that teleports, nobody lands there that way
  in the normal flow, so it is left alone. It remains the right fix for a
  shared link or a reload that lands mid-page.
- The Arabic. Owner's decision 2026-09-14: English only.
  `INVITATION_UI_BRIEF.md` no longer lists it as something he supplies.

## Verification

Code: `npm run lint`, `npx tsc --noEmit`, `npm run build`, the domain suite.
No domain logic is added; per `CLAUDE.md`, no component test.

Screen, on the owner's phone, against the production route: the music
starts on release (once `MUSIC_SRC` is set); the photograph softens without
a stutter on the mid-range Android; the verse reads at the right pace; a
swipe mid-verse skips; the cue appears and the sheet slides up over the
softened photograph on the first scroll; a reload lands at the cover.
