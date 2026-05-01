# CargoGent tracking service. Build with: docker build -t cargogent .
FROM mcr.microsoft.com/playwright/python:v1.50.0-jammy

ENV DEBIAN_FRONTEND=noninteractive

# Install Xvfb, wget, gnupg, and Chrome pinned to 146 (matches version_main=147 in UC trackers)
RUN apt-get update && apt-get install -y xvfb tzdata && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
RUN python3 -m playwright install chromium

# Removed legacy UC warming logic

COPY . .

EXPOSE 8000

# Set display variable for Xvfb (headful Chrome in headless Linux)
ENV DISPLAY=:99

# Copy entrypoint script and set it as the container entrypoint
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
