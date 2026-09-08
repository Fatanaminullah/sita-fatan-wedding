# Invitation feedback, Sita's list

The review list for `/to/[slug]` (the "Stone & Ink" rebuild). Source of truth
for what is left to do on the guest-facing invitation.

Two states are tracked separately, because they are not the same thing:

- **Built** means the code is there and the section renders.
- **Approved** means the owner looked at it on a real phone and accepted it.

A built-but-unapproved item is not done. `docs/PLANNER_MANUAL_CHECKS.md`
records the same distinction for the planner module, for the same reason.

Reconciled against the code on 2026-09-09.

## Open

| # | Item | State |
|---|---|---|
| 8 | asset cincin diganti | Blocked on the owner: the vow section's ring needs a GLB he supplies. |
| 10 | section event perlu konsep lain yang lebih wah, saat ini terlalu basic | Open. Current build is 3D tilt cards (GSAP quickTo) on venue photos, which is the version flagged as basic. |
| 20 | cari alternatif lain buat section thank you (footer) | Open. Current build is a desk spread with two night portraits, unapproved. |

## Built, awaiting the owner's eye

| # | Item | Where |
|---|---|---|
| 12 | animasi typography countdown, referensi tympanus | `countdown.tsx`, Codrops on-scroll typography #21: digits tumble in from depth, scrubbed to scroll. |
| 13 | check fungsi add to calendar | `countdown.tsx` `icsHref()`, an `.ics` data URL, no server and no library. Opened once on the owner's phone. |

## Done

| # | Item | Where |
|---|---|---|
| 1 | loader animation kelamaan, 2 iterasi | `loader.tsx`, monogram draw runs exactly two cycles, frozen on ready. |
| 2 | tinggi section gate pakai svh, CTA tertutup | `100svh` on the cover. `lvh` elsewhere, `dvh` nowhere. |
| 3 | CTA untuk lanjut, "or click here to open" | Cover, under the drag hint. |
| 4 | lighting effect mobile kurang menyala | Wandering light on hover-less devices, 1.5x hover strength, 1.4 to 3s hops. |
| 5 | scroll area gate harus seluruh bagian | The whole cover scrolls once opened. |
| 6 | alternatif verse tanpa foto | `verse.tsx`, option A: the words alone on charcoal. No photo. A Luxus chandelier port and a candelabra were built and rejected (`bf5af0d`, `6ee1b40`). |
| 7 | verse tambahkan kutip | Quotes on the verse. |
| 9 | section bride groom tambahkan instagram | `couple.tsx`, handles in `content.ts`. Only the visible block is pressable. |
| 11 | section bride groom masih nampak di section events | `.inv-events` in `invitation.css`: `margin-top: -100lvh`, `z-index: 3`, and `min-height: 100lvh` so a one-card guest's section still covers the screen it overlaps. |
| 14 | tambahkan detik, animasi detik yang keren | Odometer roll, each digit a strip of ten. |
| 15 | section dresscode, konsep lain | Three named swatches (black, brown, grey), one tone dresses her and him together, drag to turn. Approved by eye 2026-09-08. See the memory note on the nine 3D figures. |
| 16 | kalimat deskripsi dresscode diubah | `content.ts` `DRESS_CODE.lines`: "We would truly appreciate it if you could dress to the code." No mention of what the couple wears. |
| 17 | pergerakan gallery terlalu ngebut | Tunnel at half speed. |
| 18 | foto galeri jangan diedit | `public/gallery/` untouched, waiting on the final files. |
| 19 | switch gift dengan rsvp | Order is gallery, gift, RSVP, closing. RSVP is the last thing before the thank you. |
