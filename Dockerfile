# CargoGent tracking service. Build with: docker build -t cargogent .
FROM mcr.microsoft.com/playwright/python:v1.50.0-jammy

ENV DEBIAN_FRONTEND=noninteractive

# Install Xvfb, wget, gnupg, and Chrome
RUN apt-get update && apt-get install -y \
    xvfb \
    tzdata \
    wget \
    gnupg \
    && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' \
    && apt-get update \
    && apt-get install -y google-chrome-stable \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

# Set display variable
ENV DISPLAY=:99

# Copy entrypoint script and set it as the container entrypoint
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
