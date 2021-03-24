const port = 8012
import express from 'express'
import bodyParser from 'body-parser'
const app = express()
import cors from 'cors'
import session from 'express-session'

import redis from 'redis'
import connRedis from 'connect-redis'
import redisConfig from './config/redis-config.js'
const redisStore = connRedis(session)
const redisClient = redis.createClient(redisConfig.port, redisConfig.host);

import dotenv from 'dotenv'
dotenv.config()

app.use(session({
  secret: 'de78asdta8dyasdhi2jadajadazuckerbergzuperc00l',
  name: 'yifferCookie',
  resave: false,
  saveUninitialized: true,
  rolling: true,
  cookie: { secure: process.env.IS_PRODUCTION === '1' },
  proxy: true,
  store: new redisStore({
    host: redisConfig.host,
    port: redisConfig.port,
    client: redisClient,
    ttl: redisConfig.ttl,
  }),
}));

import mysql from 'mysql'
import mysqlSettings from './config/db-config.js'
let mysqlPool = mysql.createPool(mysqlSettings)

import DatabaseFacade from './app/databaseFacade.js'
let databaseFacade = new DatabaseFacade(mysqlPool)

app.use(cors())
app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: true }))
app.set('query parser', 'extended')

app.use(express.static('./public'))

import { prerenderToken } from './config/prerender.js'
import prerender from 'prerender-node'
prerender.set('prerenderToken', prerenderToken)
  .blacklisted(['/api/*'])

app.use(prerender);

import routes from './app/routes.js'
routes(app, databaseFacade)

const server = app.listen(port)
console.log('Magic happens on port ' + port)

function startGracefulShutdown () {
  console.log('Starting shutdown of express...')
  server.close(function () {
    console.log('Express shut down.')
  })
}

process.on('SIGTERM', startGracefulShutdown);
process.on('SIGINT', startGracefulShutdown);
