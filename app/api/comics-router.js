const multiparty = require('connect-multiparty')
const multipartyMiddelware = multiparty()
const FileSystemFacade = require('../fileSystemFacade')
const PythonShellFacade = require('../pythonShellFacade')
const BaseRouter = require('./baseRouter')

module.exports = class ComicsRouter extends BaseRouter {
	constructor (app, databaseFacade, modLogger) {
		super(app, databaseFacade, modLogger)
		this.setupRoutes()
	}

  setupRoutes () {
		this.app.get ('/api/comics', (req, res) => this.getComicList(req, res))
		this.app.get ('/api/comics/:name', (req, res) => this.getComicByName(req, res))
		this.app.post('/api/comics', multipartyMiddelware, (req, res) => this.createComic(req, res))
		this.app.post('/api/comics/:id/addpages', multipartyMiddelware, (req, res) => this.addPagesToComic(req, res, false))
		this.app.post('/api/comics/:id/updatedetails', (req, res) => this.updateComicDetails(req, res))
		this.app.post('/api/comics/:id/rate', this.authorizeUser.bind(this), (req, res) => this.rateComic(req, res))
		this.app.post('/api/comics/:id/addthumbnail', multipartyMiddelware, (req, res) => this.addThumbnailToComic(req, res, false))
		
		this.app.get ('/api/pendingcomics', (req, res) => this.getPendingComics(req, res))
		this.app.get ('/api/pendingcomics/:name', (req, res) => this.getPendingComic(req, res))
		this.app.post('/api/pendingcomics/:id', (req, res) => this.processPendingComic(req, res))
		this.app.post('/api/pendingcomics/:id/addthumbnail', multipartyMiddelware, (req, res) => this.addThumbnailToComic(req, res, true))
		this.app.post('/api/pendingcomics/:id/addkeywords', (req, res) => this.addKeywordsToPendingComic(req, res))
		this.app.post('/api/pendingcomics/:id/removekeywords', (req, res) => this.removeKeywordsFromPendingComic(req, res))
		this.app.post('/api/pendingcomics/:id/addpages', multipartyMiddelware, (req, res) => this.addPagesToComic(req, res, true))
	}
	
	async getComicList (req, res) {
		let query
		let queryParams
		let user = this.getUser(req)
		if (user) {
			query = 'SELECT T1.ComicId AS id, T1.ComicName AS name, T1.Cat AS cat, T1.Tag AS tag, T1.ArtistName AS artist, T1.Updated AS updated, T1.Created AS created, T1.Finished AS finished, T1.NumberOfPages AS numberOfPages, T1.Snitt AS userRating, T2.YourVote AS yourRating, T3.Keywords AS keywords FROM (( SELECT Comic.Id AS ComicId, Comic.Name AS ComicName, Cat, Artist.Name as ArtistName, Tag, Updated, Created, Finished, NumberOfPages, AVG(Vote) AS Snitt FROM Comic INNER JOIN Artist ON (Artist.Id = Comic.Artist) LEFT JOIN ComicVote ON (Comic.Id = ComicVote.ComicId) GROUP BY Comic.Name, Comic.Id) AS T1 LEFT JOIN (SELECT ComicKeyword.ComicId AS ComicId, GROUP_CONCAT(Keyword SEPARATOR \',\') AS Keywords FROM ComicKeyword GROUP BY ComicKeyword.ComicId) AS T3 ON (T1.ComicId = T3.ComicId) LEFT JOIN (SELECT ComicId, Vote AS YourVote FROM ComicVote WHERE User = ?) AS T2 ON (T1.ComicId = T2.ComicId)) ORDER BY id' 
			queryParams = [user.id]
		}
		else {
			query = 'SELECT Comic.Id AS id, Comic.Name AS name, Comic.Cat AS cat, Comic.Tag AS tag, Artist.Name AS artist, Comic.Updated AS updated, Comic.Finished AS finished, Comic.Created AS created, Comic.NumberOfPages AS numberOfPages, AVG(ComicVote.Vote) AS userRating, 0 AS yourRating, T1.Keywords AS keywords FROM Comic INNER JOIN Artist ON (Artist.Id = Comic.Artist) LEFT JOIN (SELECT ComicKeyword.ComicId AS ComicId, GROUP_CONCAT(Keyword SEPARATOR \',\') AS Keywords FROM ComicKeyword GROUP BY ComicKeyword.ComicId) AS T1 ON (T1.ComicId = Comic.Id) LEFT JOIN ComicVote ON (Comic.Id = ComicVote.ComicId) GROUP BY name, id ORDER BY id'
		}

		try {
			let results = await this.databaseFacade.execute(query, queryParams)
			results = results.map(comic => {
				comic.keywords = !comic.keywords ? [] : comic.keywords.split(',')
				return comic
			})
			res.json(results)
		}
		catch (err) {
      return this.returnError(err.message, res, err.error)
		}
	}

	async getComicByName (req, res) {
    let comicName = req.params.name
    let comicDataQuery
		let queryParams = []
    let prevLinkQuery = 'SELECT Name FROM ComicLink INNER JOIN Comic ON (Id = FirstComic) WHERE LastComic = ?'
    let nextLinkQuery = 'SELECT Name FROM ComicLink INNER JOIN Comic ON (Id = LastComic) WHERE FirstComic = ?'
		let user = this.getUser(req)

		if (user) {
			comicDataQuery = 'SELECT T1.ComicId AS id, T1.ComicName AS name, T1.Cat AS cat, T1.Tag AS tag, T1.ArtistName AS artist, T1.Updated AS updated, T1.Created AS created, T1.Finished AS finished, T1.NumberOfPages AS numberOfPages, T1.Snitt AS userRating, T2.YourVote AS yourRating, T3.Keywords AS keywords FROM ((SELECT Comic.Id AS ComicId, Comic.Name AS ComicName, Cat, Artist.Name as ArtistName, Tag, Updated, Created, Finished, NumberOfPages, AVG(Vote) AS Snitt FROM Comic INNER JOIN Artist ON (Artist.Id = Comic.Artist) LEFT JOIN ComicVote ON (Comic.Id = ComicVote.ComicId) GROUP BY Comic.Name, Comic.Id) AS T1 LEFT JOIN (SELECT ComicKeyword.ComicId, GROUP_CONCAT(Keyword SEPARATOR \',\') AS Keywords FROM ComicKeyword WHERE ComicKeyword.ComicId = (SELECT Comic.Id FROM Comic WHERE Comic.Name = ?)) AS T3 ON (T1.ComicId = T3.ComicId) LEFT JOIN (SELECT ComicId, Vote AS YourVote FROM ComicVote WHERE User = ?) AS T2 ON (T1.ComicId = T2.ComicId)) WHERE T1.ComicName = ?'
			queryParams = [comicName, user.id, comicName]
		}
		else {
			comicDataQuery = 'SELECT Comic.Name AS name, NumberOfPages as numberOfPages, Artist.Name AS artist, Comic.Id AS id, NULL AS yourRating, AVG(ComicVote.Vote) AS userRating, T1.Keywords AS keywords FROM Comic INNER JOIN Artist ON (Artist.Id = Comic.Artist) LEFT JOIN (SELECT ComicKeyword.ComicId, GROUP_CONCAT(Keyword SEPARATOR \',\') AS Keywords FROM ComicKeyword WHERE ComicKeyword.ComicId = (SELECT Comic.Id FROM Comic WHERE Comic.Name = ?)) AS T1 ON (T1.ComicId = Comic.Id) LEFT JOIN ComicVote ON (Comic.Id = ComicVote.ComicId) WHERE Comic.Name = ?'
			queryParams = [comicName, comicName]
		}

		try {
			let result = await this.databaseFacade.execute(comicDataQuery, queryParams)
			let comicData = result[0]
			if (!comicData) { return this.returnError('Comic not found', res) }
			
			let comicId = comicData.id
			if (!comicData.keywords) { comicData.keywords = [] }
			else { comicData.keywords = comicData.keywords.split(',') }
			comicData.previousComic = null
			comicData.nextComic = null

			let prevLink = await this.databaseFacade.execute(prevLinkQuery, [comicId])
			if (prevLink.length > 0) { comicData.previousComic = prevLink[0].Name }
			let nextLink = await this.databaseFacade.execute(nextLinkQuery, [comicId])
			if (nextLink.length > 0) { comicData.nextComic = nextLink[0].Name }

			res.json(comicData)
		}
		catch (err) {
      return this.returnError(err.message, res, err.error)
		}
	}

	async createComic (req, res) {
		if (!this.authorizeMod(req)) {
			return this.returnError('Unauthorized', res)
		}
		let [newFiles, thumbnailFile] = [req.files.pageFile, req.files.thumbnailFile]
		let [comicName, artistId, cat, tag, isFinished, keywords, nextComic, previousComic] = 
			[req.body.comicName, Number(req.body.artistId), req.body.cat, req.body.tag,req.body.finished==='true', 
			 req.body.keywords, Number(req.body.nextComic), Number(req.body.previousComic)]
		let userId = req.session.user.id
		let comicFolderPath = __dirname + '/../../../client/public/comics/' + comicName
		let hasThumbnail = !!thumbnailFile

		if (!newFiles) { return this.returnError('No files added', res) }
		if (newFiles.hasOwnProperty('fieldName')) { return this.returnError('Comic must have more than one page', res) }
		let fileList = this.sortNewComicImages(newFiles)

		try {
			let allComicFoldersList = await FileSystemFacade.listDir(__dirname + '/../../../client/public/comics', 'Error reading comics directory')
			if (allComicFoldersList.indexOf(comicName) >= 0) {
				return this.returnError('Directory of a comic with this name already exists', res)
			}

			let result = await this.writeNewComicFiles(fileList, comicFolderPath, thumbnailFile)
			if (result.error) { return this.returnError(result.error, res) }

			await PythonShellFacade.run('process_new_comic.py', [req.body.comicName])

			let insertQuery = 'INSERT INTO PendingComic (ModUser, Name, Artist, Cat, Tag, NumberOfPages, Finished, HasThumbnail) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
			let insertQueryParams = [userId, comicName, artistId, cat, tag, fileList.length, isFinished, hasThumbnail?1:0]
			let insertResult = await this.databaseFacade.execute(insertQuery, insertQueryParams, 'Database error creating new comic')
			let comicId = insertResult.insertId

			await this.addKeywordsToComic(keywords, comicId)

			await this.updatePrevAndNextComicLinks(comicId, previousComic, nextComic)

			res.json({success: true})
			this.addModLog(req, 'Create comic', `Add ${comicName}`)
		}
		catch (err) {
			return this.returnError(err.message, res, err.error)
		}
	}
	
	async writeNewComicFiles (fileList, comicFolderPath, thumbnailFile) {
		await FileSystemFacade.createDirectory(comicFolderPath)
		for (var i=1; i<= fileList.length; i++) {
			let file = fileList[i-1]
			let fileContents = await FileSystemFacade.readFile(file.path)
			let pageName = this.getPageName(i, file.path)
			if (!pageName) { 
				return {error: 'Some file is not .jpg or .png!'}
			}
			await FileSystemFacade.writeFile(comicFolderPath + '/' + pageName, fileContents, 'Error writing a new file to disk')
		}
		if (!!thumbnailFile) {
			let fileContents = await FileSystemFacade.readFile(thumbnailFile.path)
			await FileSystemFacade.writeFile(comicFolderPath + '/s.jpg', fileContents, 'Error writing thumbnail file to disk')
		}
		return {error: false}
	}

	async addKeywordsToComic (commaSeparatedKeywordString, comicId) {
		if (!commaSeparatedKeywordString || commaSeparatedKeywordString.length==0) { return }
		let insertKeywordsQuery = 'INSERT INTO PendingComicKeyword (ComicId, Keyword) VALUES '
		let insertKeywordsQueryParams  = []
		for (var keyword of commaSeparatedKeywordString.split(',')) {
			insertKeywordsQuery += `(?, ?), `
			insertKeywordsQueryParams .push(comicId)
			insertKeywordsQueryParams .push(keyword)
		}
		insertKeywordsQuery = insertKeywordsQuery.substring(0, insertKeywordsQuery.length-2)
		await this.databaseFacade.execute(insertKeywordsQuery, insertKeywordsQueryParams, 'Database error adding tags')
	}

	async addPagesToComic (req, res, isPendingComic) {
		let [comicName, comicId] = [req.body.comicName, req.params.id]
		let comicFolderPath = __dirname + '/../../../client/public/comics/' + comicName
		if (!req.files || !req.files.newPages) { return this.returnError('No files added!', res) }
		let requestFiles = req.files.newPages

		try {
			let existingFiles = await FileSystemFacade.listDir(comicFolderPath)
			let existingNumberOfPages = existingFiles.filter(f => f != 's.jpg').length

			let newFilesWithNames = this.parseRequestFiles(requestFiles, existingNumberOfPages)

			await this.writeAppendedComicPageFiles(comicFolderPath, newFilesWithNames)
			
			await PythonShellFacade.run('process_new_pages.py', [comicName, newFilesWithNames.length])

			let updateNumberOfPagesQuery = `UPDATE ${isPendingComic ? 'PendingComic' : 'Comic'} SET NumberOfPages = ? WHERE Id = ?`
			let queryParams = [existingNumberOfPages + newFilesWithNames.length, comicId]
			await this.databaseFacade.execute(updateNumberOfPagesQuery,
				queryParams, 'Database error: Error updating number of pages')
			
			res.json({success: true})
			this.addModLog(req, 'Comic', `Append ${newFilesWithNames.length} pages to ${comicName}`)

		}
		catch (err) {
			return this.returnError(err.message, res, err.error)
		}
	}

	parseRequestFiles (requestFiles, existingNumberOfPages) {
		if (isOneFileOnly(requestFiles)) {
			return [{
				filename: this.getPageName(existingNumberOfPages+1, requestFiles.path),
				file: requestFiles
			}]
		}
		else {
			requestFiles = [...requestFiles].sort()
			return requestFiles.map((file, i) => ({
				filename: this.getPageName(existingNumberOfPages+i+1, file.path),
				file: file
			}))
		}
	}

	async writeAppendedComicPageFiles (comicFolderPath, fileList) {
		for (let file of fileList) {
			let fileData = await FileSystemFacade.readFile(file.file.path,
				`Error parsing uploaded file (${file.name})`) // todo make sure this is  filename
			await FileSystemFacade.writeFile(`${comicFolderPath}/${file.filename}`,
				fileData, `Error writing file to disc (${file.name})`) // todo make sure this is  filename
		}
	}

	async updateComicDetails (req, res) {
		let [comicId, oldName, newName, newCat, newTag, newFinished, newArtistName, previousComic, nextComic] = 
			[Number(req.params.id), req.body.oldName, req.body.name, req.body.cat, req.body.tag, req.body.finished,
			 req.body.artist, Number(req.body.previousComic), Number(req.body.nextComic)] //todo prevand next

		if (!newName || !newCat || !newTag || newFinished==undefined || !newArtistName) {
			return returnError('Missing fields', res, null, null)
		}

		try {
			if (oldName !== newName) {
				await FileSystemFacade.renameFile(
					`${__dirname}/../../../client/public/comics/${oldName}`,
					`${__dirname}/../../../client/public/comics/${newName}`,
					'Error renaming comic directory')
			}

			let query = 'UPDATE Comic SET Name = ?, Cat = ?, Tag = ?, Finished = ?, Artist = (SELECT Artist.Id FROM Artist WHERE Name = ?) WHERE Id = ?'
			let queryParams = [newName, newCat, newTag, newFinished, newArtistName, comicId]
			await this.databaseFacade.execute(query, queryParams)

			await this.updatePrevAndNextComicLinks(comicId, previousComic, nextComic)

			res.json({success: true})
			let comicName = (await this.databaseFacade.execute('SELECT Name FROM Comic WHERE Id=?', [comicId]))[0].Name
			this.addModLog(req, 'Comic', `Update details of ${comicName}`, queryParams.slice(0,-1).join(', '))
		}
		catch (err) {
			return this.returnError(err.message, res, err.error)
		}
	}

	async updatePrevAndNextComicLinks (comicId, previousComic, nextComic) {
		if (previousComic) {
			let updateQuery = 'UPDATE ComicLink SET FirstComic=? WHERE LastComic=?'
			let updateResults = await this.databaseFacade.execute(updateQuery, [previousComic, comicId], 'Error updating comic link')
			if (updateResults.affectedRows == 0) {
				let insertQuery = 'INSERT INTO ComicLink (FirstComic, LastComic) VALUES (?, ?)'
				await this.databaseFacade.execute(insertQuery, [previousComic, comicId], 'Error adding comic link')
			}
		}
		else {
			let deleteQuery = 'DELETE FROM ComicLink WHERE LastComic=?'
			await this.databaseFacade.execute(deleteQuery, [comicId], 'Error removing comic link')
		}

		if (nextComic) {
			let updateQuery = 'UPDATE ComicLink SET LastComic=? WHERE FirstComic=?'
			let updateResults = await this.databaseFacade.execute(updateQuery, [nextComic, comicId], 'Error updating comic link')
			if (updateResults.affectedRows == 0) {
				let insertQuery = 'INSERT INTO ComicLink (FirstComic, LastComic) VALUES (?, ?)'
				await this.databaseFacade.execute(insertQuery, [comicId, previousComic], 'Error adding comic link')
			}
		}
		else {
			let deleteQuery = 'DELETE FROM ComicLink WHERE FirstComic=?'
			await this.databaseFacade.execute(deleteQuery, [comicId], 'Error removing comic link')
		}
	}

	async rateComic (req, res) {
		let [comicId, rating] = [Number(req.params.id), Number(req.body.rating)]
		let user = this.getUser(req)
		let deleteQuery = 'DELETE FROM ComicVote WHERE User = ? AND ComicId = ?'
		let deleteQueryParams = [user.id, comicId]
		let insertQuery = 'INSERT INTO ComicVote (User, ComicId, Vote) VALUES (?, ?, ?)'
		let insertQueryParams = [user.id, comicId, rating]
		try {
			await this.databaseFacade.execute(deleteQuery, deleteQueryParams, 'Error deleting old rating')
			if (rating > 0) {
				await this.databaseFacade.execute(insertQuery, insertQueryParams, 'Error assigning new rating')
			}
			res.json({success: true})
		}
		catch (err) {
			return this.returnError(err.message, res, err.error)
		}
	}

	async getPendingComics (req, res) {
		let query = 'SELECT Artist.Name AS artist, PendingComic.Id AS id, PendingComic.Name AS name, User2.Username AS modName, Cat AS cat, Tag AS tag, NumberOfPages AS numberOfPages, Finished AS finished, HasThumbnail AS hasThumbnail, T3.Keywords AS keywords FROM PendingComic INNER JOIN Artist ON (PendingComic.Artist=Artist.Id) INNER JOIN User2 ON (User2.Id=ModUser) LEFT JOIN (SELECT PendingComicKeyword.ComicId AS ComicId, GROUP_CONCAT(Keyword SEPARATOR \',\') AS Keywords FROM PendingComicKeyword GROUP BY PendingComicKeyword.ComicId) AS T3 ON (T3.ComicId=PendingComic.Id) WHERE Processed=0'
		try {
			let comics = await this.databaseFacade.execute(query)
			for (let comic of comics) {
				if (!comic.keywords) { comic.keywords = [] }
				else { comic.keywords = comic.keywords.split(',') }
			}
			res.json(comics)
		}
		catch (err) {
			return this.returnError(err.message, res, err.error)
		}
	}

	async getPendingComic (req, res) {
		let comicName = req.params.name
		let comicDataQuery = 'SELECT Artist.Name AS artistName, PendingComic.Id AS id, PendingComic.Name AS name, Cat AS cat, Tag AS tag, NumberOfPages AS numberOfPages, Finished AS finished, HasThumbnail AS hasThumbnail FROM PendingComic INNER JOIN Artist ON (PendingComic.Artist=Artist.Id) WHERE PendingComic.Name = ?'
		let keywordsQuery = 'SELECT Keyword FROM PendingComicKeyword WHERE ComicId = ?'
		try {
			let comicData = await this.databaseFacade.execute(comicDataQuery, [comicName])
			if (comicData.length === 0) { return this.returnError('No pending comic with that name', res) }
			comicData = comicData[0]

			let keywords = await this.databaseFacade.execute(keywordsQuery, [comicData.id])
			comicData.keywords = keywords.map(k => k.Keyword)

			res.json(comicData)
		}
		catch (err) {
			return this.returnError(err.message, res, err.error)
		}
	}

	async processPendingComic (req, res) {
		let [comicId, isApproved] = [Number(req.params.id), req.body.isApproved]
		try {
			if (isApproved) {
				await this.approvePendingComic(res, comicId)
			}
			else {
				await this.rejectPendingComic(res, comicId)
			}
		}
		catch (err) {
			return this.returnError(err.message, res, err.error)
		}
	}
	
	async approvePendingComic (res, comicId) {
		let getFullPendingComicDataQuery = 'SELECT Name, Cat, Tag, NumberOfPages, Finished, Artist, HasThumbnail FROM PendingComic WHERE Id = ?'
		let getKeywordsQuery = 'SELECT Keyword FROM PendingComicKeyword WHERE ComicId = ?'
		let updatePendingComicsQuery = 'UPDATE PendingComic SET Processed = 1, Approved = 1 WHERE Id = ?'
		let insertIntoComicQuery = 'INSERT INTO Comic (Name, Cat, Tag, NumberOfPages, Finished, Artist) VALUES (?, ?, ?, ?, ?, ?)'
		let insertKeywordsQuery = 'INSERT INTO ComicKeyword (ComicId, Keyword) VALUES '

		let comicData = await this.databaseFacade.execute(getFullPendingComicDataQuery, [comicId], 'Error getting pending comic data')
		comicData = comicData[0]
		if (!!comicData.hasThumbnail) { return returnError('Pending comic has no thumbnail', res) }

		let keywords = await this.databaseFacade.execute(getKeywordsQuery, [comicId], 'Error getting pending comic keywords')
		if (keywords.length === 0) { return returnError('No tags added', res, connection, err) }
		keywords = keywords.map(k => k.Keyword)

		let updatePendingComicsQueryParams = [comicData.Name, comicData.Cat, comicData.Tag, comicData.NumberOfPages, comicData.Finished, comicData.Artist]
		await this.databaseFacade.execute(insertIntoComicQuery, updatePendingComicsQueryParams, 'Error adding new comic to database')

		await this.databaseFacade.execute(updatePendingComicsQuery, [comicId], 'Error updating pending comic status')

		let insertKeywordsQueryParams = []
		for (var keyword of keywords) { 
			insertKeywordsQuery += `(?, ?), `
			insertKeywordsQueryParams.push(comicId)
			insertKeywordsQueryParams.push(keyword)
		}
		insertKeywordsQuery = insertKeywordsQuery.substring(0, insertKeywordsQuery.length-2)
		await this.databaseFacade.execute(insertKeywordsQuery, insertKeywordsQueryParams, 'Error adding tags to comic')

		res.json({success: true})

		let comicName = (await this.databaseFacade.execute('SELECT Name FROM PendingComic WHERE Id=?', [comicId]))[0].Name
		this.addModLog(req, 'Pending comic', `Approve ${comicName}`)
	}

	async rejectPendingComic (res, comicId) {
		let query = 'UPDATE PendingComic SET Processed=1, Approved=0 WHERE Id=?'
		let queryParams = [comicId]
		await this.databaseFacade.execute(query, queryParams, 'Error rejecting comic')
		res.json({success: true})
		
		let comicName = (await this.databaseFacade.execute('SELECT Name FROM PendingComic WHERE Id=?', [comicId]))[0].Name
		this.addModLog(req, 'Pending comic', `Reject ${comicName}`)
	}

	async addThumbnailToComic (req, res, isPendingComic) {
		let [thumbnailFile, comicName, comicId] = 
			[req.files.thumbnailFile, req.body.comicName, req.params.id]
		let comicFolderPath = `${__dirname}/../../../client/public/comics/${comicName}`
		if (!thumbnailFile || (thumbnailFile.path.indexOf('.jpg')===-1 && thumbnailFile.path.indexOf('.png')===-1)) {
			return this.returnError('File must exist and be .jpg or .png', res)
		}

		try {
			let directoryContents = await FileSystemFacade.listDir(comicFolderPath)
			let preExistingThumbnail = directoryContents.indexOf('s.jpg') >= 0
			if (preExistingThumbnail) {
				await FileSystemFacade.deleteFile(comicFolderPath + '/s.jpg', 'Error deleting old thumbnail')
			}
			let fileContents = await FileSystemFacade.readFile(thumbnailFile.path)
			await FileSystemFacade.writeFile(comicFolderPath+'/s.jpg', fileContents, 'Error writing new thumbnail file')

			if (isPendingComic) {
				let updateComicDataQuery = 'UPDATE PendingComic SET HasThumbnail = 1 WHERE Id = ?'
				await this.databaseFacade.execute(updateComicDataQuery, [comicId])
			}

			res.json({success: true})
			this.addModLog(req, isPendingComic?'Pending comic':'Comic', `Add thumbnail to ${comicName}`, `Had old thumbnail: ${preExistingThumbnail}`)
		}
		catch (err) {
			return this.returnError(err.message, res, err.error)
		}
	}

	async addKeywordsToPendingComic (req, res) {
		let [comicId, keywords] = [req.params.id, req.body.keywords]
		let addKeywordsQuery = 'INSERT INTO PendingComicKeyword (ComicId, Keyword) VALUES '
		let addKeywordsQueryParams = []
		for (let keyword of keywords) {
			addKeywordsQuery += '(?, ?), '
			addKeywordsQueryParams.push(comicId)
			addKeywordsQueryParams.push(keyword)
		}
		addKeywordsQuery = addKeywordsQuery.substring(0, addKeywordsQuery.length-2)

		try {
			await this.databaseFacade.execute(addKeywordsQuery, addKeywordsQueryParams)
			res.json({success: true})
			let comicName = (await this.databaseFacade.execute('SELECT Name FROM PendingComic WHERE Id=?', [comicId]))[0].Name
			this.addModLog(req, 'Pending comic', `Add ${keywords.length} keywords to ${comicName}`, keywords.join(', '))
		}
		catch (err) {
			return this.returnError(err.message, res, err.error)
		}
	}

	async removeKeywordsFromPendingComic (req, res) {
		let [comicId, keywords] = [req.params.id, req.body.keywords]
		let removeKeywordsQuery = 'DELETE FROM PendingComicKeyword WHERE (ComicId, Keyword) IN ('
		let removeKeywordsQueryParams = []
		for (let keyword of req.body.keywords) {
			removeKeywordsQuery += '(?, ?), '
			removeKeywordsQueryParams.push(comicId)
			removeKeywordsQueryParams.push(keyword)
		}
		removeKeywordsQuery = removeKeywordsQuery.substring(0, removeKeywordsQuery.length-2) + ')'

		try {
			await this.databaseFacade.execute(removeKeywordsQuery, removeKeywordsQueryParams)
			res.json({success: true})
			let comicName = (await this.databaseFacade.execute('SELECT Name FROM PendingComic WHERE Id=?', [comicId]))[0].Name
			this.addModLog(req, 'Pending comic', `Remove ${keywords.length} keywords from ${comicName}`, keywords.join(', '))
		}
		catch (err) {
			return this.returnError(err.message, res, err.error)
		}

	}

	sortNewComicImages (requestFiles) {
		return [...requestFiles].sort((file1, file2) => file1.name>file2.name ? 1 : -1)
	}

	getPageName (pageNumber, filePathName) {
		let pageNumberString = (pageNumber < 10) ? ('0' + pageNumber) : (pageNumber)
		let pagePostfix = filePathName.substring(filePathName.length - 4)
		if (pagePostfix != '.jpg' && pagePostfix != '.png') { return false }
		return pageNumberString + pagePostfix
	}
}

function isOneFileOnly (requestFilesObject) {
	return requestFilesObject.hasOwnProperty('fieldName')
}

