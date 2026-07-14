import os
import sys

# Add working directory to sys.path to find backend
sys.path.append(os.getcwd())

from backend.main import app

for route in app.routes:
    methods = getattr(route, "methods", "N/A")
    print(f"Path: {route.path}, Methods: {methods}")
