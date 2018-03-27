var fs = require('fs')
 
var mysql = require('mysql')
var mysqlSettings = require('../config/db-config.json')
var mysqlPool = mysql.createPool(mysqlSettings)

var authorizedUsers = require('../config/autorized-users.json')

var archiver = require('archiver')

function authorizeAdmin (req) {
  if (!req.session || !req.session.user) { return false }
  if (authorizedUsers.admins.indexOf(req.session.user.username) === -1) { return false }
  return true
}


function authorizeDonator (req) {
  if (!req.session || !req.session.user) { return false }
  var username = req.session.user.username

  mysqlPool.getConnection(function (err, connection) {
    var query = 'SELECT Username FROM DonatorUser WHERE Username = ?'
    connection.query(query, [username], function (err3, results3, fields3) {
      if (err3) { connection.release() } 
      connection.release()

      // console.log(results3, username, results3[0].Username, results3.length, results3[0].Username == username)
      return ((results3.length > 0) && (results3[0].Username == username))
    })
  })
}

module.exports = function (app, passport) {
  app.get('/authorizeDonator', function (req, res) {

    if (!req.session || !req.session.user) { return res.json({donator: false, key: false}) }
    var username = req.session.user.username

    mysqlPool.getConnection(function (err, connection) {
      var query = 'SELECT Username FROM DonatorUser WHERE Username = ?'
      connection.query(query, [username], function (err3, results3, fields3) {
        if (err3) { connection.release() } 
        connection.release()

        if (results3.length > 0 && results3[0].Username == username) {
          return res.json({donator: true, key: '021njnwjfusjkfn89c23nfsnfkas'}) 
        }

        res.json({donator: false, key: false})
      })
    })
  })

  app.post('/admin/addTagsToComic', modAuthorization, function (req, res) {
    var comicName = req.body.comicName
    var newTags   = req.body.tags
    var username  = req.session.user.username

    var idQuery = 'SELECT Id FROM Comic WHERE Name = ?'
    var tagLogQuery = 'INSERT INTO TagLog (TagNames, ComicName, username) VALUES (?, ?, ?)'

    mysqlPool.getConnection(function (err, connection) {
      if (err) {
        res.end('Some database error (C102), ask admin')
      }
      connection.query(idQuery, [comicName], function (err2, results, fields) {
        if (err2) {
          res.end('Some database error (C92), ask admin')
          return connection.release()
        }
        if (results.length == 0) {
          res.end('No comics with that name')
          return connection.release()
        }
        var comicId = results[0].Id

        var insertQuery = 'INSERT INTO ComicKeyword (ComicId, Keyword) VALUES '
        var insertList = []
        for (var tag of newTags) {
          if (tag.toLowerCase().indexOf('drop ') >= 0) return connection.release()
          insertList.push('(' + comicId + ', \'' + tag + '\')')
        }
        insertQuery += insertList.join(',') 

        connection.query(insertQuery, function (err3, results3, fields3) {
          if (err3) {
            res.end('Some database error (C93), ask admin. Possible problem: this comic already has this tag')
          } else {
            res.end('ok')

            connection.query(tagLogQuery, [newTags.toString(), comicName, username], function (err4, results4, fields4) {
              connection.release()
            })
          }
        })
      })
    })
  })

  app.get('/stats/dailyAllUserStats', modAuthorization, function (req, res) {
    mysqlPool.getConnection(function (err, connection) {
      var query = 'SELECT COUNT(*) AS count, YEAR(Timestamp) AS year, MONTH(Timestamp) AS month, DAY(Timestamp) AS day FROM Log GROUP BY year, month, day'
      connection.query(query, function (err3, results3, fields3) {
        if (err3) {
          return connection.release()
        } 
        
        res.json(results3)
        connection.release()
      })
    })
  })

  app.get('/stats/dailyRegisteredUserStats', modAuthorization, function (req, res) {
    mysqlPool.getConnection(function (err, connection) {
      var query = 'SELECT COUNT(*) AS count, YEAR(Timestamp) AS year, MONTH(Timestamp) AS month, DAY(Timestamp) AS day FROM Log WHERE User IS NOT NULL GROUP BY year, month, day'
      connection.query(query, function (err3, results3, fields3) {
        if (err3) {
          return connection.release()
        } 
        
        res.json(results3)
        connection.release()
      })
    })
  })

  app.get('/stats/fiveMinuteUserStats', modAuthorization, function (req, res) {
    mysqlPool.getConnection(function (err, connection) {
      var query = 'SELECT COUNT(*) AS count, HOUR(Timestamp) AS hour, MINUTE(Timestamp) AS minute FROM Log WHERE Timestamp >= NOW() - INTERVAL 1 DAY GROUP BY UNIX_TIMESTAMP(Timestamp) DIV 300'
      connection.query(query, function (err3, results3, fields3) {
        if (err3) {
          return connection.release()
        } 
        
        res.json(results3)
        connection.release()
      })
    })
  })


  app.post('/admin/removeTagsFromComic', modAuthorization, function (req, res) {

    var comicName = req.body.comicName.replace('\'', '\\\'')
    var tagsToDelete = req.body.tags

    var query = 'DELETE FROM ComicKeyword WHERE ComicId = (SELECT Id FROM Comic WHERE Name=\''+comicName+'\') AND ('
    var insertList = []
    for (var tag of tagsToDelete) {
      if (tag.toLowerCase().indexOf('drop ') >= 0) return res.end('no')
        insertList.push('Keyword = \'' + tag + '\'')
    }
    query += insertList.join(' OR ')
    query += ')'

    mysqlPool.getConnection(function (err, connection) {
      connection.query(query, function (err3, results3, fields3) {
        if (err3) {
          res.end('Some database error (F93), ask admin if you can\'t figure out what was wrong yourself.')
          return connection.release()
        } else {
          res.end('ok')
        }
        connection.release()
      })
    })
  })


  app.post('/admin/createTag', modAuthorization, function (req, res) {
    var insertQuery = 'INSERT INTO Keyword (KeywordName, Description) VALUES (?, ?)'
    mysqlPool.getConnection(function (err, connection) {
      connection.query(insertQuery, [req.body.tagName, req.body.tagDescription], function (err2, results, fields) {
        if (err2) {
          res.end('Some database error (E12), ask main mod')
          return connection.release()
        }
        res.end('ok')
        connection.release()
      })
    })
  })

  app.get('/admin/task', function (req, res) {
    fs.readdir(__dirname + '/../public/comics', function (err, data) {
      var counter = 683
      var intervallTime = 4500
      var numberOfTimes = 9

      var intervallet = setInterval(function () {
        zipIt(data, counter)
        counter += 1
      }, intervallTime)

      setTimeout(function () {
        clearInterval(intervallet)
        console.log('interval cleared')
      }, 1000 + intervallTime*numberOfTimes)
    })
  })

  app.post('/keywordSuggestionResponse', modAuthorization, (req, res) => {
    let comicId = req.body.comicId
    let keyword = req.body.keyword
    let approval = JSON.parse(req.body.approval)
    let extension = req.body.extension
    let modName = req.session.user.username
    let updateQuery = 'UPDATE KeywordSuggestion SET Approved = ?, Moderator = ?, Processed = 1 WHERE ComicId = ? AND Keyword = ?'
    let insertQuery = extension ? 'INSERT INTO ComicKeyword (ComicId, Keyword) VALUES (?, ?)' : 'DELETE FROM ComicKeyword WHERE ComicId = ? AND Keyword = ?'
    let tagLogQuery = 'INSERT INTO TagLog (TagNames, ComicName, username) VALUES (?, ?, ?)'

    mysqlPool.getConnection((err, connection) => {
      connection.query(updateQuery, [approval, modName, comicId, keyword], (err, rows) => {
        if (err) { connection.release(); return res.json({error: 'Database query error: ' + err.toString()}) }

        connection.query(tagLogQuery, [keyword, ''+comicId, modName], (err, rows) => {
          if (err) { connection.release(); return res.json({error: 'Database query error: ' + err.toString()}) }

          if (approval) {
            connection.query(insertQuery, [comicId, keyword], (err, rows) => {
              if (err) { connection.release(); return res.json({error: 'Database query error: ' + err.toString()}) }
              res.json({message: 'Success!'})
              connection.release()
            })
          }
          else {
            res.json({message: 'Success!'})
            connection.release()
          }
        })
      })
    })
  })
}


function zipIt(array, counter) {
  console.log('Zipping! ' + counter + '   ' + array[counter])

  var outputStream = fs.createWriteStream(__dirname + '/../public/021njnwjfusjkfn89c23nfsnfkas/' + array[counter] + '.zip')
  var archive = archiver('zip', {zlib: {level: 9}})

  archive.pipe(outputStream)

  archive.directory(__dirname + '/../public/comics/'+ array[counter] +'/', false)

  archive.finalize()
}


function isEmpty (obj) {
  for (var prop in obj) {
    if (obj.hasOwnProperty(prop)) return false
  }
  return true
}


function objectLength (obj) {
  var c = 0
  for (var p in obj) {
    if (obj.hasOwnProperty(p)) c++
  }
  return c
}

var adminAuthorization = function (req, res, next) {
  if (authorizedUsers.admins.indexOf(req.session.user.username) >= 0) {
    next()
  } 
  else {
    res.end('You do not have access to this data!')
  }
}

var modAuthorization = function (req, res, next) {
  if (req.session && req.session.user && authorizedUsers.mods.indexOf(req.session.user.username) >= 0) {
    next()
  } 
  else {
    res.end('You must be a mod to have access to this!')
  }
}

var startDate = new Date('sep 01 2016')
var oneDay = 86400000

function fixDate (date, subStrEnd) {
  if (!subStrEnd) subStrEnd = 17
  return (new Date(date).toString()).substr(4, subStrEnd)
}

function getDayDifference (date1, date2) {
  return Math.floor((date1 - date2) / (oneDay))
}
