FROM node:22-alpine
WORKDIR /app

RUN apk add --no-cache openssl python3 make g++

COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --omit=optional

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
