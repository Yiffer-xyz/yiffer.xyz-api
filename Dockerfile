FROM node:14.14.0-alpine AS base

COPY package*.json ./

RUN npm install

COPY . .

EXPOSE 8012

CMD ["node", "index.js"]
