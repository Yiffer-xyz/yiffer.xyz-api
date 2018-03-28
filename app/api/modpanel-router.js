let fs = require('fs')
let authorizedUsers = require('../../config/autorized-users.json')

module.exports = function (app, mysqlPool) {

  app.get('/api/modPanel/modTaggingHighscores', getModTaggingHighscores)
  app.get('/api/modPanel/modFavImageCounts', getModFavImageCounts)
  app.get('/api/modPanel/untaggedComics', getUntaggedComics)
  app.get('/api/modPanel/comicsReadyForAdding', getComicsReadyForAdding)


  function getModTaggingHighscores (req, res, next) {
    if (!authorizeMod) { return returnError('Unauthorized, no access', res, null, null) }

    let query = "SELECT T1.Username AS username, count(*) AS count FROM (SELECT distinct Username, ComicName FROM TagLog WHERE ComicName NOT LIKE '%FAVORITE IMAGE%') AS T1 GROUP BY username ORDER BY count DESC"
    mysqlPool.getConnection((err, connection) => {
      connection.query(query, (err, results) => {
        if (err) { return returnError('Database error: ' + err.toString(), res, connection, err )}
        res.json(results)
        connection.release()
      })
    })
  }


  function getModFavImageCounts (req, res, next) {
    if (!authorizeMod) { return returnError('Unauthorized, no access', res, null, null) }
    
    let modNameList = fs.readdirSync(__dirname + '/../../public/mod-favorites')
    let returnValue = []

    for (var modName of modNameList) {
      let favImageCount = fs.readdirSync(__dirname + '/../../public/mod-favorites/modName').length
      returnValue.push({modName: modName, count: favImageCount})
    }

    res.json(returnValue)
  }


  function getUntaggedComics (req, res, next) {
    if (!authorizeMod) { return returnError('Unauthorized, no access', res, null, null) }

    let query = 'SELECT Name FROM Comic WHERE Name NOT IN (SELECT Name FROM Comic INNER JOIN ComicKeyword ON (ComicId=Id))'
    mysqlPool.getConnection((err, connection) => {
      connection.query(query, (err, results) => {
        if (err) { return returnError('Database error: ' + err.toString(), res, connection, err) }

        var comicNameList = []
        for (var x of results) { comicNameList.push(x.Name) }
        res.json(comicNameList)
        connection.release()
      })
    })
  }


  function getComicsReadyForAdding (req, res, next) {
    fs.readdir(__dirname + '/../../public/comics', function (err, allComicFoldersList) {
      if (err) { return returnError('Error reading directory: ' + err.toString(), res, null, err) }

      let allComicsQuery = 'SELECT Name FROM Comic'
      mysqlPool.getConnection((err, connection) => {
        connection.query(allComicsQuery, (err, results) => {
          if (err) { return returnError('Database error: ' + err.toString(), res, connection, err) }
          let databaseComicsList = []
          for (var comic of results) { databaseComicsList.push(comic.Name) }

          let comicsNotInDatabase = []
          for (var folderComic of allComicFoldersList) {
            if (databaseComicsList.indexOf(comic) < 0) { comicsNotInDatabase.push(folderComic) }
          }

          res.json(comicsNotInDatabase)
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