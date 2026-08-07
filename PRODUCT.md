# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Fatan and Sita (role `admin`).** The couple getting married on 10 October 2026, in Indonesia. They run every part of the wedding themselves alongside two full-time jobs each. They are the only users of the planner; they are also the only users who see the whole guest system.

**The four parents (role `inviter`).** Mama Fatan, Papa Fatan, Mama Sita, Papa Sita. Each manages only the guests they personally invited, including filling in missing phone numbers for their own list. Not technical users. Not planner users.

**Wedding-day helpers (role `usher`).** Volunteers at the Resepsi door and the souvenir station on 10 October. They use one screen, once, under time pressure, on a phone, standing up.

**Numbers consumers (role `viewer`).** Wedding organizer (Ohana Enterprise), caterer, vendors. Read-only headcounts.

Login is username and password, created and handed over by an admin. No self-signup, no magic link, no OTP. Password reset is admin-initiated.

## Product Purpose

One place that runs this wedding.

Two halves, one product:

1. **Guest system.** Replaces a Google Sheet tracking roughly 330 guest entries and 578 pax across two families. Handles invitation delivery, RSVP, per-inviter capacity caps, a waiting list, day-of check-in for Akad and Resepsi separately, and one-souvenir-per-guest enforcement.
2. **Planner.** Replaces a markdown to-do list in an Obsidian vault that only Fatan can open. Tracks the dated work of getting to the wedding: vendor deadlines, fittings, bookings, payments, and appointments.

Success for the guest system: nobody is counted by hand, and nothing breaks at the door on the day.

Success for the planner: **there is exactly one place to look.** Today the same commitment can live in an Obsidian note, a Google Sheet, a Google Calendar entry, and a WhatsApp thread with a vendor, and no copy is authoritative. The planner wins only by being the single obvious place, which means capture must be faster than opening WhatsApp.

## Positioning

Not a wedding-planning SaaS and not a general to-do app. It is built against this specific wedding's real constraints, which generic products do not model: a two-sided Indonesian guest list where capacity is capped per inviting parent per event, two ceremonies with independent attendance (Akad and Resepsi), a VIP tier that exists only inside Resepsi, and a household where the two organizers work full time and coordinate mostly by phone.

## Operating Context

**Planner usage happens in three confirmed scenes, all of which must work:**

1. **Phone, at night, in bed, one hand, low light.** The end-of-day check and the moment things get captured before being forgotten. This is the dominant scene.
2. **Phone, mid-conversation with Sita or a vendor.** Reaching for the app while talking. Capture must complete in seconds; "what is next" must be readable at a glance and out loud.
3. **Laptop, weekend, both of them together.** The planning session where a month gets reshuffled. This is where a real desktop layout earns its keep.

Phone is the primary device. Desktop is the secondary, deliberate one.

Guest-system usage differs: parents use it on phones at their own pace over weeks; ushers use it for a few hours on 10 October, standing, in a venue, possibly on poor signal.

Existing tools this replaces or coexists with: Google Sheets (guest list, imported once then retired), an Obsidian vault note (`Wedding To-Do List.md`, imported once then retired), Google Calendar (deliberately not integrated), WhatsApp (stays, as the human channel, not as a record).

Working language is English for interface labels, with Indonesian domain terms kept verbatim because they have no English equivalent in use: Akad, Resepsi, seserahan, mahar, undangan, souvenir.

## Capabilities and Constraints

Confirmed:

- Roles: `admin`, `inviter`, `usher`, `viewer`, enforced by Postgres row-level security, not by UI hiding.
- Guest capacity is capped per inviter per event; every higher rollup derives from that single enforcement point.
- Akad and Resepsi attendance are tracked independently. A guest may be invited to one, the other, or both.
- Souvenirs are one per guest entry, not per pax, and not per event.
- Waiting list exists because the current list is already over cap on several inviters.
- WhatsApp sending is behind an adapter with a `fake` provider; no gateway is committed.
- Planner is admin-only. Parents, ushers, and viewers never see it.
- Planner has no Google Calendar integration, no email, and no push. Reminders are in-app only. This is a deliberate decision, not a gap to be closed later.
- Planner tracks two kinds of thing: dated tasks that get completed, and appointments that occupy time. Both appear on the same calendar.
- Business rules live in a pure domain layer with no IO, tested with Vitest. Anything that touches Supabase lives in repositories and server actions.
- Hosting is Vercel. There is no server to operate and no time to operate one.

Undecided, and not to be invented:

- WhatsApp gateway provider.
- Whether the planner gains recurring tasks. Nothing in the confirmed scope requires them.

## Brand Commitments

The product is named for the couple: Sita and Fatan, wedding date 10 October 2026. Existing artifacts that predate the app and remain binding: the wedding monogram, the wedding hashtag, and the invitation domain.

Voice is plain and direct. This is a tool two tired people use late at night, not a celebration surface. Warmth belongs to the guest-facing invitation, not to the admin interface.

## Evidence on Hand

- Real guest data: `fatan.xlsx` and `sita.xlsx` at the project root, plus the live Google Sheet they came from. Roughly 330 entries, 578 pax, as of 2026-08-01. Only 37 entries carry a phone number.
- Real planner data: about 20 items with real dates spanning July to October 2026, from the vault's `Wedding To-Do List.md`. Roughly half are three-day date blocks ("due end of July"), not single dates. Roughly a quarter are already done. At least one is a real blocker with no owner and no date (parents' attire, after vendor stock ran out).
- Real vendors already engaged: Ohana Enterprise (wedding organizer), Michelle Dekorasi (decoration), Casa de Eunoia (attire), plus accommodation.
- Real fixed dates: prewedding shoot 24 August 2026, last fitting early September 2026, wedding 10 October 2026.
- No usage analytics, no user research, no testimonials, no benchmarks. None exist. Do not fabricate them.

## Product Principles

1. **One place, or it failed.** Every feature is judged by whether it removes a reason to look somewhere else. A feature that adds a second place to check is a regression.
2. **Capture beats organization.** Getting a thing into the app while talking to a vendor matters more than that thing being perfectly categorized. Structure can be added later; a forgotten commitment cannot be recovered.
3. **The phone at night is the real device.** Desktop is where a month gets reshuffled, but the default assumption is one thumb, low light, and low patience.
4. **Surface the thing that is about to hurt.** Overdue and blocked items outrank completed counts and pretty summaries. The interface's job is to be uncomfortable about the right things.
5. **Two months of runway, then a real deadline.** 10 October 2026 does not move. Scope decisions favor shipping something used in August over something complete in October.

## Accessibility & Inclusion

No formal standard is mandated. Two product-specific requirements are confirmed by the operating context: the interface must be usable one-handed on a phone in low light, and the usher check-in screens must be operable quickly by volunteers who have never seen the app before, standing, under time pressure.
