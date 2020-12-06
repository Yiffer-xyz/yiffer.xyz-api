import BaseRouter from './baseRouter.js'
import { sendEmail } from '../emailFacade.js'
import bcrypt from 'bcrypt'
import dateFns from 'date-fns'
const { isAfter, addHours } = dateFns
const { compare, hash } = bcrypt

export default class AuthenticationRouter extends BaseRouter {
  constructor (app, databaseFacade) {
    super(app, databaseFacade)
    this.setupRoutes()
  }

  setupRoutes () {
    this.app.get ('/api/refresh-auth', (req, res) => this.refreshAuth(req, res))
    this.app.post('/api/login', (req, res) => this.login(req, res))
    this.app.post('/api/register', (req, res) => this.register(req, res))
    this.app.get ('/api/logout', (req, res) => this.logout(req, res))
    this.app.post('/api/changepassword', this.authorizeUser.bind(this), (req, res) => this.changePassword(req, res))
    this.app.post('/api/changeusername', this.authorizeUser.bind(this), (req, res) => this.changeUsername(req, res))
    this.app.post('/api/change-email', this.authorizeUser.bind(this), (req, res) => this.changeEmail(req, res))
    this.app.post('/api/reset-password', (req, res) => this.resetPassword(req, res))
    this.app.post('/api/reset-password-link/:token', (req, res) => this.resetPasswordByLink(req, res))
  }

  async refreshAuth (req, res) {
    if (req.session && req.session.user) {
      res.json(req.session.user)
    }
    else {
      res.json(null)
    }
  }

  async login (req, res) {
    let [usernameOrEmail, password] = [req.body.username, req.body.password]
    try {
      let userResponse = await this.authenticate(usernameOrEmail, password)
      if ('error' in userResponse) {
        return this.returnError(userResponse.error, res)
      }
      else {
        let userData = {
          username: userResponse.Username,
          email: userResponse.Email,
          id: userResponse.Id,
          userType: userResponse.UserType,
        }
        req.session.user = userData
        return res.json({success: true, userData: userData})
      }
    }
    catch (err) {
      return this.returnError(err.message, res, err.error, err)
    }
  }

  async authenticate (usernameOrEmail, password) {
    let query = 'SELECT * FROM user WHERE Username = ? OR Email = ?'
    let userResult = await this.databaseFacade.execute(query, [usernameOrEmail, usernameOrEmail])
    if (userResult.length === 0) {
      return {error: 'Non-existing username/email'}
    }
    userResult = userResult[0]
    let passwordMatch = await compare(password, userResult.Password)
    if (!passwordMatch) {
      return {error: 'Incorrect password'}
    }
    return userResult
  }
  
  async register (req, res) {
    let [username, password, email] = [req.body.username, req.body.password, req.body.email]
    try {
      let query = 'SELECT * FROM user WHERE Username = ?'
      let users = await this.databaseFacade.execute(query, [username])
      if (users.length > 0) {
        return this.returnError('User already exists', res)
      }
      let emailQuery = 'SELECT * FROM user WHERE Email = ?'
      users = await this.databaseFacade.execute(emailQuery, [email])
      if (users.length > 0) {
        return this.returnError('An account with this email already exists', res)
      }

      if (!this.validateEmail(email)) {
        return this.returnError('Invalid email', res)
      }
      if (!this.validatePassword(password)) {
        return this.returnError('Invalid password', res)
      }
      if (!this.validateUsername(username)) {
        return this.returnError('Invalid username', res)
      }

      password = await hash(password, 8)
      let insertQuery = 'INSERT INTO user (Username, Password, Email) VALUES (?, ?, ?)'
      let insertQueryParams = [username, password, email]
      let result = await this.databaseFacade.execute(insertQuery, insertQueryParams)

      let getNewUserQuery = 'SELECT * FROM user WHERE Id = ?'
      let userResponse = await this.databaseFacade.execute(getNewUserQuery, [result.insertId])
      userResponse = userResponse[0]

      let userData = {
        username: userResponse.Username,
        email: userResponse.Email,
        id: userResponse.Id,
        userType: userResponse.UserType,
      }
      req.session.user = userData
      res.json({success: true, userData: userData})

      sendEmail(
        'account',
        email,
        'Welcome to Yiffer.xyz!',
        `Your account has successfully been created.
         We are happy to have you, <strong>${username}</strong>!
         <br/><br/>
         Regards,<br/>
         Yiffer.xyz`
      )
    }
    catch (err) {
      return this.returnError(err.message, res, err.error, err)
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
      return this.returnError('Invalid new password, must be at least 6 characters long', res)
    }
    try {
      let userDataResponse = await this.authenticate(username, oldPassword)
      if ('error' in userDataResponse) {
        return this.returnError(userDataResponse.error, res)
      }

      newPassword = await hash(newPassword, 8)
      let updateQuery = 'UPDATE user SET Password=? WHERE Id=?'
      let updateQueryParams = [newPassword, userDataResponse.Id]
      await this.databaseFacade.execute(updateQuery, updateQueryParams, 'Error updating password in database')
      res.json({success: true})
    }
    catch (err) {
      return this.returnError(err.message, res, err.error, err)
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
      if ('error' in userResponse) {
        return this.returnError(userResponse.error, res)
      }

      let updateQuery = 'UPDATE user SET Username=? WHERE Id=?'
      let updateQueryParams = [newUsername, userResponse.Id]
      await this.databaseFacade.execute(updateQuery, updateQueryParams, 'Error updating username in database')
      res.json({success: true})
    }
    catch (err) {
      return this.returnError(err.message, res, err.error, err)
    }
  }

  async changeEmail (req, res) {
    let [currentPassword, email] = [req.body.password, req.body.email]
    let {username, id: userId} = req.session.user
    
    if (!userId) {
      return this.returnError('Not logged in', res)
    }
    if (!this.validateEmail(email)) {
      return this.returnError('Invalid email address', res)
    }
    let userResponse = await this.authenticate(username, currentPassword)
    if ('error' in userResponse) {
      return this.returnError('Incorrect password', res)
    }

    let query = 'UPDATE user SET Email=? WHERE Id=?'
    let queryParams = [email, userId]
    try {
      await this.databaseFacade.execute(query, queryParams, 'Error adding email to database')
      req.session.user = {
        ...req.session.user,
        email,
      }

      res.status(204).end()

      sendEmail(
        'account',
        email,
        'Successful email setup',
        `You have successfully connected this email address (<strong>${req.session.user.username}</strong>) to your account with username <strong>${username}</strong> at Yiffer.xyz.
        <br/><br/>
        Regards,<br/>
        Yiffer.xyz`
      )
    }
    catch (err) {
      return this.returnError(err.message, res, err.error, err)
    }
  }

  async resetPassword (req, res) {
    try {
      let a={}
      a.asd.asd()
      let email = req.body.email
      if (!this.validateEmail(email)) {
        return this.returnStatusError(400, res, 'This is not a valid email address')
      }

      let user = await this.getUserByEmail(email)
      if (user) {
        let resetToken = generateRandomString(30)
        let insertQuery = 'INSERT INTO resettoken (Token, UserId) VALUES (?, ?)'
        let queryParams = [resetToken, user.id]
        await this.databaseFacade.execute(insertQuery, queryParams)

        await sendEmail(
          'account',
          email,
          'Password reset - Yiffer.xyz',
          `You have requested a password reset for your account. Click the link below to create a new password. The link will expire in 24 hours.
          <br/><br/>
          <strong>https://beta.yiffer.xyz/reset-password-link/${resetToken}</strong>
          <br/><br/>Regards, Yiffer.xyz`
        )
      }

      res.status(204).end()
    }
    catch (err) { return this.returnStatusError(500, res, err) }
  }

  async resetPasswordByLink (req, res) {
    try {
      let token = req.params.token
      let [password1, password2] = [req.body.password1, req.body.password2]
      if (password1 !== password2) {
        return this.returnStatusError(400, res, 'Passwords do not match')
      }
      if (!this.validatePassword(password1)) {
        return this.returnStatusError(400, res, 'Invalid password')
      }

      let tokenQuery = 'SELECT UserId AS userId, Token AS token, Timestamp AS timestamp, IsUsed AS isUsed FROM resettoken WHERE token = ?'
      let tokenResults = await this.databaseFacade.execute(tokenQuery, [token])
      if (tokenResults.length === 0) {
        return this.returnStatusError(404, res, 'Invalid link')
      }
      let resetRecord = tokenResults[0]

      if (resetRecord.isUsed) {
        return this.returnStatusError(400, res, 'This link has been used already.')
      }

      let maxTokenUsageTime = addHours(new Date(resetRecord.timestamp), 24)
      if (isAfter(new Date(), maxTokenUsageTime)) {
        return this.returnStatusError(400, res, 'Link expired. Submit a password reset request again.')
      }

      let hashedPassword = await hash(password1, 8)

      let updateQuery = 'UPDATE user SET Password = ? WHERE Id = ?'
      let updateQueryParams = [hashedPassword, resetRecord.userId]
      await this.databaseFacade.execute(updateQuery, updateQueryParams, 'Error updating password in database')

      let updateResetTokenQuery = 'UPDATE resettoken SET IsUsed=1 WHERE Token=?'
      await this.databaseFacade.execute(updateResetTokenQuery, [token], 'Error updating reset token database')

      res.status(204).end()
    }
    catch (err) { return this.returnStatusError(500, res, err) }
  }

  validatePassword (password) {
    return password.length >= 6
  }
  validateUsername (username) {
    return /^[a-zA-Z][\w\d_-]{1,19}$/.test(username)
  }
  validateEmail (email) {
    // eslint-disable-next-line no-control-regex
    return /(?:[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*|"(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21\x23-\x5b\x5d-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])*")@(?:(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|\[(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?|[a-z0-9-]*[a-z0-9]:(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21-\x5a\x53-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])+)\])/.test(email)
  }

  async getUserByEmail (email) {
    let query = `
      SELECT Id AS id, Username AS username, Email AS email, UserType AS userType, CreatedTime AS createdTime
      FROM user WHERE email = ?
    `
    let results = await this.databaseFacade.execute(query, [email], 'Error looking up user in database')
    if (!results || results.length === 0) {
      return null
    }
    else {
      return results[0]
    }
  }
}

function generateRandomString (length) {
  var result           = ''
  var characters       = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  var charactersLength = characters.length
  for (let i = 0; i < length; i++) {
     result += characters.charAt(Math.floor(Math.random() * charactersLength))
  }
  return result
}
