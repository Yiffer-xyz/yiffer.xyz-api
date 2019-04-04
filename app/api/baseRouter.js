module.exports = class BaseRouter {
	// todo refactor. take only err and res?
	returnError (errorMessage, res, err) {
		if (err) { console.log(err) }
		if (res) { res.json({ error: errorMessage }) }
	}

	// todo logging of errors
}