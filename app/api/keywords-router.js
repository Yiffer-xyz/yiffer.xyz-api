let BaseRouter = require('./baseRouter')

module.exports = class KeywordsRouter extends BaseRouter {
	constructor (app, databaseFacade, modLogger) {
		super(app, databaseFacade, modLogger)
		this.setupRoutes()
  }
  
  setupRoutes () {
    this.app.get ('/api/keywords', (req, res) => this.getAllKeywords(req, res))
    this.app.post('/api/keywords/removefromcomic', (req, res) => this.removeKeywordsFromComic(req, res))
    this.app.post('/api/keywords/addtocomic', (req, res) => this.addKeywordsToComic(req, res))
    this.app.post('/api/keywords', (req, res) => this.createKeyword(req, res))
    this.app.post('/api/keywordsuggestions/process', (req, res) => this.processKeywordSuggestion(req, res))
    this.app.post('/api/keywordsuggestions', (req, res) => this.addKeywordSuggestion(req, res))
    this.app.get ('/api/keywordsuggestions', (req, res) => this.getKeywordSuggestions(req, res))
    this.app.post('/api/keywords/log', (req, res) => this.logKeywordSearch(req, res))
  }

  async getAllKeywords (req, res) {
    let query = 'SELECT ComicKeyword.Keyword AS keyword, COUNT(*) AS count FROM Comic INNER JOIN ComicKeyword ON (Id=ComicId) GROUP BY ComicKeyword.Keyword ORDER BY count DESC'
    try {
      let result = await this.databaseFacade.execute(query)
      res.json(result)
    }
    catch (err) {
      return this.returnError(err.message, res, err.error)
    }
  }

	async removeKeywordsFromComic (req, res) {
		let [comicId, keywords] = [req.body.comicId, req.body.keywords]
    if (typeof(keywords) == 'string') { keywords = [req.body.keywords] }

		let deleteQuery = 'DELETE FROM ComicKeyword WHERE (ComicId, Keyword) IN ('
		let queryParams = []
		for (let keyword of keywords) {
			deleteQuery += '(?, ?), '
			queryParams.push(comicId, keyword)
		}
		deleteQuery = deleteQuery.substring(0, deleteQuery.length-2) + ')'

    try {
      await this.databaseFacade.execute(deleteQuery, queryParams)
      res.json({success: true})
    }
    catch (err) {
			return this.returnError(err.message, res, err.error)
    }
	}

  async addKeywordsToComic (req, res) {
		let [comicId, keywords] = [req.body.comicId, req.body.keywords]
    if (typeof(keywords) == 'string') { keywords = [req.body.keywords] }

    let insertQuery = 'INSERT INTO ComicKeyword (ComicId, Keyword) VALUES '
    let queryParams = []
    for (var keyword of keywords) {
			insertQuery += '(?, ?), '
			queryParams.push(comicId, keyword)
    }
		insertQuery = insertQuery.substring(0, insertQuery.length-2)

    try {
      await this.databaseFacade.execute(insertQuery, queryParams)
      res.json({success: true})
    }
    catch (err) {
			return this.returnError(err.message, res, err.error)
    }
  }

  async createKeyword (req, res) {
    let query = 'INSERT INTO Keyword (KeywordName) VALUES (?)'
    let queryParams = [req.body.keyword]
    try {
      await this.databaseFacade.execute(query, queryParams)
      res.json({success: true})
    }
    catch (err) {
      return this.returnError(err.message, res, err.error)
    }
  }

  async addKeywordSuggestion (req, res) {
    let [comicId, suggestedKeyword, extension] = [req.body.comicId, req.body.keyword, req.body.extension ? 1 : 0]
    let user
    // if (req.session && req.session.user) { user = req.session.user.username }
		// else { user = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.socket.remoteAddress || (req.connection.socket ? req.connection.socket.remoteAddress : null) }
		user = 'todo ragnar todo'
    let query = 'INSERT INTO KeywordSuggestion (ComicId, Keyword, Extension, User) VALUES (?, ?, ?, ?)'
    let queryParams = [comicId, suggestedKeyword, extension ? 1:0, user]
    try {
      await this.databaseFacade.execute(query, queryParams)
      res.json({success: true})
    }
    catch (err) {
      return this.returnError(err.message, res, err.error)
    }
  }

  async processKeywordSuggestion (req, res) {
		let [suggestionId, comicId, keyword, extension, isApproved] = 
			[req.body.suggestion.id, req.body.suggestion.comicId, req.body.suggestion.keyword, req.body.suggestion.addKeyword, req.body.isApproved]
    let updateQuery = 'UPDATE KeywordSuggestion SET Approved = ?, Processed = 1 WHERE Id = ?'
    let updateQueryParams = [isApproved ? 1 : 0, suggestionId]
    let insertQuery = extension ? 'INSERT INTO ComicKeyword (ComicId, Keyword) VALUES (?, ?)' : 'DELETE FROM ComicKeyword WHERE ComicId = ? AND Keyword = ?'
    let insertQueryParams = [comicId, keyword]
    try {
      if (isApproved) {
        await this.databaseFacade.execute(insertQuery, insertQueryParams, 'Database error: Error adding/deleting tags to/from comic')
      }
      await this.databaseFacade.execute(updateQuery, updateQueryParams, 'Database error: Error updating suggested tags')
      res.json({success: true})
    }
    catch (err) {
      if (err.error.sqlMessage && err.error.sqlMessage.includes('Duplicate')) {
        return this.returnError('Error adding tag: tag already exists on comic. Just reject this one please.', res)
      }
      return this.returnError(err.message, res, err.error)
    }
  }

  async getKeywordSuggestions (req, res) {
    let query = 'SELECT KeywordSuggestion.Id AS id, Comic.Name AS comicName, ComicId AS comicId, Extension AS addKeyword, User AS user, Keyword AS keyword FROM KeywordSuggestion INNER JOIN Comic ON (Comic.Id=KeywordSuggestion.ComicId) WHERE Processed = 0'
    try {
      let result = await this.databaseFacade.execute(query)
      res.json(result)
    }
    catch (err) {
      return this.returnError(err.message, res, err.error)
    }
  }

  async logKeywordSearch (req, res) {
    let keyword = req.body.keyword
    if (!keyword) { return }
    let query = 'UPDATE KeywordSearches SET Count = Count + 1 WHERE Keyword = ?'
    let queryParams = [keyword]
    try {
      await this.databaseFacade.execute(query, queryParams)
      res.json({success: true})
    }
    catch (err) {
      return this.returnError(err.message, res, err.error)
    }
  }
}
