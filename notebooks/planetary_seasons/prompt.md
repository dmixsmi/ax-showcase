# Planetary Seasons Lab

Build an interactive marimo notebook for a 3D outreach lesson on why seasons happen. It has a Python reference
model, an anywidget that renders a three.js WebGL scene with synced controls and charts. Follow the spec below exactly
— layout, controls, constants, formulas, defaults, and labels are all intentional.

## Science model

Circular orbit (distance never changes), `YEAR_DAYS = 365.0`, day 0 = March-like equinox, `_POLE_EPSILON = 1e-12`.
Validate tilt ∈ [0, 90] and latitude ∈ [−90, 90];

- `solar_declination(day_of_year, tilt_deg)` → `arcsin(sin ε · sin(2π·day/365))`.
- `daylight_hours(latitude_deg, declination_rad)`:
  - Exactly ±90°: signed decl = sign(lat)·δ; > ε → 24, < −ε → 0, else 12.
  - Otherwise cos H = −tan φ · tan δ; H = 0 if cos H ≥ 1, π if ≤ −1, else arccos(clip). Return 24·H/π.
- `daily_mean_insolation(latitude_deg, declination_rad, solar_constant=1361.0)` → `S/π · (H sinφ sinδ + cosφ cosδ
  sinH)`, with H taken from daylight hours (H = hours·π/24), clamped ≥ 0. Error if solar_constant ≤ 0.
- `temperature_estimate(insolation, thermal_lag_days=30.0, baseline_c=14.0)`: needs a 1-D, non-empty, finite,
  non-negative array, and lag > 0. If mean ≤ ε or peak-to-peak ≤ ε → constant baseline. Otherwise equilibrium
  = `baseline + 20·(E − mean)/mean`; relaxation `state += f·(target − state)` with `f = 1 − exp(−1/lag)`, starting at
  baseline. Spin up for 20 full passes, then record one pass, then shift so the annual mean equals the baseline.
- `annual_cycle(tilt_deg, latitude_deg, days=365)` (days ≥ 4) returns a dict with exactly these keys: `day_of_year,
  declination_rad, daylight_hours, nighttime_hours, insolation_w_m2, temperature_c`.
- `solar_season(day_of_year, latitude_deg)`: event days `[0, 91.25, 182.5, 273.75]` → "March-like equinox", "June-like
  solstice", "September-like equinox", "December-like solstice". Append `" • <event>"` when the cyclic distance is
  < 0.01 day. At the equator → `"Equatorial sunlight<suffix>"`. Otherwise quarter = ⌊day/91.25⌋ mod 4: north
  = spring/summer/autumn/winter, south = autumn/winter/spring/summer → `"Northern summer • June-like solstice"`.
- `explain_state(tilt, lat, day)` → `"At 40°N, this 23.5° tilt gives about X.X hours of daylight and Y.Y hours of night.
  The planet is in <season lowercased>."`

## Widget bridge

| trait | default | contract |
|---|---|---|
| `tilt_deg` Float | 23.5 | [0, 90] |
| `latitude_deg` Float | 40.0 | [−90, 90] |
| `day_of_year` Float | 0.0 | [0, 365) |
| `playing` Bool | False | — |
| `speed` Float | 1.0 | one of (0.5, 1, 2, 4) |
| `camera_mode` Unicode | "orbit" | "orbit" or "planet" |


## Browser widget

**Layout:** everything is scoped under `.planet-lab` with BEM classes `planet-lab__*`.
- Header: "Drag the space scene to look around, then change the planet's tilt and your latitude. Every view, number, and
  curve stays connected.", and a season pill on the right.
- Main grid:
  - 3D stage with a CSS starfield, a toolbar (Whole orbit / Follow planet / Reset view), floating
    labels "Our star", "Fixed axis" and the location latitude, the hint "Drag to orbit • scroll or pinch to zoom", and
    a WebGL-failure fallback ("The 3D view could not start." — the controls and charts still work).
  - Side panel "Shape the seasons": Axial tilt range 0–90 step 0.5; Your latitude range −90–90 step 1, shown as
    "40°N"/"Equator"/"S".
  - Panel "At your location": metrics Daylight (h), Nighttime (h), Temperature estimate (°C).
- Timeline:
  - "▶ Play year" / "❚❚ Pause" button.
  - "Travel through the year" range 0–365 step 0.1. Its label is the event name within 2 days, else "Day N".
- Two hand-drawn charts:
  - "Daylight through the year": y = 0–24, ticks 0/6/12/18/24.
  - "Seasonal temperature response": y = floor(min−2)…ceil(max+2), 3 ticks.
  - Both: vertical guides labelled "Mar eq.", "Jun sol.", "Sep eq.", "Dec sol.", a current-day line + dot, and a dynamic
    aria-label with the current value.

**Controls:** put all controls (tilt, latitude, camera, play switch, a speed dropdown, a day-of-year slider and the four
equinox/solstice buttons) under the widget.

**Scene:**
- Camera: PerspectiveCamera(42°). Orbit view at (13.5, 8.5, 13.5). OrbitControls with damping 0.07 and distance 2.8–31.
- Renderer: ACES tone mapping, exposure 1.08, sRGB output, pixel ratio ≤ 2.
- Lighting: HemisphereLight(0x486caa, 0x061024, 0.48) and a PointLight(0xfff0be, 185, 45, 1.7) at the star.
- Star: sphere r 1.05, color 0xffce5b, plus a back-side glow r 1.46 (0xffb735, opacity 0.17).
- Orbit: ring radius 8, color 0x6f8fd6, opacity 0.45.
- Planet: radius 1.22. Nesting is `planetGroup → tiltGroup (rotation.x = −tilt) → spinGroup (rotation.y = 2π·day/16)`.
  The axis keeps a fixed direction in space as the planet orbits. Position = (8 cos θ, 0, 8 sin θ) with θ = 2π·day/365.
- Procedural canvas texture: sinusoidal "noise" for land (greens/tans), ocean blues, polar ice above |lat| > 1.28 rad.
- Equator line, plus a mint latitude ring and a yellow location marker that move with the latitude slider.
- Axis: mint cylinder with cone arrowheads at both poles.
- "Follow planet" tweens the camera over 650 ms (cubic ease-out) to the planet + (3.8, 2.6, 4.6), then carries the camera along with the planet.
- Labels are projected to screen each frame and clamped inside the stage.
- Playback: day advances 18 days/s × speed; frame dt is capped at 0.1 s. `prefers-reduced-motion` disables autoplay and camera tweens.
- Model sync: throttle to ≤ 1 per 100 ms while dragging, and force a save on `change`/click. Listen to `change:<trait>` for every trait so Python-side updates reflect in the UI.
