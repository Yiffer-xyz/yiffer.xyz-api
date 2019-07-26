module.exports = class ModLogger {
  constructor (app, databaseFacade) {
    this.app = app
    this.databaseFacade = databaseFacade
  }

  async addModLog (req, actionType, ationDescription, actionDetails) {
		if (!req.session || !req.session.user || !req.session.user.id) { return }
    let query = 'INSERT INTO modlog (User, ActionType, ActionDescription, ActionDetails) VALUES (?, ?, ?, ?)'
    let queryParams = [req.session.user.id, actionType, ationDescription, actionDetails]
    try {
      await this.databaseFacade.execute(query, queryParams)
    }
    catch (err) {
      console.log(err)
    }
  }
}