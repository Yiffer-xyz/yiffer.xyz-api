var port = 8012

var express = require('express')
var bodyParser = require('body-parser')
var mongoose = require('mongoose')
var passport = require('passport')
var sessions = require('express-session')
var RedisStore = require('connect-redis')(sessions)
var db = require('./config/db')
var app = express()

mongoose.connect(db.url)


require('./config/passport')(passport)

var sessionsSetup = require('./config/sessions-setup')
app.use(sessionsSetup)

app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: true }))

app.use(express.static('./public'))

app.use(passport.initialize())
app.use(passport.session())

require('./app/routes')(app, passport)

app.listen(port)
console.log('Magic happens on port ' + port)
