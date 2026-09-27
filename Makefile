.PHONY: install run-seasons clean

install:
	uv sync

run-seasons:
	uv run marimo run notebooks/planetary_seasons/output.py

clean:
	rm -rf -- notebooks/__marimo__ notebooks/*/__marimo__
	find notebooks -type d -name __pycache__ -prune -exec rm -rf -- {} +
	find notebooks -type f \( -name '*.pyc' -o -name '*.pyo' \) -delete
