const port = 8012
import express from 'express'
import bodyParser from 'body-parser'
const app = express()
import cors from 'cors'

import fs from 'fs'
import yaml from 'js-yaml'
import cookieParser from 'cookie-parser'

let fileContents = fs.readFileSync('./config/cfg.yml', 'utf8');
const config = yaml.load(fileContents)

import mysql from 'mysql'
import DatabaseFacade from './app/databaseFacade.js'
import routes from './app/routes.js'

const isDevEnv = process.env && process.env.IS_PRODUCTION === '0'

let mysqlPool = mysql.createPool(config.db)

let databaseFacade = new DatabaseFacade(mysqlPool)

app.use(cors())
app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: true }))
app.set('query parser', 'extended')

app.use(cookieParser())

app.use(express.static('./public'))

routes(app, databaseFacade, config)

app.listen(port)
console.log('Magic happens on port ' + port)