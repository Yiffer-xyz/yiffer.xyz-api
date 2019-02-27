let authorizedUsers = require('../../config/autorized-users.json')
let fs = require('fs')

module.exports = function (app, mysqlPool) {

	app.get ('/api/comicsuggestions', getComicSuggestions)
	app.post('/api/comicsuggestions', addComicSuggestion)
	app.post('/api/comicsuggestions/process', processComicSuggestion)

	app.get ('/api/comicpagechanges', getComicPageChanges)
	app.post('/api/swapcomicpages', swapComicPages)
	
  app.get ('/api/kofiCallback', kofiCallback)
  app.post('/api/feedback', submitFeedback)
  app.post('/api/log', addLog)


	function getComicSuggestions (req, res, next) {
		let query = 'SELECT Id AS id, Name AS name, ArtistName AS artist, Description AS description, User AS user FROM ComicSuggestion WHERE Processed=0 ORDER BY Timestamp DESC'
		mysqlPool.getConnection((err, connection) => {
			connection.query(query, (err, results) => {
				if (err) { return returnError('Database query error', res, connection, err) }
				res.json(results)
				connection.release()
			})
		})
	}


	function addComicSuggestion (req, res, next) {
		let query = 'INSERT INTO ComicSuggestion (Name, ArtistName, Description, User) VALUES (?, ?, ?, ?)'
		let user = 'todo ragnar todo'
		mysqlPool.getConnection((err, connection) => {
			connection.query(query, [req.body.comicName, req.body.artist, req.body.comment, user], (err, results) => {
				if (err) { return returnError('Database error', res, connection, err) }
				res.json({success: true})
				connection.release()
			})
		})
	}


	function processComicSuggestion (req, res, next) {
		let [suggestionId, isApproved] = [req.body.suggestionId, req.body.isApproved]
		let query = 'UPDATE ComicSuggestion SET Processed=1, Approved=? WHERE Id=?'
		mysqlPool.getConnection((err, connection) => {
			connection.query(query, [isApproved, suggestionId], (err, results) => {
				if (err) { return returnError('Database error', res, connection, err) }
				res.json({success: true})
				connection.release()
			})
		})
	}


	function getComicPageChanges (req, res, next) {
		let comicId = req.query.id

    let query = 'SELECT MAX(Timestamp) AS lastUpdated FROM ComicPageChanges WHERE ComicId = ?'
    mysqlPool.getConnection((err, connection) => {
      connection.query(query, [comicId], (err, results) => {
				if (err) { return returnError('Database error', res, connection, err) }
				if (results.length === 0) { res.json({lastUpdated: null}) }
        else { res.json(results[0]) }
        connection.release()
      })
    })
	}


	async function swapComicPages (req, res, next) {
		let [comicName, comicId, pageNumber1, pageNumber2] = 
			[req.body.comicName, req.body.comicId, req.body.pageNumber1, req.body.pageNumber2]
		let comicFolderPath = __dirname + '/../../../client/public/comics/' + comicName

		try {
			await renameFile(`${comicFolderPath}/${getPageName(pageNumber1)}.jpg`, `${comicFolderPath}/temp.jpg`)
			await renameFile(`${comicFolderPath}/${getPageName(pageNumber2)}.jpg`, `${comicFolderPath}/${getPageName(pageNumber1)}.jpg`)
			await renameFile(`${comicFolderPath}/temp.jpg`, `${comicFolderPath}/${getPageName(pageNumber2)}.jpg`)
		} catch (err) {
			return returnError(err, res, null, err)
		}

		let query = 'INSERT INTO ComicPageChanges (ComicId) VALUES (?)'
		let queryParams = [comicId]
		try {
			await executeMysqlQuery(query, queryParams, 'Database error: Error updating comic page change timestamp')
			res.json({success: true})
		} catch (err) {
			return returnError(err.message, res, null, err.error)
		}
	}


	async function executeMysqlQuery (queryString, queryParams, errorMessage) { //tood i egen klasse
		return new Promise (async (resolve, reject) => {
			mysqlPool.getConnection((err, connection) => {
				if (err) {
					reject({error: err, message: 'Error establishing database connection'})
				}
				else if (queryParams) {
					connection.query(queryString, queryParams, (err, results) => {
						if (err) { reject({error: err, message: errorMessage}) }
						resolve(results)
						connection.release()
						console.log('connection released')
					})
				}
				else {
					connection.query(queryString, (err, results) => {
						if (err) { reject({error: err, message: errorMessage}) }
						resolve(results)
						connection.release()
						console.log('connection released')
					})
				}
			})
		})
	}


	async function renameFile (oldFilename, newFilename, errorMessage) {
		return new Promise(async (resolve, reject) => {
			fs.rename(oldFilename, newFilename, err => {
				if (err) { reject({error: err, message: errorMessage}) }
				else { resolve() }
			})
		})
	}


  function kofiCallback (req, res, next) {
    let message = (JSON.parse(req.body.data)).message
    let username = extractPotentialUsername(message)

    if (username) {
      let query = 'INSERT INTO DonatorUser (Username) VALUES (?)'
      mysqlPool.getConnection((err, connection) => {
        connection.query(query, [submittedUsername], (err, results) => {
          if (err) { return returnError('Database query error', res, connection, err) }
          connection.release()
        })
      })
    }
  }


  function submitFeedback (req, res, next) {
    if (!req.session || !req.session.user || req.body.feedback.length < 5) {
      return returnError('No user or too short text', res, null, null)
    }

    let newContentForFile = '[[' + req.session.user.username + ']]  ' + req.body.feedback

    fs.readFile(__dirname + '/../contact.txt', (err, data) => {
      let newData = data.toString() + '\n\n\n' + newContentForFile
      fs.writeFile(__dirname + '/../contact.txt', newData, (err) => {
        res.json({ message: 'success' })
      })
    })
  }


  function addLog (req, res, next) {
    let path = req.body.path
    let username = req.body.username || null
    let dailyCookie = req.body.dailyCookie
    let monthlyCookie = req.body.monthlyCookie
    let query = 'INSERT INTO Log (User, Url, DailyCookie, MonthlyCookie) VALUES (?, ?, ?, ?)'
    let queryParams = [username, path, dailyCookie, monthlyCookie]

    mysqlPool.getConnection((err, connection) => {
      connection.query(query, queryParams, (err, results) => {
        if (err) { return returnError('Database query error', res, connection, err) }
        connection.release()
        res.json({ message: 'success' })
      })
    })
    logNode(req, path)
  }
}


function extractPotentialUsername (inputString) {
  let keyStringIndex = inputString.indexOf('yiffer-user=')
  if (keyStringIndex >= 0) {
    inputString = inputString.slice(keyStringIndex)
    let firstSpaceIndex = inputString.indexOf(' ')
    if (firstSpaceIndex == -1) { firstSpaceIndex = inputString.length }
    return inputString.substring(12, firstSpaceIndex)
  }
  else {
    return null
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


function getPageName (pageNumber) {
	return pageNumber<10 ? '0'+pageNumber : pageNumber
}