let port = 8012

let express = require('express')
let bodyParser = require('body-parser')

let app = express()
let cors = require('cors')

let session = require('express-session')
const redis = require('redis')
const redisStore = require('connect-redis')(session)

const redisClient = redis.createClient()
app.use(session({
  secret: 'de78asdta8dyasdhi2jadajadazuckerbergzuperc00l',
  name: '_redisPractice',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false },
  store: new redisStore({ host: 'localhost', port: 6379, client: redisClient, ttl: 86400 * 1000 * 60 }),
}));

let mysql = require('mysql')
let mysqlSettings = require('./config/db-config.json')
let mysqlPool = mysql.createPool(mysqlSettings)

let DatabaseFacade = require('./app/databaseFacade')
let databaseFacade = new DatabaseFacade(mysqlPool)

app.use(cors())

app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: true }))

app.use(express.static('./public'))

require('./app/routes')(app, databaseFacade)

app.listen(port)
console.log('Magic happens on port ' + port)
