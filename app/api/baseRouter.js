module.exports = class BaseRouter {
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

	authorizeMod (req, res, next) { //todo
		if (!req.session || !req.session.user) {
			res.json({error: 'Not logged in'})
		}
		else {
			
		}
		return true
	}

	// todo logging of errors
}