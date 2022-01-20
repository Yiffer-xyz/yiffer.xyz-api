import BaseRouter, { ApiError } from './baseRouter.js'

export default class KeywordsRouter extends BaseRouter {
	constructor (app, databaseFacade, config, modLogger) {
		super(app, databaseFacade, config, modLogger)
		this.setupRoutes()
  }
  
  setupRoutes () {
    this.app.get ('/api/keywords', (req, res) => this.getAllKeywords(req, res))
    this.app.get ('/api/comic-keywords/:comicId', (req, res) => this.getComicKeywords(req, res))
    this.app.post('/api/keywords/removefromcomic', this.authorizeMod.bind(this), (req, res) => this.handleAddOrRemoveKeywordsFromComic(req, res, false))
    this.app.post('/api/keywords/addtocomic', this.authorizeMod.bind(this), (req, res) => this.handleAddOrRemoveKeywordsFromComic(req, res, true))
    this.app.post('/api/keywords', this.authorizeMod.bind(this), (req, res) => this.createKeyword(req, res))
    this.app.post('/api/keywordsuggestions/process', this.authorizeMod.bind(this), (req, res) => this.processKeywordSuggestion(req, res))
    this.app.post('/api/keywordsuggestions', (req, res) => this.addKeywordSuggestion(req, res))
    this.app.get ('/api/keywordsuggestions', this.authorizeMod.bind(this), (req, res) => this.getKeywordSuggestions(req, res))
    this.app.post('/api/keywords/log', (req, res) => this.logKeywordClick(req, res))
    this.app.delete('/api/keywords/:id', this.authorizeMod.bind(this), (req, res) => this.deleteKeyword(req, res))
  }

  async getAllKeywords (req, res) {
    try {
      let query = 'SELECT keyword.KeywordName AS name, keyword.Id AS id, COUNT(*) AS count FROM keyword LEFT JOIN comickeyword ON (keyword.Id = comickeyword.KeywordId) GROUP BY keyword.Id ORDER BY name'
      let result = await this.databaseFacade.execute(query)
      res.json(result)
    }
    catch (err) {
      return this.returnApiError(res, err)
    }
  }

  async getComicKeywords (req, res) {
    let comicId = req.params.comicId
    let query = 'SELECT keyword.KeywordName AS name, keyword.Id AS id FROM keyword INNER JOIN comickeyword ON (keyword.Id = comickeyword.KeywordId) WHERE ComicId = ?'
    try {
      let result = await this.databaseFacade.execute(query, [Number(comicId)])
      res.json(result)
    }
    catch (err) {
      return this.returnError(err.message, res, err.error)
    }
  }

  async handleAddOrRemoveKeywordsFromComic (req, res, isAdd) {
    let [comicId, keywords] = [req.body.comicId, req.body.keywords]
    if ('name' in keywords) { keywords = [keywords] }
    let keywordIds = keywords.map(kw => kw.id)

    try {
      if (isAdd) {
        await this.addKeywordsToComic(keywordIds, comicId)
      }
      else {
        await this.removeKeywordsFromComic(keywordIds, comicId)
      }
      res.json({success: true})

			let comicName = (await this.databaseFacade.execute('SELECT Name FROM comic WHERE Id=?', [comicId]))[0].Name
			this.addModLog(req, 'Keyword', `${isAdd ? 'Add' : 'Remove'} ${keywords.length} ${isAdd ? 'to' : 'from'} ${comicName}`, keywords.map(kw => kw.name).join(', '))
    }
    catch (err) {
      if (err.error.code === 'ER_DUP_ENTRY') {
        return this.returnError('Some tags already exist on this comic', res)
      }
			return this.returnError(err.message, res, err.error)
    }
  }

  async removeKeywordsFromComic (keywordIds, comicId) {
    let deleteQuery = 'DELETE FROM comickeyword WHERE (ComicId, KeywordId) IN ('
    let queryParams = []
    for (let keywordId of keywordIds) {
      deleteQuery += '(?, ?), '
      queryParams.push(comicId, keywordId)
    }
    deleteQuery = deleteQuery.substring(0, deleteQuery.length-2) + ')'

    await this.databaseFacade.execute(deleteQuery, queryParams)
  }

  async addKeywordsToComic (keywordIds, comicId) {
    let insertQuery = 'INSERT INTO comickeyword (ComicId, KeywordId) VALUES '
    let queryParams = []
    for (var keywordId of keywordIds) {
			insertQuery += '(?, ?), '
			queryParams.push(comicId, keywordId)
    }
		insertQuery = insertQuery.substring(0, insertQuery.length-2)

    await this.databaseFacade.execute(insertQuery, queryParams)
  }

  async createKeyword (req, res) {
    if (!req.body.keyword || req.body.keyword.trim().length === 0) {
      return this.returnStatusError(400, res, 'No keyword supplied')
    }

    let query = 'INSERT INTO keyword (KeywordName) VALUES (?)'
    try {
      await this.databaseFacade.execute(query, [req.body.keyword.trim().toLowerCase()])
      res.json({success: true})
			this.addModLog(req, 'Keyword', `Create ${req.body.keyword}`)
    }
    catch (err) {
      return this.returnError(err.message, res, err.error)
    }
  }

  async addKeywordSuggestion (req, res) {
    let [comicId, keywordId, isAddingKeyword] = [req.body.comicId, req.body.keywordId, req.body.isAdding ? 1 : 0]
    let user = await this.handleGetUser(req)

    if (user && (user.userType === 'moderator' || user.userType === 'admin')) {
      if (isAddingKeyword) {
        await this.addKeywordsToComic([keywordId], comicId)
      }
      else {
        await this.removeKeywordsFromComic([keywordId], comicId)
      }
      res.status(204).end()
      return
    }

    let userIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.socket.remoteAddress || (req.connection.socket ? req.connection.socket.remoteAddress : null)

    let query = `INSERT INTO keywordsuggestion (ComicId, KeywordId, IsAdding, ${user ? 'User' : 'UserIP'}) VALUES (?, ?, ?, ?)`
    let queryParams = [comicId, keywordId, isAddingKeyword ? 1:0, user ? user.id : userIp]
    try {
      await this.databaseFacade.execute(query, queryParams)
      res.status(200).end()
    }
    catch (err) {
      return this.returnApiError(res, err)
    }
  }

  async processKeywordSuggestion (req, res) {
    try {
      let [suggestionId, comicId, keyword, isAdding, isApproved] = 
        [req.body.suggestion.id, req.body.suggestion.comicId, req.body.suggestion.keyword, req.body.suggestion.addKeyword, req.body.isApproved]
      let updateQuery = 'UPDATE keywordsuggestion SET Approved = ?, Processed = 1 WHERE Id = ?'
      let updateQueryParams = [isApproved ? 1 : 0, suggestionId]
      let insertQuery = isAdding ? 'INSERT INTO comickeyword (ComicId, KeywordId) VALUES (?, ?)' : 'DELETE FROM comickeyword WHERE ComicId = ? AND KeywordId = ?'
      let insertQueryParams = [comicId, keyword.id]

      if (isApproved) {
        await this.databaseFacade.execute(insertQuery, insertQueryParams, 'Database error: Error adding/deleting tags to/from comic')
      }
      await this.databaseFacade.execute(updateQuery, updateQueryParams, 'Database error: Error updating suggested tags')
      res.status(200).end()

      let comicName = (await this.databaseFacade.execute('SELECT Name FROM comic WHERE Id=?', [comicId]))[0].Name
      this.addModLog(req, 'Keyword', `${isApproved ? 'Approve' : 'Reject'} ${keyword.name} for ${comicName}`)
    }
    catch (err) {
      if (err?.error?.sqlMessage && err.error.sqlMessage.includes('Duplicate')) {
        return this.returnApiError(res, new ApiError('Tag already exists on comic. Just reject this one please.', 400))
      }
      return this.returnApiError(res, err)
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

  async deleteKeyword (req, res) {
    let keywordId = req.params.id
    let deleteSuggestionsQuery = 'DELETE FROM keywordsuggestion WHERE KeywordId = ?'
    let deleteFromComicsQuery = 'DELETE FROM comickeyword where KeywordId = ?'
    let deleteQuery = 'DELETE FROM keyword WHERE Id = ?'

    let tx
    try {
      tx = await this.databaseFacade.beginTransaction()
      await this.databaseFacade.txExecute(tx, deleteSuggestionsQuery, [keywordId], 'Could not delete tag suggestions')
      await this.databaseFacade.txExecute(tx, deleteFromComicsQuery, [keywordId], 'Could not delete tag from comics')
      await this.databaseFacade.txExecute(tx, deleteQuery, [keywordId], 'Could not delete the tag')
      await tx.commit()
    }
    catch (err) {
      if (tx) { tx.rollback() }
      return this.returnApiError(res, err)
    }
  }
}
