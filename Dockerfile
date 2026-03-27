# CargoGent tracking service. Build with: docker build -t cargogent .
FROM mcr.microsoft.com/playwright/python:v1.50.0-jammy

ENV DEBIAN_FRONTEND=noninteractive

# Install Xvfb, wget, gnupg, and Chrome pinned to 146 (matches version_main=146 in UC trackers)
RUN apt-get update && apt-get install -y \
    xvfb \
    tzdata \
    wget \
    gnupg \
    && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' \
    && apt-get update \
    && apt-cache madison google-chrome-stable \
    && apt-get install -y "google-chrome-stable=146.0.7680.164-1" \
    && apt-mark hold google-chrome-stable \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download ChromeDriver matching pinned Chrome version
RUN python3 -c "import undetected_chromedriver as uc; uc.Chrome.__init__.__doc__" 2>/dev/null || true

COPY . .

EXPOSE 8000

# Set display variable for Xvfb (headful Chrome in headless Linux)
ENV DISPLAY=:99

# Copy entrypoint script and set it as the container entrypoint
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
