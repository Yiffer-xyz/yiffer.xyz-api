let fs = require('fs')
let archiver = require('archiver')
let authorizedUsers = require('../../config/autorized-users.json')

module.exports = function (app, mysqlPool) {
  app.get ('/api/modPanel/suggestedComics/:name/numberOfPages', getPendingComicPagesByName)
  app.post('/api/modPanel/suggestedComics', processSuggestedComic) //todo delete
  app.get ('/api/modPanel/zip/:name', reZipAndCalculateNumberOfPagesByComicName)




  function processSuggestedComic (req, res, next) {
    if (!authorizeAdmin(req)) { return returnError('Unauthorized or no access', res, null, null) }

    let comic = req.body.comic
    let verdict = req.body.verdict
    let comment = req.body.comment

    let updatePendingTableQuery = 'UPDATE SuggestedComic SET Approved = ?, Processed = 1, Comment = ? WHERE Id = ?'
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
    fs.readdir(__dirname + '/../../public/comics/' + comicName, (err, files) => {
      if (err) { return returnError('Directory does not exist', res, null, null) }
      let numberOfPages = 0
      if (files.indexOf('s.jpg') >= 0) { numberOfPages = files.length-1 }
      else { numberOfPages = files.length }
      res.json({ numberOfPages: numberOfPages })
    })
  }


  function reZipAndCalculateNumberOfPagesByComicName (req, res, next) {
    if (!authorizeAdmin(req)) { return returnError('Unauthorized or no access', res, null, null) }

    let comicName = req.params.name
    zipComic(comicName, false)

    fs.readdir(__dirname + '/../../public/comics/' + comicName,  (err, files) => {
      if (err) { return returnError('Reading file error: ' + err.toString(), res, null, err) }

      let updateComicQuery = 'UPDATE Comic SET NumberOfPages = ? WHERE Name = ?'
      mysqlPool.getConnection((err, connection) => {
        connection.query(updateComicQuery, [files.length-1, comicName], (err, results) => {
          if (err) { return returnError('Database error: ' + err.toString(), res, connection, err) }
          res.json({message: 'Successfully re-zipped comic ' + comicName})          
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