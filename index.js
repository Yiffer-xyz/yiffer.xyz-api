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

import dotenv from 'dotenv'
import mysql from 'mysql'
import DatabaseFacade from './app/databaseFacade.js'
import routes from './app/routes.js'

const redisStore = connRedis(session)
const redisClient = redis.createClient(config.redis.port, config.redis.host)

dotenv.config()

const isDevEnv = process.env && process.env.IS_PRODUCTION === '0'

app.use(session({
  secret: config.sessionCookieSecret,
  name: 'yifferCookie',
  resave: false,
  saveUninitialized: true,
  rolling: true,
  cookie: {
    secure: !isDevEnv,
    maxAge: 86400000 * 30,
    // domain: isDevEnv ? undefined : '.yiffer.xyz',
    // sameSite: !isDevEnv,
  },
  proxy: true,
  store: new redisStore({
    host: config.redis.host,
    port: config.redis.port,
    client: redisClient,
    ttl: config.redis.ttl,
  }),
}));

let mysqlPool = mysql.createPool(config.db)

let databaseFacade = new DatabaseFacade(mysqlPool)

app.use(cors())
app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: true }))
app.set('query parser', 'extended')

app.use(express.static('./public'))

routes(app, databaseFacade, config, redisClient)

app.listen(port)
console.log('Magic happens on port ' + port)