FROM node:14.17.3-alpine as base

RUN apk add g++ make python

COPY package*.json ./

RUN npm install

COPY . .

EXPOSE 8012

CMD ["node", "index.js"]
