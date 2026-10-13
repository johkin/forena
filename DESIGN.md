---
name: Förena Team System
colors:
  surface: '#faf9f3'
  surface-dim: '#dbdad4'
  surface-bright: '#faf9f3'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f5f4ee'
  surface-container: '#efeee8'
  surface-container-high: '#e9e8e2'
  surface-container-highest: '#e3e3dd'
  on-surface: '#1b1c19'
  on-surface-variant: '#424840'
  inverse-surface: '#30312d'
  inverse-on-surface: '#f2f1eb'
  outline: '#737970'
  outline-variant: '#c2c8be'
  surface-tint: '#446744'
  primary: '#07290c'
  on-primary: '#ffffff'
  primary-container: '#1e3f20'
  on-primary-container: '#86ab83'
  inverse-primary: '#aad1a6'
  secondary: '#5b6300'
  on-secondary: '#ffffff'
  secondary-container: '#e0eb78'
  on-secondary-container: '#616a00'
  tertiary: '#391b00'
  on-tertiary: '#ffffff'
  tertiary-container: '#582d00'
  on-tertiary-container: '#ee881f'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#c5edc1'
  primary-fixed-dim: '#aad1a6'
  on-primary-fixed: '#012106'
  on-primary-fixed-variant: '#2d4e2e'
  secondary-fixed: '#e0eb78'
  secondary-fixed-dim: '#c3ce5f'
  on-secondary-fixed: '#1a1d00'
  on-secondary-fixed-variant: '#444b00'
  tertiary-fixed: '#ffdcc3'
  tertiary-fixed-dim: '#ffb77d'
  on-tertiary-fixed: '#2f1500'
  on-tertiary-fixed-variant: '#6e3900'
  background: '#faf9f3'
  on-background: '#1b1c19'
  surface-variant: '#e3e3dd'
typography:
  headline-xl:
    fontFamily: Newsreader
    fontSize: 40px
    fontWeight: '400'
    lineHeight: 48px
    letterSpacing: -0.02em
  headline-xl-mobile:
    fontFamily: Newsreader
    fontSize: 32px
    fontWeight: '400'
    lineHeight: 38px
    letterSpacing: -0.015em
  headline-lg:
    fontFamily: Newsreader
    fontSize: 28px
    fontWeight: '500'
    lineHeight: 36px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Newsreader
    fontSize: 22px
    fontWeight: '500'
    lineHeight: 28px
    letterSpacing: 0em
  headline-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '700'
    lineHeight: 24px
    letterSpacing: -0.01em
  title-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '700'
    lineHeight: 22px
    letterSpacing: 0em
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
    letterSpacing: 0em
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: 0em
  body-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
    letterSpacing: 0em
  stat-counter:
    fontFamily: Plus Jakarta Sans
    fontSize: 26px
    fontWeight: '700'
    lineHeight: 32px
    letterSpacing: -0.02em
  label-uppercase:
    fontFamily: Plus Jakarta Sans
    fontSize: 11px
    fontWeight: '700'
    lineHeight: 16px
    letterSpacing: 0.08em
  label-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 13px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.01em
  label-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.02em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-desktop: 1.5rem
  margin: 1rem
  margin-tablet: 2rem
  margin-desktop: 3rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.25rem
  space-xl: 1.75rem
  space-2xl: 2.5rem
---

## Brand & Style

This design system embodies a modern, human-centric Scandinavian aesthetic tailored for grassroots community sports. Built around principles of warmth, collectivism, and quiet functional clarity, it prioritizes trust, ease of coordination, and unhurried visual structure for busy parents, coaches, and players.

The design movement combines **Minimalism** with **Tactile Warmth**:
- Grounded, earthy surfaces replace clinical white dashboards.
- Crisp utilitarian structure balances expressive, heritage-inspired typography.
- Information hierarchy is calm and scannable, transforming stressful logistical tasks into clear, inviting touchpoints.

## Colors

The color system builds upon the Nordic landscape: deep pine evergreen paired with organic unbleached canvas neutrals, accented by functional status indicators.

- **Primary (`#1E3F20`):** Deep Spruce/Forest Green. Communicates stability, authority, and athletic tradition. Used for core brand elements, primary action buttons, key numerical data, and active state highlights.
- **Secondary (`#DCE775`):** Energized Lime-Chartreuse. Applied to subtle notification counters, pill highlights, and high-priority badge backings to guide glance attention without visual noise.
- **Tertiary (`#D97706`):** Warm Nordic Amber. Reserved for urgent reminders, missing RSVP callouts, and pending action markers.
- **Neutral Palette:**
  - Canvas / Page Background: Soft Warm Linen (`#F7F6F0`).
  - Elevated Container / Secondary Background: Warm Oat (`#EFECE4`).
  - Card Surface: Crisp Club White (`#FFFFFF`).
  - Subtle Border / Divider: Sand Border (`#E5E0D8`).
  - Text Primary: Deep Charcoal Spruce (`#19231A`).
  - Text Secondary: Muted Bark (`#5F6861`).
  - Text Tertiary / Micro-label: Soft Sage Gray (`#89928B`).
- **Semantic Status Tones:**
  - Attending / Positive: `#227038` on `#EBF6EE`
  - Declined / Negative: `#B91C1C` on `#FDF2F2`
  - Pending / Missing Response: `#B45309` on `#FFFBEB`
  - Informational / Inactive: `#4B5563` on `#F3F4F6`

## Typography

The typography system pairs **Newsreader** for primary titles with **Plus Jakarta Sans** for interfaces and operational telemetry:

- **Newsreader (Display/Headlines):** Imparts heritage, club pride, and Swedish editorial craft. Set at regular and medium weights for top-level squad names (e.g., *F2016*) and landmark card headers.
- **Plus Jakarta Sans (Body & System Labels):** A contemporary geometric sans with humanized terminals. Ensures pristine legibility on mobile screens under direct sunlight at the pitch.
- **Stat Counters & Uppercase Headers:** Section categorization uses uppercase tracking (`0.08em`) to demarcate functional regions (`ANSVAR`, `PERSONLIGT`, `NÄSTA AKTIVITET`), while critical attendance counts utilize heavy numeric weights.

## Layout & Spacing

The layout employs a mobile-first column system centered around ergonomic parent/coach actions:

- **Mobile (< 768px):** 4-column fluid layout with `1rem` outer canvas padding. Components are full-width cards with nested grids for metrics.
- **Tablet (768px - 1024px):** 8-column layout with `2rem` margins. Dashboard cards shift to two-column analytical arrangements.
- **Desktop (> 1024px):** Max container width of `1120px` centered on canvas, structured across 12 columns with `1.5rem` gutters.

Spacing rhythm follows strict 4px/8px baselines. Cards feature generous inner padding (`1.25rem` to `1.5rem`), while information tiles within cards maintain dense, scannable micro-spacing (`0.5rem` to `0.75rem`) to ensure glanceable attendance reads.

## Elevation & Depth

Visual depth avoids artificial high-drop drop shadows, opting instead for **tactile Scandinavian layering** via soft tonal stacking and hairline boundaries:

- **Canvas Base:** Soft warm cream (`#F7F6F0`) serves as the lowest foundational tier.
- **Container Level 1 (Cards):** Pure white surfaces (`#FFFFFF`) with a delicate 1px border (`#E5E0D8`) and a whisper ambient shadow: `0 2px 8px -2px rgba(30, 63, 32, 0.04)`.
- **Sub-Containers / Nested Insets:** Inner activity cards and grid tiles reside within `#FAF9F5` or receive a clean inner line border of `#EAE6DF` without drop shadow.
- **Floating Overlays & Floating Navigation:** Uses `0 8px 24px -4px rgba(25, 35, 26, 0.08)` combined with a subtle frosted border for navigation elements and mobile floating action triggers.

## Shapes

The shape architecture delivers friendly ergonomics:

- **Main Surface Cards:** Fixed at `16px` (`rounded-lg`), creating approachable modules that separate discrete operational contexts.
- **Buttons and Inputs:** Fixed at `12px` corner radii for a unified tactile tap profile.
- **Badges, Status Pills, and Counters:** Fully rounded pill forms (`9999px`) to distinguish categorical indicators from tappable structural containers.
- **Icon Buttons & Floating Action Modules:** Square elements soften into `10px` or `12px` squircle shapes; floating action anchors utilize circular silhouettes.

## Component Gallery & Consistency

Every UI element used in Förena must be represented on `/components`, including
composed controls, navigation, dialogs, feedback and specialized admin or
discipline components. Render the actual shared production components with
synthetic data; keep relevant variants, interaction states and responsive behavior
in sync in the same PR as each UI change. Reuse these components throughout the
application instead of creating page-specific copies or styling exceptions.
See [the component gallery requirements](docs/design-spec.md#komponentsidan-är-den-gemensamma-ui-referensen)
for the implementation and review checklist.

## Components

### Buttons
- **Primary:** Background `#1E3F20`, text `#FFFFFF`, radius `12px`, padding `12px 20px`. Subtle pressed scale (`0.98`).
- **Secondary / Outline:** Background `#FFFFFF`, 1px solid border `#D4CDC2`, text `#19231A`, radius `12px`. Hover state applies `#F7F6F0`.
- **Urgent / Accent:** Left amber indicator border (`3px solid #D97706`), background `#FFFDF8`.
- **Icon Actions:** `40x40px` or `44x44px` with `#FFFFFF` ground, 1px `#E5E0D8` border, and centered icon in spruce green.

### Metric Grids (Attendance Counters)
- Quad-split metric boxes inside cards. Divided by subtle `1px solid #ECE7E0` interior cross-borders.
- Number set in `stat-counter` (`Plus Jakarta Sans Bold 26px`), accompanied below by micro-caption in `label-sm` muted bark text.

### Badges & Notification Pills
- **Counter Pills:** Circular `20px` to `24px` spheres in secondary `#DCE775` with dark green text (`#1E3F20`), signaling active tasks.
- **Status Badges:** Pill-shaped (`rounded-full`), `4px 10px` padding, uppercase `11px` bold text. Colored strictly per semantic state.

### Cards & Module Accordions
- Outer container: `#FFFFFF`, 16px radius, border `1px solid #E5E0D8`.
- Header: Uppercase category tag with count badge on the left, chevron trigger on the right, title set in Newsreader or Plus Jakarta Sans Bold.
- Callout Banners: Framed within an active card using a left accent bar (`3px solid #C87D20`) over warm cream `#FCFBF7` to prioritize coach action items.

### Lists & Activity Rows
- Single item rows feature `12px` vertical padding, separated by `1px solid #F0ECE4`.
- Left icon badge: `36x36px` soft green square (`#EDF3EE`) with brand initials.
- Center metadata: bold activity title above light date/location details.
- Right arrow indicator: clean directional glyph in muted bark.

### Mobile Navigation Bar
- Fixed bottom surface (`#FFFFFF` with `rgba(247, 246, 240, 0.9)` backdrop blur).
- Top border `1px solid #EBE7E0`. Height `64px` + safe-area inset.
- Active item uses Spruce Green `#1E3F20` with a subtle top dot indicator; inactive items rest in muted bark `#89928B`.