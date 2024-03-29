import dateFns from 'date-fns'
import locale from 'date-fns/locale/index.js'
const { format } = dateFns
const { nb } = locale

export class ApiError extends Error {
	constructor(message, status, errorType, logMessage) {
		super(message)
		this.status = status
		this.name = 'ApiError'
		this.errorType = errorType
		this.logMessage = logMessage
	}
}

export default class BaseRouter {
	constructor(app, databaseFacade, config, modLogger) {
		this.app = app
		this.databaseFacade = databaseFacade
		this.modLogger = modLogger
		this.config = config
	}

	returnApiError(res, error) {
		let timeString = format(new Date(), 'PPPPppp', { locale: nb })

		if (error instanceof ApiError) {
			if (error.status < 400 || error.status >= 500) {
				console.log(`[${error.status}] Error @ ${timeString}: ${error.message}`)
			}
		}
		else {
			console.log(`Error @ ${timeString}`)
		}


		if ((error instanceof ApiError || 'errorType' in error) && error.errorType === 'database-error') {
			let errorMessage = ''
			if (error.customErrorMessage) {
				errorMessage = error.customErrorMessage
			}
			errorMessage = error.message

			console.error(`[500] Database error @ ${timeString}: ${errorMessage}. ${error.logMessage}`)

			error = new ApiError(errorMessage, 500)
		}

		// TODO remove this once everything uses returnApiError. For now, to deal with
		// database-returned stuff, which must support the old ways
		if ('customErrorMessage' in error) {
			console.error(`[500] Error (with customErrorMessage) @ ${timeString}:`, error.error)
			error = new ApiError(error.customErrorMessage, 500)
		}

		else if (error?.error?.name === 'ApiInputError') {
			console.error(`[500] EMAIL error @ ${timeString}: ${error.error.message}.\nError stack: ${error.error.stack}`)
			error = new ApiError('Server error related to email', 500)
		}

		else if (error?.error?.code === 'ECONNREFUSED' || error?.error?.code === 'ER_ACCESS_DENIED_ERROR') {
			console.error(`[500] DB error @ ${timeString}: ${error.error.message}.\nError stack: ${error.error.stack}`)
			error = new ApiError('Server error: Could not connect to database', 500)
		}

		else if (!(error instanceof ApiError)) {
			console.error(`[500] UNCAUGHT error @ ${timeString}: `, error)
			error = new ApiError('Server error', 500)
		}

		try {
			if (res) {
				res.status(error.status).send(error.message)
			}
		}
		catch (err2) {
			console.log('REAL BAD: Error returning error', err2)
		}
	}

	// TODO SWAP ALL USAGES for returnStatusError
	returnError(errorMessage, res, err, fullErr) {
		console.log('returnError: ', errorMessage)
		console.log('returnError err and fullErr: ', err, fullErr)

		try {
			if (res) { res.json({ error: errorMessage }) }
		}
		catch (err2) {
			console.log('Error returning error', err2)
		}
	}

	returnStatusError(status, res, error) {
		let errorToSend
		if (typeof (error) === 'string') {
			console.log(`Controlled returnStatusError with status ${status}: ${error.customErrorMessage}`)
			errorToSend = error
		}
		else if ('customErrorMessage' in error) {
			console.log(`Controlled returnStatusError with status ${status}: ${error.customErrorMessage}`)
			errorToSend = error.customErrorMessage
		}
		else {
			console.log(`FATAL returnStatusError with status ${status}:`, error)
			errorToSend = 'Server error'
		}

		try {
			if (res) {
				res.status(status).send(errorToSend)
			}
		}
		catch (err2) {
			console.log('Error returning error', err2)
		}
	}

	async handleGetUser(req) {
		if (req.userData) {
			try {
				let query = 'SELECT Id AS id, Username AS username, Email AS email, UserType AS userType FROM user WHERE Id = ?'
				let userResult = await this.databaseFacade.execute(query, [req.userData.id], 'Error getting user data', 'Get user by req.id')
				if (userResult.length === 0) {
					return null
				}
				return userResult[0]
			}
			catch (err) {
				console.log('Error in getUser(req): ', err)
				return null
			}
		}
		else {
			return null
		}
	}

	async getUserById(userId) {
		let query = 'SELECT Id AS id, Username AS username, Email AS email, UserType AS userType, CreatedTime AS createdTime FROM user WHERE id = ?'
		let queryParams = [userId]

		let results = await this.databaseFacade.execute(query, queryParams, 'Error getting user email', 'Get user by id')
		return results[0]
	}

	async authorizeUser(req, res, next) {
		if (!req.userData) {
			res.status(401).end('Not logged in')
		}
		else {
			next()
		}
	}

	async authorizeMod(req, res, next) {
		let authorized = await this.authorize(req, res, 'moderator')
		if (authorized === true) {
			if (next) { next() }
			else { return authorized === true }
		}
	}

	async authorizeAdmin(req, res, next) {
		let authorized = await this.authorize(req, res, 'admin')
		if (authorized === true) {
			if (next) { next() }
			else { return authorized === true }
		}
	}

	async isAdmin(req) {
		if (!req.userData) {
			return false
		}
		let query = 'SELECT * FROM user WHERE Username=?'
		let userData = await this.databaseFacade.execute(query, [req.userData.username], 'Failed to check if admin', 'Is admin')

		if (userData[0].UserType === 'admin') {
			return true
		}
		return false
	}

	async authorize(req, res, role) {
		try {
			if (!req.userData) {
				res.status(401).json({ error: 'Not logged in' })
			}
			else {
				let query = 'SELECT * FROM user WHERE Username=?'
				let userData = await this.databaseFacade.execute(query, [req.userData.username], 'Auth check failed in database', 'Authorize')
				if (role === 'moderator') {
					if (userData[0].UserType === 'moderator' || userData[0].UserType === 'admin') {
						return true
					}
					else {
						res.status(403).json({ error: 'Unauthorized' })
					}
				}
				else if (role === 'admin') {
					if (userData[0].UserType === 'admin') {
						return true
					}
					else {
						res.status(403).json({ error: 'Unauthorized' })
					}
				}
			}
		}
		catch (err) {
			res.json({ error: 'Error authorizing user' })
			console.log(`Error authorizing user: `, err)
		}
	}

	addModLog(reqOrUserId, actionType, ationDescription, actionDetails) {
		this.modLogger.addModLog(reqOrUserId, actionType, ationDescription, actionDetails)
	}
}