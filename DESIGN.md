---
name: Sita & Fatan Wedding Ops
description: A calm two-density control room for running one wedding, in light and dark.
colors:
  monogram-oxblood: "#5E040E"
  monogram-blush: "#F2D6CB"
  ink-slate: "#0F172A"
  warm-paper: "#FCF7F5"
  surface-white: "#FFFFFF"
  wash-oxblood: "#F1EAE8"
  wash-oxblood-ink: "#5E040E"
  whisper-oxblood: "#F7F1EE"
  quiet-slate: "#617188"
  hairline-slate: "#E2E8F0"
  alarm-red: "#DC2626"
  alarm-red-dark: "#F87171"
  caution-amber: "#A85A04"
  caution-amber-dark: "#FBBF24"
  midnight-navy: "#0B1220"
  midnight-card: "#111A2E"
  midnight-ink: "#F1F5F9"
  midnight-wash: "#1E293B"
  midnight-quiet: "#94A3B8"
  midnight-wash-ink: "#DBEAFE"
  series-blue: "#2a78d6"
  series-orange: "#eb6834"
  series-green: "#0F7A54"
  series-gold: "#B07A00"
  series-pink: "#C25A82"
typography:
  display:
    fontFamily: "Fira Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(3rem, 14vw, 5rem)"
    fontWeight: 500
    lineHeight: 1
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Fira Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 500
    lineHeight: 1.3
  title:
    fontFamily: "Fira Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 500
    lineHeight: 1.375
  body:
    fontFamily: "Fira Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Fira Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.33
  numeral:
    fontFamily: "Fira Code, ui-monospace, monospace"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.4
    fontFeature: "tnum"
rounded:
  sm: "0.3rem"
  md: "0.4rem"
  lg: "0.5rem"
  xl: "0.7rem"
  pill: "9999px"
spacing:
  xs: "0.25rem"
  sm: "0.5rem"
  md: "0.75rem"
  lg: "1rem"
  xl: "1.5rem"
components:
  button-primary:
    backgroundColor: "{colors.monogram-oxblood}"
    textColor: "{colors.surface-white}"
    rounded: "{rounded.lg}"
    padding: "0 0.625rem"
    height: "2rem"
    typography: "{typography.body}"
  button-primary-hover:
    backgroundColor: "#3352C0"
    textColor: "{colors.surface-white}"
  button-primary-touch:
    backgroundColor: "{colors.monogram-oxblood}"
    textColor: "{colors.surface-white}"
    rounded: "{rounded.lg}"
    padding: "0 1rem"
    height: "2.75rem"
    typography: "{typography.body}"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.ink-slate}"
    rounded: "{rounded.lg}"
    padding: "0 0.625rem"
    height: "2rem"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink-slate}"
    rounded: "{rounded.lg}"
    padding: "0 0.625rem"
    height: "2rem"
  button-destructive:
    backgroundColor: "#FBE9E9"
    textColor: "{colors.alarm-red}"
    rounded: "{rounded.lg}"
    padding: "0 0.625rem"
    height: "2rem"
  badge-default:
    backgroundColor: "{colors.monogram-oxblood}"
    textColor: "{colors.surface-white}"
    rounded: "{rounded.pill}"
    padding: "0.125rem 0.5rem"
    height: "1.25rem"
    typography: "{typography.label}"
  badge-outline:
    backgroundColor: "transparent"
    textColor: "{colors.ink-slate}"
    rounded: "{rounded.pill}"
    padding: "0.125rem 0.5rem"
    height: "1.25rem"
  card:
    backgroundColor: "{colors.surface-white}"
    textColor: "{colors.ink-slate}"
    rounded: "{rounded.xl}"
    padding: "1rem"
  input:
    backgroundColor: "transparent"
    textColor: "{colors.ink-slate}"
    rounded: "{rounded.lg}"
    padding: "0.25rem 0.625rem"
    height: "2rem"
  input-touch:
    backgroundColor: "transparent"
    textColor: "{colors.ink-slate}"
    rounded: "{rounded.lg}"
    padding: "0.5rem 0.75rem"
    height: "2.75rem"
---

# Design System: Sita & Fatan Wedding Ops

## Overview

**Creative North Star: "The Operations Room"**

This is the room you step into to find out what is actually true. Not a celebration surface, not a mood board, not a keepsake. A wedding for 578 people is being run by two people with full-time jobs, and this interface is the console they run it from. Its job is to make status legible in one glance and to make the next action obvious in one more. Everything decorative that competes with those two jobs is a defect.

The room is calm on purpose. Surfaces are flat and quiet; almost the entire interface is slate and white, or slate and midnight. Color is not applied for identity or for warmth, it is spent, and it is spent only on three things: what you can act on, what needs attention, and what has already gone wrong. When you see color here it means something. That restraint is what lets a single red overdue card be genuinely alarming on a screen full of counts.

The room has two lighting conditions and both are real. Daylight is the laptop on a weekend with both of you planning a month together. Midnight is one thumb in bed with the phone at low brightness, which is when most of this actually gets used. The dark theme is hand-tuned rather than inverted, and it is not a preference toggle bolted on at the end. It is half of the product.

**Key Characteristics:**
- Flat surfaces, hairline rings, zero decorative shadow
- Slate and white, or slate and midnight; the monogram's oxblood reserved for action
- Two deliberate densities: dense desktop ops, comfortable phone touch
- Monospaced numerals so counts, dates and times align in columns
- Status carried by a pill, never by an icon alone or by color alone
- Hand-tuned dark theme of equal standing to light

## Colors

A near-monochrome slate system with one working color drawn from the wedding monogram, and two alarm colors that are never used decoratively.

### Primary
- **Monogram Oxblood** (`#5E040E` light / **Monogram Blush** `#F2D6CB` dark): The only color that means "you can act on this". Primary buttons, active navigation, focus rings, the current day in the calendar, and links. It is the exact oxblood of the couple's monogram, sampled from the invitation artwork, so the admin tool is recognisably part of this wedding to the four parents who use it. It is very dark and heavily desaturated, which keeps a screen of several buttons calm and keeps it separable from Alarm Red; a lighter oxblood would collide with red and must not be introduced. Dark mode spends the artwork's blush field instead, because a lightened oxblood would land on top of `#F87171`.

### Secondary
- **Wash Oxblood** (`#F1EAE8` light / `#1E293B` dark) with **Wash Oxblood Ink** (`#5E040E` light / `#F2D6CB` dark): The quiet tint. Secondary buttons, selected-but-inactive rows, table header bands, and the fill behind a chip that is on but not urgent.
- **Whisper Oxblood** (`#F7F1EE` light): The faintest possible surface tint. Hover states and the accent background. It should read as "something is happening here" without reading as a color choice.

### Tertiary
- **Caution Amber** (`#A85A04` light / `#FBBF24` dark): Attention that is not yet failure. Over-cap warnings, items due soon, a blocked task waiting on someone else. Amber says look at this today.
- **Alarm Red** (`#DC2626` light / `#F87171` dark): Actual failure or destruction. Overdue items, over-capacity errors that block, and delete actions. Red says something is already wrong.

### Neutral
- **Ink Slate** (`#0F172A`) and **Midnight Ink** (`#F1F5F9`): Primary text.
- **Quiet Slate** (`#617188` light / `#94A3B8` dark): Secondary text, metadata, timestamps, empty-state copy. Everything that is context rather than content.
- **Warm Paper** (`#FCF7F5`) and **Midnight Navy** (`#0B1220`): Page background. Never pure white and never pure black; both are chosen to be kind at 2am and under bright office light respectively. Warm Paper replaced the cool `#F8FAFC` on 2026-08-16. It sits on the invitation artwork's own hue line, the blush field `#F2D6CB` (hue 16.9deg), lightened to 97.5% so the page and the monogram read as one paper. The blush itself cannot serve as the background: at 87.3% lightness it puts Quiet Slate at 3.61:1 and Alarm Red at 3.51:1, both well under AA. Quiet Slate darkened one step in the same change to hold 4.5:1 on the lighter value. If the artwork's field moves again, this hue moves with it.
- **Surface White** (`#FFFFFF`) and **Midnight Card** (`#111A2E`): Raised surfaces. Cards, popovers, sheets, sidebar.
- **Hairline Slate** (`#E2E8F0` light / `#1E293B` dark): Every border, divider, ring and input stroke.

### Series
Five categorical slots, fixed order, re-stepped per theme rather than flipped: **Series Blue** (`#2a78d6`), **Series Orange** (`#eb6834`), **Series Green** (`#0F7A54`), **Series Gold** (`#B07A00`), **Series Pink** (`#C25A82`). Charts only. Green, gold and pink were re-stepped darker on 2026-08-16 after measuring 2.82:1, 2.17:1 and 2.69:1 against the card surface, under the 3:1 non-text minimum.

### Named Rules

**The Spent Color Rule.** Color is spent, not applied. Monogram Oxblood appears on well under 10% of any screen, and Amber and Red appear only when the data earns them. A screen where nothing is wrong should be almost entirely slate. If a screen is colorful at rest, the alarms have already stopped working.

**The Series-Stay-In-Charts Rule.** The five categorical hues exist for chart series and nothing else. Never use them to color-code a task category, an assignee, or a calendar chip. Categories are distinguished by label and shape, not by hue.

**The Never-Color-Alone Rule.** No state is ever communicated by color alone: overdue is red *and* the word overdue, done is muted *and* struck through, flagged is amber *and* a pin. Assume low brightness and a colorblind reader.

## Typography

**Display / Body Font:** Fira Sans (with `ui-sans-serif`, `system-ui`, `sans-serif`)
**Numeral / Mono Font:** Fira Code (with `ui-monospace`, `monospace`)

**Character:** Fira Sans is a workhorse humanist sans with unusually clear digits and a slightly technical set of terminals, so it stays legible at 12px in a dense table and does not turn precious when set large. Paired with Fira Code it gives the system one voice at two temperaments: prose in Sans, quantities in Code. The pairing is deliberately unromantic. The romance lives on the guest-facing invitation, not in the console.

### Hierarchy
- **Display** (500, `clamp(3rem, 14vw, 5rem)`, line-height 1, `-0.02em`): The countdown numeral and nothing else. It exists once per screen at most.
- **Headline** (500, 1.25rem, 1.3): Page titles and the header of a hero card.
- **Title** (500, 1rem, 1.375): Card titles, dialog titles, section headers.
- **Body** (400, 0.875rem, 1.5): Default for everything. Table cells, task titles, form values, descriptions. Long-form notes cap at 65–75ch.
- **Label** (500, 0.75rem, 1.33): Badges, chips, column headers, metadata, form labels.
- **Numeral** (400, 0.875rem, `tnum`, Fira Code): Counts, pax figures, dates, times, durations, day-of-month cells, the countdown.

### Named Rules

**The Tabular Numeral Rule.** Any number a person compares against another number is set in Fira Code with tabular figures. Guest counts, caps, remaining pax, times in a calendar gutter, days-until. Numbers that scan in a column must align in a column.

**The One Display Rule.** Display size is a singular event. If two things on a screen are set at display size, neither of them is important.

## Layout

The system runs on a 4px rhythm expressed through a small spacing set (4 / 8 / 12 / 16 / 24px), with 16px as the default card padding and 12px as the compact card padding.

Containers are full-width with page padding, not centered fixed-width columns; this is an application, not a document. Content organizes into cards that sit directly on the page background with a hairline ring, and cards stack in a single column below `md` and flow into a responsive grid above it. The breakpoint that matters is `md` (768px), and it is the line between the two densities, not merely a column-count change.

Below `md`, the interface assumes one thumb: primary actions sit within reach at the bottom of the screen rather than in a top toolbar, and horizontal scrolling is a failure rather than a strategy. Grids that cannot fit are re-expressed as lists rather than scrolled sideways.

### Named Rules

**The Two Densities Rule.** This system has exactly two densities and each owns its surfaces. *Ops density* is 32px controls, 12–16px padding, tight table rows: it governs the guest tables, filters and desktop admin screens where seeing many rows at once is the point. *Touch density* is a 44px minimum interactive target, 16px padding, and generous row height: it governs every planner surface on phone and every wedding-day usher screen. Choose the density from the surface and the device, never from personal taste, and never mix both inside one control group.

**The Thumb Rule.** On phone, anything used more than once per session lives in the bottom half of the screen. Destructive actions never do.

**The No-Sideways Rule.** Below `md`, no primary content scrolls horizontally. A seven-column grid becomes a list; a wide table becomes stacked cards.

## Elevation & Depth

This system has no shadow vocabulary and does not want one. Depth is expressed two ways: a hairline ring (`ring-1` at 10% foreground) that separates a card from the page, and a tonal step between the page background and the card surface. Both survive the dark theme intact, where conventional shadows turn to mud.

One exception exists, and it is narrow: layers that genuinely float above the page and can be dismissed, meaning dialogs, bottom sheets, and the floating action button. Those may carry a single soft ambient shadow, because on a phone a bottom sheet with no shadow reads as a page section rather than as something you can push away. Nothing else, ever.

### Shadow Vocabulary
- **float-ambient** (`box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12)` light, `0 8px 24px rgba(0, 0, 0, 0.45)` dark): Dialogs, bottom sheets, and the floating action button only.

### Named Rules

**The Ring, Not Shadow Rule.** Separation is a hairline plus a tonal step. If a surface needs a shadow to be distinguishable, the tonal step is wrong; fix the tone, not the depth.

**The Dismissible-Only Rule.** A shadow is a promise that the thing can be dismissed. If it cannot be dismissed, it does not get a shadow.

## Shapes

One corner family, `0.5rem` at its root, stepped down for small controls (`0.4rem`) and up for cards (`0.7rem`). The result is soft but not friendly: rounded enough to read as modern software, tight enough to keep dense tables from looking like a toy.

Borders are always hairline and always in the neutral border color; there are no heavy strokes, no double borders, and no colored outlines except the focus ring. Focus is a 3px ring in Monogram Oxblood at 50% opacity plus a solid border shift, and it is never removed.

### Named Rules

**The Pill Is Status Rule.** Fully-rounded pill geometry is reserved for badges and status chips. Nothing else in the system is a pill: not buttons, not inputs, not cards, not the FAB's label. When you see a pill, you are looking at a state, not at a control.

**The Focus-Is-Sacred Rule.** The focus ring is never suppressed, including on the calendar grid and on chips. Keyboard operation of the desktop planning session is a real workflow.

## Components

### Buttons
- **Character:** Precise and unshowy. A button looks like a surface you press, not like an object that wants attention.
- **Shape:** Gently curved (`0.5rem`), hairline transparent border, bold-free medium weight text at body size.
- **Primary:** Monogram Oxblood fill with white text, hover to 80% opacity of the same oxblood. Ops density is 32px tall with 10px horizontal padding; touch density is 44px tall with 16px.
- **Outline:** Transparent on a hairline border, hover fills with the muted wash.
- **Ghost:** No border at rest, hover fills with the muted wash. Default for icon actions inside dense rows.
- **Destructive:** Never a solid red fill. Red text on a 10% red tint, deepening to 20% on hover. Destruction should look serious, not celebratory.
- **Press:** Every enabled button translates down 1px on `:active`. This is the system's only reflexive motion and it is what makes it feel physical on a phone.
- **Focus:** 3px Monogram Oxblood ring at 50% plus a border shift. Never removed.

### Chips
- **Style:** Pill geometry, label typography, 20px tall in ops density and 28px on touch surfaces.
- **Variants:** Solid oxblood for a selected filter, wash-oxblood for a set-but-neutral value, tinted red or amber for overdue and flagged states, hairline outline for everything else.
- **State:** Selection is shown by fill change and never by border weight alone.

### Cards / Containers
- **Corner Style:** `0.7rem`, and the first and last child images clip to the card corners.
- **Background:** Surface White on Warm Paper; Midnight Card on Midnight Navy.
- **Ring:** A single hairline ring at 10% foreground. No shadow.
- **Internal Padding:** 16px default, 12px in the compact size, applied as one variable so header, content and footer stay aligned.
- **Footer:** When present, it sits flush to the card bottom on the muted wash at 50%, separated by a hairline. Footers are for actions, not for content.

### Inputs / Fields
- **Style:** Transparent fill on a hairline border, `0.5rem` corners, 32px tall in ops density and 44px on touch surfaces. Text is 16px on phone to prevent iOS zoom-on-focus and 14px from `md` up.
- **Focus:** Border shifts to Monogram Oxblood and a 3px 50% ring appears.
- **Error:** Border and ring turn Alarm Red via `aria-invalid`; the message sits below in label typography, in red, and states what to do rather than what failed.
- **Disabled:** 50% opacity with a filled muted background and no pointer events.

### Navigation
- **Style:** A sidebar on desktop, on the card surface, with a hairline right edge. Items are body-size at medium weight; the active item takes the wash-oxblood fill with wash-oxblood ink, not a colored bar.
- **Mobile:** The sidebar becomes a dismissible sheet. Primary navigation between the app's few destinations is thumb-reachable rather than hidden behind a top-left hamburger where possible.

### Data Display
- **Character:** The dense heart of the product. Tables carry hairline row separators, no zebra striping, no vertical rules, column headers in label typography in Quiet Slate, and every numeric column right-aligned in Fira Code.
- **Empty state:** One sentence in Quiet Slate stating what would appear here, plus the single action that would create the first one. Never an illustration.

## Do's and Don'ts

### Do:
- **Do** spend Monogram Oxblood on action and current-selection only, keeping it under roughly 10% of any screen.
- **Do** set every comparable number in Fira Code with tabular figures.
- **Do** pick the density from the surface: 32px controls for desktop ops tables, 44px minimum for planner and wedding-day touch surfaces.
- **Do** express separation with a hairline ring plus a tonal step.
- **Do** pair every color-coded state with a word or a shape, and assume a low-brightness screen at night.
- **Do** hand-tune every new dark value against Midnight Navy, the way the existing tokens and the chart series already are.
- **Do** keep the 1px press translate on interactive elements; it is the system's signature feedback.
- **Do** write empty states as one sentence plus one action.

### Don't:
- **Don't** add box shadows to anything that cannot be dismissed.
- **Don't** use the five chart series colors outside charts.
- **Don't** use pill geometry on anything that is not a status badge or chip.
- **Don't** fill a destructive button solid red; it is red text on a red tint.
- **Don't** suppress the focus ring, including on calendar cells and chips.
- **Don't** introduce a third typeface, a third density, or a second accent hue.
- **Don't** scroll primary content horizontally below 768px; re-express the grid as a list instead.
- **Don't** decorate this interface with wedding motifs, script faces, or blush palettes. That world belongs to the guest-facing invitation, and mixing them makes both weaker.
