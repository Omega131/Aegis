# AegisMirage Design System Specification

## 1. Architectural Vision: Vibrant Living-City Observatory

AegisMirage is a unified, cyber-physical cybersecurity platform monitoring smart-city infrastructure. It merges real-time telemetry from physical edge devices (cameras, mobility signals, power substations, environmental sensors) with a synthetic deception plane (**Phantom Twin**), threat intelligence clustering, break-glass 2-of-3 Shamir quorum access, and a SHA-256 cryptographic audit chain.

The design philosophy replaces disconnected legacy dashboards with a **singular, immersive, living-city observatory**:
- **Consistent Surface Architecture**: Midnight navy backgrounds with layered slate-blue cards and elevation borders across every route.
- **Unified Navigation Shell**: Persistent branding, real-time backend connection heartbeat, context breadcrumbs, active selection pills, and toast feedback.
- **Living 2.5D Isometric City**: Prominent on the overview, and echoed on operational screens via the `CityMiniMap` topology locator.
- **Truthful State Representation**: Operational telemetry strictly drives UI states. Replayed or simulated drills are explicitly labeled.

---

## 2. Color Palette & Semantic Tokens

All styles are declared as standard CSS variables in [`src/index.css`](file:///c:/Users/Madhusudan%20Tiwari/Downloads/AeigisMirage/Aegis/dashboard/src/index.css).

| Semantic Role | Token Name | Hex Value | Usage / Meaning |
| :--- | :--- | :--- | :--- |
| **Deep Background** | `--bg-deep` | `#080D1B` | Primary canvas & app background |
| **Surface Base** | `--bg-surface` | `#111B31` | Cards, panels, modal backdrops |
| **Elevated Surface** | `--bg-surface-elevated` | `#192640` | Hovered rows, inputs, sub-cards |
| **Interactive Surface**| `--bg-surface-hover` | `#233454` | Button hovers, active tab indicators |
| **Subtle Border** | `--border-subtle` | `rgba(168, 183, 209, 0.12)` | Outer containers, section dividers |
| **Medium Border** | `--border-medium` | `rgba(168, 183, 209, 0.22)` | Interactive cards, input outlines |
| **Primary Text** | `--text-primary` | `#F3F6FF` | Headings, vital values, code tokens |
| **Secondary Text** | `--text-secondary` | `#A8B7D1` | Subtitles, labels, descriptions |
| **Muted Text** | `--text-muted` | `#637599` | Timestamps, inactive hints |
| **Production Accent**| `--accent-production` | `#37DDE0` | Real edge nodes, live feeds, normal ops |
| **Deception Accent** | `--accent-deception` | `#A78BFA` | Honeypot gateway, decoy sessions, baits |
| **Decorative Accent**| `--accent-magenta` | `#EC72C7` | High-priority triggers, substation nodes |
| **Review / Pending** | `--accent-review` | `#F5BC62` | Quorum votes, unmasking requests, alerts |
| **Hostile / Danger** | `--accent-danger` | `#FF7878` | Intrusion anomalies, camera blinds, rogue HTTP 403 |
| **Success State** | `--accent-success` | `#34D399` | Quorum achieved, ledger hash chain verified |

---

## 3. Typography & Monospace Pairing

- **Interface Font**: `Inter`, `-apple-system`, `BlinkMacSystemFont`, `Segoe UI`, `Roboto`, `sans-serif`
  - High legibility at compact density.
  - Heading 1: `1.5rem`, Weight 800, Letter spacing `-0.025em`.
  - Body text: `0.85rem`, Weight 400, Line height `1.5`.
- **Monospace Font**: `JetBrains Mono`, `Fira Code`, `ui-monospace`, `monospace`
  - Applied to IP addresses, session IDs, SHA-256 hashes, terminal commands, STIX indicators, and timestamps.
  - Enforced across terminal windows, data table identifier columns, and drawer inspectors.

---

## 4. Shared Application Shell (`AppLayout`)

Every page in the platform is mounted inside [`AppLayout`](file:///c:/Users/Madhusudan%20Tiwari/Downloads/AeigisMirage/Aegis/dashboard/src/components/AppShell/AppLayout.tsx) which guarantees a single unified experience:

1. **Top Navigation Bar (`AppNavbar`)**:
   - Branding shield icon with animated glow.
   - 7 primary routes with live session & alert count badges:
     - 🏙️ **Living City Overview** (`city`)
     - 📹 **Edge Sentry Cameras** (`cameras`)
     - 🪞 **Phantom Twin Decoys** (`decoy`)
     - 🛡️ **Threat Intel & Evidence** (`evidence`)
     - ⚖️ **Break-Glass Escrow** (`escrow`)
     - 📜 **Cryptographic Audit** (`audit`)
     - ⚙️ **Diagnostics & Settings** (`settings`)
   - Real-time backend connection status badge (`127.0.0.1:8000 LIVE`) with pulsing status indicator.
2. **Context & Breadcrumb Bar (`AppContextBar`)**:
   - Breadcrumb navigation (`Home / [Section Name]`).
   - Selected context pills: active device (`CAM-01`, `GW-05`, etc.), selected session (`ssh-...`), selected escrow case (`CASE-2026-001`).
   - Motion toggle button (`⚡ Smooth Motion` / `⏸ Reduced Motion`) respecting `prefers-reduced-motion`.
3. **Slide-Out Device Inspector Drawer (`DeviceInspectorDrawer`)**:
   - Seamless inspection of any smart city device.
   - Direct jump buttons to operational views (e.g., clicking `CAM-01` jumps to Edge Sentry; clicking `GW-05` jumps to Phantom Twin).
4. **Global Toast System (`ToastContainer`)**:
   - Stateful notifications for drill injections, honeypot trips, quorum votes, and ledger verifications.

---

## 5. Reusable Component Inventory

- **`Badge`** (`src/components/ui/Badge.tsx`):
  - Variants: `production`, `deception`, `review`, `danger`, `success`, `neutral`.
- **`StatCard`** (`src/components/ui/StatCard.tsx`):
  - Metric summary card with colored top border accent, icon badge, primary value, and contextual subtext.
- **`CityMiniMap`** (`src/components/ui/CityMiniMap.tsx`):
  - Compact SVG topology locator used on operational pages (`Cameras`, `Decoy`, `Evidence`, `Escrow`, `Audit`, `Settings`).
  - Visually links deep operational screens back to the spatial layout of the living city.
- **`TerminalViewer`** (`src/pages/decoy/terminal.css`):
  - Monospace dark terminal window with syntax highlighting for Linux shell commands, Rickroll honeytoken trap outputs, and keystroke timing audits.
- **`DataTable`** (`src/index.css` `.data-table`):
  - Clean, calm tabular layout for audit logs, honeypot sessions, camera lists, and campaign clusters with sticky headers and hover states.

---

## 6. Motion & Accessibility

- **Micro-animations**: `150ms - 200ms ease` for button hovers, badge pulses, and drawer slide-ins.
- **Reduced Motion**: Disabling motion disables auto-orbiting in the 2.5D Living City and pauses traffic simulation.
- **Keyboard & Focus**: Explicit `:focus-visible` styling (`outline: 2px solid var(--accent-production)` with `outline-offset: 2px`).
- **Contrast Ratios**: Exceeds WCAG AA standards (4.5:1 minimum; primary text `#F3F6FF` on surface `#111B31` achieves 13.8:1 contrast ratio).
