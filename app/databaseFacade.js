import { ApiError } from './api/baseRouter.js'

export default class DatabaseFacade {
  constructor(mysqlPool) {
    this.mysqlPool = mysqlPool
  }

  async execute(queryString, queryParams, errorMessage) {
    errorMessage = `Database error` + (errorMessage ? `: ${errorMessage}` : '')
    let queryArgs = [queryString]
    if (queryParams) { queryArgs.push(queryParams) }

    return new Promise((resolve, reject) => {
      this.mysqlPool.getConnection((err, connection) => {
        logDbCall(queryString)
        if (err) {
          reject({ error: err, message: 'Error establishing database connection' })
        }
        if (!connection) {
          console.log('Could not connect to databse')
          reject(new ApiError('Could not connect to database', 500))
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

  async beginTransaction() {
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

    return new Promise((resolve, reject) => {
      tx.query(...queryArgs, (err, results) => {
        if (err) {
          reject(processDbError(err, errorMessage))
        }
        resolve(results)
      })
    })
  }
}

function processDbError(err, errorMessage, isOldStyle = false) {
  if (err.code === 'ER_TRUNCATED_WRONG_VALUE_FOR_FIELD') {
    errorMessage = `Sorry, you can't use emojis here!`
  }

  let logMessage = `Code: ${err.code}, sqlMessage: ${err.sqlMessage}, sql: ${err.sql}`

  if (isOldStyle) {
    return { error: err, message: errorMessage, customErrorMessage: errorMessage, errorType: 'database-error', logMessage: logMessage }
  }
  return new ApiError(errorMessage, 500, 'database-error', logMessage)
}

function logDbCall(sqlMessage) {
  let startOfSql = sqlMessage.substr(0, 40)
  if (startOfSql.includes('SELECT ')) {
    console.log('DB >> Select')
  }
  else if (startOfSql.includes('INSERT')) {
    console.log('DB >> Insert')
  }
  else if (startOfSql.includes('UPDATE')) {
    console.log('DB >> Update')
  }
  else if (startOfSql.includes('DELETE')) {
    console.log('DB >> Delete')
  }
  else {
    console.log('DB >> Other')
  }
  console.log(startOfSql)
}