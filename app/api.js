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


function returnError (errorCode, errorMessage, res, mysqlConnection, err) {
  if (err) {console.log(err)}
  if (res) { res.json({ error: errorMessage }) }
  if (mysqlConnection) { mysqlConnection.release() }
}


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
