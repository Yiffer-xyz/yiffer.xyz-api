let mysql = require('mysql')
let authorizedUsers = require('../../config/autorized-users.json')

module.exports = function (app, mysqlPool) {

  app.get   ('/api/keywords', getAllKeywords)
  app.get   ('/api/keywords/inIdOrder', getComicKeywordsInOrder)
  app.delete('/api/keywords', deleteKeywordsFromComic)
  app.post  ('/api/keywords/addToComic', addKeywordsToComic)
  app.post  ('/api/keywords', createKeyword)
  app.post  ('/api/keywords/suggestions/responses', respondToKeywordSuggestion)
  app.get   ('/api/keywords/suggestions/pending', getPendingKeywordSuggestions)
  app.post  ('/api/keywords/suggestions', createKeywordSuggestion)
  app.post  ('/api/keywords/log', logKeywordSearch)
  app.get   ('/api/keywords/autocomplete/:query', keywordAutocomplete)
  app.get   ('/api/keywords/autocomplete/', keywordAutocomplete)


  function getAllKeywords (req, res, next) {
    let query = 'SELECT KeywordName, Description FROM Keyword'
    mysqlPool.getConnection((err, connection) => {
      connection.query(query, (err, results) => {
        if (err) { return returnError('Database error: ' + err.toString(), res,  connection, err) }
        res.json(results)
        connection.release()
      })
    })
  }


  function getComicKeywordsInOrder (req, res, next) {
    let query = 'SELECT Id AS id, GROUP_CONCAT(DISTINCT ComicKeyword.Keyword SEPARATOR \';\') AS keywords FROM Comic LEFT JOIN ComicKeyword ON (Comic.Id = ComicKeyword.ComicId) GROUP BY id ORDER BY id'

    mysqlPool.getConnection((err, connection) => {
      connection.query(query, function (err, results) {
        if (err) { return returnError('Database query error', res, connection, err) }
        connection.release()

        let keywordList = []
        for (var r of results) {
          if (r.keywords) { keywordList.push(r.keywords.split(';')) } 
          else { keywordList.push([]) }
        }

        res.json(keywordList)
      })
    })

  }


	function deleteKeywordsFromComic (req, res, next) {
		if (!authorizeMod) { return returnError('Unauthorized, no access', res, null, null) }

		let comicId = req.query.comicId
		let keywordDeleteList = req.query.keywordsToDelete
    if (typeof(keywordDeleteList) == 'string') { keywordDeleteList = [req.query.keywordsToDelete] }

		let deleteQuery = 'DELETE FROM ComicKeyword WHERE (ComicId, Keyword) IN ('+ '(?, ?), '.repeat(keywordDeleteList.length)
		deleteQuery = deleteQuery.substring(0, deleteQuery.length-2) + ')'
		let queryParams = []
		for (var i=0; i<keywordDeleteList.length; i++) {
			queryParams.push(comicId, keywordDeleteList[i])
		}

    mysqlPool.getConnection((err, connection) => {
			connection.query(deleteQuery, queryParams, (err, results) => {
				if (err) { return returnError('Database error: ' + err.toString(), res,  connection, err) }
				res.json({ message: 'Successfully removed keywords' })
				connection.release()
			})
		})
	}


  function addKeywordsToComic (req, res, next) {
    if (!authorizeMod) { return returnError('Unauthorized, no access', res, null, null) }

    let comicId = req.body.comicId
    let keywordAddList = req.body.keywordAddList

    let insertQuery = 'INSERT INTO ComicKeyword (ComicId, Keyword) VALUES ' + '(?, ?), '.repeat(keywordAddList.length)
    insertQuery = insertQuery.substring(0, insertQuery.length-2)
    let queryParams = []
    for (var i=0; i<keywordAddList.length; i++) {
      queryParams.push(comicId, keywordAddList[i])
    }

    mysqlPool.getConnection((err, connection) => {
      connection.query(insertQuery, queryParams, (err, results) => {
        if (err) { return returnError('Database error: ' + err.toString(), res,  connection, err) }
        res.json({ message: 'Successfully added keywords' })
        connection.release()
      })
    })
  }


  function createKeyword (req, res, next) {
    if (!authorizeMod) { return returnError('Unauthorized, no access', res, null, null) }

    let keywordName = req.body.keywordName
    let keywordDescription = req.body.keywordDescription

    let query = 'INSERT INTO Keyword (KeywordName, Description) VALUES (?, ?)'
    mysqlPool.getConnection((err, connection) => {
      connection.query(query, [keywordName, keywordDescription], (err, results) => {
        if (err) { return returnError('Database error:' + err.toString(), res,  connection, err) }
        res.json({ message: 'Successfully created keyword ' + keywordName})
        connection.release()
      })
    })
  }


  function createKeywordSuggestion (req, res, next) {
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
        connection.query(tagLogQuery, [suggestedKeyword, ''+comicId, user], (err, results) => {
          if (err) { return returnError('Database query error', res, connection, err) }
          connection.query(kwQuery, [comicId, suggestedKeyword], (err, results) => {
            if (err) { return returnError('Database query error: ' + err.toString(), res, connection, err) }
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
        connection.query(tagAlreadyExistsQuery, [comicId, suggestedKeyword], (err, results) => {
          if (err) { return returnError('Database query error', res, connection, err) }
          if (results.length > 0 && extension == 1) { return returnError(200, 'This comic already has this keyword!', res, connection, err) }

          connection.query(alreadySuggestedQuery, [comicId, suggestedKeyword], (err, results) => {
            if (err) { return returnError('Database query error', res, connection, err) }
            if (results.length > 0) {
              if (results[0].Processed == 1 && results[0].Approved == 0) { return returnError('This has already been suggested for this comic, and was not approved.', res, connection, err) }
              if (results[0].Processed == 0) { return returnError('This has already been suggested for this comic, pending approval!', res, connection, err) }
            }

            connection.query(insertQuery, [comicId, suggestedKeyword, extension, user], (err, results) => {
              if (err) { return returnError('Database query error', res, connection, err) }
              res.json({message: 'Suggestion added, now pending approval. Thank you!'})
              connection.release()
            })
          })
        })
      })
    }
  }


  function respondToKeywordSuggestion (req, res, next) {
    if (!authorizeMod) { return returnError('Unauthorized, no access', res, null, null) }

    let keywordName = req.body.keywordName
    let comicId = req.body.comicId
    let extension = req.body.extension
    let verdict = req.body.verdict
    let modName = req.session.user.username

    let updateQuery = 'UPDATE KeywordSuggestion SET Approved = ?, Moderator = ?, Processed = 1 WHERE ComicId = ? AND Keyword = ?'
    let insertQuery = extension ? 'INSERT INTO ComicKeyword (ComicId, Keyword) VALUES (?, ?)' : 'DELETE FROM ComicKeyword WHERE ComicId = ? AND Keyword = ?'
    let tagLogQuery = 'INSERT INTO TagLog (TagNames, ComicName, username) VALUES (?, ?, ?)'

    mysqlPool.getConnection((err, connection) => {
      connection.query(updateQuery, [verdict, modName, comicId, keywordName], (err, results) => {
        if (err) { return returnError('Database error: ' + err.toString(), res, connection, err) }

        connection.query(tagLogQuery, [keywordName, ''+comicId, modName], (err, results) => {
          if (err) { return returnError('Database error when updating TagLog: ' + err.toString(), res, connection, err) }

          if (verdict) {
            connection.query(insertQuery, [comicId, keywordName], (err, results) => {
              if (err) { return returnError('Database error when adding new keyword: ' + err.toString(), res, connection, err) }
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
  }


  function getPendingKeywordSuggestions (req, res, next) {
    if (!authorizeMod) { return returnError('Unauthorized, no access', res, null, null) }

    let query = 'SELECT Name as ComicName, ComicId, Extension, User, Keyword FROM KeywordSuggestion INNER JOIN Comic ON (Id=ComicId) WHERE Processed = 0'
    mysqlPool.getConnection((err, connection) => {
      connection.query(query, (err, results) => {
        if (err) { return returnError('Database query error:' + err.toString(), res, connection, err) }
        res.json(results)
        connection.release()
      })
    })  
  }


  function logKeywordSearch (req, res, next) {
    let keyword = req.body.keywordName
    if (keyword) {
      logNode(req, 'KW: ' + keyword)
      let query = 'UPDATE KeywordSearches SET Count = Count + 1 WHERE Keyword = ?'
      mysqlPool.getConnection((err, connection) => {
        connection.query(query, [keyword], (err, results) => {
          if (err) { return returnError('Database insert error', res, connection, err) }
          connection.release()
          res.json({status: 'success'})
        })
      })
    }
  }


  function keywordAutocomplete (req, res, next) {
    let escapedInput = ''
    if (req.params && req.params.query) { escapedInput = mysql.escape(req.params.query) }
    let input = escapedInput.substring(1, escapedInput.length-1)
    let query = ''
    let artistQuery = 'SELECT Artist.Name AS name, COUNT(*) AS count FROM Artist INNER JOIN Comic ON (Artist=Artist.Id) WHERE Artist.name LIKE \'' + input + '%\' GROUP BY Artist.name'
    let comicNameQuery = 'SELECT Comic.Name AS name, 1 AS count FROM Comic WHERE Comic.Name LIKE \'' + input + '%\''
    if (input.length >= 1) {
      query = 'SELECT Keyword AS name, COUNT(*) AS count FROM ComicKeyword WHERE Keyword LIKE \'' + input + '%\' GROUP BY name ORDER BY count DESC'
    }
    else {
      query = 'SELECT Keyword AS name, COUNT(*) AS count FROM ComicKeyword GROUP BY name ORDER BY count DESC'
    }

    mysqlPool.getConnection((err, connection) => {
      connection.query(query, (err, results) => {
        if (err) {return returnError('Database error', res, connection, err)}
        let returnValue = results

        if (input.length >= 1) {
          connection.query(artistQuery, (err, results) => {
            if (err) {return returnError('Database error', res, connection, err)}
            returnValue = returnValue.concat(results)

            connection.query(comicNameQuery, (err, results) => {
              if (err) {return returnError('Database error', res, connection, err)}
              connection.release()

              returnValue = results.concat(returnValue)
              returnValue.sort( (a,b) => { return b.count - a.count } )
              res.json(returnValue)
            })
          })
        }

        else {
          connection.release()
          res.json(results)
        }
      })
    })
  }
}


function returnError (errorMessage, res, mysqlConnection, err) {
  if (err) { console.log(err) }
  if (res) { res.json({ error: errorMessage }) }
  if (mysqlConnection) { mysqlConnection.release() }
}


function authorizeAdmin (req) { // todo remove
  if (!req.session || !req.session.user) { return false }
  if (authorizedUsers.admins.indexOf(req.session.user.username) === -1) { return false }
  return true
}


function authorizeMod (req) { // todo remove
  if (!req.session || !req.session.user) { return false }
  if (authorizedUsers.mods.indexOf(req.session.user.username) === -1) { return false }
  return true
}


function logNode (req, message) {
  let time = (new Date()).toISOString()
  let user = false
  if (req.session && req.session.user) { user = req.session.user.username }
  let ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.socket.remoteAddress || (req.connection.socket ? req.connection.socket.remoteAddress : 'none')

  let maxPathLength = 50
  let maxStringLength = 15
  let lengthOfUser = 0
  if (user) {lengthOfUser = (String(user)).length}
  else if (ip) {lengthOfUser = (String(ip)).length}

  let firstSpaceCount = (maxStringLength-lengthOfUser < 0) ? 1 : maxStringLength-lengthOfUser
  let secondSpaceLength = (maxPathLength-message.length < 0) ? 1 : maxPathLength-message.length

  console.log(`[${user||ip}] ${' '.repeat(firstSpaceCount)}${message} ${' '.repeat(secondSpaceLength)}[${time}]`)
}
