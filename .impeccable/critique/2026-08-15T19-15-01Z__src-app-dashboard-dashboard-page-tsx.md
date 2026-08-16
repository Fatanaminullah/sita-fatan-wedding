---
target: admin dashboard
total_score: 25
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 2
timestamp: 2026-08-15T19-15-01Z
slug: src-app-dashboard-dashboard-page-tsx
---
Method: dual-agent (A: design review, source-only · B: detector + contrast math). No browser inspection: the owner declines browser automation on this project.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | No "as of" timestamp on a page checked over weeks; no done-state. |
| 2 | Match System / Real World | 3 | Akad/Resepsi/pax are right; "cap", "headroom", "entries not pax" are spreadsheet vocabulary the parents never agreed to learn. |
| 3 | User Control and Freedom | 2 | An inviter cannot jump to their own problem; they scroll past six cards built for the whole wedding. |
| 4 | Consistency and Standards | 3 | Card/meter pattern is consistent, but two capacity meters exist (`CapacityMeter` in page.tsx, `Meter` in capacity-strip.tsx) with duplicated logic. |
| 5 | Error Prevention | 3 | Read-only surface, low risk. Missing-phone deep link is correctly pre-filtered. |
| 6 | Recognition Rather Than Recall | 2 | The bottom table's own subtitle admits it restates every number above. Two "Cap" and two "Left" headers disambiguated by position only. |
| 7 | Flexibility and Efficiency | 2 | Every number is a dead end except two links. No drill-through, no export, no week-over-week delta. |
| 8 | Aesthetic and Minimalist Design | 2 | Nine cards, two charts, a ten-column table, all at equal visual weight, for a parent whose answer is three numbers. |
| 9 | Error Recovery | 3 | Over-cap and missing-phone are named in words, not just coloured. Genuinely well done. |
| 10 | Help and Documentation | 2 | CardDescriptions carry real inline help, but nothing explains VIP tier or waitlist cascade to a first-time parent. |
| **Total** | | **25/40** | **Acceptable: significant improvements needed** |

## Design Specificity Verdict

**Category-interchangeable chrome around genuinely specific content.** The domain model is excellent and could not be borrowed: pax vs entries, per-inviter caps per event, VIP as a tier inside Resepsi, souvenirs per entry. The visual system around it is off-the-shelf operations blue on cool slate and would sit unchanged in front of a logistics tracker.

DESIGN.md asserts warmth belongs to the invitation, not the admin. That reasoning holds for the dense working surfaces (tables, charts) where a spent colour must stay available for alarms. It does not hold for the chrome, and the chrome is the entire first impression for four non-technical parents whose only exposure to this brand is a maroon-on-bone invitation.

**Deterministic scan:** `detect.mjs` over `src/app/(dashboard)` returned `[]`, exit 0, 24 files. Clean. No hardcoded hex in the dashboard tree. One raw Tailwind colour bypasses the token layer: `text-emerald-600` at `src/app/(dashboard)/waitlist/promote-button.tsx:34`, with no dark-mode pair. Dead tokens: `--warning-foreground`, `--chart-4`, `--chart-5`, `--sidebar-primary`, `--sidebar-primary-foreground`.

## Brand palette, measured

Sampled from the two supplied assets:

| Role | Hex | Where |
|---|---|---|
| Paper / bone | `#EFECE4` | 96% of the richlink field |
| Oxblood | `#5E040E` | monogram S, "Sita Cahyani Arasy" |
| Deep brown-maroon | `#4A1C1C` | oval frame, "Fatan Aminullah" |
| Mauve grey | `#7A5C5C` | "The Wedding of", the date |

One hue family, two values, on warm paper. The admin app is currently `#1E40AF` on `#F8FAFC`: a cool blue on a blue-tinted grey. Nothing connects them.

## Overall Impression

The engineering judgment on this page is better than the design judgment. Never-Color-Alone is actually enforced in three separate components; role scoping happens in the data, not by hiding rows. What is missing is a point of view about who is reading. The superadmin layout is served to a parent with twenty guests, and it renders a bar chart with one bar.

Biggest single opportunity: make the page answer "is there anything I need to do" before it answers "here is everything".

## What's Working

- **Never-Color-Alone is real, not documented.** Over-cap, missing-phone and waitlist states all pair colour with words: "3 pax over cap", "(3 over)". Verified in `CapacityMeter`, `RemainingCell` and `capacity-strip.tsx`. Rare discipline.
- **Role scoping is server-side.** `scopeSummaryToInviter` / `scopeSummaryToSide` reshape the summary object, so an inviter's page is genuinely smaller data rather than a filtered render. Security and cognitive load improve together.
- **The open-slot callout is the best thing on the page.** It names the inviter, the number, and offers one click to resolution. It is the only element that behaves like an answer instead of a readout.

## Priority Issues

**[P0] The palette has no relationship to the wedding, and the neutrals are cool.**
Why it matters: four non-technical parents are first-class users. Their only reference for this brand is a maroon-on-bone invitation. A cool blue SaaS shell reads as third-party software, not as the couple's own system, at exactly the moment a reluctant user is deciding whether to bother filling in a phone number. The alarm-scarcity argument in DESIGN.md survives intact if the swap is confined to identity, not to data.
Fix, token-only in `globals.css`: `--primary`, `--ring`, `--sidebar-primary` from `#1E40AF` to `#5E040E`; `--background` from `#F8FAFC` to a warm paper near `#F7F5F1`; `--muted`/`--secondary` from `#E9EEF6` to a warm wash near `#EDE8E2`; `--accent` to `#F5EFEA`. Leave `--destructive`, `--warning` and all five `--chart-*` untouched. The chart set is documented as colourblind-validated as a set; recolouring it is a separate, larger job.
Named risk: maroon primary and red destructive are both red. They stay separable because the maroon is very dark and desaturated while `#DC2626` is bright, and because every destructive state already carries words. Do not let the maroon drift brighter.

**[P0] Two live contrast failures, both in the surfaces a parent reads.**
Why it matters: a parent on a phone in daylight is the actual scene.
- `text-warning` (`#D97706`) on white for the missing-phone links in the capacity table: **3.18:1**, fails 4.5:1 for text.
- The phone-coverage bar fill `--chart-3` (`#1baf7a`) on card white: **2.82:1**, fails even the 3:1 non-text minimum.
Also failing but currently dead: `--warning-foreground` white on `#D97706` (3.19:1), `--chart-4` (2.17:1) and `--chart-5` (2.69:1) on card. Dark mode passes throughout except `chart-2`/`chart-5` as text on card (4.46 / 4.40).
Fix: darken the light-mode warning text token to roughly `#A85A04`, and darken light `--chart-3` to roughly `#0F7A54`. Fix the dead tokens before something starts using them.

**[P1] The inviter gets the superadmin's layout at one-twentieth the scale.**
Why it matters: `scopeSummaryToInviter` returns exactly one inviter row and one side row. So an inviter's "Akad by inviter" chart is a single bar, their "Pax by side" chart is a one-series bar chart with a legend of one, and the ten-column table has one data row. That is not a scoped dashboard, it is a full dashboard rendering degenerate charts. Family vs friend and the print run belong to whoever manages the whole wedding.
Fix: branch the layout on role, not only the data. For `inviter`: the three meter cards, phone coverage, their waitlist, and nothing else. Drop both bar charts and the capacity table for that role.

**[P1] Nothing on the page can say "you're done".**
Why it matters: this is checked repeatedly over weeks. Good news currently looks identical to no news: grey text. A parent who has finished has no signal that they have finished, so they keep checking and keep feeling behind. Product principle 4 says surface what is about to hurt, which also implies staying quiet when nothing does.
Fix: an affirmative state when the scoped summary is clean (under cap, no missing phones, nobody waiting). One line, not a celebration.

**[P2] The bottom table is redundant disclosure and the worst phone surface on the page.**
Why it matters: ten columns behind `overflow-x-auto` means the headers scroll out of view while the numbers stay. Two columns labelled "Cap" and two labelled "Left" are separated by position alone, so the reader least equipped to catch a misread is the one asked to hold that context.
Fix: collapse it behind a disclosure by default; omit it entirely for `inviter`. If it stays, label the groups (Akad cap / Akad left) rather than repeating bare words.

**[P2] The two Recharts surfaces are invisible to assistive tech.**
Why it matters: no aria label, no table equivalent, no keyboard-reachable data points. Two of the five visual sections carry nothing for a screen-reader user. The `TableHead` duplicates ("Cap", "Cap") announce identically.
Fix: `role="img"` plus a summarising `aria-label` on each chart, or a visually-hidden table of the same numbers. Disambiguate the duplicate headers.

## Persona Red Flags

**Parent on a phone (inviter).** Meets a one-bar bar chart and a ten-column horizontally-scrolling table. Meets "cap", "headroom", "entries, not pax". Never sees a confirmation that their list is finished. The one thing they can act on, missing phone numbers, is an amber link at 3.18:1 buried in the widest table on the page.

**Sam (accessibility).** Charts unreadable to a screen reader. Duplicate table headers. Two colour tokens below minimum contrast in light mode. Focus order runs through nine visually-titled cards with no landmark structure.

**Alex (power user).** Every number is a dead end except the two missing-phone links. No sort, no drill-through, no export, no delta against last week. The per-inviter waitlist rows are plain text with no link into that inviter's actual entries.

## Minor Observations

- `phonePct` rounds up, so 99.6% renders "100%" with a nonzero missing count directly beneath it.
- `text-emerald-600` in `promote-button.tsx:34` bypasses the token layer and has no dark-mode pair.
- `CapacityMeter` and `capacity-strip.tsx`'s `Meter` duplicate the same percentage and over-cap logic. A future change to the over-cap wording has to be made twice, and the copy that gets missed silently reverts to colour-alone.
- Inline `style={{ background: 'var(--chart-N)' }}` sits beside Tailwind classes for everything else in the same file.
- Now that a monogram asset exists, the sidebar's plain text "Sita & Fatan" is a free identity win.

## Questions to Consider

- If a parent only ever needs three numbers, why is the dashboard the same shape for them as for the couple?
- What would this page look like if it were allowed to be empty when nothing is wrong?
- Does the print run belong on a dashboard at all, or on the guests page where the cards are actually assigned?
