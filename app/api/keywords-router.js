import BaseRouter from './baseRouter.js';

export default class KeywordsRouter extends BaseRouter {
	constructor (app, databaseFacade, modLogger) {
		super(app, databaseFacade, modLogger)
		this.setupRoutes()
  }
  
  setupRoutes () {
    this.app.get ('/api/keywords', (req, res) => this.getAllKeywords(req, res))
    this.app.get ('/api/comic-keywords/:comicId', (req, res) => this.getComicKeywords(req, res))
    this.app.post('/api/keywords/removefromcomic', this.authorizeMod.bind(this), (req, res) => this.removeKeywordsFromComic(req, res))
    this.app.post('/api/keywords/addtocomic', this.authorizeMod.bind(this), (req, res) => this.addKeywordsToComic(req, res))
    this.app.post('/api/keywords', this.authorizeMod.bind(this), (req, res) => this.createKeyword(req, res))
    this.app.post('/api/keywordsuggestions/process', this.authorizeMod.bind(this), (req, res) => this.processKeywordSuggestion(req, res))
    this.app.post('/api/keywordsuggestions', (req, res) => this.addKeywordSuggestion(req, res))
    this.app.get ('/api/keywordsuggestions', this.authorizeMod.bind(this), (req, res) => this.getKeywordSuggestions(req, res))
    this.app.post('/api/keywords/log', (req, res) => this.logKeywordClick(req, res))
  }

  async getAllKeywords (req, res) {
    let query = 'SELECT keyword.KeywordName AS name, keyword.Id AS id, COUNT(*) AS count FROM keyword LEFT JOIN comickeyword ON (keyword.Id = comickeyword.KeywordId) GROUP BY keyword.Id ORDER BY name'
    try {
      let result = await this.databaseFacade.execute(query)
      res.json(result)
    }
    catch (err) {
      return this.returnError(err.message, res, err.error)
    }
  }

  async getComicKeywords (req, res) {
    let keywordId = req.params.comicId
    let query = 'SELECT keyword.KeywordName AS name, keyword.Id AS id FROM keyword INNER JOIN comickeyword ON (keyword.Id = comickeyword.KeywordId) WHERE ComicId = ?'
    try {
      let result = await this.databaseFacade.execute(query, [Number(keywordId)])
      res.json(result)
    }
    catch (err) {
      return this.returnError(err.message, res, err.error)
    }
  }

	async removeKeywordsFromComic (req, res) {
    let [comicId, keywords] = [req.body.comicId, req.body.keywords]
    if (keywords.hasOwnProperty('name')) { keywords = [keywords] }

		let deleteQuery = 'DELETE FROM comickeyword WHERE (ComicId, KeywordId) IN ('
		let queryParams = []
		for (let keyword of keywords) {
			deleteQuery += '(?, ?), '
			queryParams.push(comicId, keyword.id)
		}
		deleteQuery = deleteQuery.substring(0, deleteQuery.length-2) + ')'

    try {
      await this.databaseFacade.execute(deleteQuery, queryParams)
      res.json({success: true})
			let comicName = (await this.databaseFacade.execute('SELECT Name FROM comic WHERE Id=?', [comicId]))[0].Name
			this.addModLog(req, 'Keyword', `Remove ${keywords.length} from ${comicName}`, keywords.map(kw => kw.name).join(', '))
    }
    catch (err) {
			return this.returnError(err.message, res, err.error)
    }
	}

  async addKeywordsToComic (req, res) {
    let [comicId, keywords] = [req.body.comicId, req.body.keywords]
    if (keywords.hasOwnProperty('name')) { keywords = [keywords] }

    let insertQuery = 'INSERT INTO comickeyword (ComicId, KeywordId) VALUES '
    let queryParams = []
    for (var keyword of keywords) {
			insertQuery += '(?, ?), '
			queryParams.push(comicId, keyword.id)
    }
		insertQuery = insertQuery.substring(0, insertQuery.length-2)

    try {
      await this.databaseFacade.execute(insertQuery, queryParams)
      res.json({success: true})
			let comicName = (await this.databaseFacade.execute('SELECT Name FROM comic WHERE Id=?', [comicId]))[0].Name
			this.addModLog(req, 'Keyword', `Add ${keywords.length} to ${comicName}`, keywords.map(kw => kw.name).join(', '))
    }
    catch (err) {
      if (err.error.code === 'ER_DUP_ENTRY') {
        return this.returnError('Some tags already exist on this comic', res)
      }
			return this.returnError(err.message, res, err.error)
    }
  }

  async createKeyword (req, res) {
    let query = 'INSERT INTO keyword (KeywordName) VALUES (?)'
    let queryParams = [req.body.keyword]
    try {
      await this.databaseFacade.execute(query, queryParams)
      res.json({success: true})
			this.addModLog(req, 'Keyword', `Add ${req.body.keyword}`)
    }
    catch (err) {
      return this.returnError(err.message, res, err.error)
    }
  }

  async addKeywordSuggestion (req, res) {
    let [comicId, keywordId, isAddingKeyword] = [req.body.comicId, req.body.keywordId, req.body.isAdding ? 1 : 0]
    let user = this.getUser(req) 
    let userIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.socket.remoteAddress || (req.connection.socket ? req.connection.socket.remoteAddress : null)

    let query = `INSERT INTO keywordsuggestion (ComicId, KeywordId, IsAdding, ${user ? 'User' : 'UserIP'}) VALUES (?, ?, ?, ?)`
    let queryParams = [comicId, keywordId, isAddingKeyword ? 1:0, user ? user.id : userIp]
    try {
      await this.databaseFacade.execute(query, queryParams)
      res.json({success: true})
    }
    catch (err) {
      return this.returnError(err.message, res, err.error)
    }
  }

  async processKeywordSuggestion (req, res) {
		let [suggestionId, comicId, keyword, isAdding, isApproved] = 
      [req.body.suggestion.id, req.body.suggestion.comicId, req.body.suggestion.keyword, req.body.suggestion.addKeyword, req.body.isApproved]
    let updateQuery = 'UPDATE keywordsuggestion SET Approved = ?, Processed = 1 WHERE Id = ?'
    let updateQueryParams = [isApproved ? 1 : 0, suggestionId]
    let insertQuery = isAdding ? 'INSERT INTO comickeyword (ComicId, KeywordId) VALUES (?, ?)' : 'DELETE FROM comickeyword WHERE ComicId = ? AND KeywordId = ?'
    let insertQueryParams = [comicId, keyword.id]
    try {
      if (isApproved) {
        await this.databaseFacade.execute(insertQuery, insertQueryParams, 'Database error: Error adding/deleting tags to/from comic')
      }
      await this.databaseFacade.execute(updateQuery, updateQueryParams, 'Database error: Error updating suggested tags')
      res.json({success: true})
			let comicName = (await this.databaseFacade.execute('SELECT Name FROM comic WHERE Id=?', [comicId]))[0].Name
      this.addModLog(req, 'Keyword', `${isApproved ? 'Approve' : 'Reject'} ${keyword.name} for ${comicName}`)
    }
    catch (err) {
      if (err.error.sqlMessage && err.error.sqlMessage.includes('Duplicate')) {
        return this.returnError('Error adding tag: tag already exists on comic. Just reject this one please.', res)
      }
      return this.returnError(err.message, res, err.error)
    }
  }

  async getKeywordSuggestions (req, res) {
    let query = 'SELECT keywordsuggestion.Id AS id, comic.Name AS comicName, ComicId AS comicId, IsAdding AS addKeyword, user.Username AS user, UserIP AS userIP, keyword.Id AS keywordId, keyword.KeywordName AS keywordName FROM keywordsuggestion INNER JOIN comic ON (comic.Id=keywordsuggestion.ComicId) INNER JOIN keyword ON (keyword.Id = keywordsuggestion.KeywordId) LEFT JOIN user ON (keywordsuggestion.User = user.Id) WHERE Processed = 0'
    try {
      let result = await this.databaseFacade.execute(query)
      res.json(result)
    }
    catch (err) {
      return this.returnError(err.message, res, err.error)
    }
  }

  async logKeywordClick (req, res) {
    let query = 'INSERT INTO keywordclick (keywordId, isFromCard, count) VALUES (?, ?, 1) ON DUPLICATE KEY UPDATE count=count+1'
    let queryParams = [req.body.keywordId, req.body.isFromCard]
    try {
      await this.databaseFacade.execute(query, queryParams, 'Error logging tag click')
      res.json({success: true})
    }
    catch (err) {
      return this.returnError(err.message, res, err.error)
    }
  }
}
