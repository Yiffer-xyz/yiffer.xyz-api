let fs = require('fs')
let archiver = require('archiver')
let pythonShell = require('python-shell')
let authorizedUsers = require('../../config/autorized-users.json')
let multiparty = require('connect-multiparty')
let multipartyMiddelware = multiparty()

module.exports = function (app, mysqlPool) {

  app.get ('/api/comics', getComicList)
  app.get ('/api/comics/:name', getComicByName)
  app.post('/api/comics/:name', multipartyMiddelware, updateComicByName)
  app.post('/api/comics', multipartyMiddelware, createComic)
  app.put ('/api/comics/:name', updateComicDetailsByName)


  function getComicList (req, res, next) {
    if (req.session && req.session.user) { var query = 'SELECT T1.ComicId AS id, T1.ComicName AS name, T1.Cat AS cat, T1.Tag AS tag, T1.ArtistName AS artist, T1.Updated AS updated, T1.Created AS created, T1.Finished AS finished, T1.NumberOfPages AS numberOfPages, T1.Snitt AS userRating, T2.YourVote AS yourRating FROM ((SELECT Comic.Id AS ComicId, Comic.Name AS ComicName, Cat, Artist.Name as ArtistName, Tag, Updated, Created, Finished, NumberOfPages, AVG(Vote) AS Snitt FROM Comic INNER JOIN Artist ON (Artist.Id = Comic.Artist) LEFT JOIN ComicVote ON (Comic.Id = ComicVote.ComicId) GROUP BY Comic.Name, Comic.Id) AS T1 LEFT JOIN (SELECT ComicId, Vote AS YourVote FROM ComicVote WHERE Username = \''+req.session.user.username+'\') AS T2 ON (T1.ComicId = T2.ComicId)) ORDER BY id' }
    else { var query = 'SELECT Comic.Id AS id, Comic.Name AS name, Comic.Cat AS cat, Comic.Tag AS tag, Artist.Name AS artist, Comic.Updated AS updated, Comic.Finished AS finished, Comic.Created AS created, Comic.NumberOfPages AS numberOfPages, AVG(ComicVote.Vote) AS userRating, 0 AS yourRating FROM Comic INNER JOIN Artist ON (Artist.Id = Comic.Artist) LEFT JOIN ComicVote ON (Comic.Id = ComicVote.ComicId) GROUP BY name, id ORDER BY id' }
      
    mysqlPool.getConnection((err, connection) => {
      if (err) { return returnError('Error connecting to database connection pool', res, null, err) }
      connection.query(query, (err, results, fields) => {
        if (err) { return returnError('Database query error', res, null, err) }
        res.json(results)
        connection.release()
      })
    })
  }


  function getComicByName (req, res, next) {
    let comicName = req.params.name
    let finalReturnValue = {}
    let getIdQuery = 'SELECT Id FROM Comic WHERE Name = ?'
    let comicMetadataQuery = ''
    let keywordsQuery = 'SELECT Keyword FROM ComicKeyword WHERE ComicId = ?'
    let queryParams = {}

    mysqlPool.getConnection(function (err, connection) {
      if (err) { return returnError('Error connecting to database connection pool', res, null, err) }

      connection.query(getIdQuery, [comicName], (err, results) => {
        if (err) { return returnError('Database query error', res, connection, err) } // todo not 400 but something else
        if (results.length == 0) { return returnError('Invalid comic name', res, connection, err) }
        let comicId = results[0].Id
        if (req.session && req.session.user) {
          comicMetadataQuery = 'SELECT NumberOfPages as numberOfPages, Artist.Name as artist, Comic.Id as comicId, T1.Vote as yourRating FROM Comic LEFT JOIN (SELECT Vote, ComicId FROM ComicVote WHERE ComicId = ? AND Username = ?) AS T1 ON (Comic.Id = T1.ComicId) INNER JOIN Artist ON (Artist.Id = Comic.Artist) WHERE Comic.Id = ?'
          queryParams = [comicId, req.session.user.username, comicId]
        }
        else {
          comicMetadataQuery = 'SELECT NumberOfPages as numberOfPages, Artist.Name AS artist, Comic.Id AS comicId, NULL AS yourRating FROM Comic INNER JOIN Artist ON (Artist.Id = Comic.Artist) WHERE Comic.Id = ?'
          queryParams = [comicId]
        }

        connection.query(comicMetadataQuery, queryParams, function (err, results) {
          if (err) { return returnError('Database query error', res, connection, err) }
          finalReturnValue = results[0]

          connection.query(keywordsQuery, [comicId], function (err, results) {
            if (err) { return returnError('Database query error', res, connection, err) }
            finalReturnValue.keywords = []
            for (var v of results) {
              finalReturnValue.keywords.push(v.Keyword)
            }

            res.json(finalReturnValue)
            connection.release()
          })
        })
      })
    })
  }


  function createComic (req, res, next) {
    if (!authorizeMod(req)) { return returnError('Unauthorized or no access', res, null, null) }

    let newComicDetails = req.body.comicDetails
    let comicFolderPath = __dirname + '/../../public/comics/' + newComicDetails.name
    let pageSIncluded = false
    let fileList = []

    if (!req.files.files) { return returnError('No files added!', res, null, null) }
    if (Array.isArray(req.files.files)) {
      fileList = req.files.files.sort( (file1, file2) => { return file1.name > file2.name } )
    }
    else {
      fileList = extractFilesFromFileObject(req.files.files)
    }

    fs.mkdir(comicFolderPath, (err) => {
      if (err) { return returnError('Error creating new comic folder: ' + err.toString(), res, null, err) }
      for (var i=1; i<=fileList.length; i++) {
        let file = fileList[i-1]
        let fileContents = fs.readFileSync(file.path)
        let pageName = getPageName(i, file.path)
        if (!pageName) { return returnError('Some file is not .jpg or .png!', res, null, null) }

        if (file.name == 's.jpg') { 
          pageSIncluded = true 
          fs.writeFileSync(comicFolderPath + '/s.jpg', fileContents)
        }
        else { 
          fs.writeFileSync(comicFolderPath + '/' + pageName, fileContents) 
        }
      }

      let numberOfPages = fileList.length - (pageSIncluded ? 1 : 0)

      pythonShell.run('process_new_comic.py', {mode: 'text', args: [newComicDetails.name], scriptPath: '/home/rag/testmnet/app'}, (err, results) => {
        if (err) { return returnError('Python processing new comic failed: ' + err.toString(), res, null, err) }

        let insertQuery = 'INSERT INTO SuggestedComic (ModName, Name, Artist, Cat, Tag, NumberOfPages, Finished) VALUES (?, ?, (SELECT Id FROM Artist WHERE Name = ?), ?, ?, ?, ?)'
        let insertQueryParams = [req.session.user.username, newComicDetails.name, newComicDetails.artist, newComicDetails.cat, newComicDetails.tag, numberOfPages, newComicDetails.finished]
        let finalSuccessMessage = 'Thank you! The comic is added to a final approval queue, and will be processed shortly by admin.'

        mysqlPool.getConnection((err, connection) => {
          connection.query(insertQuery, insertQueryParams, (err, results) => {
            if (err) { return returnError('Database error: ' + err.toString(), res, connection, err) }
            res.json({message: finalSuccessMessage})
            connection.release()
          })
        })
      })
    })
  }


  function updateComicByName (req, res, next) {
    if (req.body.newImage) {
      addImageToComic(req, res)
    }
  }

  function addImageToComic (req, res) {
    if (!authorizeMod(req)) { return returnError('Unauthorized or no access', res, null, null) }
    logComicUpdate(req, mysqlPool)

    let newImageFile = req.files.file.path
    let comicName = req.body.comicName
    let query = 'UPDATE Comic SET NumberOfPages = ?, Updated = NOW() WHERE Name = ?'
    let newImageFileType = newImageFile.substring(newImageFile.length-3)
    fs.readFile(newImageFile, (err, fileData) => {
      if (err) { return returnError('Error reading the uploaded file', res, null, err) }
      fs.writeFile(__dirname + `/../../public/comics/${comicName}/x.${newImageFileType}`, fileData, (err) => {
        if (err) { return returnError('Error rewriting the uploaded file', res, null, err) }
        fs.readdir(__dirname + `/../../public/comics/${comicName}`, (err, files) => {
          if (err) { return returnError('Error reading comic directory', res, null, err) }
          let newNumberOfImages = files.length-1

          pythonShell.run('process_new_comic_page_new.py', {mode: 'text', args: [comicName, newImageFileType, newNumberOfImages], scriptPath: '/home/rag/mnet/app'}, (err, results) => {
            zipComic(comicName, false)
          })
          mysqlPool.getConnection((err, connection) => {
            connection.query(query, [newNumberOfImages, comicName], (err, rows) => {
              if (err) { return returnError('Error updating number of pages in database', res, connection, err) }
              res.json( {message: `Success! (${req.body.comicName})`} )
              connection.release()
            })
          })
        })
      })
    })
  }


  function updateComicDetailsByName (req, res, next) {
    if (!authorizeMod(req)) { return returnError('Unauthorized or no access', res, null, null) }

    let comicName = req.params.name
    let updatedCat = req.body.cat
    let updatedTag = req.body.tag
    let updatedFinished = req.body.finished
    let updatedArtistName = req.body.artistName

    if (!comicName || !updatedCat || !updatedTag || updatedFinished==undefined || !updatedArtistName) {
      return returnError('Missing fields', res, null, null)
    }

    let updateQuery = 'UPDATE Comic SET Cat = ?, Tag = ?, Finished = ?, Artist = (SELECT Id FROM Artist WHERE Name = ?) WHERE Name = ?'
    mysqlPool.getConnection((err, connection) => {
      connection.query(updateQuery, [updatedCat, updatedTag, updatedFinished, updatedArtistName, comicName], (err, results) => {
        if (err) { return returnError('Database error: ' + err.toString(), res, connection, err) }
        res.json({ message: 'Successfully updated comic' })
        connection.release()
      })
    })
  }
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


function logComicUpdate (req, mysqlPool) {
  let comicName = req.body.comicName
  let modName = req.session.user.username
  let query = 'INSERT INTO TagLog (TagNames, ComicName, Username) VALUES (?, ?, ?)'
  mysqlPool.getConnection((err, connection) => {
    connection.query(query, ['>>ADD iMAGE<<', comicName, modName], (err, rows) => {
      if (err) { return returnError(null, null, connection, err) }
      connection.release()
    })
  })
}


function getPageName (pageNumber, filePathName) {
  let pageNumberString = (pageNumber < 10) ? ('0' + pageNumber) : (pageNumber)
  let pagePostfix = filePathName.substring(filePathName.length - 4)
  if (pagePostfix != '.jpg' && pagePostfix != '.png') { return false }
  return pageNumberString + pagePostfix
}


function extractFilesFromFileObject (fileObject) {
  let keys = Object.keys(fileObject)
  let fileArray = []
  for (var i=0; i<keys.length; i++) {
    fileArray.push(fileObject['' + i])
  }
  return fileArray
}