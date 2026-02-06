FROM ghcr.io/puppeteer/puppeteer:21.5.2

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

WORKDIR /usr/src/app

# Copy files with correct ownership for the pptruser
COPY --chown=pptruser:pptruser package*.json ./

# Install dependencies
RUN npm install

# Copy application code with correct ownership
COPY --chown=pptruser:pptruser . .

CMD [ "node", "server.js" ]
