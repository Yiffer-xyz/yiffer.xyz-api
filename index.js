let port = 8013

let express = require('express')
let bodyParser = require('body-parser')
let mongoose = require('mongoose')
let passport = require('passport')
let sessions = require('express-session')
let RedisStore = require('connect-redis')(sessions)
let db = require('./config/db')
let app = express()

mongoose.connect(db.url)

require('./config/passport')(passport)

let sessionsSetup = require('./config/sessions-setup')
app.use(sessionsSetup)

app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: true }))

app.use(express.static('./public'))

app.use(passport.initialize())
app.use(passport.session())

require('./app/routes')(app, passport)

app.listen(port)
console.log('Magic happens on port ' + port)
