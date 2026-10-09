"""Python reference model for the Planetary Seasons Lab.

Circular orbit (the star distance never changes), so seasons come from axial
tilt alone. Day 0 is a March-like equinox. The browser widget re-implements the
same formulas in JavaScript; this module is the reference they are tested against.
"""
from __future__ import annotations

import math

import numpy as np

YEAR_DAYS = 365.0
_POLE_EPSILON = 1e-12
SOLAR_CONSTANT = 1361.0  # W/m^2

# Event days and names, in year order.
EVENT_DAYS = (0.0, 91.25, 182.5, 273.75)
EVENT_NAMES = (
    "March-like equinox",
    "June-like solstice",
    "September-like equinox",
    "December-like solstice",
)
_NORTH_SEASONS = ("spring", "summer", "autumn", "winter")
_SOUTH_SEASONS = ("autumn", "winter", "spring", "summer")

ANNUAL_CYCLE_KEYS = (
    "day_of_year",
    "declination_rad",
    "daylight_hours",
    "nighttime_hours",
    "insolation_w_m2",
    "temperature_c",
)


def _check_tilt(tilt_deg: float) -> float:
    tilt = float(tilt_deg)
    if not math.isfinite(tilt) or not 0.0 <= tilt <= 90.0:
        raise ValueError(f"tilt_deg must be in [0, 90], got {tilt_deg!r}")
    return tilt


def _check_latitude(latitude_deg: float) -> float:
    lat = float(latitude_deg)
    if not math.isfinite(lat) or not -90.0 <= lat <= 90.0:
        raise ValueError(f"latitude_deg must be in [-90, 90], got {latitude_deg!r}")
    return lat


def solar_declination(day_of_year: float, tilt_deg: float) -> float:
    """Solar declination (rad): arcsin(sin(eps) * sin(2 pi day / 365))."""
    tilt = _check_tilt(tilt_deg)
    day = float(day_of_year)
    if not math.isfinite(day):
        raise ValueError("day_of_year must be finite")
    s = math.sin(math.radians(tilt)) * math.sin(2.0 * math.pi * day / YEAR_DAYS)
    return math.asin(max(-1.0, min(1.0, s)))


def daylight_hours(latitude_deg: float, declination_rad: float) -> float:
    """Hours of daylight at a latitude for a given solar declination."""
    lat = _check_latitude(latitude_deg)
    decl = float(declination_rad)
    if not math.isfinite(decl):
        raise ValueError("declination_rad must be finite")
    if abs(lat) == 90.0:
        signed = math.copysign(1.0, lat) * decl
        if signed > _POLE_EPSILON:
            return 24.0
        if signed < -_POLE_EPSILON:
            return 0.0
        return 12.0
    phi = math.radians(lat)
    cos_h = -math.tan(phi) * math.tan(decl)
    if cos_h >= 1.0:
        h = 0.0
    elif cos_h <= -1.0:
        h = math.pi
    else:
        h = math.acos(max(-1.0, min(1.0, cos_h)))
    return 24.0 * h / math.pi


def daily_mean_insolation(
    latitude_deg: float, declination_rad: float, solar_constant: float = SOLAR_CONSTANT
) -> float:
    """Daily-mean top-of-atmosphere insolation (W/m^2), clamped at zero."""
    if not solar_constant > 0.0 or not math.isfinite(solar_constant):
        raise ValueError("solar_constant must be positive")
    lat = _check_latitude(latitude_deg)
    phi = math.radians(lat)
    decl = float(declination_rad)
    h = daylight_hours(lat, decl) * math.pi / 24.0
    q = solar_constant / math.pi * (
        h * math.sin(phi) * math.sin(decl) + math.cos(phi) * math.cos(decl) * math.sin(h)
    )
    return max(0.0, q)


def temperature_estimate(
    insolation, thermal_lag_days: float = 30.0, baseline_c: float = 14.0
) -> np.ndarray:
    """Lagged temperature response to one year of insolation (deg C).

    Equilibrium target = baseline + 20 (E - mean) / mean, relaxed with
    f = 1 - exp(-1/lag) per sample, 20 spin-up passes, one recorded pass,
    then shifted so the annual mean equals the baseline.
    """
    e = np.asarray(insolation, dtype=float)
    if e.ndim != 1 or e.size == 0:
        raise ValueError("insolation must be a non-empty 1-D array")
    if not np.all(np.isfinite(e)):
        raise ValueError("insolation must be finite")
    if np.any(e < 0.0):
        raise ValueError("insolation must be non-negative")
    if not thermal_lag_days > 0.0:
        raise ValueError("thermal_lag_days must be positive")
    mean = float(e.mean())
    if mean <= _POLE_EPSILON or float(e.max() - e.min()) <= _POLE_EPSILON:
        return np.full(e.shape, float(baseline_c))
    target = baseline_c + 20.0 * (e - mean) / mean
    f = 1.0 - math.exp(-1.0 / thermal_lag_days)
    state = float(baseline_c)
    for _ in range(20):
        for t in target:
            state += f * (t - state)
    out = np.empty_like(target)
    for i, t in enumerate(target):
        state += f * (t - state)
        out[i] = state
    return out + (baseline_c - out.mean())


def annual_cycle(tilt_deg: float, latitude_deg: float, days: int = 365) -> dict:
    """One year of declination, daylight, insolation and temperature."""
    _check_tilt(tilt_deg)
    _check_latitude(latitude_deg)
    if int(days) != days or days < 4:
        raise ValueError("days must be an integer >= 4")
    days = int(days)
    day = np.arange(days) * (YEAR_DAYS / days)
    decl = np.array([solar_declination(d, tilt_deg) for d in day])
    hours = np.array([daylight_hours(latitude_deg, d) for d in decl])
    insol = np.array([daily_mean_insolation(latitude_deg, d) for d in decl])
    return {
        "day_of_year": day,
        "declination_rad": decl,
        "daylight_hours": hours,
        "nighttime_hours": 24.0 - hours,
        "insolation_w_m2": insol,
        "temperature_c": temperature_estimate(insol),
    }


def event_name(day_of_year: float, tolerance: float = 0.01) -> str | None:
    """Name of the equinox/solstice within `tolerance` days (cyclic), else None."""
    day = float(day_of_year)
    for d, name in zip(EVENT_DAYS, EVENT_NAMES):
        dist = abs((day - d + YEAR_DAYS / 2) % YEAR_DAYS - YEAR_DAYS / 2)
        if dist < tolerance:
            return name
    return None


def solar_season(day_of_year: float, latitude_deg: float) -> str:
    """Season label such as 'Northern summer • June-like solstice'."""
    lat = _check_latitude(latitude_deg)
    day = float(day_of_year)
    event = event_name(day)
    suffix = f" • {event}" if event else ""
    if lat == 0.0:
        return f"Equatorial sunlight{suffix}"
    quarter = int(math.floor(day / 91.25)) % 4
    if lat > 0:
        return f"Northern {_NORTH_SEASONS[quarter]}{suffix}"
    return f"Southern {_SOUTH_SEASONS[quarter]}{suffix}"


def format_latitude(latitude_deg: float) -> str:
    """'40°N', 'Equator' or '35°S'."""
    lat = float(latitude_deg)
    if lat == 0.0:
        return "Equator"
    mag = abs(lat)
    text = f"{mag:.0f}" if mag == round(mag) else f"{mag:.1f}"
    return f"{text}°{'N' if lat > 0 else 'S'}"


def explain_state(tilt_deg: float, latitude_deg: float, day_of_year: float) -> str:
    """One-sentence explanation of the current state."""
    tilt = _check_tilt(tilt_deg)
    lat = _check_latitude(latitude_deg)
    decl = solar_declination(day_of_year, tilt)
    hours = daylight_hours(lat, decl)
    where = "the equator" if lat == 0.0 else format_latitude(lat)
    season = solar_season(day_of_year, lat).lower()
    return (
        f"At {where}, this {tilt:.1f}° tilt gives about {hours:.1f} hours of daylight "
        f"and {24.0 - hours:.1f} hours of night. The planet is in {season}."
    )
