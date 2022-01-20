import { ApiError } from './api/baseRouter.js'

export default class DatabaseFacade {
  constructor (mysqlPool) {
    this.mysqlPool = mysqlPool
  }

  async execute (queryString, queryParams, errorMessage) {
    errorMessage = `Database error` + (errorMessage ? `: ${errorMessage}` : '')
    let queryArgs = [queryString]
    if (queryParams) { queryArgs.push(queryParams) }
    
    return new Promise ((resolve, reject) => {
      this.mysqlPool.getConnection((err, connection) => {
        if (err) {
          reject({error: err, message: 'Error establishing database connection'})
        }
        connection.query(...queryArgs, (err, results) => {
          if (err) {
            reject(processDbError(err, errorMessage, true))
          }
          resolve(results)
          connection.release()
        })
      })
    })
  }

  async beginTransaction () {
    return new Promise((resolve, reject) => {
      this.mysqlPool.getConnection((err, connection) => {
        if (err) {
          reject(new ApiError('Error establishing database connection', 500))
        }

        connection.beginTransaction(err => {
          if (err) {
            reject(new ApiError('Error starting database transaction', 500))
          }

          resolve(connection)
        })
      })
    })
  }

  async txExecute(tx, queryString, queryParams, errorMessage) {
    errorMessage = `Database error` + (errorMessage ? `: ${errorMessage}` : '')
    let queryArgs = [queryString]
    if (queryParams) { queryArgs.push(queryParams) }

    return new Promise ((resolve, reject) => {
      tx.query(...queryArgs, (err, results) => {
        if (err) {
          reject(processDbError(err, errorMessage))
        }
        resolve(results)
      })
    })
  }
}

function processDbError (err, errorMessage, isOldStyle=false) {
  if (err.code === 'ER_TRUNCATED_WRONG_VALUE_FOR_FIELD') {
    errorMessage = `Sorry, you can't use emojis here!`
  }
  console.log(err)

  if (isOldStyle) {
    return {error: err, message: errorMessage, customErrorMessage: errorMessage}
  }
  return new ApiError(errorMessage, 500)
}