var express = require('express')
var app = express()
var fs = require('fs')
var multiparty = require('connect-multiparty')
var multipartyMiddelware = multiparty()
 
var mysql = require('mysql')
var mysqlSettings = require('../config/db-config.json')
var mysqlPool = mysql.createPool(mysqlSettings)

var authorizedUsers = require('../config/autorized-users.json')


function authorizeAdmin (req) {
  if (!req.session || !req.session.user) { return false }
  if (authorizedUsers.admins.indexOf(req.session.user.username) === -1) { return false }
  return true
}
function authorizeMod (req) {
  if (!req.session || !req.session.user) { return false }
  if (authorizedUsers.mods.indexOf(req.session.user.username) === -1) { return false }
  return true
}


app.post('/addLog', function (req, res) {
  var urll = req.body.path
  var user = req.body.username
  var query
  var dailyCookie = req.body.dailyCookie
  var monthlyCookie = req.body.monthlyCookie

  if (user) {
    query = 'INSERT INTO Log (User, Url, DailyCookie, MonthlyCookie) VALUES (?, ?, ?, ?)'
    mysqlPool.getConnection(function (err, connection) {
      connection.query(query, [user, urll, dailyCookie, monthlyCookie], function (err, results, fields) {
        if (err) {return returnError(500, 'Database query error', res, connection, err)}
        connection.release()
        res.end('ok')
      })
    })
  }
  else {
    query = 'INSERT INTO Log (Url, DailyCookie, MonthlyCookie) VALUES (?, ?, ?)'
    mysqlPool.getConnection(function (err, connection) {
      connection.query(query, [urll, dailyCookie, monthlyCookie], function (err, results, fields) {
        if (err) {return returnError(500, 'Database query error', res, connection, err)}
        connection.release()
        res.end('ok')
      })
    })
  }

  logNode(req, urll)
})


app.get('/getModNames', function (req, res) {
  fs.readdir(__dirname + '/../public/mod-favorites', function (err, files) {
    res.json(files)
  })
})


module.exports = app.get('/getComicRating', function (req, res) {
  var username = req.query.username
  var comicId  = req.query.comicId
  var query = 'SELECT Vote FROM ComicVote WHERE Username = ? AND ComicId = ?'

  mysqlPool.getConnection(function (err, connection) {
    connection.query(query, [username, comicId], function (err2, results, fields) {
      if (err2) return connection.release()
      if (results.length == 0)
        res.end('0')
      else
        res.end('' + results[0].Vote)
      connection.release()
    })
  })
})
 

module.exports = app.post('/addVote', function (req, res) {
  if (!req.session || !req.session.user) { return res.json({error: 'Not logged in'}) }
  var username = req.session.user.username
  var number   = parseInt(req.body.vote)
  var comicId  = req.body.comicId

  var removeQuery = 'DELETE FROM ComicVote WHERE Username = ? AND ComicId = ?'
  var insertQuery = 'INSERT INTO ComicVote (Username, ComicId, Vote) VALUES (?, ?, ?)'
  var newRatingQuery = 'SELECT AVG(Vote) AS avg FROM ComicVote WHERE ComicId = ?'

  mysqlPool.getConnection(function (err, connection) {
    connection.query(removeQuery, [username, comicId], function (err2, results, fields) {
      if (err2) {return connection.release()}

      if (number > 0) {
        connection.query(insertQuery, [username, comicId, number], function (err3, results2, fields2) {
          if (err3) {return connection.release()}

          connection.query(newRatingQuery, [comicId], function (err4, results3, fields3) {
            if (err4) {return connection.release()}
            res.json(results3[0]['avg'])
            connection.release()
          })
        })
      }
      else {
        connection.query(newRatingQuery, [comicId], function (err4, results3, fields3) {
          if (err4) {return connection.release()}
          res.json(results3[0]['avg'])
          connection.release()
        })
      }
    })
  })
})


module.exports = app.get('/getComicLinks', function (req, res) {
  var comicId = req.query.comicId
  var prevQuery = 'SELECT Name FROM ComicLink INNER JOIN Comic ON (Id = FirstComic) WHERE LastComic = ?'
  var nextQuery = 'SELECT Name FROM ComicLink INNER JOIN Comic ON (Id = LastComic) WHERE FirstComic = ?'
  var retur = {previousComic: null, nextComic: null}

  mysqlPool.getConnection(function (err, connection) {
    if (err) return connection.release()
    connection.query(prevQuery, [comicId], function (err2, results2, fields2) {
      if (err2) return connection.release()
      if (results2.length > 0) {
        retur.previousComic = results2[0].Name
      }

      connection.query(nextQuery, [comicId], function (err3, results3, fields3) {
        if (err3) return connection.release()
        if (results3.length > 0) {
          retur.nextComic = results3[0].Name
        }

        res.json(retur)
        connection.release()
      })
    })
  })
})


function returnError (errorCode, errorMessage, res, mysqlConnection, err) {
  if (err) {console.log(err)}
  if (res) { res.json({ error: errorMessage }) }
  if (mysqlConnection) { mysqlConnection.release() }
}


app.post('/addFeedback', function (req, res) {
  if (!req.session || !req.session.user || req.body.feedback.length < 7) return res.end()

  var newContentForFile = '[[' + req.session.user.username + ']]  ' + req.body.feedback

  fs.readFile(__dirname + '/contact.txt', function (err, data) {
    var newData = data.toString() + '\n\n\n' + newContentForFile
    fs.writeFile(__dirname + '/contact.txt', newData, function (err) {
      res.end('Success!')
    })
  })
})


app.get('/getTaggingHighscores', function (req, res) {
  var query = "SELECT T1.Username AS username, count(*) AS count FROM (SELECT distinct Username, ComicName FROM TagLog WHERE ComicName NOT LIKE '%FAVORITE IMAGE%') AS T1 GROUP BY username ORDER BY count DESC"
  mysqlPool.getConnection(function (err, connection) {
    connection.query(query, function (err2, results, fields) {
      if (err2) {return connection.release()}
      res.json(results)
      connection.release()
    })
  })
})


app.get('/getModFavImageCount', function (req, res) {
  fs.readdir(__dirname + '/../public/mod-favorites/' + req.query.modName, function (err, files) {
    if (err) res.json({'modName': req.query.modName, 'count': 0})
    res.json({'modName': req.query.modName, 'count': files.length})
  })  
})


app.get('/getComicRatings', function (req, res) {
  var query = 'SELECT Name as name, Vote as rating FROM Comic INNER JOIN ComicVote ON (Id = ComicId) WHERE Username = ? ORDER BY rating DESC'
  mysqlPool.getConnection(function (err, connection) {
    connection.query(query, [req.query.modName], function (err2, results, fields) {
      if (err2) {return connection.release()}
      res.json({'modName': req.query.modName, 'data': results})
      connection.release()
    })
  })
})


app.get('/getModFavoriteImages', function (req, res) {
  fs.readdir(__dirname + '/../public/mod-favorites/' + req.query.modName, function (err, files) {
    if (err) res.end("oops")
    res.json({'modName': req.query.modName, 'data': files})
  })  
})


app.get('/tagLog', function (req, res) {
  var query = 'SELECT Username, ComicName, Timestamp FROM TagLog WHERE Timestamp > NOW() - INTERVAL 1 DAY ORDER BY Timestamp DESC'
  mysqlPool.getConnection(function (err, connection) {
    connection.query(query, function (err2, results, fields) {
      if (err2) {connection.release(); return res.end("Some database error lolol")}
      res.json(results)
      connection.release()
    })
  })
})


app.get('/addTagLogModIndex', function (req, res) {
  if (req.session && req.session.user && req.session.user.username) {
    var query = 'INSERT INTO TagLog (TagNames, ComicName, username) VALUES (?, ?, ?)'
    mysqlPool.getConnection(function (err, connection) {
      connection.query(query, ['ModIndex', 'ModIndex', req.session.user.username], function (err2, results, fields) {
        connection.release()
      })
    })
  }
})


app.get('/allComicData', function (req, res) {
  var query = 'SELECT Name, Cat, Tag, Created, AVG(Vote) AS AvgRating, COUNT(*) AS NumberVotes FROM Comic INNER JOIN ComicVote ON (ComicId=Id) GROUP BY Name, Comic.Id ORDER BY Created DESC'
  mysqlPool.getConnection(function (err, connection) {
    connection.query(query, function (err2, results, fields) {
      if (err2) {res.end(); return connection.release()}
      res.json(results)
      connection.release()
    })
  })
})


app.get('/tagStats', function (req, res) {
  var query = 'SELECT Tag, COUNT(*) AS NumberOfComics FROM Comic GROUP BY Tag'
  mysqlPool.getConnection(function (err, connection) {
    connection.query(query, function (err2, results, fields) {
      if (err2) {res.end(); return connection.release()}
      res.json(results)
      connection.release()
    })
  })
})


app.get('/catStats', function (req, res) {
  var query = 'SELECT Cat, COUNT(*) AS NumberOfComics FROM Comic GROUP BY Cat'
  mysqlPool.getConnection(function (err, connection) {
    connection.query(query, function (err2, results, fields) {
      if (err2) {res.end(); return connection.release()}
      res.json(results)
      connection.release()
    })
  })
})


app.get('/tagVotes', function (req, res) {
  var query = 'SELECT Tag, AVG(Vote) AS AvgRating FROM Comic INNER JOIN ComicVote ON (Id=ComicId) GROUP BY Tag'
  mysqlPool.getConnection(function (err, connection) {
    connection.query(query, function (err2, results, fields) {
      if (err2) {res.end(); return connection.release()}
      res.json(results)
      connection.release()
    })
  })
})


app.get('/catVotes', function (req, res) {
  var query = 'SELECT Cat, AVG(Vote) AS AvgRating FROM Comic INNER JOIN ComicVote ON (Id=ComicId) GROUP BY Cat'
  mysqlPool.getConnection(function (err, connection) {
    connection.query(query, function (err2, results, fields) {
      if (err2) {res.end(); return connection.release()}
      res.json(results)
      connection.release()
    })
  })
})


app.get('/getComicTags', function (req, res) {
  var query = 'SELECT Id AS id, GROUP_CONCAT(DISTINCT ComicKeyword.Keyword SEPARATOR \';\') AS keywords FROM Comic LEFT JOIN ComicKeyword ON (Comic.Id = ComicKeyword.ComicId) GROUP BY id ORDER BY id'

  mysqlPool.getConnection(function (err, connection) {
    connection.query(query, function (err2, results, fields) {
      if (err2) {res.end(); return connection.release()}

      var results2 = []
      for (var r of results) {
        if (r.keywords) { results2.push(r.keywords.split(';')) } 
        else { results2.push([]) }
      }

      res.json(results2)
      connection.release()
    })
  })
})


app.post('/kofiCallback', function (req, res) {
  console.log('Ko-Fi callback!')
  var kofiData = JSON.parse(req.body.data)
  var message = kofiData.message
  var amount  = Number(kofiData.amount)

  if (message.indexOf('yiffer-user=') >= 0 && amount >= 2) {
    var message2 = message.slice(message.indexOf('yiffer-user='))
    var spaceIndex = message2.indexOf(' ')
    if (spaceIndex == -1) {spaceIndex = message2.length}

    var yifferUser = message2.substring(12, spaceIndex)

    mysqlPool.getConnection(function (err, connection) {
      var query = 'INSERT INTO DonatorUser (Username) VALUES (?)'
      connection.query(query, [yifferUser], function (err3, results3, fields3) {
        if (err3) {
          console.log(err3.toString())
          connection.release()
        } 
        res.end('1')
        console.log('User has been added to donator table')
        connection.release()
      })
    })
  }
})


app.get('/keywordAutoComplete', function (req, res) {
  let escapedInput = mysql.escape(req.query.tagName)
  let input = escapedInput.substring(1, escapedInput.length-1)
  let query
  const artistQuery = 'SELECT Artist.Name AS name, COUNT(*) AS count FROM Artist INNER JOIN Comic ON (Artist=Artist.Id) WHERE Artist.name LIKE \'' + input + '%\' GROUP BY Artist.name'
  const comicNameQuery = 'SELECT Comic.Name AS name, 1 AS count FROM Comic WHERE Comic.Name LIKE \'' + input + '%\''
  if (input.length >= 1) {
    query = 'SELECT Keyword AS name, COUNT(*) AS count FROM ComicKeyword WHERE Keyword LIKE \'' + input + '%\' GROUP BY name ORDER BY count DESC'
  }
  else {
    query = 'SELECT Keyword AS name, COUNT(*) AS count FROM ComicKeyword GROUP BY name ORDER BY count DESC'
  }

  mysqlPool.getConnection((err, connection) => {
    connection.query(query, (err, results) => {
      if (err) {res.end(); return connection.release()}

      if (input.length >= 1) {
        connection.query(artistQuery, (err, results2) => {
          if (err) {console.log(err); res.end(); return connection.release()}
          var concatResults = results.concat(results2)

          connection.query(comicNameQuery, (err, results3) => {
            if (err) {console.log(err); res.end(); return connection.release()}
            var concatResults2 = results3.concat(concatResults)

            res.json(concatResults2.sort(function (a, b) {return b.count - a.count}))
            connection.release()
          })
        })
      }
      else {
        res.json(results)
        connection.release()
      }
    })
  })
})


app.post('/suggestKeyword', (req, res) => {
  let comicId = req.body.comicId
  let suggestedKeyword = req.body.suggestedKeyword
  let extension = req.body.extension ? 1 : 0
  let user
  if (req.session && req.session.user) { user = req.session.user.username }
  else { user = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.socket.remoteAddress || (req.connection.socket ? req.connection.socket.remoteAddress : null) }

  if (authorizeMod(req)) {
    let tagLogQuery = 'INSERT INTO TagLog (TagNames, ComicName, username) VALUES (?, ?, ?)'
    let kwQuery = extension ? 'INSERT INTO ComicKeyword (ComicId, Keyword) VALUES (?, ?)' : 'DELETE FROM ComicKeyword WHERE ComicId = ? AND Keyword = ?'
    mysqlPool.getConnection((err, connection) => {
      connection.query(tagLogQuery, [suggestedKeyword, ''+comicId, user], (err, rows) => {
        if (err) { return returnError(500, 'Database query error', res, connection, err) }
        connection.query(kwQuery, [comicId, suggestedKeyword], (err, rows) => {
          if (err) { return returnError(500, 'Database query error: ' + err.toString(), res, connection, err) }
          res.json({message: 'Keyword auto-approved, because you\'re a mod!'})
          connection.release()
        })
      })
    })
  }

  else {
    let tagAlreadyExistsQuery = 'SELECT Keyword FROM ComicKeyword WHERE ComicId = ? AND Keyword = ?'
    let alreadySuggestedQuery = 'SELECT * FROM KeywordSuggestion WHERE ComicId = ? AND Keyword = ?'
    let insertQuery = 'INSERT INTO KeywordSuggestion (ComicId, Keyword, Extension, User) VALUES (?, ?, ?, ?)'

    mysqlPool.getConnection((err, connection) => {
      connection.query(tagAlreadyExistsQuery, [comicId, suggestedKeyword], (err, rows) => {
        if (err) { return returnError(500, 'Database query error', res, connection, err) }
        if (rows.length > 0 && extension == 1) { return returnError(200, 'This comic already has this keyword!', res, connection, err) }

        connection.query(alreadySuggestedQuery, [comicId, suggestedKeyword], (err, rows) => {
          if (err) { return returnError(500, 'Database query error', res, connection, err) }
          if (rows.length > 0) {
            if (rows[0].Processed == 1 && rows[0].Approved == 0) { return returnError(200, 'This has already been suggested for this comic, and was not approved.', res, connection, err) }
            if (rows[0].Processed == 0) { return returnError(200, 'This has already been suggested for this comic, pending approval!', res, connection, err) }
          }

          connection.query(insertQuery, [comicId, suggestedKeyword, extension, user], (err, rows) => {
            if (err) { return returnError(500, 'Database query error', res, connection, err) }
            res.json({message: 'Suggestion added, now pending approval. Thank you!'})
            connection.release()
          })
        })
      })
    })
  }
})


app.get('/completedKeywordSuggestions', (req, res) => {
  let query = 'SELECT Keyword, User, Extension, Name, Moderator, Timestamp, Approved FROM KeywordSuggestion INNER JOIN Comic ON (Id=ComicId) WHERE Processed = 1 ORDER BY Timestamp DESC'
  mysqlPool.getConnection((err, connection) => {
    connection.query(query, (err, rows) => {
      if (err) { return returnError(500, 'Database query error', res, connection, err) }
      res.json(rows)
    })
  })
})


app.get('/keywordsNotInComic', (req, res) => {
  let comicId = req.query.comicId
  let query = 'SELECT KeywordName FROM Keyword WHERE KeywordName NOT IN (SELECT Keyword FROM ComicKeyword WHERE ComicId = ?)'

  mysqlPool.getConnection((err, connection) => {
    connection.query(query, [comicId], (err, rows) => {
      if (err) { return returnError(500, 'Database query error', res, connection, err) }
      let keywordList = []
      for (var x of rows) {
        keywordList.push(x.KeywordName)
      }
      res.json(keywordList)
      connection.release()
    })
  })
})


app.get('/logKeywordSearch', (req, res) => {
  let keyword = req.query.keywordName
  logNode(req, `KW: ${keyword}`)
  if (keyword) {
    let query = 'UPDATE KeywordSearches SET Count = Count + 1 WHERE Keyword = ?'
    mysqlPool.getConnection((err, connection) => {
      connection.query(query, [keyword], (err, results) => {
        if (err) { return returnError(500, 'MySql error: ' + err.toString(), res, connection, err) }
        res.json({status: 'success'})
        connection.release()
      })
    })
  }
})


app.get('/listRagGetImages', (req, res) => {
  let query = 'SELECT Id AS id, Artist AS artist, Rating AS rating, Added AS added FROM ListRagImage'
  mysqlPool.getConnection((err, connection) => {
    connection.query(query, (err, results) => {
      if (err) { return returnError(500, 'MySql error: ' + err.toString(), res, connection, err) }
      res.json(results)     
      connection.release()
    })
  })
})


app.post('/listRagAssignRating', (req, res) => {
  let imageId = req.body.id
  let newRating = req.body.newRating
  let query = 'UPDATE ListRagImage SET Rating = ? WHERE Id = ?'
  mysqlPool.getConnection((err, connection) => {
    connection.query(query, [newRating, imageId], (err, results) => {
      if (err) { return returnError(500, 'MySql error: ' + err.toString(), res, connection, err) }
      res.json({status: 'ok'})
      connection.release()
      archiveNewRating(imageId, newRating)
    })
  })
})


function archiveNewRating (imageId, newRating) {
  let query = 'INSERT INTO ListRagRatingArchive (Id, Rating, Timestamp) VALUES (?, ?, NOW())'
  mysqlPool.getConnection((err, connection) => {
    connection.query(query, [imageId, newRating], (err, results) => {
      if (err) { return returnError(500, 'MySql error: ' + err.toString(), null, connection, err) }
      connection.release()
    })
  })
}


function appendZeroFirstIfSingleNumber (number) {
  if (number < 10) {
    return '0' + number
  }
  else {
    return '' + number
  }
}


function logNode (req, message) {
  var time = (new Date()).toISOString()
  var user = false
  if (req.session && req.session.user) { user = req.session.user.username }
  var ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.socket.remoteAddress || (req.connection.socket ? req.connection.socket.remoteAddress : 'none')

  var lengthOfUser = 0
  var maxPathLength = 50
  var maxStringLength = 15
  if (user) {lengthOfUser = (String(user)).length}
  else if (ip) {lengthOfUser = (String(ip)).length}

  var firstSpaceCount = (maxStringLength-lengthOfUser < 0) ? 1 : maxStringLength-lengthOfUser
  var secondSpaceLength = (maxPathLength-message.length < 0) ? 1 : maxPathLength-message.length

  console.log(`[${user||ip}] ${' '.repeat(firstSpaceCount)}${message} ${' '.repeat(secondSpaceLength)}[${time}]`)
}
