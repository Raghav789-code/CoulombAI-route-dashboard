# Coulomb · Route Intelligence

An EV fleet dashboard that shows **the route a vehicle drove**, the **route parameters** that matter for an EV, and a **video session** that replays the trip as a cinematic 3D flight along its path.

Built for the Coulomb AI frontend assignment (brief: *"a Dashboard that shows the route driven by vehicles, specific route parameters, and includes a video session button to display the vehicle's travel path"*).

![Stack](https://img.shields.io/badge/React-19-61dafb) ![Three.js](https://img.shields.io/badge/three.js-r186-black) ![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6)

## Run it

```bash
npm install        # .npmrc sets legacy-peer-deps for the React 19 / R3F peer ranges
npm run dev        # http://localhost:5173
npm run build      # type-check + production build into dist/
npm run preview    # serve the production build
```

No API keys, no tile server, no network calls: the map, road network and telemetry are all generated locally, so the build runs anywhere (static hosting on Vercel, Netlify or GitHub Pages works as-is).

## What's on screen

| Brief asks for | Where it lives |
|---|---|
| Route driven by vehicles | **2D map**, a faithful take on the reference UI. It has the tabs (*Whole week · Deviation · Speed · Energy · Traffic · Elevation*), zoom/Fit, the live info card, the legend, a scale bar, and the playback scrubber at 240× speed. Pan, scroll-zoom and pinch-zoom work. Hovering the route shows a tooltip; clicking it jumps playback to that point. |
| Specific route parameters | **Route parameters** panel: distance, duration (moving vs idle), average and max speed, energy, Wh/km, regen recovered, SoC start → end, peak pack temperature, harsh brakes, off-route km, cost vs petrol and CO₂ avoided. A **timeline chart** follows the active tab, with a crosshair, a playhead and click-to-seek. A **trip event log** (left usual route, rejoined, heavy traffic, peak regen…) seeks playback when you click an event. |
| Video session button | **Video session** opens a fullscreen 3D replay. A camera *Director* cuts between chase, drone, orbit and top-down shots, and you can also pick a camera or fly it freely. The HUD has a speedometer, power/regen bar, minimap, live stats, event toasts and an off-route banner, plus a summary card at the end. **Record clip** exports the replay with the HUD burned in as a `.webm` file. |
| EV perspective | The physics simulation (below) produces battery power, regen, SoC, pack voltage/current and temperature at 1 Hz. |

Extras:
- **3D view** of the dashboard map: terrain with contour lines and hill-shading, lakes, and a translucent "curtain" under the route whose height and colour encode the active tab's metric. It grows in when you switch tabs.
- **Fleet of 3 EVs** (e-sedan commuter, e-cargo 3-wheeler on delivery loops, 9 m e-shuttle) with a week of trips each.
- **Whole week** view: every route the vehicle drove that week, with line weight showing how often each route was used, plus a distance-per-day chart.
- **Light and dark themes**, a responsive layout down to phone width, and `prefers-reduced-motion` support.
- **Keyboard shortcuts:** `Space` play/pause · `V` video session · `3` toggle 3D · `←/→` on the scrubber · `Esc` close video.

## Data and assumptions

The brief says to assume any intra-city GPS data, so everything is simulated and deterministic (seeded).

- **Geography:** the road network of east Bengaluru is hand-authored with approximate real coordinates. It covers Koramangala, Silk Board, HSR, Agara, Bellandur, Marathahalli, Whitefield, KR Puram, Old Airport Rd and others. Waypoints are smoothed with centripetal Catmull-Rom splines plus a small tapered wobble so they read like GPS traces. Lakes (Bellandur, Agara, Ulsoor, Varthur, Kaikondrahalli) and a synthetic plateau terrain (≈ 880–935 m above sea level) complete the map.
- **Traffic:** a congestion field built from time-of-day peaks (≈ 09:30 and 18:45, lighter on weekends), known choke points (Silk Board, Marathahalli, KR Puram…) and correlated noise along the road.
- **Kinematics:** target speed comes from road class × congestion and is capped by curvature. Signal, jam, passenger and delivery stops are added (some jam stops are *sudden*, which produce harsh-brake events). A forward–backward pass applies acceleration and braking limits, and the result is integrated to time and resampled at **1 Hz**.
- **Energy:** a road-load model with inertia, rolling resistance, aero drag and grade. Drivetrain and regen efficiencies and a regen power cap apply. HVAC/aux load follows ambient temperature. The battery has open-circuit voltage vs SoC and IR sag, and a lumped thermal model gives pack temperature.
- **Deviation:** each trip is compared with the vehicle's usual route using a spatial-hash distance query. A point counts as **off route above 250 m**, as in the reference.
- **The reference trip:** EV-07, Thu 15 Oct 2026, 09:12, Koramangala → Whitefield. Waterlogging on the ORR at Bellandur pushes the driver onto Sarjapur Rd, which shows up as a 10 km red detour.

Typical outputs: about 90–125 Wh/km for the sedan in peak traffic, about 60 Wh/km for the 3W, and about 600 Wh/km for the shuttle.

## Architecture

```
src/
  data/        network.ts (roads, lakes, path building) · terrain.ts · vehicles.ts
               simulate.ts (traffic → kinematics → energy → deviation → events/stats) · fleet.ts (week schedule)
  lib/         scales.ts (colour scale per tab) · sample.ts (interpolated snapshot at time t) · format.ts (IST)
  state/       store.ts: zustand store for vehicle, trip, tab, view, theme and playback
  components/  Map2D (SVG, world-space paths with non-scaling strokes) · MapCard · PlaybackBar
               TimelineChart · Panels (fleet, trips, route parameters, events) · VideoSession
  components/three/  Scene (terrain shader, curtain shader, roads, lakes, pins, camera rig)
                     Vehicle (procedural models per vehicle type) · Labels (projected DOM labels)
```

- **Playback** is a single `requestAnimationFrame` loop that advances trip time × rate. Heavy layers are memoised, and only the vehicle marker, info card and playhead subscribe to time. The 3D scene reads time inside `useFrame` without re-rendering React.
- **Colour** follows one rule per job:
  - Deviation is categorical (on/off route).
  - Speed and elevation use single-hue sequential ramps.
  - Energy is diverging around the trip's own average Wh/km.
  - Traffic uses a status palette, always shown with labels.
  - Dark mode uses its own stepped ramps rather than an automatic inversion.
- **Code-splitting:** the 3D view and the video session (three.js and postprocessing) load lazily, so the 2D dashboard loads first.

Stack: React 19, TypeScript, Vite, three.js with @react-three/fiber, drei and postprocessing, zustand, Motion, and Inter / JetBrains Mono (self-hosted).
