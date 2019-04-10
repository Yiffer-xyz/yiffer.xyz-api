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

	authorizeMod (req) { //todo
		if (!req.session || !req.session.user) { return false }
		// if (authorizedUsers.mods.indexOf(req.session.user.username) === -1) { return false }
		return true
	}

	// todo logging of errors
}