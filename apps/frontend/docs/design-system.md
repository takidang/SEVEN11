# Design system

The visual language is measured from https://7-eleven.vn (see
[`../../../docs/research/7-eleven-vn.md`](../../../docs/research/7-eleven-vn.md)) and
extended for the back office. **Read this before building or restyling UI.** Tokens live in
[`src/app/globals.css`](../src/app/globals.css).

## Principles

1. **Look like a real convenience-store product, not a template.** Clean white surfaces,
   product photos do the talking, brand colour is an accent — never a wash.
2. **One meaning per colour** (table below). If a colour means "danger" somewhere, it never
   decorates something else.
3. **Vietnamese copy, full diacritics, sentence case.** No English UI strings, no lorem ipsum,
   no "Coming soon" placeholders.
4. **Consistency over creativity.** Reuse the shared components before inventing a variant.

## Colour tokens

| Token (Tailwind)                  | Hex                    | Means                                                                  |
| --------------------------------- | ---------------------- | ---------------------------------------------------------------------- |
| `brand` / `primary`               | `#007350`              | Primary actions, selected state, prices on product page, category bars |
| `brand-soft`                      | `#e6f2ed`              | Tinted backgrounds for brand items (icon wells, selected rows)         |
| `fresh`                           | `#09af4c`              | "Giao 24 phút", quick-add, in stock, success                           |
| `orange`                          | `#f56f20`              | HOT badge, countdown, pending attention                                |
| `red`                             | `#e4202a`              | Flash sale, out of stock, destructive                                  |
| `sale` on `sale-soft`             | `#c2410c` on `#fdf3c4` | Discount tag `-34%`                                                    |
| `warning` on `warning-soft`       | `#b45309` on `#fef3c7` | Low stock, expiring soon                                               |
| `info` on `info-soft`             | `#1d4ed8` on `#e8efff` | In progress (confirmed, delivering)                                    |
| `surface`                         | `#f5f6f7`              | Back-office canvas behind white panels                                 |
| `tier-bronze/silver/gold/diamond` |                        | Member tiers (use `TIERS[tier].className` chips)                       |

Text: `foreground` `#1f2937`, `muted-foreground` `#6b7280`. Borders: `border` `#e5e7eb`.
Never put brand/fresh/orange **text** on a coloured fill of the same hue at low contrast — use the
`*-soft` background with the darker text shown in `StatusBadge`.

## Typography

Roboto (Vietnamese subset) everywhere; Roboto Mono only for codes where alignment matters
(barcodes, receipt). Big promotional headlines use Roboto's width axis at 75%, black, italic,
uppercase (`<Headline>`). The logo itself is artwork, not text: `<LogoMark>` (square, `size-*`)
and `<Wordmark>` (height follows the font size, so size it with `text-*`) render the transparent
PNGs in `src/assets/brand` — keep them on white or light surfaces.

| Use                      | Class                                                                  |
| ------------------------ | ---------------------------------------------------------------------- |
| Back-office page title   | `text-2xl font-bold tracking-tight` (via `<PageHeader>`)               |
| Storefront section title | `text-lg font-bold` (via `<SectionHeading>`)                           |
| Panel title              | `text-[15px] font-semibold` (via `<Panel>`)                            |
| Body                     | `text-sm` (back office), `text-sm`–`text-base` (storefront)            |
| Meta / helper            | `text-xs text-muted-foreground`                                        |
| Prices in cards          | `text-[15px] font-bold` ; product page `text-2xl font-bold text-brand` |

Numbers that line up in columns get the `tabular` utility (DataTable does it for
`meta.align: "right"`). Big standalone numbers (stat cards) stay proportional.

## Shape, spacing, elevation

- Radius: cards/panels `rounded-xl`, inputs/buttons `rounded-lg` (shadcn default), chips/pills
  `rounded-full`, product photos `rounded-lg`.
- Borders: `ring-1 ring-border` on white cards instead of shadows. Hover on storefront cards may
  add `shadow-[0_8px_24px_-12px_rgba(0,0,0,0.25)]`. No heavy drop shadows, no glass, no
  gradients in the back office.
- Spacing: storefront sections `space-y-8`; back-office pages `space-y-6`; panel body `p-4`;
  grids `gap-3` (products) / `gap-4` (stat cards, panels).

## Storefront patterns

- **Frame**: sticky header (Giao đến · search · cart · account), 256px category rail on `lg+`,
  footer. Already in `app/(shop)/layout.tsx`.
- **Product card**: `<ProductCard>` only. Grid: `<ProductGrid>`; horizontal rows: `<ProductRail>`.
- **Section**: `<SectionHeading title chips href>` then a rail or grid.
- **Chips**: white with `ring-brand/25` and brand text; active = solid brand.
- **Badges on photos**: `MỚI` (brand), `FLASH SALE` (red), `18+` (dark).
- **Banners**: build them in code with brand colours, a condensed headline and product photos.
  Do **not** hotlink 7-Eleven campaign artwork.
- **Buttons**: primary actions `h-10`–`h-11` full-width on mobile; the round green `+` for quick add.
- **Empty states**: icon in a `muted` circle, one line of explanation, one action.

## Back-office patterns

- **Frame**: shadcn Sidebar (collapsible to icons) + 56px header with store switcher. Canvas
  `bg-surface`, content max-width 1400px.
- **Page**: `<PageHeader title description actions>` → optional stat row
  (`<StatCard>` in `grid gap-4 sm:grid-cols-2 lg:grid-cols-4`) → toolbar → `<DataTable>` or
  `<Panel>`s.
- **Toolbar** (above a table, never inside a chart card): search `Input` with a leading
  `SearchIcon` (w-64), `Select` filters, status `ToggleGroup`/`Tabs`, and a result count.
  One filter row scopes everything below it.
- **Detail / quick edit**: right `Sheet` — widen it with
  `className="data-[side=right]:w-full data-[side=right]:sm:max-w-xl"` (a plain `sm:max-w-xl` loses to
  the primitive's own `data-[side=right]:sm:max-w-sm`). Create forms: `Dialog` or `Sheet`.
  Destructive confirmations: `AlertDialog`.
- **Statuses**: `<StatusBadge tone>` with labels from `lib/order-status` — always text + dot,
  never colour alone.
- **Read-only roles**: hide or disable edit actions with `canManage(role, module)`; don't show
  buttons that fail.
- **Density**: shadcn "nova" sizes (buttons `h-8`, `text-sm`). Tables `py-2.5` rows.

## Charts

Recharts through shadcn `ChartContainer`. Palette validated for colour-vision deficiency:

| Slot | Token       | Hex       |
| ---- | ----------- | --------- |
| 1    | `--chart-1` | `#007350` |
| 2    | `--chart-2` | `#e8641c` |
| 3    | `--chart-3` | `#2f7ed8` |
| 4    | `--chart-4` | `#c28a12` |
| 5    | `--chart-5` | `#9b59b6` |

Rules: assign slots in this fixed order and keep a series' colour when filters change; a single
series uses slot 1 and needs no legend; ≥2 series always get a legend; pie/donut max 3 slices
(otherwise use a bar chart); **never a dual axis**; bars ≤24px thick with 4px rounded ends;
lines 2px; area fill ~10% opacity; hairline solid gridlines; tooltip on hover; text never wears
the series colour; every chart has the numbers available as labels or a table next to it.

## Don'ts

- Emoji as icons (use `lucide-react`).
- Purple/neon gradients, glassmorphism, "AI dashboard" chrome.
- Raw `<img>` for products (use `<ProductImage>`), `next/image` for CDN images.
- Hard-coded hex colours in components — use tokens.
- Recomputing prices/totals by hand — use `priceCart` / `displayPrice`.
