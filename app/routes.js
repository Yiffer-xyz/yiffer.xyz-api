var api = require('./api')

let mysql = require('mysql')
let mysqlSettings = require('../config/db-config.json')
let mysqlPool = mysql.createPool(mysqlSettings)

module.exports = function (app, databaseFacade) {
  require('./admin')(app)

  require('./api/comics-router')(app, mysqlPool)
  require('./api/artist-router')(app, mysqlPool)
  require('./api/modpanel-router')(app, mysqlPool)

	let MiscRouter = require('./api/misc-router')
  new MiscRouter(app, databaseFacade)
  let KeywordsRouter = require('./api/keywords-router')
  new KeywordsRouter(app, databaseFacade)
  let AuthRouter = require('./api/auth-router')
  new AuthRouter(app, databaseFacade)

  app.use('/api', api)
  app.get('*', function (req, res) {
    res.sendFile('views/index.html', {root: './public'})
  })
}