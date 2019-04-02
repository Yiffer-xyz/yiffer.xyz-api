let port = 8012

let express = require('express')
let bodyParser = require('body-parser')
let mongoose = require('mongoose')
let passport = require('passport')
let sessions = require('express-session')
let RedisStore = require('connect-redis')(sessions)
let db = require('./config/db')
let app = express()
let cors = require('cors')

let mysql = require('mysql')
let mysqlSettings = require('./config/db-config.json')
let mysqlPool = mysql.createPool(mysqlSettings)

let DatabaseFacade = require('./app/databaseFacade')
let databaseFacade = new DatabaseFacade(mysqlPool)

app.use(cors())

mongoose.connect(db.url, {useNewUrlParser: true})

require('./config/passport')(passport, databaseFacade)

let sessionsSetup = require('./config/sessions-setup')
app.use(sessionsSetup)

app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: true }))

app.use(express.static('./public'))

app.use(passport.initialize())
app.use(passport.session())

require('./app/routes')(app, passport, databaseFacade)

app.listen(port)
console.log('Magic happens on port ' + port)
