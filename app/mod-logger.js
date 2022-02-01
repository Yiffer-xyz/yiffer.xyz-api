export default class ModLogger {
  constructor(app, databaseFacade) {
    this.app = app
    this.databaseFacade = databaseFacade
  }

  async addModLog(reqOrUserId, actionType, ationDescription, actionDetails) {
    let userId
    if (typeof (reqOrUserId) === 'number') {
      userId = reqOrUserId
    }
    else {
      userId = reqOrUserId.userData.id
    }
    if (!userId) {
      return
    }

    let query = 'INSERT INTO modlog (User, ActionType, ActionDescription, ActionDetails) VALUES (?, ?, ?, ?)'
    let queryParams = [userId, actionType, ationDescription, actionDetails]
    try {
      await this.databaseFacade.execute(query, queryParams, 'Error adding mod log', 'Add mod log')
    }
    catch (err) {
      console.log(`Error adding mod log: `, err)
    }
  }
}