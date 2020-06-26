let FileSystemFacade = require('../fileSystemFacade')
let BaseRouter = require('./baseRouter')

let multiparty = require('connect-multiparty')
let multipartyMiddelware = multiparty()

module.exports = class MiscRouter extends BaseRouter {
	constructor (app, databaseFacade, modLogger) {
		super(app, databaseFacade, modLogger)
		this.setupRoutes()
	}

	setupRoutes () {
		this.app.get ('/api/comicsuggestions', (req, res) => this.getComicSuggestions(req, res))
		this.app.get ('/api/comicsuggestions/rejected', (req, res) => this.getRejectedComicSuggestions(req, res))
		this.app.post('/api/comicsuggestions', (req, res) => this.addComicSuggestion(req, res))
		this.app.post('/api/comicsuggestions/:id/process', (req, res) => this.processComicSuggestion(req, res))

		this.app.get ('/api/modlog', (req, res) => this.getModLog(req, res))
		this.app.get ('/api/modscores', (req, res) => this.getModScores(req, res))
	
		this.app.post('/api/swapcomicpages', (req, res) => this.swapComicPages(req, res))
		this.app.post('/api/insertcomicpage', multipartyMiddelware, (req, res) => this.insertComicPage(req, res))
		this.app.post('/api/deletecomicpage', (req, res) => this.deletecomicpage(req, res))
	}

	async getComicSuggestions (req, res) {
		let query = 'SELECT ComicSuggestion.Id AS id, Name AS name, ArtistName AS artist, Description AS description, User.username AS user, ComicSuggestion.UserIP AS userIP FROM ComicSuggestion LEFT JOIN User ON (ComicSuggestion.User = User.Id) WHERE Processed=0 ORDER BY Timestamp ASC'
		try {
			let result = await this.databaseFacade.execute(query, null, 'Database query error')
			res.json(result)
		}
		catch(err) {
			return this.returnError(err.message, res, err.error)
		}
	}

	async getRejectedComicSuggestions (req, res) {
		let query = 'SELECT Name AS name, ArtistName AS artist, Reason AS reason FROM ComicSuggestion WHERE Approved=0 AND ShowInList=1 ORDER BY Timestamp DESC'
		try {
			let result = await this.databaseFacade.execute(query, null, 'Database query error')
			res.json(result)
		}
		catch(err) {
			return this.returnError(err.message, res, err.error)
		}	
	}

	async addComicSuggestion (req, res) {
		let [comicName, artist, comment] = [req.body.comicName, req.body.artist, req.body.comment]

		try {
			let existingSuggestionsQuery = 'SELECT * FROM ComicSuggestion WHERE Name LIKE ?'
			let existingSuggestions = await this.databaseFacade.execute(existingSuggestionsQuery, [comicName])
			if (existingSuggestions.length > 0) {
				return this.returnError('This comic name has already been suggested', res)
			}

			let existingComicQuery = 'SELECT * FROM Comic WHERE Name LIKE ?'
			let existingComics = await this.databaseFacade.execute(existingComicQuery, [comicName])
			if (existingComics.length > 0) {
				return this.returnError('A comic with this name already exists!', res)
			}

			let user = this.getUser(req)
			let userParam = user ? user.id : req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.socket.remoteAddress || (req.connection.socket ? req.connection.socket.remoteAddress : null)
			let query = `INSERT INTO ComicSuggestion (Name, ArtistName, Description, ${user ? 'User' : 'UserIP'}) VALUES (?, ?, ?, ?)`
			let queryParams = [comicName, artist, comment, userParam]

			await this.databaseFacade.execute(query, queryParams, 'Database error')
			res.json({success: true})
		}
		catch (err) {
			return this.returnError(err.message, res, err.error)
		}
	}

	async processComicSuggestion (req, res) {
		let [isApproved, shouldShowInList, reason, suggestionId] = 
			[req.body.isApproved, req.body.shouldShowInList, req.body.reason, req.params.id]

		try {
			if (isApproved) {
				await this.processApprovedSuggestion(res, suggestionId)
			}
			else {
				await this.processNotApprovedSuggestion(res, suggestionId, shouldShowInList, reason)
			}

			let suggestionDetails = (await this.databaseFacade.execute('SELECT Name, ArtistName, Description FROM ComicSuggestion WHERE Id=?', [req.body.suggestionId]))[0]
			this.addModLog(req, 'Comic suggestion', `${req.body.isApproved ? 'Approve' : 'Reject'} ${suggestionDetails.Name}`, `${suggestionDetails.Name} by ${suggestionDetails.ArtistName}, description: ${suggestionDetails.Description}`)
		}
		catch (err) {
			return this.returnError(err.message, res, err.error)
		}
	}

	async processApprovedSuggestion (res, suggestionId) {
		let query = 'UPDATE ComicSuggestion SET Processed=1, Approved=1 WHERE Id=?'
		let queryParams = [suggestionId]

		await this.databaseFacade.execute(query, queryParams, 'Database error')
		res.json({success: true})
	}

	async processNotApprovedSuggestion (res, suggestionId, shouldShowInList, reason) {
		let query = 'UPDATE ComicSuggestion SET Processed=1, Approved=0, ShowInList=?, Reason=? WHERE Id=?'
		let queryParams = [shouldShowInList, reason, suggestionId]

		await this.databaseFacade.execute(query, queryParams, 'Database error')
		res.json({success: true})
	}

	async getModLog (req, res) {
		let query = 'SELECT User.Username AS username, ActionType AS actionType, ActionDescription AS actionDescription, ActionDetails AS actionDetails, Timestamp AS timestamp FROM ModLog INNER JOIN User ON (ModLog.User=User.Id) ORDER BY Timestamp DESC'
		try { 
			let result = await this.databaseFacade.execute(query)
			res.json(result)
		}
		catch (err) {
			return this.returnError(err.message, res, err.error)
		}
	}

	async getModScores (req, res) {
		let query = 'SELECT ModLog.ActionType, ModLog.ActionDescription, User.Username FROM ModLog INNER JOIN User ON (User.Id=ModLog.User)'
		try {
			let logs = await this.databaseFacade.execute(query)
			
			let userScores = {}
			for (var log of logs) {
				if (!(log.Username in userScores)) { userScores[log.Username] = 0 }
				userScores[log.Username] += this.getActionScore(log.ActionType, log.ActionDescription)
			}
			let userScoreList = Object.keys(userScores).map(us => 
				new Object({'username': us, 'score': userScores[us]}))
			userScoreList.sort((a, b) => a.score > b.score ? 1 : -1)
			res.json(userScoreList)
		}
		catch (err) {
			return this.returnError(err.message, res, err.error)
		}
	}

	getActionScore (actionType, actionDescription) {
		if (actionType === 'Comic') {
			if (actionDescription.includes('Append')) {
				return 30
			}
			if (actionDescription.includes('Update details of')) {
				return 15
			}
			if (actionDescription.includes('Add thumbnail to')) {
				return 20
			}
			if (actionDescription.includes('Swap pages')) {
				return 20
			}
			if (actionDescription.includes('Insert page')) {
				return 20
			}
			if (actionDescription.includes('Delete page')) {
				return 20
			}
		}
		else if (actionType === 'Create comic') {
			return 170
		}
		else if (actionType === 'Pending comic') {
			if (actionDescription.includes('Approve ') || actionDescription.includes('Reject ')) {
				return 15
			}
			if (actionDescription.includes('Add thumbnail to')) {
				return 20
			}
			if (actionDescription.includes(' keywords to ') || actionDescription.includes(' keywords from ')) {
				return 10
			}
		}
		else if (actionType === 'Artist') {
			if (actionDescription.includes('Add ')) {
				return 10
			}
			if (actionDescription.includes('Update ')) {
				return 20
			}
		}
		else if (actionType === 'Keyword') {
			if (actionDescription.includes('Remove') && actionDescription.includes(' from ')) {
				return 10
			}
			if (actionDescription.includes('Add') && actionDescription.includes(' to ')) {
				return 10
			}
			if (actionDescription.includes('Add')) {
				return 20
			}
			if (actionDescription.includes('Approve') || actionDescription.includes('Reject')) {
				return 5
			}
		}
		else if (actionType === 'Comic suggestion') {
			return 15
		}
		else {
			console.log(actionType, actionDescription)
			return -1000
		}
		return 0
	}

	async swapComicPages (req, res) {
		let [comicName, comicId, pageNumber1, pageNumber2] = 
			[req.body.comicName, req.body.comicId, req.body.pageNumber1, req.body.pageNumber2]
		let comicFolderPath = __dirname + '/../../../client/public/comics/' + comicName
		let pageName1 = this.getPageName(pageNumber1)
		let pageName2 = this.getPageName(pageNumber2)

		try {
			await FileSystemFacade.renameFile(`${comicFolderPath}/${pageName1}.jpg`, 
				`${comicFolderPath}/temp.jpg`, 'Error renaming first file')
			await FileSystemFacade.renameFile(`${comicFolderPath}/${pageName2}.jpg`,
				`${comicFolderPath}/${pageName1}.jpg`, 'Error renaming second file')
			await FileSystemFacade.renameFile(`${comicFolderPath}/temp.jpg`,
				`${comicFolderPath}/${pageName2}.jpg`, 'Error renaming first file')

				console.log('sholw dowkr')
			
			res.json({success: true})
			this.addModLog(req, 'Comic', `Swap pages in ${comicName}`, `Page ${pageNumber1} and ${pageNumber2}`)
		}
		catch (err) {
			return this.returnError(err.message, res, err.error)
		}
	}

	async insertComicPage (req, res) {
		let [comicName, comicId, newPageFile, insertAfterPageNumber] =
			[req.body.comicName, req.body.comicId, req.files.newPageFile, Number(req.body.insertAfterPageNumber)]
		let comicFolderPath = __dirname + '/../../../client/public/comics/' + comicName
		if (!newPageFile || (newPageFile.path.indexOf('.jpg')===-1 && newPageFile.path.indexOf('.png')===-1)) {
			return this.returnError('File must exist and be .jpg or .png', res)
		}
		try {
			let comicFiles = (await FileSystemFacade.listDir(comicFolderPath, 'Error listing comic directory'))
				.filter(f => f!='s.jpg').sort()
			for (var i=comicFiles.length; i>=insertAfterPageNumber+1; i--) {
				console.log(`Renaming ${this.getPageName(i)} to ${this.getPageName(i+1)}`)
				await FileSystemFacade.renameFile(
					`${comicFolderPath}/${this.getPageName(i)}.jpg`,
					`${comicFolderPath}/${this.getPageName(i+1)}.jpg`,
					'Error renaming existing image files'
				)
			}

			let fileContents = await FileSystemFacade.readFile(newPageFile.path)
			await FileSystemFacade.writeFile(`${comicFolderPath}/${this.getPageName(insertAfterPageNumber+1)}.jpg`, fileContents, 'Error writing new file')

			let query = 'UPDATE comic SET NumberOfPages=? WHERE Id=?'
			let queryParams = [comicFiles.length+1, comicId]
			await this.databaseFacade.execute(query, queryParams, 'Error updating number of pages')

			res.json({success: true})
			this.addModLog(req, 'Comic', `Insert page in ${comicName}`, `Page at position ${insertAfterPageNumber+1}`)
		}
		catch (err) {
			return this.returnError(err.message, res, err.error)
		}
	}

	async deletecomicpage (req, res) {
		let [comicName, comicId, pageNumber] = [req.body.comicName, req.body.comicId, req.body.pageNumber]
		let numberOfPagesQuery = 'SELECT NumberOfPages FROM comic WHERE Id = ?'
		let updateQuery = 'UPDATE comic SET NumberOfPages = ? WHERE Id = ?'
		let comicFolderPath = __dirname + '/../../../client/public/comics/' + comicName
		try {
			let numberOfPages = (await this.databaseFacade.execute(numberOfPagesQuery, [comicId]))[0].NumberOfPages
			let queryParams = [numberOfPages-1, comicId]

			await FileSystemFacade.deleteFile(`${comicFolderPath}/${this.getPageName(pageNumber)}.jpg`)
			for (var i=pageNumber+1; i<=numberOfPages; i++) {
				await FileSystemFacade.renameFile(`${comicFolderPath}/${this.getPageName(i)}.jpg`,
																					`${comicFolderPath}/${this.getPageName(i-1)}.jpg`)
			}

			await this.databaseFacade.execute(updateQuery, queryParams, 'Error updating number of pages')

			res.json({success: true})
			this.addModLog(req, 'Comic', `Delete page in ${comicName}`, `Page ${pageNumber}`)
		}
		catch (err) {
			return this.returnError(err.message, res, err.error)
		}
	}

	getPageName (pageNumber) {
		return pageNumber<100 ? (pageNumber<10 ? '00'+pageNumber : '0'+pageNumber) : pageNumber
	}
}
