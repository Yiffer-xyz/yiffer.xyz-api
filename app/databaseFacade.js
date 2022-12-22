import { ApiError } from './api/baseRouter.js';
import fs from 'fs';
import yaml from 'js-yaml';
let fileContents = fs.readFileSync('config/cfg.yml', 'utf8');
const config = yaml.load(fileContents);

export default class DatabaseFacade {
  constructor(mysqlPool) {
    this.mysqlPool = mysqlPool;
    this.queryCounts = {
      Other: 0,
    };
    this.logCounter = 0;
    this.firstLogTime = new Date();
    this.prevLogTime = new Date();
  }

  logDbCall(queryName) {
    if (!queryName) {
      this.queryCounts['Other'] += 1;
    } else if (!(queryName in this.queryCounts)) {
      this.queryCounts[queryName] = 1;
    } else {
      this.queryCounts[queryName] += 1;
    }
    this.logCounter += 1;

    if (this.logCounter % config.logInterval === 0) {
      let sumOfCounts = Object.values(this.queryCounts).reduce((partialSum, count) => partialSum + count, 0);
      let lengthOfSum = ('' + sumOfCounts).length;

      let lengthOfLongestQuery = Math.max(...Object.keys(this.queryCounts).map(x => x.length));

      let secondsSincePrevLog = roundTo1Digit((new Date() - this.prevLogTime) / 1000);
      let minutesSinceInit = roundTo1Digit((new Date() - this.firstLogTime) / (1000 * 60));
      let hoursSinceInit = roundTo1Digit(minutesSinceInit / 60);
      let daysSinceInit = roundTo1Digit(hoursSinceInit / 24);
      let monthsSinceInit = daysSinceInit / 30.5;
      let avgReqPerMonth = roundTo1Digit(sumOfCounts / monthsSinceInit);

      console.log(`${config.logInterval} queries made in ${secondsSincePrevLog} seconds.`);
      console.log(
        `In total ${sumOfCounts} queries made in ${daysSinceInit} days / ${hoursSinceInit} hours / ${minutesSinceInit} min`
      );
      console.log(`On average with these numbers, ${avgReqPerMonth} queries per month`);

      let sortedCounts = Object.entries(this.queryCounts).sort((qc1, qc2) => (qc1[1] > qc2[1] ? -1 : 1));

      sortedCounts.forEach(queryCount => {
        let percentage = Math.round((100 * queryCount[1]) / sumOfCounts);
        let perMinute = Math.round(queryCount[1] / minutesSinceInit);

        console.log(
          padWithSpacesStart(queryCount[1], lengthOfSum),
          ' ',
          padWithSpacesStart(percentage + '%', 3),
          ' ',
          padWithSpacesEnd(queryCount[0], lengthOfLongestQuery),
          padWithSpacesStart(perMinute + '/min', 10)
        );
      });

      this.prevLogTime = new Date();
    }
  }

  async execute(queryString, queryParams, errorMessage, queryName) {
    errorMessage = `Database error` + (errorMessage ? `: ${errorMessage}` : '');
    let queryArgs = [queryString];
    if (queryParams) {
      queryArgs.push(queryParams);
    }

    console.log('Executing query: ', queryString, queryParams || '');

    return new Promise((resolve, reject) => {
      this.mysqlPool.getConnection((err, connection) => {
        if (err) {
          console.log('Error establishing database connection', err);
          reject({ error: err, message: 'Error establishing database connection' });
        }
        if (!connection) {
          console.log('Could not connect to databse');
          reject(new ApiError('Could not connect to database', 500));
        }

        console.log('Connection established, executing query: ', queryString, queryParams || '');
        this.logDbCall(queryName);

        connection.query(...queryArgs, (err, results) => {
          if (err) {
            reject(processDbError(err, errorMessage, true));
          }
          resolve(results);
          connection.release();
        });
      });
    });
  }

  async beginTransaction() {
    return new Promise((resolve, reject) => {
      this.mysqlPool.getConnection((err, connection) => {
        if (err) {
          reject(new ApiError('Error establishing database connection', 500));
        }

        connection.beginTransaction(err => {
          if (err) {
            reject(new ApiError('Error starting database transaction', 500));
          }

          resolve(connection);
        });
      });
    });
  }

  async txExecute(tx, queryString, queryParams, errorMessage) {
    errorMessage = `Database error` + (errorMessage ? `: ${errorMessage}` : '');
    let queryArgs = [queryString];
    if (queryParams) {
      queryArgs.push(queryParams);
    }

    return new Promise((resolve, reject) => {
      tx.query(...queryArgs, (err, results) => {
        if (err) {
          reject(processDbError(err, errorMessage));
        }
        resolve(results);
      });
    });
  }
}

function processDbError(err, errorMessage, isOldStyle = false) {
  if (err.code === 'ER_TRUNCATED_WRONG_VALUE_FOR_FIELD') {
    errorMessage = `Sorry, you can't use emojis here!`;
  }

  let logMessage = `Code: ${err.code}, sqlMessage: ${err.sqlMessage}, sql: ${err.sql}`;

  if (isOldStyle) {
    return {
      error: err,
      message: errorMessage,
      customErrorMessage: errorMessage,
      errorType: 'database-error',
      logMessage: logMessage,
    };
  }
  return new ApiError(errorMessage, 500, 'database-error', logMessage);
}

function roundTo1Digit(num) {
  return Math.round(num * 10) / 10;
}

function padWithSpacesStart(val, len) {
  return String(' '.repeat(len) + val).slice(-len);
}

function padWithSpacesEnd(val, len) {
  return String(val + ' '.repeat(len)).substr(0, len);
}
