const BaseRouter = require('./baseRouter')

module.exports = class UserRouter extends BaseRouter {
  constructor (app, databaseFacade, modLogger) {
		super(app, databaseFacade, modLogger)
		this.setupRoutes()
  }
  
  setupRoutes () {
    this.app.get ('/api/users/search', (req, res) => this.searchForUser(req, res))
    this.app.get ('/api/users/moderators', (req, res) => this.getModerators(req, res))
    this.app.get ('/api/users/:id', (req, res) => this.getUser(req, res))
    this.app.post('/api/users/:id', (req, res) => this.updateUser(req, res))
    this.app.post('/api/users/:id/delete', (req, res) => this.deleteUser(req, res))
  }

  async searchForUser (req, res) {
    let query = 'SELECT Id AS id, Username AS username, UserType AS userType, Donator AS donator, CreatedTime AS createdTime FROM User WHERE Username LIKE ? ORDER BY createdTime DESC'
    let queryParams = ['%' + req.query.searchText + '%']
    try {
      let results = await this.databaseFacade.execute(query, queryParams, 'Error fetching users')
      res.json(results)
    }
		catch (err) {
      return this.returnError(err.message, res, err.error)
		}
  }

  async getUser (req, res) {
    let query = 'SELECT Comic.Name AS comicName, ComicVote.Vote AS vote, ComicVote.Timestamp AS timestamp FROM ComicVote INNER JOIN Comic ON (ComicVote.ComicId = Comic.Id) WHERE UserId = ? ORDER BY timestamp DESC'
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
    let query = `SELECT Id AS id, Username AS username, UserType AS userType, Donator AS donator, CreatedTime AS createdTime FROM User WHERE UserType = 'moderator' OR UserType = 'admin' ORDER BY CreatedTime DESC`
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
    let query = 'UPDATE User SET UserType = ?, Donator = ? WHERE Id = ?'
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
    let query = 'DELETE FROM User WHERE Id = ?'
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