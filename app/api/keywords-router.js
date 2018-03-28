let authorizedUsers = require('../../config/autorized-users.json')

module.exports = function (app, mysqlPool) {

	app.delete('/api/keywords', deleteKeywordsFromComic) //sendTagsToDelete


	function deleteKeywordsFromComic (req, res, next) {
		if (!authorizeMod) { return returnError('Unauthorized, no access', res, null, null) }

		let comicName = req.body.comicName
		let tagsToDelete = req.body.tagsToDelete

		let comicIdQuery = 'SELECT Id from Comic where Name = ?'
		let deleteQuery = 'DELETE FROM ComicKeyword WHERE (ComicId, Keyword) IN ('+ '(?, ?), '.repeat(tagsToDelete.length)
		deleteQuery = deleteQuery.substring(0, deleteQuery.length-2) + ')'

		mysqlPool.getConnection((err, connection) => {
			connection.query(comicIdQuery, [comicName], (err, results) => {
				if (err) { return returnError('Database error (error getting comic id)', res,  connection, err) }
				let comicId = results[0].Id

				let deleteParams = []
				for (var i=0; i<tagsToDelete.length; i++) {
					deleteParams.push(comicId, tagsToDelete[i])
				}

				connection.query(deleteQuery, deleteParams, (err, results) => {
					if (err) { return returnError('Database error (error in delete query)', res,  connection, err) }
					res.json({message: 'Success'})
					connection.release()
				})
			})
		})
	}

}


function returnError (errorMessage, res, mysqlConnection, err) {
  if (err) { console.log(err) }
  if (res) { res.json({ error: errorMessage }) }
  if (mysqlConnection) { mysqlConnection.release() }
}


function authorizeAdmin (req) { // todo remove
  if (!req.session || !req.session.user) { return false }
  if (authorizedUsers.admins.indexOf(req.session.user.username) === -1) { return false }
  return true
}


function authorizeMod (req) { // todo remove
  if (!req.session || !req.session.user) { return false }
  if (authorizedUsers.mods.indexOf(req.session.user.username) === -1) { return false }
  return true
}