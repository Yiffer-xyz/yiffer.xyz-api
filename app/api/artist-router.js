let fs = require('fs')
let pythonShell = require('python-shell')
let authorizedUsers = require('../../config/autorized-users.json')
let multiparty = require('connect-multiparty')
let multipartyMiddelware = multiparty()

module.exports = function (app, mysqlPool) {
  app.get ('/api/artists', getAllArtists)
  app.get ('/api/artists/:name', getArtistByName)
  app.post('/api/artists/', createArtist)
  app.post('/api/artistLinks', addArtistLinks)
  app.post('/api/artistFavImage', multipartyMiddelware, addArtistModFavoriteImage)


  function getAllArtists (req, res, next) {
    let query = 'SELECT Id AS id, Name AS name FROM Artist'
    mysqlPool.getConnection((err, connection) => {
      connection.query(query, (err, results) => {
				if (err) { return returnError('Database error: Error fetching artists', res, connection, err) }
        res.json(results)
        connection.release()
      })
    })
  }


  function getArtistByName (req, res, next) {
    let artistName = req.params.name
    let queryComic = 'SELECT Comic.Name FROM Comic INNER JOIN Artist ON (Artist.Id = Comic.Artist) WHERE Artist.Name = ? ORDER BY Comic.Name DESC'
    let queryLinks = 'SELECT LinkType as linkType, LinkURL as linkUrl FROM ArtistLink INNER JOIN Artist ON (Artist.Id = ArtistLink.ArtistId) WHERE Artist.Name = ?'

    mysqlPool.getConnection((err, connection) => {
      connection.query(queryComic, [artistName], (err, results) => {
        if (err) { return returnError('Database query error', res, connection, err) }
        if (results.length === 0) { return returnError('404', res, connection, null) }  // todo change to real 404

        let finalReturn = {comicList: [], linkList: []}
        for (var r in results) { finalReturn.comicList.push(results[r].Name) }

        connection.query(queryLinks, [artistName], (err, results) => {
          if (err) { return returnError('Database query error', res, connection, err) }
          finalReturn.linkList = results

          let modFavorites = getModFavImagesForArtist(artistName)
          finalReturn.modFavoriteList = modFavorites

          res.json(finalReturn)
          connection.release()
        })
      })
    })  
  }


  function getModFavImagesForArtist (artistName) {
    let modNames = fs.readdirSync(__dirname + '/../../public/mod-favorites/')
    let artistsWithFavImage = []
    for (var modName of modNames) {
      let favoriteImages = fs.readdirSync(__dirname + `/../../public/mod-favorites/${modName}`)
      if (favoriteImages.indexOf(artistName + '.jpg') >= 0) { artistsWithFavImage.push(modName) }
    }
    return artistsWithFavImage
  }


  function createArtist (req, res, next) {
    if (!authorizeMod(req)) { return returnError('Unauthorized or no access', res, null, null) }
      
    let newArtistName = req.body.artistName
    let insertArtistQuery = 'INSERT INTO Artist (Name) VALUES (?)'

    mysqlPool.getConnection((err, connection) => {
      connection.query(insertArtistQuery, [newArtistName], (err, results) => {
        if (err) { return returnError('Database query error: '+err.toString(), res, connection, err) }
        res.json({ message: 'Successfully added artist ' + newArtistName })
        connection.release()
      })
    })
  }


  function addArtistLinks (req, res, next) {
    if (!authorizeMod(req)) { return returnError('Unauthorized or no access', res, null, err) }
    let artistId = req.body.artistId
    let artistLinks = req.body.artistLinks
    if (!artistId && artistLinks.length == 0) { return returnError('Missing field(s)', res, null, null) }
    let typedLinkList = extractLinkTypesFromLinkUrls(artistLinks)

    let addLinksQuery = 'INSERT INTO ArtistLink (ArtistId, LinkURL, LinkType) VALUES '
    let addLinksParams = []

    for (var i=0; i<typedLinkList.length; i++) {
      if (i!=0) { addLinksQuery += ', ' }
      addLinksQuery += `(${artistId}, ?, ?)`
      addLinksParams.push(typedLinkList[i].linkUrl)
      addLinksParams.push(typedLinkList[i].linkType)
    }

    mysqlPool.getConnection((err, connection) => {
      connection.query(addLinksQuery, addLinksParams, (err, results) => {
        if (err) { return returnError('Database query error: '+err.toString(), res, connection, err) }
        res.json({message: 'Successfully added links'})
        connection.release()
      })
    })
  }


  function addArtistModFavoriteImage (req, res, next) {
    if (!authorizeMod(req)) { return returnError('Unauthorized or no access', res, null, err) }
    if (!req.files || !req.files.file || !req.body.artistName) { return returnError('Missing field(s)', res, null, err) }

    let imageFile = req.files.file.path
    let artistName = req.body.artistName
    let modName = req.session.user.username
    let fileEnding = imageFile.substring(imageFile.length-4)
    if ((fileEnding != '.jpg') && (fileEnding != '.png')) { 
      return returnError('File type must be png or jpg', res, null, null)
    }

    fs.readFile(imageFile, (err, fileData) => {
      if (err) { return returnError('Error reading the uploaded file: ' + err.toString(), res, null, err) }

      fs.writeFile(__dirname + `/../../public/mod-favorites/${modName}/${artistName}${fileEnding}`, fileData, (err) => {
        if (err) { return returnError('Error writing the uploaded file: ' + err.toString(), res, null, err) }

        // if (fileEnding == '.png') { convertImageToJpg(`/public/mod-favorites/${modName}/${artistName}${fileEnding}`) }
        if (fileEnding == '.png') { 
          convertImageToJpg('/public/mod-favorites/' + modName + '/' + artistName + fileEnding)
        }
        res.json({message: 'Successfully added new fav image!'})
      })
    })
  }
}


function extractLinkTypesFromLinkUrls (linkList) {
  let typedLinkList = []
  for (var link of linkList) {
    if (link.indexOf('furaffinity') >= 0) { typedLinkList.push({linkUrl: link, linkType: 'furaffinity'}) }
    else if (link.indexOf('inkbunny') >= 0) { typedLinkList.push({linkUrl: link, linkType: 'inkbunny'}) }
    else if (link.indexOf('patreon') >= 0) { typedLinkList.push({linkUrl: link, linkType: 'patreon'}) }
    else if (link.indexOf('tumblr') >= 0) { typedLinkList.push({linkUrl: link, linkType: 'tumblr'}) }
    else if (link.indexOf('twitter') >= 0) { typedLinkList.push({linkUrl: link, linkType: 'twitter'}) }
    else if (link.indexOf('furrynetwork') >= 0) { typedLinkList.push({linkUrl: link, linkType: 'furrynetwork'}) }
    else if (link.indexOf('weasyl') >= 0) { typedLinkList.push({linkUrl: link, linkType: 'weasyl'}) }
    else if (link.indexOf('hentaifoundry') >= 0) { typedLinkList.push({linkUrl: link, linkType: 'hentaifoundry'}) }
    else if (link.indexOf('deviantart') >= 0) { typedLinkList.push({linkUrl: link, linkType: 'deviantart'}) }
    else if (link.indexOf('sofurry') >= 0) { typedLinkList.push({linkUrl: link, linkType: 'sofurry'}) }
    else if (link.indexOf('pixiv') >= 0) { typedLinkList.push({linkUrl: link, linkType: 'pixiv'}) }
    else { typedLinkList.push({linkUrl: link, linkType: 'website'}) }
  }
  return typedLinkList
}

function convertImageToJpg (pathToImage) {
  pythonShell.run('convert_file_to_jpg.py', {mode: 'text', args: [pathToImage], scriptPath: '/home/rag/mnet/app'}, (err, results) => {
    if (err) { console.log(err) }
  })
}


function returnError (errorMessage, res, mysqlConnection, err) {
  if (err) { console.log(err) }
  res.json({ error: errorMessage })
  if (mysqlConnection) { mysqlConnection.release() }
}


function authorizeAdmin (req) {
  if (!req.session || !req.session.user) { return false }
  if (authorizedUsers.admins.indexOf(req.session.user.username) === -1) { return false }
  return true
}


function authorizeMod (req) { 
  if (!req.session || !req.session.user) { return false }
  if (authorizedUsers.mods.indexOf(req.session.user.username) === -1) { return false }
  return true
}