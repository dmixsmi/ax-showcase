import marimo

__generated_with = "0.24.0"
app = marimo.App(width="medium")


@app.cell
def _():
    import json
    from pathlib import Path

    import marimo as mo
    import matplotlib.pyplot as plt

    from src.seasons_model import (
        EVENT_DAYS,
        annual_cycle,
        explain_state,
        format_latitude,
        solar_season,
    )
    from src.seasons_widget import ControlSync, PlanetSeasonsWidget

    return (
        ControlSync, EVENT_DAYS, Path, PlanetSeasonsWidget, annual_cycle,
        explain_state, format_latitude, json, mo, plt, solar_season,
    )


@app.cell
def _(mo):
    mo.md(r"""
    # Planetary Seasons Lab

    **Why do seasons happen?** The planet's orbit is a circle, so its distance from the star never changes.
    Only the axial tilt $\varepsilon$ does the work: it sets the solar declination
    $\delta = \arcsin(\sin\varepsilon \,\sin(2\pi\, d/365))$, which sets daylight length, sunlight per day and, with a lag, temperature.

    Drag the scene, then use the controls under it. Set the tilt to 0° and the seasons vanish. Set it to 90° and the poles get half a year of light.
    """)
    return


@app.cell
def _(ControlSync, PlanetSeasonsWidget, mo):
    widget = PlanetSeasonsWidget()
    get_tilt, set_tilt = mo.state(widget.tilt_deg)
    get_lat, set_lat = mo.state(widget.latitude_deg)
    get_day, set_day = mo.state(widget.day_of_year)
    get_playing, set_playing = mo.state(widget.playing)
    get_speed, set_speed = mo.state(widget.speed)
    get_camera, set_camera = mo.state(widget.camera_mode)

    _setters = {
        "tilt_deg": set_tilt, "latitude_deg": set_lat, "day_of_year": set_day,
        "playing": set_playing, "speed": set_speed, "camera_mode": set_camera,
    }
    sync = ControlSync(widget, lambda trait, value: _setters[trait](value))
    return (
        get_camera, get_day, get_lat, get_playing, get_speed, get_tilt,
        set_day, sync, widget,
    )


@app.cell
def _(get_tilt, mo):
    tilt = mo.ui.slider(0, 90, step=0.5, value=get_tilt(), label="Axial tilt (°)", show_value=True, full_width=True)
    return (tilt,)


@app.cell
def _(get_lat, mo):
    latitude = mo.ui.slider(-90, 90, step=1, value=get_lat(), label="Latitude (°)", show_value=True, full_width=True)
    return (latitude,)


@app.cell
def _(get_camera, mo):
    camera = mo.ui.radio(options={"Whole orbit": "orbit", "Follow planet": "planet"}, value="Whole orbit" if get_camera() == "orbit" else "Follow planet", label="Camera", inline=True)
    return (camera,)


@app.cell
def _(get_playing, mo):
    play = mo.ui.switch(value=get_playing(), label="Play year")
    return (play,)


@app.cell
def _(get_speed, mo):
    speed = mo.ui.dropdown(options={"0.5x": 0.5, "1x": 1.0, "2x": 2.0, "4x": 4.0}, value={0.5: "0.5x", 1.0: "1x", 2.0: "2x", 4.0: "4x"}[get_speed()], label="Speed")
    return (speed,)


@app.cell
def _(get_day, mo):
    day = mo.ui.slider(0, 365, step=0.1, value=get_day(), label="Day of year", show_value=True, full_width=True)
    return (day,)


@app.cell
def _(EVENT_DAYS, mo, set_day, sync):
    def _jump(d):
        def go(_):
            sync.push("day_of_year", float(d))
            set_day(float(d))
        return go

    event_buttons = mo.hstack(
        [mo.ui.button(label=name, on_click=_jump(d), kind="neutral")
         for name, d in zip(["March equinox", "June solstice", "September equinox", "December solstice"], EVENT_DAYS)],
        justify="start",
    )
    return (event_buttons,)


@app.cell
def _(sync, tilt):
    if not sync.is_echo("tilt_deg", float(tilt.value)):
        sync.push("tilt_deg", float(tilt.value))
    return


@app.cell
def _(latitude, sync):
    if not sync.is_echo("latitude_deg", float(latitude.value)):
        sync.push("latitude_deg", float(latitude.value))
    return


@app.cell
def _(camera, sync):
    sync.push("camera_mode", camera.value)
    return


@app.cell
def _(play, sync):
    sync.push("playing", bool(play.value))
    return


@app.cell
def _(speed, sync):
    sync.push("speed", float(speed.value))
    return


@app.cell
def _(day, sync):
    _d = float(day.value) % 365.0
    if not sync.is_echo("day_of_year", _d):
        sync.push("day_of_year", _d)
    return


@app.cell
def _(camera, day, event_buttons, latitude, mo, play, speed, tilt, widget):
    mo.vstack([
        widget,
        mo.md("**Controls.** They stay in step with the scene: moving a slider inside the scene moves the matching one here."),
        mo.hstack([tilt, latitude], widths="equal"),
        mo.hstack([camera, play, speed], justify="start", gap=2),
        day,
        event_buttons,
    ])
    return


@app.cell
def _(mo):
    mo.md(r"""
    ## Python reference model

    The browser widget re-implements the formulas in JavaScript. [seasons_model.py](src/seasons_model.py) is the reference, and the curves below come straight from it for the current tilt and latitude.
    Insolation is the daily mean $\overline{Q}=\frac{S}{\pi}\left(H\sin\varphi\sin\delta+\cos\varphi\cos\delta\sin H\right)$ with $S=1361$ W/m², and temperature is that insolation relaxed with a 30-day lag.
    """)
    return


@app.cell
def _(annual_cycle, day, explain_state, latitude, mo, plt, tilt):
    _c = annual_cycle(tilt.value, latitude.value)
    _d = day.value % 365.0
    ref_fig, _axes = plt.subplots(1, 3, figsize=(11, 3), constrained_layout=True)
    for _ax, _key, _label, _col in zip(
        _axes,
        ["daylight_hours", "insolation_w_m2", "temperature_c"],
        ["Daylight (h)", "Daily-mean insolation (W/m²)", "Temperature estimate (°C)"],
        ["#e0a800", "#d95f02", "#1b9e77"],
    ):
        _ax.plot(_c["day_of_year"], _c[_key], color=_col, lw=2)
        _ax.axvline(_d, color="0.4", ls="--", lw=1)
        _ax.set_xlabel("Day of year"); _ax.set_title(_label, fontsize=10)
        _ax.margins(x=0)
    mo.vstack([mo.md(f"> {explain_state(tilt.value, latitude.value, _d)}"), ref_fig])
    return


@app.cell
def _(mo):
    mo.md(r"""
    ## Checks

    A headless Chromium run ([browser_test.py](tests/browser_test.py)) loads the widget and compares it with the Python model; a pytest file ([test_model.py](tests/test_model.py)) covers the reference model and the trait bridge.
    """)
    return


@app.cell
def _(Path, json, mo):
    _r = json.loads(Path("tests/browser_test_results.json").read_text())
    mo.vstack([
        mo.md(f"""
    | check | result |
    |---|---|
    | WebGL canvas created, no fallback | {_r['webgl_ok'] and _r['fallback_visible'] is None} |
    | Daylight, night, temperature and season pill vs Python, 7 states incl. poles and 0° tilt | {len(_r['parity_mismatches'])} mismatches |
    | Temperature curve vs Python (max pixel residual after linear fit) | {_r['temp_curve_fit_resid_px']:.2f} px |
    | Model saves during a 30-event slider burst (throttle) | {_r['saves_during_burst']} |
    | Timeline label near an event / elsewhere | {_r['tl_label_event']} / {_r['tl_label_day']} |
    | Browser console errors | {len(_r['errors'])} |
    """),
        mo.image("tests/shot_follow.png", width=620, caption="Follow-planet view at day 100, captured headless."),
    ])
    return


@app.cell
def _(mo):
    mo.md(r"""
    ## Limits

    - three.js loads from a CDN (esm.sh), so the 3D view needs network access. Without it, the fallback message appears and the controls and charts keep working.
    - Testing used software WebGL, so frame rate on real hardware is unmeasured. Playback speed in the test was frame-limited.
    - Marimo controls mirror the scene except the day slider during playback, which resyncs when you pause.
    - The thermal lag is counted in samples, so it is 30 days only for the default 365-sample year.
    - The "At the equator" wording in `explain_state` for latitude 0 is my reading of the spec, which gives only the "40°N" form.
    """)
    return


if __name__ == "__main__":
    app.run()
