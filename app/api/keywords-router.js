let mysql = require('mysql')
let authorizedUsers = require('../../config/autorized-users.json')

module.exports = function (app, mysqlPool) {

  app.get ('/api/keywords', getAllKeywords)
  app.get ('/api/keywords/inIdOrder', getComicKeywordsInOrder)
  app.post('/api/keywords/removefromcomic', removeKeywordsFromComic)
  app.post('/api/keywords/addtocomic', addKeywordsToComic)
  app.post('/api/keywords', createKeyword)
  app.post('/api/keywordsuggestions/process', processKeywordSuggestion)
  app.get ('/api/keywordsuggestions', getKeywordSuggestions)
  app.post('/api/keywordsuggestions', addKeywordSuggestion)
  app.post('/api/keywords/log', logKeywordSearch)
  app.get ('/api/keywords/autocomplete/:query', keywordAutocomplete)
  app.get ('/api/keywords/autocomplete/', keywordAutocomplete)


  function getAllKeywords (req, res, next) {
    let query = 'SELECT KeywordName AS keyword, Description AS description FROM Keyword'
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


	function removeKeywordsFromComic (req, res, next) {
		let [comicId, keywords] = [req.body.comicId, req.body.keywords]
    if (typeof(keywords) == 'string') { keywords = [req.body.keywords] }

		let deleteQuery = 'DELETE FROM ComicKeyword WHERE (ComicId, Keyword) IN ('
		let queryParams = []
		for (keyword of keywords) {
			deleteQuery += '(?, ?), '
			queryParams.push(comicId, keyword)
		}
		deleteQuery = deleteQuery.substring(0, deleteQuery.length-2) + ')'

    mysqlPool.getConnection((err, connection) => {
			connection.query(deleteQuery, queryParams, (err, results) => {
				if (err) { return returnError('Database error', res, connection, err) }
        res.json({success: true})
				connection.release()
			})
		})
	}


  function addKeywordsToComic (req, res, next) {
		let [comicId, keywords] = [req.body.comicId, req.body.keywords]
    if (typeof(keywords) == 'string') { keywords = [req.body.keywords] }

    let insertQuery = 'INSERT INTO ComicKeyword (ComicId, Keyword) VALUES '
    let queryParams = []
    for (var keyword of keywords) {
			insertQuery += '(?, ?), '
			queryParams.push(comicId, keyword)
    }
		insertQuery = insertQuery.substring(0, insertQuery.length-2)

    mysqlPool.getConnection((err, connection) => {
      connection.query(insertQuery, queryParams, (err, results) => {
        if (err) { return returnError('Database error. One of the keywords might already exist for this comic?', res, connection, err) }
        res.json({success: true})
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


  function addKeywordSuggestion (req, res, next) {
    let comicId = req.body.comicId
    let suggestedKeyword = req.body.keyword
    let extension = req.body.extension ? 1 : 0
    let user
    // if (req.session && req.session.user) { user = req.session.user.username }
		// else { user = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.socket.remoteAddress || (req.connection.socket ? req.connection.socket.remoteAddress : null) }
		user = 'todo ragnar todo'
		let userIsMod = false  // todo
    if (userIsMod) {
      let kwQuery = extension ? 'INSERT INTO ComicKeyword (ComicId, Keyword) VALUES (?, ?)' : 'DELETE FROM ComicKeyword WHERE ComicId = ? AND Keyword = ?'
      mysqlPool.getConnection((err, connection) => {
				connection.query(kwQuery, [comicId, suggestedKeyword], (err, results) => {
					if (err) {
						return returnError(
							(extension ? 'Database error. Keyword might already exist?' : 'Database error'), 
							res, connection, err
						)
					}
					res.json({success: true})
					connection.release()
        })
      })
    }

    else {
      let tagAlreadyExistsQuery = 'SELECT Keyword FROM ComicKeyword WHERE ComicId = ? AND Keyword = ?'
      let insertQuery = 'INSERT INTO KeywordSuggestion (ComicId, Keyword, Extension, User) VALUES (?, ?, ?, ?)'

      mysqlPool.getConnection((err, connection) => {
        connection.query(tagAlreadyExistsQuery, [comicId, suggestedKeyword], (err, results) => {
          if (err) { return returnError('Database error', res, connection, err) }
          if (results.length > 0 && extension == 1) { return returnError('This comic already has this keyword!', res, connection, err) }

					connection.query(insertQuery, [comicId, suggestedKeyword, extension ? 1:0, user], (err, results) => {
						if (err) { return returnError('Database query error', res, connection, err) }
						res.json({success: true})
						connection.release()
					})
        })
      })
    }
  }


  function processKeywordSuggestion (req, res, next) {
		let [suggestionId, comicId, keyword, extension, isApproved] = 
			[req.body.suggestion.id, req.body.suggestion.comicId, req.body.suggestion.keyword, req.body.suggestion.addKeyword, req.body.isApproved]
    let updateQuery = 'UPDATE KeywordSuggestion SET Approved = ?, Processed = 1 WHERE Id = ?'
    let insertQuery = extension ? 'INSERT INTO ComicKeyword (ComicId, Keyword) VALUES (?, ?)' : 'DELETE FROM ComicKeyword WHERE ComicId = ? AND Keyword = ?'

    mysqlPool.getConnection((err, connection) => {
			if (isApproved) {
				connection.query(insertQuery, [comicId, keyword], (err, results) => {
					if (err) { return returnError('Database error: Error adding/deleting tags to/from comic', res, connection, err) }
	
					connection.query(updateQuery, [1, suggestionId], (err, results) => {
						if (err) { return returnError('Database error: Error updating suggested tags', res, connection, err) }
						
						res.json({success: true})
						connection.release()
					})
				})
			}

			else {
				connection.query(updateQuery, [0, suggestionId], (err, results) => {
					if (err) { return returnError('Database error: Error updating suggested tags', res, connection, err) }
					
					res.json({success: true})
					connection.release()
				})
			}
    })
  }


  function getKeywordSuggestions (req, res, next) {
    let query = 'SELECT KeywordSuggestion.Id AS id, Comic.Name AS comicName, ComicId AS comicId, Extension AS addKeyword, User AS user, Keyword AS keyword FROM KeywordSuggestion INNER JOIN Comic ON (Comic.Id=KeywordSuggestion.ComicId) WHERE Processed = 0'
    mysqlPool.getConnection((err, connection) => {
      connection.query(query, (err, results) => {
        if (err) { return returnError('Database error', res, connection, err) }
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
