FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000 DB_PATH=/data/tracking.db SECURE_COOKIES=1
COPY package.json ./
COPY src ./src
COPY public ./public
COPY scripts ./scripts
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost:3000/health || exit 1
CMD ["node", "--no-warnings=ExperimentalWarning", "src/server.js"]
