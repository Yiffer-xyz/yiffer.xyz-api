var api = require('./api')

let mysql = require('mysql')
let mysqlSettings = require('../config/db-config.json')
let mysqlPool = mysql.createPool(mysqlSettings)

let DatabaseFacade = require('./databaseFacade')
let databaseFacade = new DatabaseFacade(mysqlPool)

module.exports = function (app, passport) {
  require('./auth')(app, passport)
  require('./admin')(app, passport)

  require('./api/comics-router')(app, mysqlPool)
  require('./api/artist-router')(app, mysqlPool)
  require('./api/modpanel-router')(app, mysqlPool)
  require('./api/keywords-router')(app, mysqlPool)
	// require('./api/misc-router')(app, mysqlPool)
	
	let MiscRouter = require('./api/misc-router')
	new MiscRouter(app, databaseFacade, mysqlPool)

  app.use('/api', api)
  app.get('*', function (req, res) {
    res.sendFile('views/index.html', {root: './public'})
  })
}