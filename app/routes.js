var api = require('./api')

let mysql = require('mysql')
let mysqlSettings = require('../config/db-config.json')
let mysqlPool = mysql.createPool(mysqlSettings)

module.exports = function (app, databaseFacade) {
  require('./admin')(app)

  require('./api/modpanel-router')(app, mysqlPool)

  let ComicsRouter = require('./api/comics-router')
  new ComicsRouter(app, databaseFacade)
  
	let MiscRouter = require('./api/misc-router')
  new MiscRouter(app, databaseFacade)
  
  let KeywordsRouter = require('./api/keywords-router')
  new KeywordsRouter(app, databaseFacade)
  
  let AuthRouter = require('./api/auth-router')
  new AuthRouter(app, databaseFacade)
  
  let ArtistRouter = require('./api/artist-router')
  new ArtistRouter(app, databaseFacade)

  app.use('/api', api)
  app.get('*', function (req, res) {
    res.sendFile('views/index.html', {root: './public'})
  })
}