import { convertComicPage, convertThumbnailFile } from '../image-processing.js'
import { getComics, getFilterQuery } from './comics-query-helper.js'

import multer from 'multer'
var storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads')
  },
  filename: function (req, file, cb) {
    cb(null, file.fieldname + '-' + Date.now())
  }
})
var upload = multer({ storage: storage })

import FileSystemFacade from '../fileSystemFacade.js'
import BaseRouter, { ApiError } from './baseRouter.js'

const addComicUploadFormat = upload.fields([{ name: 'pageFile' }, { name: 'thumbnailFile', maxCount: 1 }])

const COMICS_PER_PAGE = 75

import { dirname } from 'path';	
import { fileURLToPath } from 'url';	
const __dirname = dirname(fileURLToPath(import.meta.url));

import cron from 'cron'
const CronJob = cron.CronJob

async function clearUploadsFolder() {
	console.log('Cron: Cleaning up uploads folder...')
	let uploadedFiles = await FileSystemFacade.listDir(__dirname + '/../../uploads')
	console.log(`Found ${uploadedFiles.length} files`)
	for (let file of uploadedFiles) {
		console.log(file)
		await FileSystemFacade.deleteFile(`${__dirname}/../../uploads/${file}`)
	}
	console.log(`Deleted all upload files`)
}

export default class ComicsRouter extends BaseRouter {
	constructor (app, databaseFacade, modLogger) {
		super(app, databaseFacade, modLogger)
		this.setupRoutes()
		this.setupUploadsFolder()
		let cronJob = new CronJob('0 0 * * *', clearUploadsFolder, null, true, 'Europe/London')
		cronJob.start()
	}

  setupRoutes () {
		this.app.get ('/api/all-comics', (req, res) => this.getAllComics(req, res))
		this.app.get ('/api/comicsPaginated', (req, res) => this.getComicListPaginated(req, res))
		this.app.get ('/api/firstComics', (req, res) => this.getFirstPageComics(req, res))
		this.app.get ('/api/comics/:name', (req, res) => this.getComicByName(req, res))
		this.app.post('/api/comics', this.authorizeMod.bind(this), addComicUploadFormat, (req, res) => this.createComic(req, res))
		this.app.post('/api/comics/:id/addpages', this.authorizeMod.bind(this), upload.array('newPages'), (req, res) => this.addPagesToComic(req, res, false))
		this.app.post('/api/comics/:id/updatedetails', this.authorizeMod.bind(this), (req, res) => this.updateComicDetails(req, res))
		this.app.post('/api/comics/:id/rate', this.authorizeUser.bind(this), (req, res) => this.rateComic(req, res))
		this.app.post('/api/comics/:id/addthumbnail', this.authorizeMod.bind(this), upload.single('thumbnailFile'), (req, res) => this.addThumbnailToComic(req, res, false))
		
		this.app.get ('/api/pendingcomics', this.authorizeMod.bind(this), (req, res) => this.getPendingComics(req, res))
		this.app.get ('/api/pendingcomics/:name', this.authorizeMod.bind(this), (req, res) => this.getPendingComic(req, res))
		this.app.post('/api/pendingcomics/:id', this.authorizeAdmin.bind(this), (req, res) => this.processPendingComic(req, res))
		this.app.post('/api/pendingcomics/:id/addthumbnail', this.authorizeMod.bind(this), upload.single('thumbnailFile'), (req, res) => this.addThumbnailToComic(req, res, true))
		this.app.post('/api/pendingcomics/:id/addkeywords', this.authorizeMod.bind(this), (req, res) => this.addKeywordsToPendingComic(req, res))
		this.app.post('/api/pendingcomics/:id/removekeywords', this.authorizeMod.bind(this), (req, res) => this.removeKeywordsFromPendingComic(req, res))
		this.app.post('/api/pendingcomics/:id/addpages', this.authorizeMod.bind(this), upload.array('newPages'), (req, res) => this.addPagesToComic(req, res, true))
	}

	async setupUploadsFolder () {
		let folders = await FileSystemFacade.listDir(__dirname + '/../../')
		if (!folders.includes('uploads')) {
			await FileSystemFacade.createDirectory(__dirname + '/../../uploads')
		}
	}

	async getComicListPaginated (req, res) {
		try {
			let [categories, tags, keywordIds, search, page, order, shouldGetKeywords] = 
				[req.query.categories, req.query.tags, req.query.keywordIds, req.query.search, req.query.page, req.query.order, req.query.getKeywords]

			keywordIds = keywordIds ? keywordIds.map(kw => Number(kw)) : undefined

			let user = this.getUser(req)
			page = (page && !isNaN(page)) ? Number(page)-1 : 0
			let pageOffset = page * COMICS_PER_PAGE

			if (!user && order === 'yourRating') { order = 'updated' }

			let comicsPromise = getComics(
				this.databaseFacade,
				user,
				COMICS_PER_PAGE,
				pageOffset,
				categories,
				tags,
				keywordIds,
				search,
				order
			)

			let [
				filterQueryString,
				filterQueryParams,
				keywordCountString,
				innerJoinKeywordString
			] = getFilterQuery(categories, tags, keywordIds, search)

			let totalPagesQuery = `
				SELECT COUNT(*) AS count FROM (
					SELECT comic.Id FROM comic 
					INNER JOIN artist ON (artist.Id = comic.Artist) 
					${innerJoinKeywordString}
					${filterQueryString}
					GROUP BY comic.Id
					${keywordCountString}
				) AS Q1`

			let totalNumberPromise = this.databaseFacade.execute(totalPagesQuery, filterQueryParams)

			let [comics, totalNumber] = await Promise.all([comicsPromise, totalNumberPromise])
			let numberOfPages = Math.ceil(totalNumber[0].count / COMICS_PER_PAGE)

			if (shouldGetKeywords && comics.length > 0) {
				comics = await this.getComicsWithKeywords(comics)
			}

			res.json({ comics, numberOfPages, page: page+1 })
		}
		catch (err) {
			return this.returnApiError(res, err)
		}
	}

	async getComicsWithKeywords (comics) {
		let getKwQuery = 'SELECT keyword.KeywordName AS keywordName, keyword.Id AS keywordId, comic.Id AS comicId FROM comic INNER JOIN comickeyword ON (comic.Id = comickeyword.ComicId) INNER JOIN keyword ON (keyword.Id = comickeyword.KeywordId) WHERE comic.Id IN (?) ORDER BY comicId'

		let comicIds = []
		let comicsWithKeywords = {}

		for (let comic of comics) {
			comicsWithKeywords[comic.id] = []
			comicIds.push(comic.id)
		}

		let keywords = await this.databaseFacade.execute(getKwQuery, [comicIds], 'Error fetching tags from database')

		for (let keywordResult of keywords) {
			comicsWithKeywords[keywordResult.comicId].push({
				id: keywordResult.keywordId,
				name: keywordResult.keywordName,
			})
		}

		let newComics = comics.map(c => ({
			...c,
			keywords: comicsWithKeywords[c.id]
		}))

		return newComics
	}

	async getAllComics (req, res) {
		let innerComicQuery = `SELECT comic.Id AS id, comic.Name AS name, comic.Cat AS cat, comic.Tag AS tag, artist.Name AS artist, comic.Updated AS updated, comic.State AS state, comic.Created AS created, comic.NumberOfPages AS numberOfPages FROM comic INNER JOIN artist ON (artist.Id = comic.Artist) ORDER BY name ASC`

		try {
			let comics = await this.databaseFacade.execute(innerComicQuery, null)
			res.json(comics)
		}
		catch (err) {
      return this.returnError(err.message, res, err.error, err)
		}
	}
	
	async getFirstPageComics (req, res) {
		let query = 'SELECT comic.Id AS id, comic.Name AS name, comic.Cat AS cat, comic.Tag AS tag, artist.Name AS artist, comic.Updated AS updated, comic.State AS state, comic.Created AS created, comic.NumberOfPages AS numberOfPages FROM comic INNER JOIN artist ON (artist.Id = comic.Artist) GROUP BY name, id ORDER BY id LIMIT 50'
		try {
			let results = await this.databaseFacade.execute(query)
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
    let prevLinkQuery = 'SELECT Name FROM comiclink INNER JOIN comic ON (Id = FirstComic) WHERE LastComic = ?'
    let nextLinkQuery = 'SELECT Name FROM comiclink INNER JOIN comic ON (Id = LastComic) WHERE FirstComic = ?'
		let user = this.getUser(req)

		if (user) {
			comicDataQuery = 'SELECT T1.name AS name, T1.numberOfPages AS numberOfPages, T1.artist AS artist, T1.id AS id, T1.userRating AS userRating, T1.keywords AS keywords, T1.cat, T1.tag, T1.Created AS created, T1.Updated AS updated, comicvote.Vote AS yourRating FROM (SELECT comic.Name AS name, comic.NumberOfPages as numberOfPages, artist.Name AS artist, comic.Id AS id, AVG(comicvote.Vote) AS userRating, GROUP_CONCAT(DISTINCT KeywordName SEPARATOR \',\') AS keywords, comic.Cat AS cat, comic.Tag AS tag, comic.Created, comic.Updated FROM comic INNER JOIN artist ON (artist.Id = comic.Artist) LEFT JOIN comickeyword ON (comickeyword.ComicId = comic.Id) LEFT JOIN keyword ON (comickeyword.KeywordId = keyword.Id) LEFT JOIN comicvote ON (comic.Id = comicvote.ComicId) WHERE comic.Name = ? GROUP BY numberOfPages, artist, id, cat, tag) AS T1 LEFT JOIN comicvote ON (comicvote.ComicId = T1.id AND comicvote.UserId = ?)'
			queryParams = [comicName, user.id]
		}
		else {
			comicDataQuery = 'SELECT comic.Name AS name, comic.NumberOfPages as numberOfPages, artist.Name AS artist, comic.Id AS id, comic.Cat AS cat, comic.tag AS tag, comic.Created AS created, comic.Updated AS updated, NULL AS yourRating, AVG(comicvote.Vote) AS userRating, GROUP_CONCAT(DISTINCT KeywordName SEPARATOR \',\') AS keywords FROM comic INNER JOIN artist ON (artist.Id = comic.Artist) LEFT JOIN comickeyword ON (comickeyword.ComicId = comic.Id) LEFT JOIN keyword ON (comickeyword.KeywordId = keyword.Id) LEFT JOIN comicvote ON (comic.Id = comicvote.ComicId) WHERE comic.Name = ? GROUP BY numberOfPages, artist, id'
			queryParams = [comicName, comicName]
		}

		try {
			let result = await this.databaseFacade.execute(comicDataQuery, queryParams)
			let comicData = result[0]
			if (!comicData) {
				return this.returnApiError(res, new ApiError('There are no comics with this name', 404))
			}
			
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
			return this.returnApiError(res, err)
		}
	}

	async createComic (req, res) {
		let [newFiles, thumbnailFile] = [req.files.pageFile, req.files.thumbnailFile]
		let [comicName, artistId, cat, tag, state, keywordIds, nextComic, previousComic] = 
			[req.body.comicName, Number(req.body.artistId), req.body.cat, req.body.tag, req.body.state, req.body.keywordIds, Number(req.body.nextComic)||null, Number(req.body.previousComic)||null]
		let userId = req.session.user.id

		let hasThumbnail = false
		if (thumbnailFile && thumbnailFile.length === 1) {
			thumbnailFile = thumbnailFile[0]
			hasThumbnail = true
		}

		if (!newFiles) { return this.returnError('No files added', res) }
		if (newFiles.length === 1) {
			FileSystemFacade.deleteFile(newFiles[0].path)
			return this.returnError('Comic must have more than one page', res)
		}

		let fileList = newFiles.sort((f1, f2) => f1.f > f2.f ? -1 : 1)

		try {
			let comicExistsQuery = 'SELECT * FROM comic WHERE Name = ?'
			let comicExistsPendingQuery = 'SELECT * FROM pendingcomic WHERE Name = ?'

			let existingResults = await this.databaseFacade.execute(comicExistsQuery, [comicName])
			if (existingResults.length > 0) {
				return this.returnError('Comic with this name already exists', res)
			}
			let existingSuggestedResults = await this.databaseFacade.execute(comicExistsPendingQuery, [comicName])
			if (existingSuggestedResults.length > 0) {
				return this.returnError('Comic with this name already exists, is pending', res)
			}

			await this.processComicFiles(fileList, thumbnailFile)

			await this.writeNewComicFiles(
				fileList.map(f => f.path), 
				comicName, 
				hasThumbnail ? thumbnailFile.path : null
			)

			let insertQuery = 'INSERT INTO pendingcomic (Moderator, Name, Artist, Cat, Tag, NumberOfPages, State, HasThumbnail, PreviousComicLink, NextComicLink) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
			let insertQueryParams = [userId, comicName, artistId, cat, tag, fileList.length, state, hasThumbnail?1:0, previousComic, nextComic]
			let insertResult = await this.databaseFacade.execute(insertQuery, insertQueryParams, 'Database error creating new comic')
			let comicId = insertResult.insertId

			await this.addKeywordsToComic(keywordIds, comicId)

			res.json({success: true})
			
			FileSystemFacade.deleteFiles(fileList.map(f => f.path))
			if (hasThumbnail) {
				FileSystemFacade.deleteFile(thumbnailFile.path)
				FileSystemFacade.deleteFile(thumbnailFile.path + '-thumb')
				FileSystemFacade.deleteFile(thumbnailFile.path + '-thumbsmall')
			}
			this.addModLog(req, 'Create comic', `Add ${comicName}`)
		}
		catch (err) {
			FileSystemFacade.deleteFiles(newFiles.map(f => f.path))
			return this.returnError(err.message, res, err.error, err)
		}
	}
	
	async processComicFiles (fileList, thumbnailFile) {
		for (let file of fileList) {
			if (file.mimetype.endsWith('png')) {
				await convertComicPage(file.path)
			}
			else if (!file.mimetype.endsWith('jpeg')) {
				throw new Error(`Some file is of an unsupported format (${file.originalname})`)
			}
		}

		if (thumbnailFile) {
			if (thumbnailFile.mimetype.endsWith('png') || thumbnailFile.mimetype.endsWith('jpeg')) {
				await convertThumbnailFile(thumbnailFile.path)
			}
			else {
				throw new Error(`Thumbnail file is of an unsupported format (${thumbnailFile.originalname})`)
			}
		}
	}

	async writeNewComicFiles (filePaths, comicName, originalThumbnailFilePath) {
		let fileWritePromises = []
		for (var i=1; i<= filePaths.length; i++) {
			let filePath = filePaths[i-1]
			let pageNumberString = i<100 ? (i<10 ? '00'+i : '0'+i) : i
			let pageName = `${pageNumberString}.jpg`
			fileWritePromises.push(FileSystemFacade.writeGoogleComicFile(filePath, comicName, pageName))
		}

		await Promise.all(fileWritePromises)

		if (originalThumbnailFilePath) {
			await Promise.all([
				FileSystemFacade.writeGoogleComicFile(originalThumbnailFilePath + '-thumb', comicName, 'thumbnail.webp'),
				FileSystemFacade.writeGoogleComicFile(originalThumbnailFilePath + '-thumbsmall', comicName, 'thumbnail-small.webp'),
				FileSystemFacade.writeGoogleComicFile(originalThumbnailFilePath, comicName, 'thumbnail.jpg'),
			])
		}

		return {error: false}
	}

	async addKeywordsToComic (keywordIds, comicId) {
		if (!keywordIds) { return }
		keywordIds = keywordIds.split(',').map(kwId => Number(kwId))
		let insertKeywordsQuery = 'INSERT INTO pendingcomickeyword (ComicId, KeywordId) VALUES '


		let insertKeywordsQueryParams  = []
		for (var keywordId of keywordIds) {
			insertKeywordsQuery += `(?, ?), `
			insertKeywordsQueryParams .push(comicId)
			insertKeywordsQueryParams .push(Number(keywordId))
		}
		insertKeywordsQuery = insertKeywordsQuery.substring(0, insertKeywordsQuery.length-2)
		await this.databaseFacade.execute(insertKeywordsQuery, insertKeywordsQueryParams, 'Database error adding tags')
	}

	async addPagesToComic (req, res, isPendingComic) {
		let [uploadedFiles, comicName, comicId] = [req.files, req.body.comicName, Number(req.params.id)]

		if (!uploadedFiles || uploadedFiles.length === 0) {
			return this.returnError('No files added!', res)
		}

		try {
			let comicQuery = `SELECT * FROM ${isPendingComic ? 'pendingcomic' : 'comic'} WHERE Id=?`
			let comicQueryRes = await this.databaseFacade.execute(comicQuery, [comicId])
			let comic = comicQueryRes[0]
			let existingNumberOfPages = comic.NumberOfPages

			let files = uploadedFiles.sort((f1, f2) => f1.originalname > f2.originalname ? 1 : -1)
			
			for (let file of files) {
				if (file.mimetype.endsWith('png')) {
					await convertComicPage(file.path)
				}
				else if (!file.mimetype.endsWith('jpeg')) {
					throw new Error(`Some file is of an unsupported format (${file.originalname})`)
				}
			}

			await this.writeAppendedComicPageFiles(
				existingNumberOfPages,
				files.map(f => f.path),
				comicName
			)

			if (!isPendingComic) {
				let updateUpdatedTimeQuery = 'UPDATE comic SET Updated = NOW() WHERE Id=?'
				await this.databaseFacade.execute(updateUpdatedTimeQuery, [comicId],
					'Database error: Error updating comic updated timestamp')
			}

			let updateNumberOfPagesQuery = `UPDATE ${isPendingComic ? 'pendingcomic' : 'comic'} SET NumberOfPages = ? WHERE Id = ?`
			let queryParams = [existingNumberOfPages + files.length, comicId]
			await this.databaseFacade.execute(updateNumberOfPagesQuery,
				queryParams, 'Database error: Error updating number of pages')
			
			FileSystemFacade.deleteFiles(uploadedFiles.map(f => f.path))
			res.json({success: true})
			
			this.addModLog(req, 'Comic', `Append ${files.length} pages to ${comicName}`)
		}
		catch (err) {
			console.log(err)
			FileSystemFacade.deleteFiles(uploadedFiles.map(f => f.path))
			return this.returnError(err.message, res, err.error, err)
		}
	}

	async writeAppendedComicPageFiles(existingNumPages, filePaths, comicName) {
		let fileWritePromises = []
    for (let i=0; i < filePaths.length; i++) {
			let filePath = filePaths[i]
			let pageNo = existingNumPages + i + 1
			let pageNumString = pageNo<100 ? (pageNo<10 ? '00'+pageNo : '0'+pageNo) : pageNo
			let pageName = `${pageNumString}.jpg`
			fileWritePromises.push(FileSystemFacade.writeGoogleComicFile(filePath, comicName, pageName))
		}

		await Promise.all(fileWritePromises)
	}

	async updateComicDetails (req, res) {
		let [comicId, oldName, newName, newCat, newTag, newState, newArtistName, previousComic, nextComic] = 
			[Number(req.params.id), req.body.oldName, req.body.name, req.body.cat, req.body.tag, req.body.state, req.body.artist, Number(req.body.previousComic), Number(req.body.nextComic)]

		if (!newName || !newCat || !newTag || !newState || !newArtistName) {
			return this.returnError('Missing fields', res, null, null)
		}

		let hasMovedFiles = false
		try {
			if (oldName !== newName) {
				await this.renameComicFiles(comicId, oldName, newName)
				hasMovedFiles = true
			}

			let query = 'UPDATE comic SET Name = ?, Cat = ?, Tag = ?, State = ?, Artist = (SELECT artist.Id FROM artist WHERE Name = ?) WHERE Id = ?'
			let queryParams = [newName, newCat, newTag, newState, newArtistName, comicId]
			await this.databaseFacade.execute(query, queryParams)

			await this.updatePrevAndNextComicLinks(comicId, previousComic, nextComic)

			res.json({success: true})

			let comicName = (await this.databaseFacade.execute('SELECT Name FROM comic WHERE Id=?', [comicId]))[0].Name
			this.addModLog(req, 'Comic', `Update details of ${comicName}`, queryParams.slice(0,-1).join(', '))
		}
		catch (err) {
			if (hasMovedFiles) {
				await this.renameComicFiles(comicId, newName, oldName)
			}
			return this.returnError(err.message, res, err.error, err)
		}
	}

	async renameComicFiles (comicId, oldComicName, newComicName) {
		let numberOfPages = (await this.databaseFacade.execute('SELECT NumberOfPages FROM comic WHERE Id=?', [comicId], 'Error  getting comic number of pages'))[0].NumberOfPages

		let allRenamePromises = []
		for (let i=1; i<=numberOfPages; i++) {
			let pageNumberString = i<100 ? (i<10 ? '00'+i : '0'+i) : i
			let pageName = `${pageNumberString}.jpg`
			let oldPageName = `comics/${oldComicName}/${pageName}`
			let newPageName = `comics/${newComicName}/${pageName}`
			allRenamePromises.push(FileSystemFacade.renameGoogleComicFile(oldPageName, newPageName))
		}

		allRenamePromises.push(FileSystemFacade.renameGoogleComicFile(
			`comics/${oldComicName}/thumbnail.webp`, `comics/${newComicName}/thumbnail.webp`
		))
		allRenamePromises.push(FileSystemFacade.renameGoogleComicFile(
			`comics/${oldComicName}/thumbnail-small.webp`, `comics/${newComicName}/thumbnail-small.webp`
		))

		return await Promise.all(allRenamePromises)
	}

	async updatePrevAndNextComicLinks (comicId, previousComic, nextComic) {
		if (previousComic) {
			let updateQuery = 'UPDATE comiclink SET FirstComic=? WHERE LastComic=?'
			let updateResults = await this.databaseFacade.execute(updateQuery, [previousComic, comicId], 'Error updating comic link')
			if (updateResults.affectedRows == 0) {
				let insertQuery = 'INSERT INTO comiclink (FirstComic, LastComic) VALUES (?, ?)'
				await this.databaseFacade.execute(insertQuery, [previousComic, comicId], 'Error adding comic link')
			}
		}
		else {
			let deleteQuery = 'DELETE FROM comiclink WHERE LastComic=?'
			await this.databaseFacade.execute(deleteQuery, [comicId], 'Error removing comic link')
		}

		if (nextComic) {
			let updateQuery = 'UPDATE comiclink SET LastComic=? WHERE FirstComic=?'
			let updateResults = await this.databaseFacade.execute(updateQuery, [nextComic, comicId], 'Error updating comic link')
			if (updateResults.affectedRows == 0) {
				let insertQuery = 'INSERT INTO comiclink (FirstComic, LastComic) VALUES (?, ?)'
				await this.databaseFacade.execute(insertQuery, [comicId, nextComic], 'Error adding comic link')
			}
		}
		else {
			let deleteQuery = 'DELETE FROM comiclink WHERE FirstComic=?'
			await this.databaseFacade.execute(deleteQuery, [comicId], 'Error removing comic link')
		}
	}

	async rateComic (req, res) {
		let [comicId, rating] = [Number(req.params.id), Number(req.body.rating)]
		let user = this.getUser(req)
		let deleteQuery = 'DELETE FROM comicvote WHERE UserId = ? AND ComicId = ?'
		let deleteQueryParams = [user.id, comicId]
		let insertQuery = 'INSERT INTO comicvote (UserId, ComicId, Vote) VALUES (?, ?, ?)'
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
		let query = 'SELECT artist.Name AS artist, pendingcomic.Id AS id, pendingcomic.Name AS name, user.Username AS modName, Cat AS cat, Tag AS tag, NumberOfPages AS numberOfPages, State AS state, HasThumbnail AS hasThumbnail, GROUP_CONCAT(DISTINCT KeywordName SEPARATOR \',\') AS keywords FROM pendingcomic INNER JOIN artist ON (pendingcomic.Artist=artist.Id) INNER JOIN user ON (user.Id=pendingcomic.Moderator) LEFT JOIN pendingcomickeyword ON (pendingcomickeyword.ComicId = pendingcomic.Id) LEFT JOIN keyword ON (keyword.Id = pendingcomickeyword.KeywordId) WHERE Processed=0 GROUP BY name, numberOfPages, artist, id'
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
		let comicDataQuery = 'SELECT artist.Name AS artistName, pendingcomic.Id AS id, pendingcomic.Name AS name, Cat AS cat, Tag AS tag, NumberOfPages AS numberOfPages, State AS state, HasThumbnail AS hasThumbnail FROM pendingcomic INNER JOIN artist ON (pendingcomic.Artist=artist.Id) WHERE pendingcomic.Name = ?'
		let keywordsQuery = 'SELECT KeywordName AS name, keyword.Id AS id FROM pendingcomickeyword INNER JOIN keyword ON (pendingcomickeyword.KeywordId = keyword.Id) WHERE pendingcomickeyword.ComicId = ?'
		try {
			let comicData = await this.databaseFacade.execute(comicDataQuery, [comicName])
			if (comicData.length === 0) { return this.returnError('No pending comic with that name', res) }
			comicData = comicData[0]

			let keywords = await this.databaseFacade.execute(keywordsQuery, [comicData.id])
			comicData.keywords = keywords.map(k => ({name: k.name, id: k.id}))

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
				await this.approvePendingComic(req, res, comicId)
			}
			else {
				await this.rejectPendingComic(req, res, comicId)
			}
		}
		catch (err) {
			return this.returnError(err.message, res, err.error, err)
		}
	}
	
	async approvePendingComic (req, res, comicId) {
		let getFullPendingComicDataQuery = 'SELECT Name, Cat, Tag, NumberOfPages, State, Artist, HasThumbnail FROM pendingcomic WHERE Id = ?'
		let getKeywordsQuery = 'SELECT KeywordId FROM pendingcomickeyword WHERE ComicId = ?'
		let updatePendingComicsQuery = 'UPDATE pendingcomic SET Processed = 1, Approved = 1 WHERE Id = ?'
		let insertIntoComicQuery = 'INSERT INTO comic (Name, Cat, Tag, NumberOfPages, State, Artist) VALUES (?, ?, ?, ?, ?, ?)'
		let insertKeywordsQuery = 'INSERT INTO comickeyword (ComicId, KeywordId) VALUES '

		let comicData = await this.databaseFacade.execute(getFullPendingComicDataQuery, [comicId], 'Error getting pending comic data')
		comicData = comicData[0]
		if (comicData.hasThumbnail) { return this.returnError('Pending comic has no thumbnail', res) }

		let keywordIds = await this.databaseFacade.execute(getKeywordsQuery, [comicId], 'Error getting pending comic keywords')
		if (keywordIds.length === 0) {
			return this.returnStatusError(400, res, 'No tags added')
		}
		keywordIds = keywordIds.map(k => k.KeywordId)

		let updatePendingComicsQueryParams = [comicData.Name, comicData.Cat, comicData.Tag, comicData.NumberOfPages, comicData.State, comicData.Artist]
		let insertResult = await this.databaseFacade.execute(insertIntoComicQuery, updatePendingComicsQueryParams, 'Error adding new comic to database')
		await this.databaseFacade.execute(updatePendingComicsQuery, [comicId], 'Error updating pending comic status')

		let newComicId = insertResult.insertId

		let insertKeywordsQueryParams = []
		for (var keywordId of keywordIds) { 
			insertKeywordsQuery += `(?, ?), `
			insertKeywordsQueryParams.push(newComicId)
			insertKeywordsQueryParams.push(keywordId)
		}
		insertKeywordsQuery = insertKeywordsQuery.substring(0, insertKeywordsQuery.length-2)
		await this.databaseFacade.execute(insertKeywordsQuery, insertKeywordsQueryParams, 'Error adding tags to comic')

		let comicName = (await this.databaseFacade.execute('SELECT Name FROM pendingcomic WHERE Id=?', [comicId]))[0].Name
		this.addModLog(req, 'Pending comic', `Approve ${comicName}`)

		res.json({success: true})
	}

	async rejectPendingComic (req, res, comicId) {
		let query = 'UPDATE pendingcomic SET Processed=1, Approved=0 WHERE Id=?'
		let queryParams = [comicId]
		await this.databaseFacade.execute(query, queryParams, 'Error rejecting comic')
		
		let comicName = (await this.databaseFacade.execute('SELECT Name FROM pendingcomic WHERE Id=?', [comicId]))[0].Name
		this.addModLog(req, 'Pending comic', `Reject ${comicName}`)

		res.json({success: true})
	}

	async addThumbnailToComic (req, res, isPendingComic) {
		let [thumbnailFile, comicName, comicId] = [req.file, req.body.comicName, Number(req.params.id)]

		if (!thumbnailFile) {
			return this.returnError('File must exist', res)
		}

		if (!thumbnailFile.mimetype.endsWith('jpeg') && !thumbnailFile.mimetype.endsWith('png')) {
			await FileSystemFacade.deleteFile(thumbnailFile.path, 'Error deleting temp file')
			return this.returnError('File must be .jpg, .jpeg, or .png', res)
		}

		await convertThumbnailFile(thumbnailFile.path)

		try {
			await Promise.all([
				FileSystemFacade.writeGoogleComicFile(thumbnailFile.path+'-thumb', comicName, 'thumbnail.webp'),
				FileSystemFacade.writeGoogleComicFile(thumbnailFile.path+'-thumbsmall', comicName, 'thumbnail-small.webp'),
				FileSystemFacade.writeGoogleComicFile(thumbnailFile.path, comicName, 'thumbnail.jpg'),
			])

			if (isPendingComic) {
				let updateComicDataQuery = 'UPDATE pendingcomic SET HasThumbnail = 1 WHERE Id = ?'
				await this.databaseFacade.execute(updateComicDataQuery, [comicId])
			}

			res.json({success: true})

			await FileSystemFacade.deleteFile(thumbnailFile.path, 'Error deleting temp file 1')
			await FileSystemFacade.deleteFile(thumbnailFile.path + '-thumb', 'Error deleting temp file 2')
			await FileSystemFacade.deleteFile(thumbnailFile.path + '-thumbsmall', 'Error deleting temp file 3')

			this.addModLog(req, isPendingComic?'Pending comic':'Comic', `Add/change thumbnail to ${comicName}`)
		}
		catch (err) {
			return this.returnError(err.message, res, err.error, err)
		}
	}

	async addKeywordsToPendingComic (req, res) {
		let [comicId, keywords] = [req.params.id, req.body.keywords]
		let addKeywordsQuery = 'INSERT INTO pendingcomickeyword (ComicId, KeywordId) VALUES '
		let addKeywordsQueryParams = []
		for (let keywordObject of keywords) {
			addKeywordsQuery += '(?, ?), '
			addKeywordsQueryParams.push(comicId)
			addKeywordsQueryParams.push(keywordObject.id)
		}
		addKeywordsQuery = addKeywordsQuery.substring(0, addKeywordsQuery.length-2)

		try {
			await this.databaseFacade.execute(addKeywordsQuery, addKeywordsQueryParams)
			res.json({success: true})
			let comicName = (await this.databaseFacade.execute('SELECT Name FROM pendingcomic WHERE Id=?', [comicId]))[0].Name
			this.addModLog(req, 'Pending comic', `Add ${keywords.length} keywords to ${comicName}`, keywords.map(kw => kw.name).join(', '))
		}
		catch (err) {
      if (err.error.code === 'ER_DUP_ENTRY') {
        return this.returnError('Some tags already exist on this comic', res)
      }
			return this.returnError(err.message, res, err.error)
		}
	}

	async removeKeywordsFromPendingComic (req, res) {
		let [comicId, keywords] = [req.params.id, req.body.keywords]
		let removeKeywordsQuery = 'DELETE FROM pendingcomickeyword WHERE (ComicId, KeywordId) IN ('
		let removeKeywordsQueryParams = []
		for (let keyword of req.body.keywords) {
			removeKeywordsQuery += '(?, ?), '
			removeKeywordsQueryParams.push(comicId)
			removeKeywordsQueryParams.push(keyword.id)
		}
		removeKeywordsQuery = removeKeywordsQuery.substring(0, removeKeywordsQuery.length-2) + ')'

		try {
			await this.databaseFacade.execute(removeKeywordsQuery, removeKeywordsQueryParams)
			res.json({success: true})
			
			let comicName = (await this.databaseFacade.execute('SELECT Name FROM pendingcomic WHERE Id=?', [comicId]))[0].Name
			this.addModLog(req, 'Pending comic', `Remove ${keywords.length} keywords from ${comicName}`, keywords.map(kw => kw.name).join(', '))
		}
		catch (err) {
			return this.returnError(err.message, res, err.error)
		}

	}
}
