# Stage 1: Build
FROM node:24-slim AS builder

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

RUN npm run build

# Stage 2: Production
FROM node:24-slim

WORKDIR /app

COPY package*.json ./

# Install only production dependencies (no typescript, no types)
RUN npm install --omit=dev

# Copy only the compiled code from the builder stage
COPY --from=builder /app/dist ./dist

ENV PORT=7860

EXPOSE 7860

CMD [ "npm", "start" ]