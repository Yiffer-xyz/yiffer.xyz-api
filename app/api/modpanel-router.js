let fs = require('fs')
let authorizedUsers = require('../../config/autorized-users.json')

module.exports = function (app, mysqlPool) {

  app.get ('/api/modPanel/modTaggingHighscores', getModTaggingHighscores)
  app.get ('/api/modPanel/modFavImageCounts', getModFavImageCounts)
  app.get ('/api/modPanel/untaggedComics', getUntaggedComics)
  app.get ('/api/modPanel/comicsReadyForAdding', getComicsReadyForAdding)
  app.get ('/api/modPanel/suggestedComics/:name/numberOfPages', getPendingComicPagesByName)
  app.get ('/api/modPanel/suggestedComics', getSuggestedComics)
  app.post('/api/modPanel/suggestedComics', judgePendingComic)

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


  function getSuggestedComics (req, res, next) {
    let query = 'SELECT Processed, Approved, PendingComic.Id AS Id PendingComic.Name AS Name, ModName, PendingComic.Artist AS ArtistId, Artist.Name AS ArtistName Cat, Tag, NumberOfPages, Finished, Timestamp, Artist.Name FROM PendingComic INNER JOIN Artist ON (PendingComic.Artist=Artist.Id)'
    mysqlPool.getConnection((err, connection) => {
      connection.query(query, (err, results) => {
        if (err) { return returnError('Database error: ' + err.toString(), res, connection, err) }
        res.json(results)
        connection.release()
      })
    })
  }


  function judgePendingComic (req, res, next) {
    if (!authorizeAdmin(req)) { return returnError('Unauthorized or no access', res, null, null) }

    let comic = req.body.comic
    let verdict = req.body.verdict
    let comment = req.body.comment

    let updatePendingTableQuery = 'UPDATE PendingComic SET Approved = ?, Processed = 1, Comment = ? WHERE Id = ?'
    let updatePendingTableQueryParams = [verdict ? 1 : 0, comment, comic.Id]
    let addComicQuery = 'INSERT INTO Comic (Name, Artist, Cat, Tag, NumberOfPages, Finished) VALUES (?, ?, ?, ?, ?, ?)'
    let addComicQueryParams = [comic.Name, comic.ArtistId, comic.Cat, comic.Tag, comic.NumberOfPages, comic.Finished]

    mysqlPool.getConnection((err, connection) => {
      connection.query(updatePendingTableQuery, updatePendingTableQueryParams, (err, results) => {
        if (err) { return returnError('Database error: ' + err.toString(), res, connection, err) }

        if (verdict) {
          connection.query(addComicQuery, addComicQueryParams, (err, results) => {
            if (err) { return returnError('Database error: ' + err.toString(), res, connection, err) }
            connection.release()
            zipComic(comic.Name, true)
            res.json({message: 'Successfully approved and added' + comic.Name})
          })
        }
        else if (!verdict) {
          res.json({message: 'Successfully rejected ' + comic.Name})
          connection.release()
        }
      })
    })
  }


  function getPendingComicPagesByName (req, res, next) {
    let comicName = req.params.name
    let files = fs.readdirSync(__dirname + '/../../public/pending-comics/' + comicName)
    let numberOfPages = 0
    if (files.indexOf('s.jpg') >= 0) { numberOfPages = files.length-1 }
    else { numberOfPages = files.length }
    res.json({ numberOfPages: numberOfPages })
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


function zipComic (comicName, isNewComic) {
  var zipFilePath = __dirname + '/../../public/021njnwjfusjkfn89c23nfsnfkas/' + comicName + '.zip'
  if (!isNewComic) {
    console.log('Deleting file ' + zipFilePath)
    fs.unlinkSync(zipFilePath)
  }

  var outputStream = fs.createWriteStream(zipFilePath)
  var archive = archiver('zip', {zlib: {level: 9}})

  archive.pipe(outputStream)
  archive.directory(__dirname + '/../../public/comics/'+ comicName +'/', false)
  archive.finalize()
  console.log('Zipping ' + comicName + '!')
}