# Stage 1: Build
FROM node:24-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Stage 2: Production
FROM node:24-slim

# 1. Set environment to production
ENV NODE_ENV=production

WORKDIR /app

# 2. Change ownership of the workdir to the 'node' user before switching
RUN chown node:node /app

# 3. Switch to the non-root user
USER node

# 4. Copy dependency manifests with correct ownership
COPY --chown=node:node package*.json ./

# Install only production dependencies
RUN npm install --omit=dev

# 5. Copy the compiled code with correct ownership
COPY --chown=node:node --from=builder /app/dist ./dist

ENV PORT=7860
EXPOSE 7860

# 6. Recommendation: Use 'node' directly to handle OS signals (SIGTERM) better than 'npm'
CMD [ "node", "dist/index.js" ]