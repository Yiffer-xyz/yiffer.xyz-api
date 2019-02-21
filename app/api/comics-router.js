let fs = require('fs')
let archiver = require('archiver')
let pythonShell = require('python-shell')
let authorizedUsers = require('../../config/autorized-users.json')
let multiparty = require('connect-multiparty')
let multipartyMiddelware = multiparty()

module.exports = function (app, mysqlPool) {

  app.get ('/api/comics', getComicList)
  app.get ('/api/comics/:name', getComicByName)
  app.get ('/api/comics/:name/userRating', getComicUserRatingByName)
  app.post('/api/comics/:name', multipartyMiddelware, updateComicByName)
  app.post('/api/comics', multipartyMiddelware, createComic)
  app.put ('/api/comics/:name', updateComicDetailsByName)
	app.get ('/api/pendingcomics', getPendingComics)
	app.get ('/api/pendingcomics/:name', getPendingComic)
	app.put ('/api/pendingcomics/:id', authorizeAdmin, processPendingComic)
	app.post('/api/pendingcomics/:name/addthumbnail', multipartyMiddelware, addThumbnailToPendingComic)
	app.post('/api/pendingcomics/:id/addkeywords', addKeywordsToPendingComic)
	app.post('/api/pendingcomics/:id/removekeywords', removeKeywordsFromPendingComic)
	app.post('/api/pendingcomics/:id/addpages', multipartyMiddelware, addPagesToPendingComic)


  function getComicList (req, res, next) {
		let query = ''
		let queryParams = []
    if (req.session && req.session.user) { 
			query = 'SELECT T1.ComicId AS id, T1.ComicName AS name, T1.Cat AS cat, T1.Tag AS tag, T1.ArtistName AS artist, T1.Updated AS updated, T1.Created AS created, T1.Finished AS finished, T1.NumberOfPages AS numberOfPages, T1.Snitt AS userRating, T2.YourVote AS yourRating, T3.Keywords AS keywords FROM (( SELECT Comic.Id AS ComicId, Comic.Name AS ComicName, Cat, Artist.Name as ArtistName, Tag, Updated, Created, Finished, NumberOfPages, AVG(Vote) AS Snitt FROM Comic INNER JOIN Artist ON (Artist.Id = Comic.Artist) LEFT JOIN ComicVote ON (Comic.Id = ComicVote.ComicId) GROUP BY Comic.Name, Comic.Id) AS T1 LEFT JOIN (SELECT ComicKeyword.ComicId AS ComicId, GROUP_CONCAT(Keyword SEPARATOR \',\') AS Keywords FROM ComicKeyword GROUP BY ComicKeyword.ComicId) AS T3 ON (T1.ComicId = T3.ComicId) LEFT JOIN (SELECT ComicId, Vote AS YourVote FROM ComicVote WHERE Username = ?) AS T2 ON (T1.ComicId = T2.ComicId)) ORDER BY id' 
			queryParams = [req.session.user.username]
		}
    else {
			query = 'SELECT Comic.Id AS id, Comic.Name AS name, Comic.Cat AS cat, Comic.Tag AS tag, Artist.Name AS artist, Comic.Updated AS updated, Comic.Finished AS finished, Comic.Created AS created, Comic.NumberOfPages AS numberOfPages, AVG(ComicVote.Vote) AS userRating, 0 AS yourRating, T1.Keywords AS keywords FROM Comic INNER JOIN Artist ON (Artist.Id = Comic.Artist) LEFT JOIN (SELECT ComicKeyword.ComicId AS ComicId, GROUP_CONCAT(Keyword SEPARATOR \',\') AS Keywords FROM ComicKeyword GROUP BY ComicKeyword.ComicId) AS T1 ON (T1.ComicId = Comic.Id) LEFT JOIN ComicVote ON (Comic.Id = ComicVote.ComicId) GROUP BY name, id ORDER BY id'
		}
		
    mysqlPool.getConnection((err, connection) => {
      if (err) { return returnError('Error connecting to database connection pool', res, null, err) }
      connection.query(query, queryParams, (err, results, fields) => {
				if (err) { return returnError('Database query error', res, null, err) }
				for (var comic of results) {
					if (!comic.keywords) { comic.keywords = [] }
					else { comic.keywords = comic.keywords.split(',') }
				}
        res.json(results)
        connection.release()
      })
    })
	}


  function getComicByName (req, res, next) {
    let comicName = req.params.name
    let comicDataQuery = ''
    let queryParams = []
    let prevLinkQuery = 'SELECT Name FROM ComicLink INNER JOIN Comic ON (Id = FirstComic) WHERE LastComic = ?'
    let nextLinkQuery = 'SELECT Name FROM ComicLink INNER JOIN Comic ON (Id = LastComic) WHERE FirstComic = ?'

    mysqlPool.getConnection((err, connection) => {
      if (err) { return returnError('Error connecting to database connection pool', res, null, err) }

			if (req.session && req.session.user) {
				comicDataQuery = 'SELECT T1.ComicId AS id, T1.ComicName AS name, T1.Cat AS cat, T1.Tag AS tag, T1.ArtistName AS artist, T1.Updated AS updated, T1.Created AS created, T1.Finished AS finished, T1.NumberOfPages AS numberOfPages, T1.Snitt AS userRating, T2.YourVote AS yourRating, T3.Keywords AS keywords FROM ((SELECT Comic.Id AS ComicId, Comic.Name AS ComicName, Cat, Artist.Name as ArtistName, Tag, Updated, Created, Finished, NumberOfPages, AVG(Vote) AS Snitt FROM Comic INNER JOIN Artist ON (Artist.Id = Comic.Artist) LEFT JOIN ComicVote ON (Comic.Id = ComicVote.ComicId) GROUP BY Comic.Name, Comic.Id) AS T1 LEFT JOIN (SELECT ComicKeyword.ComicId, GROUP_CONCAT(Keyword SEPARATOR \',\') AS Keywords FROM ComicKeyword WHERE ComicKeyword.ComicId = (SELECT Comic.Id FROM Comic WHERE Comic.Name = ?)) AS T3 ON (T1.ComicId = T3.ComicId) LEFT JOIN (SELECT ComicId, Vote AS YourVote FROM ComicVote WHERE Username = ?) AS T2 ON (T1.ComicId = T2.ComicId)) WHERE T1.ComicName = ?'
				queryParams = [comicName, req.session.user.username, comicName]
			}
			else {
				comicDataQuery = 'SELECT Comic.Name AS name, NumberOfPages as numberOfPages, Artist.Name AS artist, Comic.Id AS id, NULL AS yourRating, AVG(ComicVote.Vote) AS userRating, T1.Keywords AS keywords FROM Comic INNER JOIN Artist ON (Artist.Id = Comic.Artist) LEFT JOIN (SELECT ComicKeyword.ComicId, GROUP_CONCAT(Keyword SEPARATOR \',\') AS Keywords FROM ComicKeyword WHERE ComicKeyword.ComicId = (SELECT Comic.Id FROM Comic WHERE Comic.Name = ?)) AS T1 ON (T1.ComicId = Comic.Id) LEFT JOIN ComicVote ON (Comic.Id = ComicVote.ComicId) WHERE Comic.Name = ?'
				queryParams = [comicName, comicName]
			}

			connection.query(comicDataQuery, queryParams, (err, results) => {
				if (err) { return returnError('Database query error', res, connection, err) }
				finalReturnValue = results[0]
				if (!finalReturnValue) { return returnError('Comic not found', res, connection, err) }
				let comicId = finalReturnValue.id

				if (!finalReturnValue.keywords) { finalReturnValue.keywords = [] }
				else { finalReturnValue.keywords = finalReturnValue.keywords.split(',') }

				finalReturnValue.previousComic = null
				finalReturnValue.nextComic = null
				connection.query(prevLinkQuery, [comicId], (err, results) => {
					if (err) { return returnError('Database error', res, connection, err) }
					if (results.length > 0) { finalReturnValue.previousComic = results[0].Name }

					connection.query(nextLinkQuery, [comicId], (err, results) => {
						if (err) { return returnError('Database error', res, connection, err) }
						if (results.length > 0) { finalReturnValue.nextComic = results[0].Name }

						res.json(finalReturnValue)
						connection.release()
					})
				})
      })
    })
  }


  function getComicUserRatingByName (req, res, next) {
    let comicName = req.params.name
    if (!req.session || !req.session.user || !req.session.user.username) {
      return returnError('Must be logged in', res, null, null)
    }
    let username = req.session.user.username
    let query = 'SELECT Vote FROM ComicVote WHERE Username = ?'

    mysqlPool.getConnection((err, connection) => {
      connection.query(query, [username], (err, results) => {
        if (err) { return returnError('Database query error', res, connection, err) }
        connection.release()

        if (results.length > 0) { res.json({rating: results[0].Vote}) }
        else { res.json({rating: 0}) }
      })
    })
  }


  function createComic (req, res, next) {
		if (!authorizeMod(req)) { return returnError('Unauthorized or no access', res, null, null) }
		let comicFolderPath = __dirname + '/../../../client/public/comics/' + req.body.comicName
		
		if (!req.files.pageFile) { return returnError('No files added!', res, null, null) }
		if (req.files.pageFile.hasOwnProperty('fieldName')) { return returnError('Comic must have more than one page', res, null, null) }

		let fileList = sortNewComicImages(req.files.pageFile)
		let hasThumbnailPage = !!req.files.thumbnailFile

		let allComicFoldersList = fs.readdirSync(__dirname + '/../../../client/public/comics')
		if (allComicFoldersList.indexOf(req.body.comicName) >= 0) {
			return returnError('Directory of a comic with this name already exists!', res, null, err)
		}

		try {
			fs.mkdirSync(comicFolderPath)

			for (var i=1; i<= req.files.pageFile.length; i++) {
				let file = req.files.pageFile[i-1]
				let fileContents = fs.readFileSync(file.path)
				let pageName = getPageName(i, file.path)
				if (!pageName) { return returnError('Some file is not .jpg or .png!', res, null, null) }
				fs.writeFileSync(comicFolderPath + '/' + pageName, fileContents)
			}
			if (hasThumbnailPage) {
				let fileContents = fs.readFileSync(req.files.thumbnailFile.path)
				fs.writeFileSync(comicFolderPath + '/s.jpg', fileContents)
			}
		}
		catch (err) {
			return returnError('Error creating new directory or writing new files to disc', res, null, err)
		}

		pythonShell.PythonShell.run('process_new_comic.py', {mode: 'text', args: [req.body.comicName], scriptPath: 'C:/progg/server/app'}, (err, results) => { //todo scriptpath
			if (err) { return returnError('Python processing new comic failed.', res, null, err) }

			let insertQuery = 'INSERT INTO PendingComic (ModName, Name, Artist, Cat, Tag, NumberOfPages, Finished, HasThumbnail) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
			let insertQueryParams = [
				'malann',// BIG todo req.session.user.username
				req.body.comicName,
				Number(req.body.artistId),
				req.body.cat,
				req.body.tag,
				fileList.length,
				req.body.finished==='true',
				hasThumbnailPage ? 1 : 0
			] 
			mysqlPool.getConnection((err, connection) => {
				connection.query(insertQuery, insertQueryParams, (err, results) => {
					if (err) { return returnError('Error inserting new comic into database', res, connection, err) }
					if (req.body.keywords && req.body.keywords.length > 0) {
						let insertId = results.insertId
						let insertKeywordsQuery = 'INSERT INTO PendingComicKeyword (ComicId, Keyword) VALUES '
						let insertKeywordsParams = []
						for (var keyword of req.body.keywords.split(',')) {
							insertKeywordsQuery += `(?, ?), `
							insertKeywordsParams.push(insertId)
							insertKeywordsParams.push(keyword)
						}
						insertKeywordsQuery = insertKeywordsQuery.substring(0, insertKeywordsQuery.length-2)
						connection.query(insertKeywordsQuery, insertKeywordsParams, (err, results) => {
							if (err) { return returnError('Error adding tags to comic', res, connection, err) }
							res.json({success: true})
							connection.release()	
						})
					}
					else {
						res.json({success: true})
						connection.release()
					}
				})
			})
		})
  }


  function updateComicByName (req, res, next) {
    if (req.body.newImage) {
      addImageToComic(req, res)
    }
  }

  function addImageToComic (req, res) {
    if (!authorizeMod(req)) { return returnError('Unauthorized or no access', res, null, null) }
    logComicUpdate(req, mysqlPool)

    let newImageFile = req.files.file.path
    let comicName = req.body.comicName
    let query = 'UPDATE Comic SET NumberOfPages = ?, Updated = NOW() WHERE Name = ?'
    let newImageFileType = newImageFile.substring(newImageFile.length-3)
    fs.readFile(newImageFile, (err, fileData) => {
      if (err) { return returnError('Error reading the uploaded file', res, null, err) }
      fs.writeFile(__dirname + `/../../public/comics/${comicName}/x.${newImageFileType}`, fileData, (err) => {
        if (err) { return returnError('Error rewriting the uploaded file', res, null, err) }
        fs.readdir(__dirname + `/../../public/comics/${comicName}`, (err, files) => {
          if (err) { return returnError('Error reading comic directory', res, null, err) }
          let newNumberOfImages = files.length-1

          pythonShell.run('process_new_comic_page_new.py', {mode: 'text', args: [comicName, newImageFileType, newNumberOfImages], scriptPath: '/home/rag/mnet/app'}, (err, results) => {
            zipComic(comicName, false)
          })
          mysqlPool.getConnection((err, connection) => {
            connection.query(query, [newNumberOfImages, comicName], (err, rows) => {
              if (err) { return returnError('Error updating number of pages in database', res, connection, err) }
              res.json( {message: `Success! (${req.body.comicName})`} )
              connection.release()
            })
          })
        })
      })
    })
  }


  function updateComicDetailsByName (req, res, next) {
    if (!authorizeMod(req)) { return returnError('Unauthorized or no access', res, null, null) }

    let comicName = req.params.name
    let updatedCat = req.body.cat
    let updatedTag = req.body.tag
    let updatedFinished = req.body.finished
    let updatedArtistName = req.body.artistName

    if (!comicName || !updatedCat || !updatedTag || updatedFinished==undefined || !updatedArtistName) {
      return returnError('Missing fields', res, null, null)
    }

    let updateQuery = 'UPDATE Comic SET Cat = ?, Tag = ?, Finished = ?, Artist = (SELECT Id FROM Artist WHERE Name = ?) WHERE Name = ?'
    mysqlPool.getConnection((err, connection) => {
      connection.query(updateQuery, [updatedCat, updatedTag, updatedFinished, updatedArtistName, comicName], (err, results) => {
        if (err) { return returnError('Database error: ' + err.toString(), res, connection, err) }
        res.json({ message: 'Successfully updated comic' })
        connection.release()
      })
    })
  }
	
	
	function getPendingComics (req, res, next) {
		let query = 'SELECT Artist.Name AS artist, PendingComic.Id AS id, PendingComic.Name AS name, ModName AS modName, Cat AS cat, Tag AS tag, NumberOfPages AS numberOfPages, Finished AS finished, HasThumbnail AS hasThumbnail, T3.Keywords AS keywords FROM PendingComic INNER JOIN Artist ON (PendingComic.Artist=Artist.Id) LEFT JOIN (SELECT PendingComicKeyword.ComicId AS ComicId, GROUP_CONCAT(Keyword SEPARATOR \',\') AS Keywords FROM PendingComicKeyword GROUP BY PendingComicKeyword.ComicId) AS T3 ON (T3.ComicId=PendingComic.Id) WHERE Processed=0'
		mysqlPool.getConnection((err, connection) => {
			connection.query(query, (err, results) => {
				if (err) { return returnError('Database error', res, connection, err) }

				for (var comic of results) {
					if (!comic.keywords) { comic.keywords = [] }
					else { comic.keywords = comic.keywords.split(',') }
				}
				res.json(results)
				connection.release()
			})
		})
	}


	function getPendingComic (req, res, next) {
		let comicDataQuery = 'SELECT Artist.Name AS artistName, PendingComic.Id AS id, PendingComic.Name AS name, Cat AS cat, Tag AS tag, NumberOfPages AS numberOfPages, Finished AS finished, HasThumbnail AS hasThumbnail FROM PendingComic INNER JOIN Artist ON (PendingComic.Artist=Artist.Id) WHERE PendingComic.Name = ?'
		let keywordsQuery = 'SELECT Keyword FROM PendingComicKeyword WHERE ComicId = ?'
		mysqlPool.getConnection((err, connection) => {
			connection.query(comicDataQuery, [req.params.name], (err, results) => {
				if (err) { return returnError('Database error: Error getting comic data', res, connection, err) }
				if (results.length===0) { return returnError('No pending comic with this name', res, connection, err) }
				let comicData = results[0]
				comicData.keywords = []

				connection.query(keywordsQuery, [comicData.id], (err, results) => {
					if (err) { return returnError('Database error: Error getting comic keywords', res, connection, err) }
					if (results.length > 0) {
						comicData.keywords = results.map(keywordObj => keywordObj.Keyword)
					}
					res.json(comicData)
					connection.release()
				})
			})
		})
	}


	function processPendingComic (req, res, next) {
		let comicId = req.params.id
		let getFullPendingComicDataQuery = 'SELECT Name, Cat, Tag, NumberOfPages, Finished, Artist, HasThumbnail FROM PendingComic WHERE Id = ?'
		let getKeywordsQuery = 'SELECT Keyword FROM PendingComicKeyword WHERE ComicId = ?'
		let updatePendingComicsQuery = 'UPDATE PendingComic SET Processed = 1, Approved = 1 WHERE Id = ?'
		let insertIntoComicQuery = 'INSERT INTO Comic (Name, Cat, Tag, NumberOfPages, Finished, Artist) VALUES (?, ?, ?, ?, ?, ?)'
		let insertKeywordsQuery = 'INSERT INTO ComicKeyword (ComicId, Keyword) VALUES '
		mysqlPool.getConnection((err, connection) => {
			connection.query(getFullPendingComicDataQuery, [comicId], (err, results) => {
				if (err) { return returnError('Database error: Error getting the pending comic\'s data', res, connection, err) }
				let comicData = results[0]
				if (!!comicData.hasThumbnail) { return returnError('Pending comic has no thumbnail', res, connection, err) }

				connection.query(getKeywordsQuery, [comicId], (err, results) => {
					if (err) { return returnError('Database error: Error getting tags from pending comic', res, connection, err) }
					if (results.length === 0) { return returnError('No tags added', res, connection, err) }
					let keywords = results.map(keywordObj => keywordObj.Keyword)
					let updatePendingComicsQueryParams = [comicData.Name, comicData.Cat, comicData.Tag, comicData.NumberOfPages, comicData.Finished, comicData.Artist]
					connection.query(insertIntoComicQuery, updatePendingComicsQueryParams, (err, results) => {
						if (err) { return returnError('Database error: Error adding new comic to the database', res, connection, err) }
						let newComicId = results.insertId
						
						connection.query(updatePendingComicsQuery, [comicId], (err, results) => {
							if (err) { return returnError('Database error: Error updating pending comic processed status', res, connection, err) }	

							let insertKeywordsQueryParams = []
							for (var keyword of keywords) { 
								insertKeywordsQuery += `(?, ?), `
								insertKeywordsQueryParams.push(newComicId)
								insertKeywordsQueryParams.push(keyword)
							}
							insertKeywordsQuery = insertKeywordsQuery.substring(0, insertKeywordsQuery.length-2)
							connection.query(insertKeywordsQuery, insertKeywordsQueryParams, (err, results) => {
								if (err) { return returnError('Database error: Error transferring tags from pending to new comic', res, connection, err) }	

								res.json({success: true})
								connection.release()
							})
						})
					})
				})
			})
		})
	}


	async function addThumbnailToPendingComic (req, res, next) {
		let thumbnailFile = req.files.thumbnailFile
		let comicName = req.params.name
		let comicFolderPath = `${__dirname}/../../../client/public/comics/${comicName}`

		if (!thumbnailFile || (thumbnailFile.path.indexOf('.jpg')===-1 && thumbnailFile.path.indexOf('.png')===-1)) {
			return returnError('File must exist and be .jpg or .png', res, null, null)
		}

		try {
			let directoryContents = fs.readdirSync(comicFolderPath)
			if (directoryContents.indexOf('s.jpg') >= 0) {
				fs.unlinkSync(comicFolderPath + '/s.jpg')
			}
			let fileContents = fs.readFileSync(thumbnailFile.path)
			await fs.writeFileSync(comicFolderPath+'/s.jpg', fileContents)
		}
		catch (err) {
			return returnError('Error deleting old thumbnail or writing new one to disc', res, null, err)
		}

		let updateComicDataQuery = 'UPDATE PendingComic SET HasThumbnail = 1 WHERE Name = ?'
		mysqlPool.getConnection((err, connection) => {
			connection.query(updateComicDataQuery, [comicName], (err) => {
				if (err) { return returnError('Error updating comic data to reflect new thumbnail added', res, connection, err) }
				res.json({success: true})
				connection.release()
			})
		})
	}


	async function addPagesToPendingComic (req, res, next) {
		if (!authorizeMod(req)) { return returnError('Unauthorized or no access', res, null, null) }
		let comicFolderPath = __dirname + '/../../../client/public/comics/' + req.body.comicName
		if (!req.files || !req.files.newPages) { return returnError('No files added!', res, null, null) }
		
		let newNumberOfPages
		try { newNumberOfPages = await parseAndWriteNewFiles(comicFolderPath, req.files.newPages) }
		catch (err) { return returnError('Error parsing or writing the new files to disc', res, null, err) }

		let updateNumberOfPagesQuery = 'UPDATE PendingComic SET NumberOfPages = ? WHERE Id = ?'
		mysqlPool.getConnection((err, connection) => {
			connection.query(updateNumberOfPagesQuery, [newNumberOfPages, req.params.id], (err) => {
				if (err) { return returnError('Database error: Error updating number of pages', res, connection, err) }
				res.json({success: true})
				connection.release()
			})
		})
	}


	function addKeywordsToPendingComic (req, res, next) {
		let comicId = req.params.id
		let addKeywordsQuery = 'INSERT INTO PendingComicKeyword (ComicId, Keyword) VALUES '
		let addKeywordsQueryParams = []
		for (var keyword of req.body.keywords) {
			addKeywordsQuery += '(?, ?), '
			addKeywordsQueryParams.push(comicId)
			addKeywordsQueryParams.push(keyword)
		}
		addKeywordsQuery = addKeywordsQuery.substring(0, addKeywordsQuery.length-2)

		mysqlPool.getConnection((err, connection) => {
			connection.query(addKeywordsQuery, addKeywordsQueryParams, (err) => {
				if (err) { return returnError('Error inserting the keywords into the database', res, connection, err) }
				res.json({success: true})
				connection.release()
			})
		})
	}


	function removeKeywordsFromPendingComic (req, res, next) {
		let comicId = req.params.id
		let removeKeywordsQuery = 'DELETE FROM PendingComicKeyword WHERE (ComicId, Keyword) IN ('
		let removeKeywordsQueryParams = []
		for (var keyword of req.body.keywords) {
			removeKeywordsQuery += '(?, ?), '
			removeKeywordsQueryParams.push(comicId)
			removeKeywordsQueryParams.push(keyword)
		}
		removeKeywordsQuery = removeKeywordsQuery.substring(0, removeKeywordsQuery.length-2) + ')'

		mysqlPool.getConnection((err, connection) => {
			connection.query(removeKeywordsQuery, removeKeywordsQueryParams, (err) => {
				if (err) { return returnError('Error removing the keywords from the database', res, connection, err) }
				res.json({success: true})
				connection.release()
			})
		})
	}




}


async function parseAndWriteNewFiles (comicFolderPath, requestFiles) {
	return new Promise( async resolve => {
		fs.readdir(comicFolderPath, (err, files) => {
			let oldNumberOfPages = files.filter(f => f!='s.jpg').length
			let newFilesWithNames = []
			if (requestFiles.hasOwnProperty('fieldName')) { // one file only
				newFilesWithNames.push({filename: getPageName(oldNumberOfPages+1, requestFiles.path), file: requestFiles})
			}
			else {
				requestFiles = [...requestFiles]
				for (var i=0; i<requestFiles.length; i++) {
					newFilesWithNames.push({filename: getPageName(oldNumberOfPages+i+1, requestFiles[i].path), file: requestFiles[i]})
				}
			}

			for (var newFile of newFilesWithNames) {
				fs.writeFileSync(`${comicFolderPath}/${newFile.filename}`, newFile.file)
			}

			resolve(oldNumberOfPages + newFilesWithNames.length)
		})
	})
}


function zipComic (comicName, isNewComic) {
  let zipFilePath = __dirname + '/../../public/021njnwjfusjkfn89c23nfsnfkas/' + comicName + '.zip'
  if (!isNewComic) {
    console.log('Deleting file ' + zipFilePath)
    fs.unlinkSync(zipFilePath)
  }

  let outputStream = fs.createWriteStream(zipFilePath)
  let archive = archiver('zip', {zlib: {level: 9}})

  archive.pipe(outputStream)
  archive.directory(__dirname + '/../../public/comics/'+ comicName +'/', false)
  archive.finalize()
  console.log('Zipping ' + comicName + '!')
}


function returnError (errorMessage, res, mysqlConnection, err) {
	console.log(errorMessage, err)
  if (err) { console.log(err) }
  if (res) { res.json({ error: errorMessage }) }
  if (mysqlConnection) { mysqlConnection.release() }
}


function authorizeAdmin (req, res, next) { // todo !!
  // if (!req.session || !req.session.user) { return false }
  // if (authorizedUsers.admins.indexOf(req.session.user.username) === -1) { return false }
  next()
}


function authorizeMod (req) { // todo !! gj;re til next
  // if (!req.session || !req.session.user) { return false }
  // if (authorizedUsers.mods.indexOf(req.session.user.username) === -1) { return false }
  return true
}


function logComicUpdate (req, mysqlPool) {
  let comicName = req.body.comicName
  let modName = req.session.user.username
  let query = 'INSERT INTO TagLog (TagNames, ComicName, Username) VALUES (?, ?, ?)'
  mysqlPool.getConnection((err, connection) => {
    connection.query(query, ['>>ADD iMAGE<<', comicName, modName], (err, rows) => {
      if (err) { return returnError(null, null, connection, err) }
      connection.release()
    })
  })
}


function getPageName (pageNumber, filePathName) {
  let pageNumberString = (pageNumber < 10) ? ('0' + pageNumber) : (pageNumber)
  let pagePostfix = filePathName.substring(filePathName.length - 4)
  if (pagePostfix != '.jpg' && pagePostfix != '.png') { return false }
  return pageNumberString + pagePostfix
}


function extractFilesFromFileObject (fileObject) {
  let keys = Object.keys(fileObject)
  let fileArray = []
  for (var i=0; i<keys.length; i++) {
    fileArray.push(fileObject['' + i])
  }
  return fileArray
}


function sortNewComicImages (requestFiles) {
	return [...requestFiles].sort((file1, file2) => file1.name>file2.name ? 1 : -1)
}