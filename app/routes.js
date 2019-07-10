const mysql = require('mysql')
const mysqlSettings = require('../config/db-config.json')
const mysqlPool = mysql.createPool(mysqlSettings)
const ModLogger = require('./mod-logger')

module.exports = function (app, databaseFacade) {
  const modLogger = new ModLogger(app, databaseFacade)

  let ComicsRouter = require('./api/comics-router')
  new ComicsRouter(app, databaseFacade, modLogger)

	let MiscRouter = require('./api/misc-router')
  new MiscRouter(app, databaseFacade, modLogger)

  let KeywordsRouter = require('./api/keywords-router')
  new KeywordsRouter(app, databaseFacade, modLogger)

  let AuthRouter = require('./api/auth-router')
  new AuthRouter(app, databaseFacade)

  let ArtistRouter = require('./api/artist-router')
  new ArtistRouter(app, databaseFacade, modLogger)

  app.get('*', function (req, res) {
    res.sendFile('views/index.html', {root: './public'})
  })
}
