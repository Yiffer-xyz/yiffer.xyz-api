export default class BaseRouter {
	constructor (app, databaseFacade, modLogger) {
		this.app = app
		this.databaseFacade = databaseFacade
		this.modLogger = modLogger
	}

	// todo refactor. take only err and res?
	returnError (errorMessage, res, err, fullErr) {
		console.log('Error: ', errorMessage)
		console.log(fullErr)
	
		try {
			if (res) { res.json({ error: errorMessage }) }
		}
		catch (err2) {
			console.log('Error returning error', err2)
		}
	}

	getUser (req) {
		if (req.session && req.session.user) {
			return req.session.user
		}
		else {
			return null
		}
	}

	async authorizeUser (req, res, next) {
		let user = this.getUser(req)
		if (!user) {
			res.json({error: 'Not logged in'})
		}
		else {
			next()
		}
	}

	async authorizeMod (req, res, next) {
		let authorized = await this.authorize(req, res, 'moderator')
		return authorized === true
	}

	async authorizeAdmin (req, res, next) {
		let authorized = await this.authorize(req, res, 'admin')
		return authorized === true
	}

	async authorize(req, res, role) {
		try {
			if (!req.session || !req.session.user) {
				return res.json({error: 'Not logged in'})
			}
			else {
				let query = 'SELECT * FROM user WHERE Username=?'
				let userData = await this.databaseFacade.execute(query, [req.session.user.username])
				if (role === 'moderator') {
					if (userData[0].UserType === 'moderator' || userData[0].UserType === 'admin') {
						return true
					}
					else {
						res.json({error: 'Unauthorized'})
					}
				}
				else if (role === 'admin') {
					if (userData[0].UserType === 'admin') {
						return true
					}
					else {
						res.json({error: 'Unauthorized'})
					}
				}
			}
		}
		catch (err) {
			res.json({error: 'Error authorizing user'})
			console.log(err)
		}
	}

	addModLog (req, actionType, ationDescription, actionDetails) {
		this.modLogger.addModLog(req, actionType, ationDescription, actionDetails)
	}
}