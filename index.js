const port = 8012
import express from 'express'
import bodyParser from 'body-parser'
const app = express()
import cors from 'cors'
import session from 'express-session'

import fs from 'fs'
import yaml from 'js-yaml'
let fileContents = fs.readFileSync('./config/cfg.yml', 'utf8');
const config = yaml.load(fileContents)

import redis from 'redis'
import connRedis from 'connect-redis'
const redisStore = connRedis(session)
const redisClient = redis.createClient(config.redis.port, config.redis.host);

import dotenv from 'dotenv'
dotenv.config()

const insecureCookie = process.env && process.env.IS_PRODUCTION === '0'

app.use(session({
  secret: config.sessionCookieSecret,
  name: 'yifferCookie',
  resave: false,
  saveUninitialized: true,
  rolling: true,
  cookie: {
    secure: !insecureCookie,
    domain: '.yiffer.xyz',
    maxAge: 86400000 * 60,
  },
  proxy: true,
  store: new redisStore({
    host: config.redis.host,
    port: config.redis.port,
    client: redisClient,
    ttl: config.redis.ttl,
  }),
}));

import mysql from 'mysql'
let mysqlPool = mysql.createPool(config.db)

import DatabaseFacade from './app/databaseFacade.js'
let databaseFacade = new DatabaseFacade(mysqlPool)

app.use(cors())
app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: true }))
app.set('query parser', 'extended')

app.use(express.static('./public'))

import routes from './app/routes.js'
routes(app, databaseFacade, config, redisClient)

app.listen(port)
console.log('Magic happens on port ' + port)
