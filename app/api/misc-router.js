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
		this.app.post('/api/comicsuggestions', (req, res) => this.addComicSuggestion(req, res))
		this.app.post('/api/comicsuggestions/process', (req, res) => this.processComicSuggestion(req, res))

		this.app.get ('/api/modlog', (req, res) => this.getModLog(req, res))
	
		this.app.post('/api/swapcomicpages', (req, res) => this.swapComicPages(req, res))
		this.app.post('/api/insertcomicpage', multipartyMiddelware, (req, res) => this.insertComicPage(req, res))
		this.app.post('/api/deletecomicpage', (req, res) => this.deletecomicpage(req, res))
	}

	async getComicSuggestions (req, res) {
		let query = 'SELECT Id AS id, Name AS name, ArtistName AS artist, Description AS description, User AS user FROM ComicSuggestion WHERE Processed=0 ORDER BY Timestamp DESC'
		try {
			let result = await this.databaseFacade.execute(query, null, 'Database query error')
			res.json(result)
		}
		catch(err) {
			return this.returnError(err.message, res, err.error)
		}
	}

	async addComicSuggestion (req, res) {
		let query = 'INSERT INTO ComicSuggestion (Name, ArtistName, Description, User) VALUES (?, ?, ?, ?)'
		let user = 'todo ragnar todo'
		let queryParams = [req.body.comicName, req.body.artist, req.body.comment, user]
		try {
			await this.databaseFacade.execute(query, queryParams, 'Database error')
			res.json({success: true})
		}
		catch (err) {
			return this.returnError(err.message, res, err.error)
		}
	}

	async processComicSuggestion (req, res) {
		let query = 'UPDATE ComicSuggestion SET Processed=1, Approved=? WHERE Id=?'
		let queryParams = [req.body.isApproved, req.body.suggestionId]
		try {
			await this.databaseFacade.execute(query, queryParams, 'Database error')
			res.json({success: true})
			let suggestionDetails = (await this.databaseFacade.execute('SELECT Name, ArtistName, Description FROM ComicSuggestion WHERE Id=?', [req.body.suggestionId]))[0]
			this.addModLog(req, 'Comic suggestion', `${req.body.isApproved ? 'Approve' : 'Reject'} ${suggestionDetails.Name}`, `${suggestionDetails.Name} by ${suggestionDetails.ArtistName}, description: ${suggestionDetails.Description}`)
		}
		catch (err) {
			return this.returnError(err.message, res, err.error)
		}
	}

	async getModLog (req, res) {
		let query = 'SELECT user2.Username AS username, ActionType AS actionType, ActionDescription AS actionDescription, ActionDetails AS actionDetails, Timestamp AS timestamp FROM modlog INNER JOIN user2 ON (modlog.UserId=user2.Id) ORDER BY Timestamp DESC'
		try { 
			let result = await this.databaseFacade.execute(query)
			res.json(result)
		}
		catch (err) {
			return this.returnError(err.message, res, err.error)
		}
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
