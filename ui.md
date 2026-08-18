# Pramochak MC Launcher — Minimalist Design System & Architecture Specification
*Created & Engineered by **Maheshwar Hari Tripathi** · Copyright (c) 2026 · [GitHub Repository](https://github.com/maheshwarkibehan-hub/pramochak-mc-launcher)*
*Inspired by Apple HIG, Linear.app, Raycast, Vercel (Geist), and Teenage Engineering*

---

## 1. Executive Design Philosophy (Quiet Luxury & Pure Minimalism)

Gaming interfaces frequently suffer from aggressive RGB neon glows, saturated multicolor gradients, and noisy visual clutter. This specification establishes a **pure minimalist, high-aesthetic desktop instrument** tailored for **Tauri v2 + Rust** desktop architecture.

### Core Pillars
1. **Zero Flashy Neons / Zero Distracting Glows**: All neon halos, glowing colored outlines, and saturated rainbow badges are removed. Visual distinction is created strictly through surface elevation, tonal brightness deltas, and crisp hairline strokes.
2. **Warm Minimal & Matte Studio Color Palette**:
   - **Dark Studio Mode (Default)**: Deep Matte Charcoal (`#111113`), Card Base (`#18181B`), Raised Panel (`#222226`), Soft Bone White Text (`#F5F2EB`), Slate Hairlines (`rgba(255, 255, 255, 0.08)`).
   - **Warm Cream Studio Mode**: Pure Warm Paper (`#FAF8F5`), Soft Bone Cards (`#F5F2EB`), Recessed Inset (`#EBE6DC`), Charcoal Text (`#161618`), Subtle Hairlines (`rgba(0, 0, 0, 0.08)`).
   - **Single Functional Accent (Cadmium Amber)**: `#E65D24` (Teenage Engineering industrial tactile marker) for active interactive points.
3. **High-Precision Typography (Geist / Instrument Sans + JetBrains Mono)**:
   - **Headings & Display**: `Geist` or `Instrument Sans` with negative optical tracking (`-0.02em` to `-0.03em`).
   - **Body & Controls**: `Plus Jakarta Sans` or `Geist` with neutral tracking (`0em`) and WCAG AAA compliance.
   - **Telemetry & Versions**: `JetBrains Mono` with `font-variant-numeric: tabular-nums` for rock-solid alignment.
4. **Instantaneous & Tactile Micro-Interactions**:
   - Hover: Strictly **1px subtle lift** (`transform: translateY(-1px)`) + delicate hairline border highlight (`0.08` -> `0.16`).
   - Active Press: Fast, tactile downward compression (`transform: translateY(0.5px) scale(0.99)`) in `60ms`.
   - Transitions: Swift **150ms–180ms** elevation cross-fades (`cubic-bezier(0.16, 1, 0.3, 1)`). No sluggish animations.
5. **Zero Jank in Tauri v2 WebView2**:
   - Use `contain: layout paint` and `transform: translateZ(0)` on active containers.
   - Restrict `backdrop-filter: blur()` strictly to fixed overlays (Titlebar, Sidebar, Modals); use flat matte solid fills for internal scroll cards to preserve 60fps on all GPUs.

---

## 2. Master Design Tokens

```css
:root {
  /* Surface Foundations — Dark Matte Studio (Default) */
  --bg-app:                #111113;
  --bg-sidebar:            #0C0C0E;
  --bg-surface:            #18181B;
  --bg-surface-raised:     #222226;
  --bg-surface-active:     #27272A;
  --bg-surface-inset:      #0C0C0E;
  --bg-control-track:      #2A2A30;

  /* Hairlines & Borders */
  --border-subtle:         rgba(255, 255, 255, 0.05);
  --border-default:        rgba(255, 255, 255, 0.08);
  --border-hover:          rgba(255, 255, 255, 0.16);
  --border-active:         rgba(255, 255, 255, 0.24);

  /* Stratified Text Colors (WCAG AAA) */
  --text-primary:          #F5F2EB; /* Soft Bone White */
  --text-secondary:        #D4D0C8; /* Chalk */
  --text-muted:            #9DA4AE; /* Ash Muted */
  --text-disabled:         #52525B; /* Lead */

  /* Functional Accent */
  --accent-primary:        #E65D24; /* Cadmium Amber */
  --accent-primary-hover:  #FF6B30;
  --accent-primary-muted:  rgba(230, 93, 36, 0.12);

  /* Monochrome & Studio Status Indicators */
  --status-ready-dot:      #22C55E;
  --status-ready-bg:       rgba(34, 197, 94, 0.08);
  --status-ready-border:   rgba(34, 197, 94, 0.20);
  --status-idle-dot:       #A1A1AA;
  --status-idle-bg:        rgba(161, 161, 170, 0.08);
  --status-idle-border:    rgba(161, 161, 170, 0.18);
  --status-warn-dot:       #F59E0B;
  --status-warn-bg:        rgba(245, 158, 11, 0.08);
  --status-warn-border:    rgba(245, 158, 11, 0.20);
  --status-alert-dot:      #EF4444;
  --status-alert-bg:       rgba(239, 68, 68, 0.08);
  --status-alert-border:   rgba(239, 68, 68, 0.20);

  /* Focus Rings */
  --focus-ring:            0 0 0 2px var(--bg-app), 0 0 0 4px rgba(255, 255, 255, 0.20);
  --focus-ring-accent:     0 0 0 2px var(--bg-app), 0 0 0 4px var(--accent-primary);

  /* Tactile Drop Shadows */
  --elevation-flat:        0 1px 2px rgba(0, 0, 0, 0.24);
  --elevation-raised:      0 1px 3px rgba(0, 0, 0, 0.20), 0 4px 12px rgba(0, 0, 0, 0.12);
  --elevation-overlay:     0 4px 12px rgba(0, 0, 0, 0.35);
  --elevation-modal:       0 0 0 1px var(--border-default), 0 20px 48px -12px rgba(0, 0, 0, 0.65);

  /* Typography */
  --font-sans:             'Geist', 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
  --font-mono:             'JetBrains Mono', monospace;

  /* Timing Curves */
  --ease-swift:            cubic-bezier(0.16, 1, 0.3, 1);
  --motion-instant:        60ms;
  --motion-fast:           150ms;
  --motion-screen:         180ms;
}

/* Warm Cream Studio Mode */
body.theme-warm-cream {
  --bg-app:                #FAF8F5;
  --bg-sidebar:            #F5F2EB;
  --bg-surface:            #FFFFFF;
  --bg-surface-raised:     #F5F2EB;
  --bg-surface-active:     #EBE6DC;
  --bg-surface-inset:      #EBE6DC;
  --bg-control-track:      #DFD8CB;

  --border-subtle:         rgba(0, 0, 0, 0.04);
  --border-default:        rgba(0, 0, 0, 0.08);
  --border-hover:          rgba(0, 0, 0, 0.14);
  --border-active:         rgba(0, 0, 0, 0.22);

  --text-primary:          #161618;
  --text-secondary:        #4A4A52;
  --text-muted:            #767682;
  --text-disabled:         #A4A4B0;

  --focus-ring:            0 0 0 2px var(--bg-app), 0 0 0 4px rgba(0, 0, 0, 0.18);
  --elevation-flat:        0 1px 2px rgba(0, 0, 0, 0.04);
  --elevation-raised:      0 1px 3px rgba(0, 0, 0, 0.06), 0 4px 12px rgba(0, 0, 0, 0.03);
  --elevation-modal:       0 0 0 1px var(--border-default), 0 16px 36px rgba(0, 0, 0, 0.09);
}
```

---

## 3. Screen-by-Screen Information Architecture & Layout Wireframes

### Screen 1: Home (Bento Dashboard)
```
┌────────────────────────────────────────────────────────┬──────────────────────────────────────────┐
│  HERO LAUNCHPAD CARD (Matte Bone / Charcoal)           │  QUICK ACTIONS (2x2 Pill Grid)           │
│  ● 1.21.4 Fabric Ready  [Ctrl + K Search Bar]          │  [+ Create World]    [+ Add Server]      │
│  "Ready to Craft"                                      │  [⚡ Install Mods]   [🎨 Resource Packs]  │
│  Logged in as Pramochak_MC                             ├──────────────────────────────────────────┤
│                                                        │  SYSTEM TELEMETRY CAPSULE                │
│  [  ▶  PLAY NOW  ]   [ 1.21.4 Fabric ▼ ]   [ ⚙ ]       │  RAM: [████████░░░░░] 4.0 / 16.0 GB      │
│                                                        │  Java 17 64-bit  •  Disk: 1.42 GB        │
├────────────────────────────────────────────────────────┤  Playtime: 14h 22m • Launches: 38        │
│  RECENT WORLDS STRIP                                   ├──────────────────────────────────────────┤
│  Recent Saves                               All (12) → │  RELEASE NOTES CAPSULE                   │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐   │  v1.21.4 Performance & Security Patch    │
│  │ World 1      │ │ World 2      │ │ World 3      │   │  Updated Fabric loader to 0.16.9         │
│  │ Survival•2h  │ │ Creative•1d  │ │ Hardcore•3d  │   │                                          │
│  └──────────────┘ └──────────────┘ └──────────────┘   │                                          │
└────────────────────────────────────────────────────────┴──────────────────────────────────────────┘
```

### Screen 2: Installations
- **Top Control Bar**: Filter input + Segmented Loader Filter (`All` | `Vanilla` | `Fabric` | `Forge`) + `[+ New Installation]` + `[Import Modpack]`.
- **List Rows**: 36px Block Glyph + Profile Name + Modloader Pill + RAM Allocation Pill + Relative Playtime + Action Strip (`PLAY`, `Folder`, `Export`, `Delete`).

### Screen 3: Skins & Capes Studio
- **Left Column (45%)**: 3D Orbit WebGL Viewport with floating bottom glass pedestal toolbar (`↺ Auto-Rotate`, `🛡️ Cape`, `Walk/Run Pose`).
- **Right Column (55%)**: Segmented Tabs:
  - `Wardrobe`: Dual dashed upload dropzones for Skin 64x64 PNG & Cape PNG + Model switcher (Classic 4px vs Slim 3px) + Reset button.
  - `2D Pixel Studio`: 64x64 drawing canvas with pencil, bucket, dropper, eraser, undo/redo + color swatch palette.
  - `Community Library`: Search bar with Mojang / Ely.by import.

### Screen 4: Mods Manager
- **Top Bar**: Profile selector + Search input with instant debounce + Category filter pills.
- **Browse Tab**: 2-column uniform cards with 44px mod icon, 2-line clamped description, downloads counter, and clean 1-click Install button.
- **Installed Tab**: Clean list view with search filter, JAR icon, file size, Enable/Disable toggle switch, folder link, and delete action.

### Screen 5: Resource Packs
- **Browse Tab**: Modrinth certified resource pack cards with thumbnail preview, resolution tag (`16x`, `32x`, `64x`), and downloads badge.
- **Installed Tab**: Reorderable pack list with drag grip handle (`⋮⋮`), format version compatibility tag, enable toggle, and delete action.

### Screen 6: Worlds Directory
- **Top Bar**: Search saves input + Profile saves selector + View toggle (`[ Grid ] [ List ]`) + `[+ Create / Import World]` + `[ Open Folder ]`.
- **Grid Cards**: 16:9 thumbnail preview + Mode badge (`Survival` / `Creative` / `Hardcore`) + Version tag + Relative time + Size + Hover bottom action strip (`Quick Play`, `Folder`, `Backup .zip`, `Delete`).

### Screen 7: Multiplayer & Local Hosting
- **Multiplayer List**: 48px server favicon + Server Name & Address + 2-line clean formatted MOTD + Monochrome 3-bar ping indicator + Online player counter + Join button.
- **Local Dedicated Server Console**: Server cards with PaperMC/Purpur version, Port, RAM + Collapsible Monospace Terminal Drawer with command input.

### Screen 8: Settings
- **Left Column (Identity & Launch)**: Offline nickname, Account Switcher modal trigger, resolution presets (`854x480`, `720p`, `1080p`, `Fullscreen`), launcher behavior switches.
- **Right Column (Java & Memory)**: Minimalist RAM slider with quick-tap memory preset pills (`[2G] [4G] [8G] [12G] [16G]`), auto-detected Java JRE path, storage root directory.

---

## 4. Modal Overlays & System Drawers

1. **Spotlight Command Palette (`Ctrl + K`)**: Centered 560px modal with search input, instant arrow-key navigation for Screens, Profiles, Worlds, and Quick Actions.
2. **Launch Progress Dialog**: 520px centered card with bold numeric percentage (`2.2rem`), current phase label, live speed/ETA throughput, fluid progress bar, and Pause/Cancel buttons.
3. **Client Game Logs Drawer**: 840x540px high-density developer console with search filter, log level filters (`INFO`, `WARN`, `ERROR`), and 1-click mclo.gs upload.
