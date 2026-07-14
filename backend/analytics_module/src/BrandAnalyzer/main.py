#!/usr/bin/env python3
"""Brand Equity Analyzer - Entry point (ported from C# Brand Equity Analyzer)."""

import sys

from main_window import MainWindow


def main() -> int:
    use_ui = "--ui" in sys.argv or "-u" in sys.argv
    if use_ui:
        app = MainWindow()
        app.mainloop()
        return 0
    # Idle/headless mode: run with default inputs, no UI
    app = MainWindow(headless=True)
    app.mainloop()
    return 0


if __name__ == "__main__":
    sys.exit(main())
