---
name: Botanical Intelligence
colors:
  surface: '#f9f9f9'
  surface-dim: '#dadada'
  surface-bright: '#f9f9f9'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f3f3f3'
  surface-container: '#eeeeee'
  surface-container-high: '#e8e8e8'
  surface-container-highest: '#e2e2e2'
  on-surface: '#1a1c1c'
  on-surface-variant: '#40493d'
  inverse-surface: '#2f3131'
  inverse-on-surface: '#f1f1f1'
  outline: '#707a6c'
  outline-variant: '#bfcaba'
  surface-tint: '#1b6d24'
  primary: '#0d631b'
  on-primary: '#ffffff'
  primary-container: '#2e7d32'
  on-primary-container: '#cbffc2'
  inverse-primary: '#88d982'
  secondary: '#286b33'
  on-secondary: '#ffffff'
  secondary-container: '#abf4ac'
  on-secondary-container: '#2e7238'
  tertiary: '#7a4a00'
  on-tertiary: '#ffffff'
  tertiary-container: '#9c6000'
  on-tertiary-container: '#ffeee0'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#a3f69c'
  primary-fixed-dim: '#88d982'
  on-primary-fixed: '#002204'
  on-primary-fixed-variant: '#005312'
  secondary-fixed: '#abf4ac'
  secondary-fixed-dim: '#90d792'
  on-secondary-fixed: '#002107'
  on-secondary-fixed-variant: '#07521d'
  tertiary-fixed: '#ffddba'
  tertiary-fixed-dim: '#ffb865'
  on-tertiary-fixed: '#2b1700'
  on-tertiary-fixed-variant: '#663d00'
  background: '#f9f9f9'
  on-background: '#1a1c1c'
  surface-variant: '#e2e2e2'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-md-mobile:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-caps:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.05em
  stat-value:
    fontFamily: Inter
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 32px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 4px
  xs: 8px
  sm: 16px
  md: 24px
  lg: 32px
  xl: 48px
  container-margin-mobile: 16px
  container-margin-desktop: 40px
  gutter: 16px
---

## Brand & Style

The design system is centered on a "Digital Conservatory" aesthetic—merging the organic vitality of a thriving garden with the precision of high-end agricultural technology. The target audience includes urban hobbyists and serious indoor growers who value both environmental sustainability and data-driven optimization.

The visual style is **Modern / Corporate** with a **Tactile** edge. It utilizes generous whitespace to mimic the openness of nature, while maintaining a rigorous structural integrity through card-based modules. The UI should evoke a sense of calm, clarity, and growth, ensuring that complex sensor data feels approachable and revitalizing.

## Colors

The palette is anchored by **Garden Green**, providing a sense of stability and healthy growth. **Leaf Green** serves as a secondary accent for softer UI elements, progress bars, and secondary actions. **Amber** (#FFA000) is introduced as a tertiary color specifically for alerts—such as low soil moisture or temperature warnings—mimicking sunlight.

The background uses a "Cool Mist" white (#FAFAFA) to maintain a sterile, lab-like precision, while surfaces and cards use pure white to pop against the subtle grey backdrop.

## Typography

This design system utilizes **Inter** for all primary communication to ensure a modern, neutral, and highly readable interface. Headlines feature tighter letter spacing for a premium, editorial feel. 

To emphasize the "tech-focused" aspect of the garden management, **JetBrains Mono** is used sparingly for labels and technical metadata (e.g., sensor IDs, timestamps, or botanical coordinates). This creates a functional contrast between the organic subject matter and the digital monitoring tools.

## Layout & Spacing

The layout follows a **fluid grid** model optimized for mobile-first consumption. On mobile devices, the dashboard defaults to a single-column stack of cards to ensure sensor data is easily tappable. As the screen scales to tablet and desktop, the layout transitions to a multi-column masonry or grid system (12 columns).

Spacing follows a strict 4px/8px baseline shift. Internal card padding is consistently 24px (md) to provide "breathing room" for the data. Margins are kept tight at 16px on mobile to maximize screen real estate, expanding to 40px on larger displays to enhance the minimalist aesthetic.

## Elevation & Depth

Visual hierarchy is achieved through **Tonal Layers** and **Ambient Shadows**. The base background is the lowest level. Secondary surfaces (cards) sit on top with a subtle, highly diffused shadow (e.g., `0px 4px 20px rgba(0, 0, 0, 0.05)`).

Elevated states (active cards or modals) use a slightly more pronounced shadow and a thin, 1px border using the primary green at 10% opacity. This creates a soft depth that feels physical without being heavy. Backdrop blurs are used exclusively for navigation overlays to maintain focus on the dashboard metrics.

## Shapes

The shape language is organic and approachable. All primary containers and cards use a **16px radius**. This soft curvature mimics the rounded edges of leaves and natural forms. 

Interactive elements like buttons and input fields follow this rounded logic. Small utility elements (chips or tags) may use a full pill-shape to distinguish them from structural layout components.

## Components

### Cards (Stats & Sensors)
The cornerstone of the dashboard. Every sensor (Moisture, Light, Humidity) is housed in a white card with 16px rounded corners. The top-left features a technical label (JetBrains Mono), the center features the primary metric (Stat-value), and the bottom includes a mini-sparkline graph in Leaf Green.

### Buttons
Primary buttons are solid Garden Green with white text, utilizing a 12px corner radius for a slightly firmer look than the cards. Secondary buttons use a Leaf Green ghost style (border only) to indicate subordinate actions like "View History."

### Chips
Used for plant categories or status indicators (e.g., "Healthy," "Needs Water"). These use a 50% opacity version of the status color with high-contrast text for accessibility.

### Inputs & Toggles
Form fields are minimal, with a soft grey background that turns white on focus with a Garden Green border. Toggles (for automated watering systems) use a tactile, rounded design where the "on" state is a vibrant Leaf Green.

### Progress Gauges
Circular progress rings are used for overall garden health scores, employing a thick stroke with rounded caps to maintain the soft shape language.