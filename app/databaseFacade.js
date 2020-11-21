export default class DatabaseFacade {
	constructor (mysqlPool) {
		this.mysqlPool = mysqlPool
	}

	async execute (queryString, queryParams, errorMessage='Database query error') {
		return new Promise (async (resolve, reject) => {
			this.mysqlPool.getConnection((err, connection) => {
				if (err) {
					reject({error: err, message: 'Error establishing database connection'})
				}
				else if (queryParams) {
					connection.query(queryString, queryParams, (err, results) => {
						if (err) { reject({error: err, message: errorMessage, customErrorMessage: errorMessage}) }
						resolve(results)
						connection.release()
					})
				}
				else {
					connection.query(queryString, (err, results) => {
						if (err) { reject({error: err, message: errorMessage, customErrorMessage: errorMessage}) }
						resolve(results)
						connection.release()
					})
				}
			})
		})
	}
}