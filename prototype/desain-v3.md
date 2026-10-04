# Lifestore design system v3 (from the user's 5 references)

Reference images are in `ref/ref1.png` … `ref/ref5.png`. Look at all of them before you start.
- ref1: PosyMart (teal sidebar, KPI cards with round icons, photo grid with + buttons, "Current Sale" panel, big Pay button)
- ref2: dark food app (round category images, cart with a Delivery / Dine In / Takeaway segmented control)
- ref3: Resto (order line cards with colored status pills, explore menu, lavender order panel, black pill buttons)
- ref4: French restaurant POS (white, category tiles with icons, food photos, green pill "+ Ajouter" buttons, order summary on the right)
- ref5: CosyPOS (dark mode, each category its own PASTEL color, menu cards with a left color stripe matching the category, table/order bar at the bottom)

Their shared language is what we take: an icon sidebar, food visuals in every menu card, categories as colorful tiles, pastel colors per category, rounded cards with soft shadows, pill buttons, solid colored status pills, segmented control by order type, an order panel on the right with a large pay button. It must look lively and modern, NOT plain.

## Tokens (replace the old :root block entirely; remove the old palette picker `.palet` / palet.js and `[data-palette]` CSS)
- Font: Plus Jakarta Sans 400/500/600/700/800 from Google Fonts (`https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap`). Numbers: `font-variant-numeric: tabular-nums` (no separate mono font).
- Light (default):
  - `--bg:#eef3f1` (outer canvas)
  - `--surface:#ffffff`
  - `--surface-2:#f4f7f6`
  - `--line:#e6ecea`
  - `--line-strong:#d3dcd9`
  - `--fg:#14201c`
  - `--muted:#64736d`
  - `--faint:#9aa8a2`
  - `--accent:#0f9f7f`
  - `--accent-ink:#fff`
  - `--accent-soft:#dff5ee`
  - `--accent-strong:#0b7d64`
  - `--ink:#14201c` (black pill buttons, like ref3)
  - status colors:
    - `--warn:#c27803` / `--warn-soft:#fff1d6`
    - `--danger:#e0445c` / `--danger-soft:#ffe3e8`
    - `--ok:#16a34a` / `--ok-soft:#dcfce7`
    - `--info:#2f6fe4` / `--info-soft:#e0ebff`
  - radius: `--radius:20px`, `--radius-md:14px`, `--radius-sm:10px`
  - `--shadow:0 1px 2px rgba(16,40,32,.04),0 10px 30px rgba(16,40,32,.07)`
- Category pastels (the same in both themes; text on them is always `#14201c`):
  - `--c-peach:#ffd9c2`
  - `--c-lemon:#fff0b3`
  - `--c-sky:#cfe6ff`
  - `--c-lilac:#e6d9ff`
  - `--c-mint:#c9f2df`
  - `--c-pink:#ffd6e7`
  - `--c-sand:#efe4d6`
- Dark (CosyPOS feel), using the required pattern: `@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){…}}` and again under `:root[data-theme="dark"]{…}`, `color-scheme:dark`.
  - `--bg:#0f1211`
  - `--surface:#181c1b`
  - `--surface-2:#202625`
  - `--line:#2a3230`
  - `--line-strong:#37413e`
  - `--fg:#eef3f1`
  - `--muted:#9eaca7`
  - `--faint:#6b7873`
  - `--accent:#34d3a6`
  - `--accent-ink:#06261d`
  - `--accent-soft:#143a30`
  - `--accent-strong:#5fe0bb`
  - `--ink:#eef3f1` (so ink buttons become light pills with `--bg`-colored text)
  - status softs become dark tints:
    - `--warn:#f5b54a` / `--warn-soft:#3a2c10`
    - `--danger:#ff7b8f` / `--danger-soft:#3d1a21`
    - `--ok:#4ade80` / `--ok-soft:#123222`
    - `--info:#7fa8ff` / `--info-soft:#16264a`
  - The pastels stay pastel, as in CosyPOS.
- `body` gets an explicit background.

## Components
- **App shell (kasir and dapur on wide screens):** a left sidebar about 232px wide on a `--surface` card (ref1/ref4).
  - Brand at the top: a round accent logo mark and "Lifestore".
  - Nav items with inline SVG stroke icons (Lucide-style, 1.75 stroke, 20px). The active item is an `--accent-soft` pill with `--accent-strong` text.
  - A user card at the bottom (avatar circle with initials, name, role).
  - Sidebar items can be decorative; the switcher remains the real navigation.
  - Between 768 and 1100px the sidebar collapses to 76px icons only. Below 768px it is hidden and the layout stacks.
- **Top bar:** a greeting ("Selamat siang, Rina 👋" + a small muted subtitle), a pill search box with a search icon, and round icon buttons (bell with a count badge, online status).
- **Category tiles:** each category gets a pastel and an emoji or icon.
  - Either a tile row (ref4/ref5: rounded 16px tile, emoji 24px, name, "8 menu" muted) or round chips (ref2).
  - The active tile gets a 2px accent ring or an ink background.
- **Menu card:**
  - A visual area on top, tinted with the category pastel, with a large emoji (40–56px) centered (no external images are allowed, so emoji is our "photo").
  - Below it: the name in 600 weight, the price in 700 weight, and a round accent "+" button 32px bottom right (ref1), or a full-width pill "+ Tambah" (ref4).
  - Sold out: grayscale emoji, "Habis" pill.
  - Variant: small muted text.
  - CosyPOS stripe: a 4px left border in the category pastel is OK in lists.
- **Order panel (right):** a white card with radius 20px.
  - Header: "Pesanan saat ini" + table / order #.
  - Segmented control Dine-in · Bawa pulang · Ojol (a pill track `--surface-2` with an active pill `--surface` + shadow, or an ink active pill).
  - Lines: an emoji thumbnail in a 44px pastel rounded square, name and modifiers, a round − qty + stepper, line price, and a trash icon.
  - Summary rows, then a big total (800 weight, 28px).
  - Primary pay button: full-width pill, accent background, 52px tall, "Bayar Rp80.850".
  - Secondary buttons are `--surface-2` pills.
- **Status pills (ref3):** solid soft background with colored text, 999px radius, 12–13px 600 weight.
  - Antre = info
  - Dimasak = warn
  - Siap = ok
  - Terlambat = danger (solid danger background with white text when late)
  - Batal = danger-soft + strikethrough
  - Lunas = ok
  - Belum dikirim = warn
- **KPI cards (ref1), where it makes sense** (kasir header, dapur header): a round 40px soft-colored icon circle, label, big number, and a small "↑ 12% dari kemarin" in ok color.
- **Order-line cards (ref3), for kasir open bills / dapur tickets:** white cards with the customer or table, the item count, the time ago, and a status pill; horizontally scrollable on narrow screens.
- **Buttons:** pills (radius 999px), min-height 44px for touch. Primary = accent. Strong = ink. Quiet = surface-2.
- **Inputs:** pill or radius 14px, `--surface-2` fill, no heavy border, accent focus ring.
- **Modals and sheets:** radius 24px, soft shadow, a backdrop of `rgba(10,20,16,.35)` with a blur of 4px.
- **The variant switcher** (existing, bottom center): keep the behavior; style it as an ink pill.
- **Motion:** 150ms transitions on hover and press (`transform: scale(.98)` on press). Respect `prefers-reduced-motion`.

## Emoji map for the menu (use consistently across all three prototypes; extend sensibly for other items)
Nasi Goreng 🍛, Ayam Bakar 🍗, Mie Goreng 🍜, Sop Buntut / Soto 🍲, Gado-gado 🥗, Tahu Cabe Garam 🌶️, Pisang Goreng 🍌, Kentang Goreng 🍟, Es Teh 🧋, Es Jeruk 🍊, Kopi Susu ☕, Air Mineral 💧, Perkedel 🥔, Sambal 🌶️, Es campur / dessert 🍧, Pudding 🍮, Kerupuk 🍘, Sate 🍢, Ikan 🐟, Udang 🍤, Nasi putih 🍚.
Category → pastel + emoji:
- Makanan / Makanan utama: peach 🍛
- Camilan: lemon 🍟
- Minuman: sky 🧋
- Penutup: lilac 🍮
- Kuah: mint 🍲
- Bakar: pink 🍗
- Wajan: sand 🍳
- Dingin / Bar: sky 🧊
- ojol channels: GoFood mint, GrabFood mint/green, ShopeeFood peach

## Hard constraints (the page is published as a claude.ai Artifact)
- The file starts with `<title>`; no doctype, html, head or body tags (keep the file's current structure).
- The only external resource is the Google Fonts stylesheet link. No other CDNs, no images by URL. Inline SVG and emoji are fine.
- No alert, confirm or prompt dialogs.
- Works at 390px phone width with a 16px side gutter and no horizontal page scroll. Both light and dark themes must look right.
- Every interactive element is keyboard reachable with a visible focus ring.
- Keep ALL existing behavior, data, flows, modals, demo controls and the 3 variants (A/B/C via `location.hash` + switcher + arrow keys). This is a visual redesign; do not drop features. You may restructure the markup templates freely to fit the new look. The three variants must still be radically different layouts from each other.
- Indonesian UI copy stays Indonesian.
- localStorage, if used at all, goes inside try/catch.
