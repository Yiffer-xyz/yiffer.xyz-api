module.exports = class BaseRouter {
	constructor (app, databaseFacade) {
		this.app = app
		this.databaseFacade = databaseFacade
	}

	// todo refactor. take only err and res?
	returnError (errorMessage, res, err) {
		if (err) { console.log(err) }
		if (res) { res.json({ error: errorMessage }) }
	}

	getUser (req) {
		if (req.session && req.session.user) {
			return req.session.user
		}
		else {
			return undefined
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
				let query = 'SELECT * FROM User2 WHERE Username=?'
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

	// todo logging of errors
}