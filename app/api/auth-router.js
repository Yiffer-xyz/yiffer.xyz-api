const BaseRouter = require('./baseRouter')
const bcrypt = require('bcrypt')

module.exports = class AuthenticationRouter extends BaseRouter {
  constructor (app, databaseFacade) {
    super(app, databaseFacade)
    this.setupRoutes()
  }

  setupRoutes () {
    this.app.post('/login', (req, res) => this.login(req, res))
    this.app.post('/register', (req, res) => this.register(req, res))
    this.app.get ('/logout', (req, res) => this.logout(req, res))
    this.app.post('/changepassword', this.authorizeUser.bind(this), (req, res) => this.changePassword(req, res))
    this.app.post('/changeusername', this.authorizeUser.bind(this), (req, res) => this.changeUsername(req, res))
  }

  async login (req, res) {
    let [username, password] = [req.body.username, req.body.password]
    try {
      let userResponse = await this.authenticate(username, password)
      if ('error' in userResponse) {
        return this.returnError(userResponse.error, res)
      }
      else {
        let userData = {
          username: userResponse.Username,
          id: userResponse.Id,
          userType: userResponse.UserType,
          donator: userResponse.Donator
        }
        req.session.user = userData
        return res.json({success: true, userData: userData})
      }
    }
    catch (err) {
      return this.returnError(err.message || 'Server error', res, err.error || err)
    }
  }

  async authenticate (username, password) {
    let query = 'SELECT * FROM User WHERE Username = ?'
    let userResult = await this.databaseFacade.execute(query, [username])
    if (userResult.length === 0) {
      return {error: 'Wrong username'}
    }
    userResult = userResult[0]
    let passwordMatch = await bcrypt.compare(password, userResult.Password)
    if (!passwordMatch) {
      return {error: 'Wrong password'}
    }
    return userResult
  }
  
  async register (req, res) {
    let [username, password] = [req.body.username, req.body.password]
    try {
      let query = 'SELECT * FROM User WHERE Username = ?'
      let users = await this.databaseFacade.execute(query, [username])
      if (users.length > 0) {
        return this.returnError('User already exists', res)
      }
      if (!this.validatePassword(password)) {
        return this.returnError('Invalid password', res)
      }
      if (!this.validateUsername(username)) {
        return this.returnError('Invalid username', res)
      }

      password = await bcrypt.hash(password, 8)
      let insertQuery = 'INSERT INTO User (Username, Password) VALUES (?, ?)'
      let insertQueryParams = [username, password]
      let result = await this.databaseFacade.execute(insertQuery, insertQueryParams)

      let getNewUserQuery = 'SELECT * FROM User WHERE Id = ?'
      let userResponse = await this.databaseFacade.execute(getNewUserQuery, [result.insertId])
      userResponse = userResponse[0]

      let userData = {
        username: userResponse.Username,
        id: userResponse.Id,
        userType: userResponse.UserType,
        donator: userResponse.Donator
      }
      req.session.user = userData
      return res.json({success: true, userData: userData})
    }
    catch (err) {
      return this.returnError(err.message || 'Server error', res, err.error || err)
    }
  }

  logout (req, res) {
    req.session.destroy()
    res.end('ok')
  }

  async changePassword (req, res) {
    let [username, oldPassword, newPassword] = 
      [req.session.user.username, req.body.oldPassword, req.body.newPassword]
    if (!this.validatePassword(newPassword)) {
      return this.returnError('Invalid new password', res)
    }
    try {
      let userDataResponse = await this.authenticate(username, oldPassword)
      if ('error' in userDataResponse) {
        return this.returnError(userDataResponse.error, res)
      }

      newPassword = await bcrypt.hash(newPassword, 8)
      let updateQuery = 'UPDATE User SET Password=? WHERE Id=?'
      let updateQueryParams = [newPassword, userDataResponse.Id]
      await this.databaseFacade.execute(updateQuery, updateQueryParams, 'Error updating password in database')
      res.json({success: true})
    }
    catch (err) {
      return this.returnError(err.message || 'Server error', res, err.error || err)
    }
  }

  async changeUsername (req, res) {
    let [currentUsername, newUsername, password] = 
      [req.session.user.username, req.body.newUsername, req.body.password]
    if (!this.validateUsername(newUsername)) {
      return this.returnError('New username invalid', res)
    }
    try {
      let userResponse = await this.authenticate(currentUsername, password)
      if ('error' in userDataResponse) {
        return this.returnError(userDataResponse.error, res)
      }

      let updateQuery = 'UPDATE User SET Username=? WHERE Id=?'
      let updateQueryParams = [newUsername, userResponse.Id]
      await this.databaseFacade.execute(updateQuery, updateQueryParams, 'Error updating username in database')
      res.json({success: true})
    }
    catch (err) {
      return this.returnError(err.message || 'Server error', res, err.error || err)
    }
  }

  validatePassword (password) {
    return password.length >= 6
  }
  validateUsername (username) {
    return /^[a-zA-Z][\w\d_-]{1,19}$/.test(username)
  }
}
