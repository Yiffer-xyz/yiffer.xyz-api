FROM node:14.14.0-alpine AS base

COPY package*.json ./

RUN npm install

COPY . .


RUN apk add --no-cache git
RUN apk add --no-cache openssh
RUN git clone https://github.com/ragnarob/yiffer.xyz-vue.git client
WORKDIR ./client
RUN npm install
RUN ["npm", "run", "build"]
WORKDIR /
RUN cp -r client/dist/* ./public/


EXPOSE 8012

CMD ["node", "index.js"]
