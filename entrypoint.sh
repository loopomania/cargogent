#!/bin/sh
# Clean up any phantom X11 locks from previous container restarts
rm -rf /tmp/.X99-lock /tmp/.X11-unix/X99

# Start Xvfb in the background
Xvfb :99 -screen 0 1920x1080x24 -ac &
# Give Xvfb a moment to start
sleep 2

# Launch the FastAPI application
export NEW_RELIC_CONFIG_FILE=newrelic.ini
exec newrelic-admin run-program uvicorn app:app --host 0.0.0.0 --port 8000
