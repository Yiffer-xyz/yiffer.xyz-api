let authorizedUsers = require('../../config/autorized-users.json')

module.exports = function (app, mysqlPool) {

  app.get   ('/api/keywords', getAllKeywords)
  app.delete('/api/keywords', deleteKeywordsFromComic)
  app.post  ('/api/keywords/addToComic', addKeywordsToComic)
  app.post  ('/api/keywords', createKeyword)
  app.post  ('/api/keywords/suggestions/responses', respondToKeywordSuggestion)
  app.get   ('/api/keywords/suggestions/pending', getPendingKeywordSuggestions)


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


	function deleteKeywordsFromComic (req, res, next) {
		if (!authorizeMod) { return returnError('Unauthorized, no access', res, null, null) }

		let comicId = req.body.comicId
		let keywordDeleteList = req.body.keywordsToDelete

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
    insertQuery = insertQuery.substring(0, insertQuery.length-2) + ')'
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
        res.json({ message: 'Successfully created keyword ' + keywordName}})
        connection.release()
      })
    })
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
      connection.query(updateQuery, [verdict, modName, comicId, keywordName], (err, rows) => {
        if (err) { return returnError('Database error: ' + err.toString(), res, connection, err) }

        connection.query(tagLogQuery, [keyword, ''+comicId, modName], (err, rows) => {
          if (err) { return returnError('Database error when updating TagLog: ' + err.toString(), res, connection, err) }

          if (approval) {
            connection.query(insertQuery, [comicId, keyword], (err, rows) => {
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