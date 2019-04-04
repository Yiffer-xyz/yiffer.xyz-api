let BaseRouter = require('./baseRouter')
let bcrypt = require('bcrypt')

module.exports = class AuthenticationRouter extends BaseRouter {
  constructor (app, databaseFacade) {
    super()
    this.app = app
    this.databaseFacade = databaseFacade
    this.setupRoutes()
  }

  setupRoutes () {
    this.app.post('/login', (req, res) => this.login(req, res))
    this.app.post('/register', (req, res) => this.register(req, res))
    this.app.get ('/logout', (req, res) => this.logout(req, res))
  }

  async login (req, res) {
    let query = 'SELECT * FROM User2 WHERE Username = ?'
    let [username, password] = [req.body.username, req.body.password]
    try {
      let userResponse = await this.databaseFacade.execute(query, [username])
      if (userResponse.length == 0) {
        return this.returnError('Wrong username', res)
      }
      userResponse = userResponse[0]
      let passwordMatch = await bcrypt.compare(password, userResponse.Password)

      if (!passwordMatch) {
        return this.returnError('Wrong password', res)
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
  
  async register (req, res) {
    let [username, password] = [req.body.username, req.body.password]
    try {
      let query = 'SELECT * FROM User2 WHERE Username = ?'
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
      let insertQuery = 'INSERT INTO User2 (Username, Password) VALUES (?, ?)'
      let insertQueryParams = [username, password]
      let result = await this.databaseFacade.execute(insertQuery, insertQueryParams)
      let getNewUserQuery = 'SELECT * FROM User2 WHERE Id = ?'
      let userResponse = await this.databaseFacade.execute(getNewUserQuery, [result.insertId])
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

  validatePassword (password) {
    return password.length >= 6
  }
  validateUsername (username) {
    return /^[a-zA-Z][\w\d_-]{1,19}$/.test(username)
  }
}
