# Growly production image.
#
# Node 24 is not optional: the whole data layer is `node:sqlite`, which only
# exists from Node 22.5 and is only stable on 24. The host this deploys to
# still ships Node 12, which is precisely why the app travels as a container.

FROM node:24-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:24-slim AS runner
WORKDIR /app

# Dates in Growly are local "YYYY-MM-DD" strings built from getFullYear /
# getMonth / getDate, so the container's clock decides what "today" means.
# Left at UTC, everything before 07:00 in Vietnam would land on yesterday.
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    TZ=Asia/Ho_Chi_Minh \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    GROWLY_DB=/app/data/growly.db

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
# Read at runtime by lib/db.ts, and by scripts/seed.mjs when seeding.
COPY --from=builder /app/lib/schema.sql ./lib/schema.sql
COPY --from=builder /app/scripts/seed.mjs ./scripts/seed.mjs

# The database is a file on a mounted volume; `node` is uid 1000 in this image.
RUN mkdir -p /app/data && chown -R node:node /app/data
USER node

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
