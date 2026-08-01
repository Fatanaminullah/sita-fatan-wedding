# Wedding Invitation & Guest App: What We're Building

Non-technical product doc. Written to be read by Fatan and Sita together.
Technical companion: `TECH_SPEC.md`. Schema: `DATA_MODEL.md`.

Last refreshed: 2026-08-01 (supersedes the version in the Obsidian vault).

---

## The idea in one sentence

Replace our guest-list Google Sheet with a small website that handles invitations, RSVP, and check-in on the wedding day, so we are not manually tracking 556 pax by hand.

## Why

The spreadsheet counts well. It cannot:

- Send invitations to guests automatically
- Let guests confirm attendance themselves
- Warn us in real time when a family member invites too many people
- Check people in at the door
- Show us, live, how many people have actually arrived
- Stop a guest from receiving two souvenirs

## Who uses it

**Us (Fatan and Sita), role `admin`.** See everything, edit any guest, adjust quotas, handle special cases by hand, run the Akad check-in and the Akad souvenir table.

**Our parents (4 people), role `inviter`.** Each sees and manages only the guests they personally invited. They can add, edit, and fill in phone numbers for their own list. They cannot see or touch anyone else's.

**Wedding-day helpers, role `usher`.** A single check-in screen at the Resepsi door, plus a separate souvenir scan station. They do not see the guest list or the dashboard.

**Anyone needing numbers (WO, caterer), role `viewer`.** Read-only headcounts.

**Login:** username and password we create and hand over. No magic link, no OTP, no self-signup. Password reset is admin-initiated.

## Where the guest data comes from

Our current Google Sheet is imported once, then retires. Everything after that lives in the app.

As of 2026-08-01 the sheet holds:

| | Fatan side | Sita side | Total |
|---|---|---|---|
| Guest entries | 194 | 136 | 330 |
| Pax invited to Akad | 115 | 94 | 209 |
| Pax invited to Resepsi | 234 | 249 | 483 |
| VIP pax | 23 | 15 | 38 |
| Unique guests (souvenir count) | | | **320** |

### The phone number problem

Only **37 of 330** guest entries have a phone number. Phones are how invitations get sent, so this is the single biggest gap between here and sending anything.

Decision: **we do not fill these in the spreadsheet.** The app imports what exists, and the remaining numbers get entered in the app, by each parent, for their own guests. Each inviter gets a "missing phone" filter showing exactly their own gaps. This turns one long chore for Fatan into four short ones, and avoids running two live copies of the data for weeks.

## How a guest experiences it

1. They get a WhatsApp message with a personal invitation link, just for them.
2. They open it and see their name, how many people they are invited for, and which events.
3. They tap Attending or Not Attending. If attending, they confirm how many people are actually coming. They can say fewer than invited, never more.
4. Closer to the day, a second message arrives with a QR code, their entry ticket.
5. At the door we scan the QR and check them in.
6. They get their souvenir at whichever event they attend first, one per guest regardless of party size.

If a guest will not use a link (older relatives), **we enter their answer for them** after a phone call. Nobody is forced onto the website.

## Quotas and the waiting list

Each of the 6 inviters has an agreed maximum headcount per event.

| Inviter | Akad cap | Resepsi cap |
|---|---|---|
| Fatan | 20 | 90 |
| Mama Fatan | 40 | 80 |
| Papa Fatan | 40 | 80 |
| Sita | 20 | 90 |
| Mama Sita | 40 | 80 |
| Papa Sita | 40 | 80 |

Venue totals: Akad 200 pax, Resepsi 500 pax, VIP 50 pax. The per-inviter caps add up to exactly those totals, so enforcing at the inviter level makes every larger total correct automatically.

**Warn, allow, flag.** Going over quota never blocks anyone from being added and never silently rejects a guest. The row saves, the inviter shows red on the dashboard, and we deal with it as people.

### Where we actually stand

Four inviters are over cap right now, 63 pax total:

| Inviter | Event | Invited / Cap | Over by |
|---|---|---|---|
| Mama Fatan | Akad | 65 / 40 | 25 |
| Mama Sita | Akad | 61 / 40 | 21 |
| Sita | Resepsi | 100 / 90 | 10 |
| Papa Fatan | Resepsi | 87 / 80 | 7 |

Separately, Fatan has flagged 16 pax of his own as waiting list, by choice, while being under cap on both events.

Both become the same thing in the app: a `waitlisted` state. Fatan's 16 import as waitlisted. The 63 over-cap pax import as **confirmed**, and the dashboard shows those four inviters in red until we sit down with each of them and decide who moves to the waiting list. The app never picks for us, because spreadsheet row order is not priority order.

### How the waiting list behaves

- Waitlisted guests receive **no messages at all**, not the invitation and not the QR, until promoted.
- Waitlisting is per event. A guest can be confirmed for Resepsi and waitlisted for Akad at the same time. This matters: our overrun is concentrated on Akad for the mothers and Resepsi for Sita and Papa Fatan.
- When a confirmed guest declines and frees up seats, we get a prompt: here are the people waiting, pick who fills it. It offers the same inviter's waiting list first, then the same side, then everyone.

## The week before (QR and check-in)

About a week out we press one button and every confirmed guest gets their QR ticket.

- **Akad check-in:** us, using our own admin accounts. No separate family PIC role.
- **Resepsi check-in:** ushers at the door.
- **VIP guests** get a badge that appears automatically when their QR is scanned. If a VIP cancels we can promote someone else any time, including on the day, with no message resent.

The guest form keeps working after the QR send, and we can still change answers by hand. Nothing freezes.

## Souvenirs

**320 souvenirs**, one per guest entry, not per pax. A 2-pax guest gets one. A guest invited to both events gets one, not two.

- **At Akad:** a plain tick-list on a tablet. Names in a list, tick when handed over. No scanning; Akad is small enough that ticking is faster.
- **At Resepsi:** a separate table from the entrance, with its own scan screen. Same QR. If they already collected at Akad the screen says so and refuses. If they skipped Akad entirely, this is where they collect.
- The database physically cannot record two claims for one guest, so a double-handout is impossible even if two helpers scan at once.

## What the dashboard shows

Live, replacing the sheet's Summary tab, broken down per event, per side, and per inviter:

- **Invited / Confirmed / Arrived** as three separate numbers, not one
- Who has not responded yet, so we know who to chase
- Who is missing a phone number
- Whether invitation messages actually went through
- A real-time arrival counter on the day
- Souvenirs handed out versus expected

## Still open

- [ ] Two duplicate names on Fatan's side: `ihsan`, `dian`. Resolve before import.
- [ ] Pick the real WhatsApp gateway (Fonnte, Meta Cloud API, or WAHA) before Phase 3. Not urgent: the app is built against a swappable adapter and a fake provider until then.
- [ ] Decide guest-facing copy language and tone (Phase 2).
- [ ] Visual design of the invitation itself. Separate conversation, no deadline, blocks nothing.

## Resolved since the vault version

- Fatan and Sita's Akad caps are 20 each. They previously read 0, which was a placeholder.
- VIP is a tier inside Resepsi, not a third event. Verified: zero VIP guests exist who are not also Resepsi guests.
- The sheet's "invitation quota 250 per side" block was misleading and has been deleted. Per-event caps are the only real ceiling.
- The 50 Akad-only guests on Fatan's side (Mama Fatan's extended family) are intentional, not a data gap.
- Guest grouping by the sheet's "Note" column is dropped for now. Nothing depends on it.
