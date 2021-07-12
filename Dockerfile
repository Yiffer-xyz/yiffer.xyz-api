FROM node:14.17.3-alpine AS base

COPY package*.json ./

RUN npm install

COPY . .

EXPOSE 8012

CMD ["node", "index.js"]
