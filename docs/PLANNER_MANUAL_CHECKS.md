# Planner: outstanding manual checks

The planner module shipped with its code verified and its screens largely unverified. Every task passed `npm run lint`, `npx tsc --noEmit`, `npm run build`, the domain unit tests and the RLS suite, but browser verification was deliberately declined during the build, so most of the list below has never been exercised by a human.

Some of it has since been checked by hand and is marked as such. The rest has not.

Written 2026-08-08, after the `feat/planner` branch merged.

---

## 1. Already verified by hand

These were found and fixed by looking at real screens, so they no longer need checking:

- The item modal renders as a centred dialog on desktop and a bottom sheet on phone.
- A timed event's block fills its real duration. A six hour shoot is six hours tall.
- Chips are tinted and carry a hairline edge, so two back-to-back events do not merge.
- A 30 minute block in the day view does not clip its own bottom edge.
- Delete sits at the bottom of the form, below Save, under a divider.
- Clicking empty grid space creates an event at that half hour; clicking a month cell creates a task on that day.
- Half hour slots highlight on hover, and the block created matches the slot highlighted.
- Planner home and the task list prefix each row with its day.
- The Google Maps field and its **Open in Google Maps** button.
- The mobile sidebar closes after following a link.

## 2. Never verified: the swipe gesture

**This is the largest gap.** Task 19 is almost entirely a touch interaction, and none of it has run on a real device. Needs iOS Safari and Android Chrome at minimum.

1. Left swipe advances one period, right swipe goes back, in all three views, and the URL and rendered data both follow.
2. Vertical scrolling inside the day and week hour grids never changes the period, including a fast momentum scroll.
3. A deliberately diagonal flick (roughly 45 degrees) inside an hour grid does not both scroll the grid and page the calendar at once.
4. Tapping a day number, a "+N more" link, or a chip in month view still performs its normal action when it is a genuine tap.
5. A swipe that *starts* on a day-number link or a chip and travels 60px or more: confirm only the swipe fires, not also the link's own navigation. Touch events do not cancel a synthetic click, so both could fire.
6. `touch-pan-y` preserves native vertical momentum scrolling in the hour grids on both platforms.
7. iOS edge-swipe-back is suppressed anywhere over the calendar surface. This is an expected consequence of `touch-pan-y`; confirm it is acceptable.
8. A two-finger pinch does not trigger a spurious period change. There is no multi-touch guard.
9. The 60px horizontal / 40px vertical thresholds feel right rather than twitchy or unresponsive.
10. Six or more consecutive swipes, then Back. Each press steps back one period, matching what six taps of the arrow buttons already does.

## 3. Never verified: access control

Only ever proven at the database layer by the RLS suite. The screen behaviour has not been seen.

- The Planner entry appears in the sidebar for an admin and is absent for an inviter.
- Visiting `/planner`, `/planner/calendar` and `/planner/tasks` as a non-admin redirects to `/dashboard`.
- The countdown strip shows on `/dashboard` and hides on `/planner`.

## 4. Never verified: layout at phone width

- Week view below 768px becomes a grouped agenda list with all seven day headers, empty ones reading "Nothing".
- No horizontal scrollbar anywhere, in any view, at 375px.
- The month grid still renders six rows at phone width, and the hit-slop targets on the day number and "+N more" feel right on a real device rather than stealing taps from chips.
- Loading `/planner/calendar` with no `?view=` on a phone briefly shows the month grid before settling on day. This flash is deliberate, and is what makes hydration silent. Confirm it is tolerable.
- The FAB sits above the bottom edge without covering the last card, respecting the safe-area inset.

## 5. Never verified: the capture and edit flow

- The FAB opens with the cursor already in the title field. This is the module's most important interaction, the "1am path".
- Typing a title and saving makes the task appear on today.
- The quick capture sheet closing while the full form opens reads as a clean handoff, not a double-backdrop flash. The two overlap for roughly 150 to 200ms.
- Save stays reachable on a short viewport with the event form's full field set, and the close button does not scroll away with it.
- Subtasks: add two, tick one and see it strike through, remove it, and confirm Enter in the subtask field adds a subtask rather than saving and closing the whole task.

## 6. Never verified: planner home and the task list

- The seeded blocked item appears in the Blocked card.
- Completed July items count toward Progress without appearing in Overdue.
- `/planner/calendar?view=month&date=2026-08-01` shows the three-day blocks spanning three cells each.
- Tasks group by month in date order with the undated backlog last.
- Filter chips change the URL, a refresh keeps the filter, and hide-done removes completed tasks.

---

## Known cosmetic issues, not yet judged

Real but minor, left for a look rather than fixed blind:

- The "Now HH:MM" badge is about 77px wide against a 56px gutter, so it visually overlaps an in-progress event's left edge. It is `pointer-events-none`, so it cannot steal a tap.
- At an exact hour, that badge and the gutter's own hour label collide visually.
- The day-number link's hit-slop reaches about 4px past its cell's padding.

## Open decisions

- **The "Today" card on planner home.** Design spec section 7.2 lists seven cards with no Today card, but the domain computes `today` as a bucket distinct from `next7`. Implementing the spec literally would leave items due exactly today rendering on no card at all. The code keeps the card; the spec needs reconciling once you have seen the screen.
- **Section titles.** The code says "Blocked" and "Later this month"; the spec says "Flagged" and "This month".

## Before any deploy

**Set `TZ=Asia/Jakarta` in the Vercel environment.** The planner resolves dates in the host timezone throughout, and on a UTC runtime every date shifts by seven hours between midnight and 07:00 WIB. There is no `vercel.json`, so the dashboard is the only place this exists. See CLAUDE.md's Timezone section.
