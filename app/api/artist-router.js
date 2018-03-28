let fs = require('fs')
let authorizedUsers = require('../../config/autorized-users.json')

module.exports = function (app, mysqlPool) {
  app.get ('/api/artists', getAllArtists)
  app.get ('/api/artists/:name', getArtistByName)
  app.post('/api/artists/', createArtist)
  app.post('/api/artistLink', addArtistLinks)


  function getAllArtists (req, res, next) {
    let query = 'SELECT Name FROM Artist'
    mysqlPool.getConnection((err, connection) => {
      connection.query(query, (err, results) => {
        if (err) { return returnError('Database query error: ' + err.toString(), res, connection, err) }
        let allArtistList = []
        for (var artist of results) { allArtistList.push(artist.Name) } // todo get query results as list?
        res.json(allArtistList)
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

        connection.query(queryLinks, [artistName], (err, results2) => {
          if (err) { return returnError('Database query error', res, connection, err) }
          finalReturn.linkList = results2

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
    let artistLinks = req.body.artistLinkList
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
        res.json({status: 'Successfully added links'})
        connection.release()
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