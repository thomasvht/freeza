# Freeza – Product and visual design

Freeza is a freezer inventory for one household: two people, one freezer with
drawers, used on phones (tablet later). It answers three questions at the
freezer door: *what do we have, where is it, and what should we eat first?*
It also suggests recipes from what is in the freezer.

This document covers the product (features, screens, behaviour) and the visual
design. The technical design is in [ARCHITECTURE.md](ARCHITECTURE.md).

Decisions marked **(decided)** came from the owner. Decisions marked
**(builder's call, changeable)** were made while writing this document.

## 1. Goals, non-goals, anti-goals

**Goals**

- Both partners see the same, up-to-date inventory on their own phone.
- Adding an item takes under 15 seconds. Taking one out takes one tap.
- Nothing is forgotten until it is spoiled: items that must be used first are
  always visible at the top.
- Recipe ideas that use what is in the freezer, favouring what expires first.
- Feels like a native app: installable on the home screen, fast, works with
  one hand.
- Runs on free Cloudflare tiers.

**Non-goals (for now)**

- Multiple freezers or multiple households.
- Push notifications, shopping lists, barcode scanning, nutrition data.
- In-app accounts, sign-up or passwords. Cloudflare Access is the only gate
  **(decided)**.
- Full offline editing with conflict resolution.

**Anti-goals** (it works, but this would still be a failure)

- A form that feels like data entry. If adding food is a chore, the inventory
  goes stale and the app is useless.
- Pretty glass that you can't read in a bright kitchen.
- A recipe feature that suggests things that need ingredients the household
  doesn't have, with no way to see that.

## 2. Feature review

### Kept from the current app

| Feature | Change |
|---|---|
| Items: name, category, quantity, unit, storage date, expiry date, notes | Renamed: "Frozen on" and "Best before". Unit becomes a picker. Drawer added. |
| Category colours | Category list extended (see 4.2). |
| Expiry status: expired / expiring soon / fresh | One threshold: **14 days** for "use soon". The current code has 7 and 3 in different places. |
| Sorted by expiry | Kept inside each drawer group, and in the "Use first" strip. |
| Search and category filter | Kept, and fixed (the current filter never updates). |
| Totals footer | Replaced by counts in the section headers and in "Use first". |

### Removed

- Sign-up, login, Google sign-in, password screens and Firebase Auth.
- Firebase Hosting and Firestore.
- The per-browser `localStorage` copy of the data as a source of truth.
- The browser `confirm()` dialog on delete. Replaced by an undo toast.

### Added

| Feature | Why |
|---|---|
| **Drawers** **(decided)** | You need to know where to look, not just what you have. |
| **"−" take-one-out button** | The most common action at the freezer. One tap, no form. |
| **"Use first" strip** | Expired items and items within 14 days, always at the top. |
| **Best-before suggestion per category** | Nobody knows freezer shelf life by heart. |
| **Unit picker, metric only** | Free text produced "kg", "Kg", "kilo". |
| **Added by** | Cloudflare Access already tells the app who you are. |
| **Recipe ideas** **(decided)** | Three quick ideas using what's in the freezer. |
| **Name suggestions** | Typing "Min" suggests "Minced beef" with its last category, drawer and unit. |
| **Light and dark winter theme** **(decided)** | Follows the phone setting, with a manual override. |
| **Installable PWA** | Home-screen icon and full-screen app. |
| **Shared data that syncs** | Changes from one phone show up on the other. |

## 3. Users and key moments

Two adults sharing one kitchen freezer. Typical moments:

1. **Putting shopping or leftovers away.** Phone in one hand, a bag in the
   other. Opens Freeza, taps +, types "chi", picks "Chicken thighs" from the
   suggestions (category, drawer and unit pre-filled), sets quantity to 6,
   saves. Best before was filled in automatically.
2. **Taking something out for dinner.** Opens Freeza, finds the item in its
   drawer or with search, taps −. When the last one goes, the item disappears
   and an undo toast shows for 5 seconds.
3. **"What's for dinner?"** Opens the Recipes tab, optionally types
   "vegetarian" or "under 30 min", taps *What can I make?*, gets three ideas.
4. **Sunday check.** Looks at "Use first" to plan the week.

## 4. Product behaviour

### 4.1 Item

| Field | Rules |
|---|---|
| Name | Required, 1–60 characters, trimmed. |
| Category | Required, one of 4.2. |
| Drawer | Required, one of the household's drawers. |
| Quantity | Required, number > 0, step 1 for counted units and 0.1 for weights and volumes. |
| Unit | Required. One of: `piece`, `portion`, `bag`, `box`, `g`, `kg`, `ml`, `l`. Shown in the UI as pieces, portions, bags, boxes, g, kg, ml, l. |
| Pack size | Optional, number + `g`/`kg`/`ml`/`l`, only for the counted units. Shown as "2 × 500 g". |
| Frozen on | Required, defaults to today. |
| Best before | Required. Defaults to *frozen on* + the category's shelf life. Once the user changes it by hand, changing the category no longer overwrites it. |
| Notes | Optional, up to 200 characters. |
| Added by / updated by | Set by the server from the Access identity. Read-only. |

**Status:** *expired* when best before is before today. *Use soon* when it is
today or within the next 14 days. *Fresh* otherwise. "Today" is the phone's
local date.

**Take one out (−):** lowers the quantity by 1 for counted units. For `g`,
`kg`, `ml` and `l` it opens a small sheet with the amount to take out. At 0 the
item is removed and an undo toast shows for 5 s.

**Delete:** from the edit sheet. Undo toast for 5 s. No confirmation dialog.

### 4.2 Categories and suggested freezer life (builder's call, changeable)

At −18 °C, based on common food-safety guidance. These are quality guidelines,
not safety limits, and the user can always override them.

| Category | Colour token | Default shelf life |
|---|---|---|
| Meat | `--cat-meat` | 6 months |
| Poultry | `--cat-poultry` | 9 months |
| Fish | `--cat-fish` | 4 months |
| Vegetables & fruit | `--cat-veg` | 10 months |
| Bread & baked | `--cat-bread` | 3 months |
| Dairy | `--cat-dairy` | 4 months |
| Prepared meals | `--cat-prepared` | 3 months |
| Other | `--cat-other` | 6 months |

The defaults live in one shared module used by the client (suggestion) and the
server (validation of the category list).

### 4.3 Drawers

- New household starts with 3 drawers: "Drawer 1", "Drawer 2", "Drawer 3".
- Settings lets you rename, reorder, add and remove drawers (up to 10).
- Removing a drawer that still holds items asks which drawer they move to.

### 4.4 Sync between the two phones

- The app re-fetches the inventory when it opens, when it comes back to the
  foreground, and every 30 seconds while visible.
- Every change is applied optimistically on screen and sent to the API. If the
  API rejects it, the screen rolls back and a toast explains why.
- Taking one out is an atomic "decrement" on the server, so two people tapping
  − at the same time both count.
- Other edits are last-write-wins. That is acceptable for two people.

### 4.5 Offline

- The app shell and the last known inventory are cached, so the app opens and
  shows the inventory without signal.
- While offline, a banner says "Offline – changes are disabled", and add, edit,
  − and recipes are disabled (builder's call, changeable). Queued offline
  writes are out of scope.

### 4.6 Recipes

- Input: optional one-line preference (max 100 characters), for example
  "vegetarian", "kids", "under 30 min".
- Output: exactly 3 ideas **(decided)**. Each has:
  - a name
  - a time in minutes
  - the freezer items it uses, with expiring ones marked
  - a short "you'll also need" list of other ingredients
  - one or two sentences of method
- Ideas favour items that are expired or due to be used soon.
- The last result is kept on the device until the next request.
- At most 20 recipe requests per day for the household (ARCHITECTURE.md §6).
- When that cap or the daily free AI allowance is used up, show: "Recipe ideas are
  resting for today – try again tomorrow." No paid fallback.
- Recipes are suggestions only. They don't change the inventory.

### 4.7 Identity

- Cloudflare Access supplies the email of whoever is using the app.
- The display name defaults to the part of the email before `@` or `.`, with a
  capital letter. It can be changed in Settings.
- Shown as "Added by Thomas · 03/11/2026" in the edit sheet.

### 4.8 Formats

- Dates: `dd/MM/yyyy`. In compact places, `dd/MM`. Week starts Monday.
- Numbers: decimal comma (`0,5 kg`). Units are metric only.
- UI language: English (builder's call, changeable). All UI strings are kept in
  one file so the app can be translated later.

## 5. Screens

Navigation is a floating tab bar at the bottom: **Freezer**, a raised **+**
button, and **Recipes**. Settings opens from the top-right of Freezer.

### 5.1 Freezer (home)

From top to bottom:

1. **Top bar:** snowflake logo + "Freeza" on the left. On the right, a theme
   toggle and a settings button.
2. **Search field:** filters by name and notes as you type.
3. **Category chips:** a horizontally scrolling row. "All" plus one chip per
   category. One chip selected at a time.
4. **Use first:** a horizontally scrolling row of compact tiles (expired
   first, then use soon), with a count. Hidden when empty. Tapping a tile
   opens the item.
5. **Drawer groups:** a header per drawer (its name, e.g. "Top – meat", and
   the item count),
   then item cards sorted by best before. A toggle at the top switches the
   grouping between *By drawer* (default) and *By date* (one list).
6. **Item card:**
   - a colour bar for the category
   - the name
   - a meta line: "2 × 500 g · 09/11/2026"
   - a status chip: "Expired", "4 days" or "3 months"
   - a **−** button on the right (44 × 44 px minimum)

   Tapping the card opens the edit sheet.

**Empty states:**
- Empty freezer: a snowflake illustration with "Your freezer is empty – tap +
  to add the first item."
- No search results: "Nothing matches 'xyz'."

### 5.2 Add / edit sheet

A bottom sheet on phones and a centred dialog on tablets.

- The name field has autocomplete from earlier item names. Picking a
  suggestion fills category, drawer, unit and pack size.
- Category and drawer are chips.
- Quantity uses a stepper (−/+) next to the unit picker.
- Pack size is an optional field that shows only for counted units.
- Frozen on and best before are date fields. Best before shows "suggested"
  until edited.
- Notes.
- **Save** sticks to the bottom of the sheet. When editing, **Delete** appears
  as a text button.

### 5.3 Recipes

- Preference field and a **What can I make?** button.
- While loading: three skeleton cards with a frost shimmer.
- Results: three glass cards, laid out as described in 4.6. Expiring items in
  a card are highlighted with the use-soon colour.
- Errors: limit reached (4.6), offline, or a generic "Couldn't think of
  anything – try again."

### 5.4 Settings

- Theme: System / Light / Dark.
- Your display name.
- Drawers: rename, reorder, add, remove.
- About: app version.

### 5.5 Tablet (later)

Version 1 targets phones. On wider screens, version 1 shows the phone layout
in a centred column, at most 560 px wide, so nothing breaks (builder's call,
changeable).

The planned tablet layout for a later version:
- Item cards in a 2-column grid (3 columns from 1100 px).
- The sheet becomes a centred dialog.
- The tab bar stays at the bottom, centred, at most 480 px wide.

## 6. Visual design – "Glacier" **(decided)**

Crisp and icy: frosted glass on a deep-to-pale blue gradient, with a few snow
specks. Direction C of the mockups, chosen over "Frost Glass" and "Arctic
Clean".

### 6.1 Principles

1. **Glass on ice.** Content sits on translucent, blurred panels over a blue
   gradient background.
2. **Readable first.** Glacier was the lowest-contrast option in the mockups.
   Every text/background pair must meet WCAG AA (4.5:1 for body text, 3:1 for
   large text and icons). Where glass is too clear behind text, raise the
   panel's opacity. Don't darken the text.
3. **Calm motion.** Snow specks are static. There is no falling-snow animation.
4. **Thumb-first.** Primary actions sit in the bottom third of the screen.
   Touch targets are at least 44 × 44 px.

### 6.2 Colour tokens

Defined as CSS custom properties on `:root`. Dark values apply under
`@media (prefers-color-scheme: dark)` unless `[data-theme="light"]` is set, and
always under `[data-theme="dark"]`.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `radial-gradient(120% 70% at 20% 0%, #ffffff 0%, #bfe3f7 40%, #7fbfe6 100%)` | `radial-gradient(120% 70% at 20% 0%, #1f4a6e 0%, #0d2740 45%, #050d18 100%)` | Page background (fixed, does not scroll) |
| `--bg-solid` | `#bfe3f7` | `#0d2740` | `theme-color` meta tag; fallback |
| `--ink` | `#0b2236` | `#e9f6ff` | Main text |
| `--muted` | `#3f6683` | `#9cc3df` | Secondary text |
| `--glass` | `rgba(255,255,255,.45)` | `rgba(140,200,245,.12)` | Cards |
| `--glass-strong` | `rgba(255,255,255,.62)` | `rgba(140,200,245,.18)` | Tab bar, sheets, inputs |
| `--glass-border` | `rgba(255,255,255,.7)` | `rgba(180,225,255,.25)` | 1 px borders on glass |
| `--blur` | `22px` | `22px` | `backdrop-filter: blur()` |
| `--shadow` | `0 10px 30px rgba(20,80,130,.22)` | `0 12px 30px rgba(0,0,0,.45)` | Cards, tab bar |
| `--accent` | `#0f7fc9` | `#48b0f0` | + button, primary buttons, links |
| `--accent-ink` | `#0b5d96` | `#a8dcff` | Active tab, accent text |
| `--accent-soft` | `rgba(255,255,255,.5)` | `rgba(72,176,240,.18)` | − button background |
| `--fresh` | `#1d7a5a` | `#7fdcb5` | Fresh chip text (chip background: same colour at 14–16 % alpha) |
| `--soon` | `#a8650a` | `#f3c27a` | Use-soon chip and tile |
| `--expired` | `#b4323f` | `#f59aa6` | Expired chip and tile |

Category colours (`--cat-*`) are mid-saturation hues that read on both
backgrounds:

| Token | Colour |
|---|---|
| `--cat-meat` | `#e06a6a` |
| `--cat-poultry` | `#e89a5a` |
| `--cat-fish` | `#4aa3c9` |
| `--cat-veg` | `#4fb37f` |
| `--cat-bread` | `#c9a05a` |
| `--cat-dairy` | `#e3c55a` |
| `--cat-prepared` | `#9a7fd6` |
| `--cat-other` | `#8a9aab` |

The builder must check all values above with a contrast tool and adjust them to
meet 6.1.2. These values are the starting point, not the end point.

**Fallback:** when `backdrop-filter` is not supported (`@supports not`), glass
becomes solid. Light uses `#e8f4fb` cards; dark uses `#13304a` cards.

### 6.3 Typography

- **Manrope**, self-hosted (bundled with the app, so it works offline), weights
  400, 600, 700 and 800.
- App title: 22 px / 800, letter-spacing −0.02 em.
- Section labels: 11 px / 800, uppercase, letter-spacing 0.09 em, `--muted`.
- Item name: 15 px / 700. Meta text: 12 px / 500. Body text: 15 px / 400.
- Inputs are at least 16 px, so iOS doesn't zoom in on focus.

### 6.4 Shape, space, elevation

- Radii: cards 18 px, tiles and inputs 14 px, buttons 12 px, tab bar 22 px,
  sheets 24 px (top corners).
- Spacing scale: 4 / 8 / 12 / 16 / 24 / 32 px. Page gutter: 16 px.
- Respect safe-area insets (`env(safe-area-inset-*)`) for the notch and the
  home indicator.

### 6.5 Iconography and imagery

- Line icons, 2 px stroke, rounded caps (Lucide).
- The logo is a 6-armed line snowflake in `--accent`.
- The app icon is a white snowflake on the light `--bg` gradient. It needs a
  maskable variant for Android.
- Snow specks: a static layer of 6–10 small dots behind the content, opacity
  1 in light mode and 0.5 in dark mode.

### 6.6 Motion

- Sheets slide up over 220 ms with ease-out. Toasts fade and rise over 160 ms.
- When an item is taken out and its quantity changes, the number ticks over.
- Skeleton shimmer while recipes load.
- Under `prefers-reduced-motion: reduce`, all motion becomes an instant change
  or a fade.

### 6.7 Theme switching

- The default follows the phone's setting.
- The toggle in the top bar cycles System → Light → Dark. The choice is stored
  on the device.
- The choice is applied as `data-theme` on `<html>` before first paint, so the
  wrong theme never flashes.
- `<meta name="theme-color">` follows the active theme.

## 7. Accessibility

- WCAG 2.2 AA contrast (6.1).
- Every interactive element is reachable by keyboard and has a visible focus
  ring (2 px `--accent`, 2 px offset).
- Icon-only buttons have an `aria-label`. For example: "Take one Minced beef
  out".
- Status is never shown by colour alone. The chip always has text.
- Toasts use `aria-live="polite"`.
