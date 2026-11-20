FROM node:24-alpine
WORKDIR /app
COPY --chown=node:node server.mjs package.json healthcheck.mjs ./
COPY --chown=node:node public ./public
USER node
ENV NODE_ENV=production PORT=4173 LISTEN_HOST=0.0.0.0
EXPOSE 4173
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD ["node","healthcheck.mjs"]
CMD ["node","server.mjs"]
