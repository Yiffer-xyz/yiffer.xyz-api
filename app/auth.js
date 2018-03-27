var User = require('./mongoose_models/user-model')
var donatorUsers = require('../config/donator-users.json')

module.exports = function (app, passport) {
  app.get('/userSession', function (req, res) {
    if (!req.session || !req.session.user) {
      res.json({status: false, username: false, yourRating: false})
    } else {
      var retur = {status: true, username: req.session.user.username}
      var comicID = req.query.comicID

      User.findOne({username: retur.username}, function (err, userDoc) {
        if (err) {
          throw err
        }

        retur.yourRating = userDoc.comicVotes[comicID] || 0
        res.json(retur)
      })
    }
  })

  app.post('/login', function (req, res, next) {
    passport.authenticate('local-login', function (err, user, info) {
      if (err) {
        return next(err)
      }
      if (!user) {
        if (typeof info === 'object') {
          info = 'empty field(s)'
        }
        return res.json({success: false, message: info})
      }

      req.login(user, function (err) {
        if (err) return next(err)

        req.session.user = { username: user.username }
        return res.json({success: true, message: user.username})
      })
    })(req, res, next)
  })

  app.post('/register', function (req, res, next) {
    passport.authenticate('local-register', function (err, user, info) {
      if (err) {
        return next(err)
      }
      if (!user) {
        return res.json({success: false, message: info})
      }

      req.login(user, function (err) {
        if (err) return next(err)

        req.session.user = { username: user.username }
        return res.json({success: true, message: user.username})
      })
    })(req, res, next)
  })

  app.get('/logout', function (req, res) {
    req.session.destroy()
    res.end('ok')
  })
}
