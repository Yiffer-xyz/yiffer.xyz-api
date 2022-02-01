import BaseRouter, { ApiError } from './baseRouter.js'
import { sendEmail } from '../emailFacade.js'
import bcrypt from 'bcrypt'
import dateFns from 'date-fns'
const { isAfter, addHours } = dateFns
const { compare, hash } = bcrypt

import jwt from 'jsonwebtoken'
import fs from 'fs'
import crypto from 'crypto'

import cron from 'cron'
const CronJob = cron.CronJob

export default class AuthenticationRouter extends BaseRouter {
  constructor(app, databaseFacade, config) {
    super(app, databaseFacade, config)
    this.setupRoutes()

    let rawPrivateKey = fs.readFileSync(`${this.config.privateJwtKeyPath}`, 'utf-8')
    let rawPublicKey = fs.readFileSync(`${this.config.publicJwtKeyPath}`, 'utf-8')

    let privateKey = crypto.createPrivateKey(rawPrivateKey)
    let publicKey = crypto.createPublicKey(rawPublicKey)

    this.tokenPrivateKey = privateKey
    this.tokenPublicKey = publicKey

    let clearSpammableActionsCronJob = new CronJob('0 0 * * *', this.clearSpammableActions, null, true, 'Europe/London')
    clearSpammableActionsCronJob.start()
  }

  setupRoutes() {
    this.app.get('/api/refresh-auth', (req, res) => this.refreshAuth(req, res))
    this.app.post('/api/login', (req, res) => this.login(req, res))
    this.app.post('/api/register', (req, res) => this.register(req, res))
    this.app.get('/api/logout', (req, res) => this.logout(req, res))
    this.app.post('/api/changepassword', this.authorizeUser.bind(this), (req, res) => this.changePassword(req, res))
    this.app.post('/api/changeusername', this.authorizeUser.bind(this), (req, res) => this.changeUsername(req, res))
    this.app.post('/api/change-email', this.authorizeUser.bind(this), (req, res) => this.changeEmail(req, res))
    this.app.post('/api/reset-password', (req, res) => this.resetPassword(req, res))
    this.app.post('/api/reset-password-link/:token', (req, res) => this.resetPasswordByLink(req, res))
  }

  async signToken(tokenData) {
    let tokenOptions = {
      algorithm: this.config.tokenConfig.algorithm,
      expiresIn: this.config.tokenConfig.tokenDurationDays + 'd',
    }

    return new Promise((resolve, reject) => {
      jwt.sign(tokenData, this.tokenPrivateKey, tokenOptions, (err, token) => {
        if (err) {
          console.log('Token signing error: ', err)
          reject(err)
        }
        resolve(token)
      })
    })
  }

  async refreshAuth(req, res) {
    try {
      if (!req.userData) {
        return this.setInvalidTokenAndReturnForbidden(res)
      }

      let query = `SELECT * FROM user WHERE Id = ?`
      let userResponse = await this.databaseFacade.execute(query, [req.userData.id], 'Error refreshing auth', 'Refresh auth')
      if (userResponse.length === 0) {
        return this.setInvalidTokenAndReturnForbidden(res)
      }

      let userData = buildUserSessionData(userResponse[0])
      return this.setAuthCookieAndSendRes(res, userData)
    }
    catch (err) {
      console.log('Cookie error: ', err)
      return this.setInvalidTokenAndReturnForbidden(res)
    }
  }

  async setInvalidTokenAndReturnForbidden(res) {
    res.cookie(this.config.tokenConfig.cookieName, "invalid", this.getInvalidToken())
    res.cookie('yiffer_userdata', 'invalid', this.getInvalidToken(true))
    res.status(403).end()
  }

  async login(req, res) {
    try {
      let [usernameOrEmail, password] = [req.body.username, req.body.password]
      let userResponse = await this.authenticate(usernameOrEmail, password)
      if ('error' in userResponse) {
        return this.returnApiError(res, new ApiError(userResponse.error, 400))
      }
      else {
        let userData = buildUserSessionData(userResponse)
        this.setAuthCookieAndSendRes(res, userData)
      }
    }
    catch (err) {
      this.returnApiError(res, err)
    }
  }

  async setAuthCookieAndSendRes(res, userData) {
    let expiresTime = new Date(Date.now() + this.config.tokenConfig.tokenDurationDays * 86400 * 1000)
    let tokenBody = {
      id: userData.id,
      username: userData.username,
    }
    let token = await this.signToken(tokenBody)

    // Auth cookie, the one used to actually verify session
    res.cookie(this.config.tokenConfig.cookieName, token, {
      httpOnly: this.config.tokenConfig.httpOnly,
      secure: this.config.tokenConfig.secure,
      domain: this.config.tokenConfig.domain,
      path: this.config.tokenConfig.path,
      expires: expiresTime,
    })

    // Regular cookie, replacing localstorage to enable sharing sessions between subdomains
    res.cookie('yiffer_userdata', JSON.stringify(userData), {
      httpOnly: false,
      secure: this.config.tokenConfig.secure,
      domain: this.config.tokenConfig.domain,
      path: this.config.tokenConfig.path,
      expires: expiresTime,
    })

    res.json(userData)
  }

  getInvalidToken(disableHttpOnly = false) {
    return {
      httpOnly: disableHttpOnly ? false : this.config.tokenConfig.httpOnly,
      secure: this.config.tokenConfig.secure,
      domain: this.config.tokenConfig.domain,
      path: this.config.tokenConfig.path,
      expires: new Date(Date.now() - 1000000),
    }
  }

  async authenticate(usernameOrEmail, password) {
    let query = 'SELECT * FROM user WHERE Username = ? OR Email = ?'
    let userResult = await this.databaseFacade.execute(query, [usernameOrEmail, usernameOrEmail], 'Error authenticating', 'Authenticate')
    if (userResult.length === 0) {
      return { error: 'Incorrect email/username/password' }
    }
    userResult = userResult[0]
    let passwordMatch = await compare(password, userResult.Password)
    if (!passwordMatch) {
      return { error: 'Incorrect email/username/password' }
    }
    return userResult
  }

  async register(req, res) {
    try {
      let [username, password1, password2, email] = [req.body.username, req.body.password1, req.body.password2, req.body.email]
      if (password1 !== password2) {
        return this.returnApiError(res, new ApiError('Passwords do not match', 400))
      }
      let query = 'SELECT * FROM user WHERE Username = ?'
      let users = await this.databaseFacade.execute(query, [username])
      if (users.length > 0) {
        return this.returnApiError(res, new ApiError('Username already exists', 409))
      }
      let emailQuery = 'SELECT * FROM user WHERE Email = ?'
      users = await this.databaseFacade.execute(emailQuery, [email])
      if (users.length > 0) {
        return this.returnApiError(res, new ApiError('An account with this email already exists', 409))
      }

      if (!this.validateEmail(email)) {
        return this.returnApiError(res, new ApiError('Invalid email', 400))
      }
      if (!this.validatePassword(password1)) {
        return this.returnApiError(res, new ApiError('Invalid password', 400))
      }
      if (!this.validateUsername(username)) {
        return this.returnApiError(res, new ApiError('Invalid username', 400))
      }

      await this.logIpAndVerifyNoSpam(req, username, email)

      let password = await hash(password1, 8)
      let insertQuery = 'INSERT INTO user (Username, Password, Email) VALUES (?, ?, ?)'
      let insertQueryParams = [username, password, email]
      let result = await this.databaseFacade.execute(insertQuery, insertQueryParams)

      let userResponse = await this.databaseFacade.execute('SELECT * FROM user WHERE Id = ?', [result.insertId])

      let userData = buildUserSessionData(userResponse[0])
      this.setAuthCookieAndSendRes(res, userData)

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
      this.returnApiError(res, err)
    }
  }

  async logIpAndVerifyNoSpam(req, username, newUserEmail) {
    let newUserIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.socket.remoteAddress || (req.connection.socket ? req.connection.socket.remoteAddress : null)
    if (!newUserIp) { return }

    // Check IP
    let getRecentNewUsersIpQuery = `SELECT Ip, Email FROM spammableaction WHERE ActionType = 'signup'`
    let recentUserIps = await this.databaseFacade.execute(getRecentNewUsersIpQuery, null, 'Error fetching recent user signups')
    if (recentUserIps.filter(user => user.Ip === newUserIp).length >= 5) {
      console.log(`Spam IP signup detected. IP: ${newUserIp}`)
      throw new ApiError('Too many recent signups with this IP', 403)
    }

    // Check similar recent emails
    let vaguelySimilarEmails = [newUserEmail]
    for (let recentUser of recentUserIps) {
      let emailDistance = levenshteinDistance(recentUser.Email, newUserEmail)

      if (emailDistance < 8) {
        vaguelySimilarEmails.push(recentUser.Email)
      }
    }

    let allSimilarEmails = getSimilarEmails(vaguelySimilarEmails)
    if (allSimilarEmails.length >= 5) {
      console.log(`Spam email signup detected. New email: ${newUserEmail}. Other emails:`, allSimilarEmails)
      throw new ApiError('Forbidden', 403)
    }

    let insertIpQuery = 'INSERT INTO spammableaction (Ip, Username, Email, ActionType) VALUES (?, ?, ?, ?)'
    await this.databaseFacade.execute(insertIpQuery, [newUserIp, username, newUserEmail, 'signup'], 'Error storing signup IP')

    return
  }

  async clearSpammableActions() {
    try {
      console.log('Cron: Clearing spammableaction DB table')
      let clearQuery = 'DELETE FROM spammableaction WHERE 1'
      await this.databaseFacade.execute(clearQuery, null, 'Error deleting queries')
    }
    catch (err) {
      console.log('Error clearing recent users', err)
    }
  }

  logout(req, res) {
    res.cookie(this.config.tokenConfig.cookieName, "invalid", this.getInvalidToken())
    res.cookie('yiffer_userdata', 'invalid', this.getInvalidToken(true))
    res.status(200).end()
  }

  async changePassword(req, res) {
    try {
      let [oldPassword, newPassword] = [req.body.oldPassword, req.body.newPassword]

      if (!req.userData) {
        return this.returnApiError(res, new ApiError('Login token invalid - try logging out and in again', 401))
      }
      let username = req.userData.username

      if (!oldPassword || !newPassword) {
        return this.returnApiError(res, new ApiError('Missing new password or old password', 400))
      }
      if (!this.validatePassword(newPassword)) {
        return this.returnApiError(res, new ApiError('Invalid new password, must be at least 6 characters long', 400))
      }
      let userDataResponse = await this.authenticate(username, oldPassword)
      if ('error' in userDataResponse) {
        return this.returnApiError(res, new ApiError(userDataResponse.error, 400))
      }

      newPassword = await hash(newPassword, 8)
      let updateQuery = 'UPDATE user SET Password=? WHERE Id=?'
      let updateQueryParams = [newPassword, userDataResponse.Id]
      await this.databaseFacade.execute(updateQuery, updateQueryParams, 'Error updating password in database')
      res.status(200).end()
    }
    catch (err) {
      this.returnApiError(res, err)
    }
  }

  async changeUsername(req, res) {
    let [newUsername, password] = [req.body.newUsername, req.body.password]
    if (!this.validateUsername(newUsername)) {
      return this.returnError('New username invalid', res)
    }
    try {
      if (!req.userData) {
        return this.returnError('Login token invalid - try logging out and back in', res)
      }
      let currentUsername = req.userData.username

      let userResponse = await this.authenticate(currentUsername, password)
      if ('error' in userResponse) {
        return this.returnError(userResponse.error, res)
      }

      let updateQuery = 'UPDATE user SET Username=? WHERE Id=?'
      let updateQueryParams = [newUsername, userResponse.Id]
      await this.databaseFacade.execute(updateQuery, updateQueryParams, 'Error updating username in database')
      res.json({ success: true })
    }
    catch (err) {
      return this.returnError(err.message, res, err.error, err)
    }
  }

  async changeEmail(req, res) {
    try {
      let [currentPassword, email] = [req.body.password, req.body.email]

      if (!req.userData) {
        return this.returnError('Login token invalid - try logging out and back in', res)
      }
      let { username, id } = req.userData

      if (!id) {
        return this.returnApiError(res, new ApiError('Not logged in', 400))
      }
      if (!this.validateEmail(email)) {
        return this.returnApiError(res, new ApiError('Invalid email address', 400))
      }
      let userResponse = await this.authenticate(username, currentPassword)
      if ('error' in userResponse) {
        return this.returnApiError(res, new ApiError('Incorrect password', 400))
      }

      let emailQuery = 'SELECT * FROM user WHERE Email = ?'
      let users = await this.databaseFacade.execute(emailQuery, [email])
      if (users.length > 0) {
        return this.returnApiError(res, new ApiError('An account with this email already exists', 409))
      }

      let query = 'UPDATE user SET Email=? WHERE Id=?'
      let queryParams = [email, id]

      await this.databaseFacade.execute(query, queryParams, 'Error adding email to database')

      userResponse = { ...userResponse, Email: email }

      let userData = buildUserSessionData(userResponse)
      this.setAuthCookieAndSendRes(res, userData)

      sendEmail(
        'account',
        email,
        'Successful email setup',
        `You have successfully connected this email address (<strong>${email}</strong>) to your account with username <strong>${username}</strong> at Yiffer.xyz.
        <br/><br/>
        Regards,<br/>
        Yiffer.xyz`
      )
    }
    catch (err) {
      this.returnApiError(res, err)
    }
  }

  async resetPassword(req, res) {
    try {
      let email = req.body.email
      if (!this.validateEmail(email)) {
        return this.returnApiError(res, new ApiError('This is not a valid email address', 400))
      }

      await this.logResetIpAndVerifyNoSpam(req, email)

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
          <strong>https://yiffer.xyz/reset-password-link/${resetToken}</strong>
          <br/><br/>Regards, Yiffer.xyz`
        )
      }

      res.status(200).end()
    }
    catch (err) {
      this.returnApiError(res, err)
    }
  }

  async logResetIpAndVerifyNoSpam(req, email) {
    let userIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.socket.remoteAddress || (req.connection.socket ? req.connection.socket.remoteAddress : null)
    if (!userIp) { return }

    let getRecentNewUsersIpQuery = `SELECT Ip FROM spammableaction WHERE ActionType = 'password-reset'`
    let recentUserIps = await this.databaseFacade.execute(getRecentNewUsersIpQuery, null, 'Error fetching recent password resets')
    if (recentUserIps.filter(user => user.Ip === userIp).length >= 8) {
      console.log(`Spam password resets detected. IP: ${userIp}, email: ${email}`)
      throw new ApiError('Too many recent password resets with this IP', 403)
    }

    let insertIpQuery = 'INSERT INTO spammableaction (Ip, ActionType, Email) VALUES (?, ?, ?)'
    await this.databaseFacade.execute(insertIpQuery, [userIp, 'password-reset', email], 'Error storing user IP')
  }

  async resetPasswordByLink(req, res) {
    try {
      let token = req.params.token
      let [password1, password2] = [req.body.password1, req.body.password2]
      if (password1 !== password2) {
        return this.returnApiError(res, new ApiError('Passwords do not match', 400))
      }
      if (!this.validatePassword(password1)) {
        return this.returnApiError(res, new ApiError('Invalid password', 400))
      }

      let tokenQuery = 'SELECT UserId AS userId, Token AS token, Timestamp AS timestamp, IsUsed AS isUsed FROM resettoken WHERE token = ?'
      let tokenResults = await this.databaseFacade.execute(tokenQuery, [token])
      if (tokenResults.length === 0) {
        return this.returnApiError(res, new ApiError('Invalid link', 404))
      }
      let resetRecord = tokenResults[0]

      if (resetRecord.isUsed) {
        return this.returnApiError(res, new ApiError('This link has been used already', 400))
      }

      let maxTokenUsageTime = addHours(new Date(resetRecord.timestamp), 24)
      if (isAfter(new Date(), maxTokenUsageTime)) {
        return this.returnApiError(res, new ApiError('Link expired. Submit a password reset request again', 400))
      }

      let hashedPassword = await hash(password1, 8)

      let updateQuery = 'UPDATE user SET Password = ? WHERE Id = ?'
      let updateQueryParams = [hashedPassword, resetRecord.userId]
      await this.databaseFacade.execute(updateQuery, updateQueryParams, 'Error updating password in database')

      let updateResetTokenQuery = 'UPDATE resettoken SET IsUsed=1 WHERE Token=?'
      await this.databaseFacade.execute(updateResetTokenQuery, [token], 'Error updating reset token database')

      res.status(204).end()
    }
    catch (err) {
      this.returnApiError(res, err)
    }
  }

  validatePassword(password) {
    return password.length >= 6
  }
  validateUsername(username) {
    return /^[a-zA-Z][\w\d_-]{1,19}$/.test(username)
  }
  validateEmail(email) {
    // eslint-disable-next-line no-control-regex
    return /(?:[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*|"(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21\x23-\x5b\x5d-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])*")@(?:(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|\[(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?|[a-z0-9-]*[a-z0-9]:(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21-\x5a\x53-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])+)\])/.test(email)
  }

  async getUserByEmail(email) {
    let query = `
      SELECT Id AS id, Username AS username, Email AS email, UserType AS userType, CreatedTime AS createdTime
      FROM user WHERE email = ?
    `
    let results = await this.databaseFacade.execute(query, [email], 'Error looking up user in database', 'Get user by email')
    if (!results || results.length === 0) {
      return null
    }
    else {
      return results[0]
    }
  }
}

function buildUserSessionData(rawDatabaseUserRow) {
  let user = {
    username: rawDatabaseUserRow.Username,
    email: rawDatabaseUserRow.Email,
    id: rawDatabaseUserRow.Id,
    userType: rawDatabaseUserRow.UserType,
  }
  if (rawDatabaseUserRow.PatreonTier) {
    user.patreonTier = rawDatabaseUserRow.PatreonTier
    user.hasPatreonPicture = rawDatabaseUserRow.HasPatreonPicture
    user.patreonDisplayName = rawDatabaseUserRow.PatreonDisplayName
    user.patreonDisplayLink = rawDatabaseUserRow.PatreonDisplayLink
  }

  return user
}

function generateRandomString(length) {
  var result = ''
  var characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  var charactersLength = characters.length
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength))
  }
  return result
}

function getSimilarEmails(emailList) {
  let similarEmails = new Set()

  for (let i = 0; i < emailList.length; i++) {
    for (let j = 0; j < emailList.length; j++) {
      if (i === j) { continue }
      if (levenshteinDistance(emailList[i], emailList[j]) <= 3) {
        similarEmails.add(emailList[i], emailList[j])
      }
    }
  }

  return [...similarEmails]
}

function levenshteinDistance(str1 = '', str2 = '') {
  const track = Array(str2.length + 1).fill(null).map(() =>
    Array(str1.length + 1).fill(null))
  for (let i = 0; i <= str1.length; i += 1) {
    track[0][i] = i
  }
  for (let j = 0; j <= str2.length; j += 1) {
    track[j][0] = j
  }
  for (let j = 1; j <= str2.length; j += 1) {
    for (let i = 1; i <= str1.length; i += 1) {
      const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1
      track[j][i] = Math.min(
        track[j][i - 1] + 1, // deletion
        track[j - 1][i] + 1, // insertion
        track[j - 1][i - 1] + indicator, // substitution
      );
    }
  }
  return track[str2.length][str1.length]
}

