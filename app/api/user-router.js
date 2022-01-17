import BaseRouter from './baseRouter.js'

export default class UserRouter extends BaseRouter {
  constructor (app, databaseFacade, config, modLogger) {
		super(app, databaseFacade, config, modLogger)
		this.setupRoutes()
  }
  
  setupRoutes () {
    this.app.get ('/api/users/search', this.authorizeAdmin.bind(this), (req, res) => this.searchForUser(req, res))
    this.app.get ('/api/users/moderators', this.authorizeAdmin.bind(this), (req, res) => this.getModerators(req, res))
    this.app.get ('/api/users/:id', this.authorizeAdmin.bind(this), (req, res) => this.handleGetUser(req, res))
    this.app.post('/api/users/:id', this.authorizeAdmin.bind(this), (req, res) => this.updateUser(req, res))
    this.app.post('/api/users/:id/delete', this.authorizeAdmin.bind(this), (req, res) => this.deleteUser(req, res))
  }

  async searchForUser (req, res) {
    let query = 'SELECT Id AS id, Username AS username, Email AS email, UserType AS userType, Donator AS donator, CreatedTime AS createdTime FROM user WHERE Username LIKE ? ORDER BY createdTime DESC'
    let queryParams = ['%' + req.query.searchText + '%']
    try {
      let results = await this.databaseFacade.execute(query, queryParams, 'Error fetching users')
      res.json(results)
    }
		catch (err) {
      return this.returnError(err.message, res, err.error)
		}
  }

  async handleGetUser (req, res) {
    let query = 'SELECT comic.Name AS comicName, comicvote.Vote AS vote, comicvote.Timestamp AS timestamp FROM comicvote INNER JOIN comic ON (comicvote.ComicId = comic.Id) WHERE UserId = ? ORDER BY timestamp DESC'
    let queryParams = [Number(req.params.id)]
    try {
      let results = await this.databaseFacade.execute(query, queryParams, 'Error fetching user votes')
      res.json(results)
    }
    catch (err) {
      return this.returnError(err.message, res, err.error)
    }
  }

  async getModerators (req, res) {
    let query = `SELECT Id AS id, Username AS username, Email AS email, UserType AS userType, Donator AS donator, CreatedTime AS createdTime FROM user WHERE UserType = 'moderator' OR UserType = 'admin' ORDER BY CreatedTime DESC`
    try {
      let results = await this.databaseFacade.execute(query, null, 'Error fetching moderators')
      res.json(results)
    }
    catch (err) {
      return this.returnError(err.message, res, err.error)
    }
  }

  async updateUser (req, res) {
    let [userId, userType, donator] = [req.body.id, req.body.userType, req.body.donator]
    let query = 'UPDATE user SET UserType = ?, Donator = ? WHERE Id = ?'
    let queryParams = [userType, donator, userId]
    try {
      await this.databaseFacade.execute(query, queryParams, 'Error updating user data')
      res.json({success: true})
    }
    catch (err) {
      return this.returnError(err.message, res, err.error)
    }
  }

  async deleteUser (req, res) {
    let query = 'DELETE FROM user WHERE Id = ?'
    let queryParams = [req.params.id]
    try {
      await this.databaseFacade.execute(query, queryParams, 'Error fetching user votes')
      res.json({success: true})
    }
    catch (err) {
      return this.returnError(err.message, res, err.error)
    }
  }
}