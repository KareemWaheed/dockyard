FROM node:20-alpine

# git and bash are needed for clone/checkout/build scripts
RUN apk add --no-cache git bash

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

EXPOSE 3001
CMD ["sh", "-c", "[ -f /app/data/notes.json ] || echo '{}' > /app/data/notes.json && node server.js"]
