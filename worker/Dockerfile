FROM node:22-slim
RUN apt-get update && apt-get install -y ffmpeg python3 python3-pip && pip3 install --break-system-packages yt-dlp && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY server.mjs .
CMD ["node", "server.mjs"]
