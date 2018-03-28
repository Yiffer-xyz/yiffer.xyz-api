var api = require('./api')

let mysql = require('mysql')
let mysqlSettings = require('../config/db-config.json')
let mysqlPool = mysql.createPool(mysqlSettings)


module.exports = function (app, passport) {
  require('./auth')(app, passport)
  require('./admin')(app, passport)

  require('./api/comics-router')(app, mysqlPool)
  require('./api/artist-router')(app, mysqlPool)

  app.use('/api', api)
  app.get('*', function (req, res) {
    res.sendFile('views/index.html', {root: './public'})
  })
}