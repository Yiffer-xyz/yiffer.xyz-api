const port = 8012
import express from 'express'
import bodyParser from 'body-parser'
const app = express()
import cors from 'cors'
import session from 'express-session'

import redis from 'redis'
import connRedis from 'connect-redis'
const redisStore = connRedis(session)
const redisClient = redis.createClient()
app.use(session({
  secret: 'de78asdta8dyasdhi2jadajadazuckerbergzuperc00l',
  name: '_redisPractice',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false },
  store: new redisStore({ host: 'localhost', port: 6379, client: redisClient, ttl: 86400 * 1000 * 60 }),
}));

import mysql from 'mysql'
import mysqlSettings from './config/db-config.js'
let mysqlPool = mysql.createPool(mysqlSettings)

import DatabaseFacade from './app/databaseFacade.js'
let databaseFacade = new DatabaseFacade(mysqlPool)

app.use(cors())

app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: true }))

app.use(express.static('./public'))

import routes from './app/routes.js'
routes(app, databaseFacade)

app.listen(port)
console.log('Magic happens on port ' + port)
