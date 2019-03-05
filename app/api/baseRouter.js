module.exports = class BaseRouter {
	returnError (errorMessage, res, err) {
		if (err) { console.log(err) }
		if (res) { res.json({ error: errorMessage }) }
	}

	// todo logging of errors
}