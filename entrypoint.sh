#!/bin/sh
# Start Xvfb in the background
Xvfb :99 -screen 0 1920x1080x24 -ac &
# Give Xvfb a moment to start
sleep 2
# Launch the FastAPI application
exec uvicorn app:app --host 0.0.0.0 --port 8000
