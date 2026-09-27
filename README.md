# Axiomatic Intelligence Showcase

Interactive [Marimo](https://marimo.io/) notebooks demonstrating how Axiomatic
Intelligence performs on scientific and engineering problems.

## Prerequisites

- [`uv`](https://docs.astral.sh/uv/getting-started/installation/)
- Access to the private `ax-stack` repository

## Run the notebooks

Install the locked development environment:

```bash
make install
```

Run it as a read-only app:

```bash
uv run marimo run notebooks/planetary_seasons/output.py
```

Open the notebook editor:

```bash
uv run marimo edit notebooks/planetary_seasons/output.py
```

## Notebooks

| Notebook | What it demonstrates |
| --- | --- |
| [Planetary seasons lab](notebooks/planetary_seasons/output.py) | Interactive 3D axial tilt, latitude, daylight, nighttime, and seasonal temperature for learners ages 8–15 |
