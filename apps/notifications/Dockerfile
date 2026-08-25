FROM node:22-alpine AS development

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm install --legacy-peer-deps
COPY tsconfig.json tsconfig.json
COPY nest-cli.json nest-cli.json
COPY apps/notifications ./apps/notifications
COPY libs libs

RUN npm run build notifications

CMD ["node", "dist/apps/notifications/main.js"]

FROM node:22-alpine AS production

ARG NODE_ENV=production
ENV NODE_ENV=${NODE_ENV}

WORKDIR /usr/src/app

COPY apps/notifications/package.json ./package.json

RUN npm install --omit=dev --legacy-peer-deps

COPY --from=development /usr/src/app/dist ./dist

CMD ["node", "dist/apps/notifications/main.js"]
