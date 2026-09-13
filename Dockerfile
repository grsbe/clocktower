# --- build the client -------------------------------------------------------
FROM node:24-alpine AS client-build
WORKDIR /build

# `npm ci` installs exactly what package-lock.json pins, and --ignore-scripts
# means no dependency gets to execute code during the build. esbuild and
# rollup ship their native binaries as per-platform packages, so they work
# without their install hooks.
COPY client/package.json client/package-lock.json ./client/
RUN cd client && npm ci --ignore-scripts

COPY shared ./shared
COPY client ./client
RUN cd client && npm run build
# vite writes to ../server/public

# --- runtime ----------------------------------------------------------------
FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci --omit=dev --ignore-scripts && npm cache clean --force

COPY shared ./shared
COPY server/src ./server/src
COPY --from=client-build /build/server/public ./server/public

ENV PORT=3000
EXPOSE 3000
USER node

HEALTHCHECK --interval=30s --timeout=4s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/src/index.js"]
