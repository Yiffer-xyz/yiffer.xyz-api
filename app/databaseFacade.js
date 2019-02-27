module.exports = class DatabaseFacade {
	constructor (mysqlPool) {
		this.mysqlPool = mysqlPool
	}

	execute (queryString, queryParams, errorMessage) {
		return new Promise (async (resolve, reject) => {
			mysqlPool.getConnection((err, connection) => {
				if (err) {
					reject({error: err, message: 'Error establishing database connection'})
				}
				else if (queryParams) {
					connection.query(queryString, queryParams, (err, results) => {
						if (err) { reject({error: err, message: errorMessage}) }
						resolve(results)
						connection.release()
						console.log('connection released')
					})
				}
				else {
					connection.query(queryString, (err, results) => {
						if (err) { reject({error: err, message: errorMessage}) }
						resolve(results)
						connection.release()
						console.log('connection released')
					})
				}
			})
		})
	}
}