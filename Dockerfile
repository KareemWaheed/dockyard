# Stage 1: Build frontend
FROM node:20-alpine AS frontend-build
WORKDIR /app
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ .
RUN npm run build

# Stage 2: Build backend (needs python/make/g++ to compile better-sqlite3)
FROM node:20-alpine AS backend-build
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY backend/package*.json ./
RUN npm install --omit=dev
COPY backend/ .

# Stage 3: Final image — only runtime deps, no build tools
FROM node:20-alpine
RUN apk add --no-cache git bash nginx aws-cli jq curl docker-cli openjdk8-jdk maven

WORKDIR /app
COPY --from=backend-build /app .
COPY --from=frontend-build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/http.d/default.conf

# Bundle app-provided scripts
COPY scripts/aws-sg.sh /scripts/aws-sg.sh
RUN chmod +x /scripts/aws-sg.sh

EXPOSE 80

CMD ["sh", "-c", "node /app/server.js & nginx -g 'daemon off;'"]
