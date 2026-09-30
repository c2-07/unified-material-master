# Unified Material Code - Design System (Cloudflare Theme)

## 1. Identity & Theme
We are building a highly functional, utility-first B2B dashboard for CPSEs and the Ministry. The aesthetic closely mirrors the **Cloudflare Dashboard**: professional, dense, clean, and highly readable. 

### Typography
Following professional typography principles for dense UI:
- **Primary Font**: `Inter` (or system-ui fallback).
- **Base Size**: 14px (0.875rem) for data tables and dense UI; 16px (1rem) for reading text.
- **Weights**: 400 (Body), 500 (Table Headers/Labels), 600 (Headings/Buttons).
- **Line Height**: Tighter (1.2 - 1.4) for UI elements, 1.5 for paragraphs.

### Color Palette (Tailwind Configuration)
- **Brand (Orange)**: `#f38020` (Cloudflare-like orange for primary brand accents).
- **Action (Blue)**: `#0051c3` (Primary links, active states, main CTA buttons).
  - Hover: `#003682`
- **Backgrounds**:
  - `bg-gray-50` (`#f9fafb`) - Main application background.
  - `bg-white` (`#ffffff`) - Card surfaces, modals, dropdowns.
- **Text**:
  - `text-gray-900` - Primary headings and crucial data.
  - `text-gray-600` - Secondary text, descriptions, table column headers.
- **Borders**: 
  - `border-gray-200` (`#e5e7eb`) - Subtle borders for cards and tables.
- **Status Colors**:
  - Success: `#007300` (bg: `#e6f2e6`)
  - Warning: `#c45f00` (bg: `#fff3e6`)
  - Error: `#bd0000` (bg: `#ffe6e6`)

## 2. Surfaces & Geometry
- **Cards**: White background, `border border-gray-200`, `shadow-sm`, and tight corners (`rounded-md` or 4px radius). Cloudflare uses very subtle boxing rather than heavy shadows.
- **Inputs & Controls**: White background, 1px solid gray border, blue focus ring (`focus:ring-2 focus:ring-blue-500 focus:border-blue-500`).
- **Buttons**:
  - *Primary*: Blue background, white text, no border.
  - *Secondary*: White background, gray text, gray border.
  - *Ghost*: Transparent background, blue text (for table actions).

## 3. Layout Structure
- **Sidebar**: Fixed left navigation (dark or light, usually white with gray borders in modern CF). Contains logo and navigation links.
- **Top Bar**: User profile, CPSE name context, breadcrumbs.
- **Main Content**: Fixed max-width or fluid container with standard 24px/32px padding (`p-6` or `p-8`).

## 4. Components
- **Data Tables**: Striped rows or simple bordered rows. Left-aligned text, right-aligned numbers.
- **Badges**: Small pill-shaped tags for `Status` (e.g. `PENDING`, `ACTIVE`).
- **Forms**: Vertical stack, labels above inputs, 14px label size, 14px input text.
