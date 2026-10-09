"""anywidget bridge for the Planetary Seasons Lab (three.js scene, charts, controls)."""
from __future__ import annotations

import math
from collections import defaultdict, deque
from pathlib import Path

import anywidget
import traitlets

_HERE = Path(__file__).parent
SPEEDS = (0.5, 1.0, 2.0, 4.0)
CAMERA_MODES = ("orbit", "planet")


class PlanetSeasonsWidget(anywidget.AnyWidget):
    _esm = _HERE / "planet_lab.js"
    _css = _HERE / "planet_lab.css"

    tilt_deg = traitlets.Float(23.5).tag(sync=True)
    latitude_deg = traitlets.Float(40.0).tag(sync=True)
    day_of_year = traitlets.Float(0.0).tag(sync=True)
    playing = traitlets.Bool(False).tag(sync=True)
    speed = traitlets.Float(1.0).tag(sync=True)
    camera_mode = traitlets.Unicode("orbit").tag(sync=True)

    @traitlets.validate("tilt_deg")
    def _v_tilt(self, proposal):
        v = proposal["value"]
        if not (math.isfinite(v) and 0.0 <= v <= 90.0):
            raise traitlets.TraitError(f"tilt_deg must be in [0, 90], got {v}")
        return v

    @traitlets.validate("latitude_deg")
    def _v_lat(self, proposal):
        v = proposal["value"]
        if not (math.isfinite(v) and -90.0 <= v <= 90.0):
            raise traitlets.TraitError(f"latitude_deg must be in [-90, 90], got {v}")
        return v

    @traitlets.validate("day_of_year")
    def _v_day(self, proposal):
        v = proposal["value"]
        if not (math.isfinite(v) and 0.0 <= v < 365.0):
            raise traitlets.TraitError(f"day_of_year must be in [0, 365), got {v}")
        return v

    @traitlets.validate("speed")
    def _v_speed(self, proposal):
        v = proposal["value"]
        if v not in SPEEDS:
            raise traitlets.TraitError(f"speed must be one of {SPEEDS}, got {v}")
        return v

    @traitlets.validate("camera_mode")
    def _v_cam(self, proposal):
        v = proposal["value"]
        if v not in CAMERA_MODES:
            raise traitlets.TraitError(f"camera_mode must be one of {CAMERA_MODES}, got {v!r}")
        return v


class ControlSync:
    """Keeps marimo controls and the widget in step without echo loops.

    `push` sends a marimo control value to the widget. `on_widget_change` runs when the
    browser changes a trait; it ignores values Python itself pushed and calls `notify`
    for the rest, so the notebook can rebuild the matching control. `is_echo` tells a
    control's applier cell that a value just came from the widget, so a stale rebuilt
    control cannot overwrite a newer browser value.
    """

    TRAITS = ("tilt_deg", "latitude_deg", "day_of_year", "playing", "speed", "camera_mode")

    def __init__(self, widget: PlanetSeasonsWidget, notify):
        self.widget = widget
        self.notify = notify  # notify(trait, value)
        self._pushed: dict = {}
        self._from_widget = defaultdict(lambda: deque(maxlen=64))
        for t in self.TRAITS:
            widget.observe(self._observer, names=[t])

    def _observer(self, change):
        name, new = change["name"], change["new"]
        if self._pushed.get(name) == new:
            return
        self._from_widget[name].append(new)
        if name == "day_of_year" and self.widget.playing:
            return  # the playback clock is not mirrored into marimo controls
        self.notify(name, new)

    def is_echo(self, trait: str, value) -> bool:
        return value in self._from_widget[trait]

    def push(self, trait: str, value) -> None:
        if getattr(self.widget, trait) == value:
            return
        self._pushed[trait] = value
        setattr(self.widget, trait, value)
