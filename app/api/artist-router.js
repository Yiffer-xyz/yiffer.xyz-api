const BaseRouter = require('./baseRouter')

module.exports = class ArtistRouter extends BaseRouter {
  constructor (app, databaseFacade, modLogger) {
		super(app, databaseFacade, modLogger)
		this.setupRoutes()
  }
  
  setupRoutes () {
    this.app.get ('/api/artists', (req, res) => this.getAllArtists(req, res))
    this.app.get ('/api/artists/:name', (req, res) => this.getArtistByName(req, res))
    this.app.post('/api/artists', (req, res) => this.addArtist(req, res))
    this.app.post('/api/artistlinks', (req, res) => this.addArtistLinks(req, res))
  }

  async getAllArtists (req, res) {
    try {
      let query = 'SELECT Id AS id, Name AS name FROM Artist'
      let results = await this.databaseFacade.execute(query)
      res.json(results)
    }
		catch (err) {
      return this.returnError(err.message, res, err.error)
		}
  }

  async getArtistByName (req, res) {
    let artistName = req.params.name
    let artistIdQuery = 'SELECT Id from Artist where Name = ?'
    let linksQuery = 'SELECT LinkType as linkType, LinkURL as linkUrl FROM ArtistLink WHERE ArtistId = ?'

    let user = this.getUser(req)
    let comicsQuery
    let comicsQueryParams = []
    if (user) {
      comicsQuery = 'SELECT T1.ComicId AS id, T1.ComicName AS name, T1.Cat AS cat, T1.Tag AS tag, T1.ArtistName AS artist, T1.Updated AS updated, T1.Created AS created, T1.Finished AS finished, T1.NumberOfPages AS numberOfPages, T1.Snitt AS userRating, T2.YourVote AS yourRating, T3.Keywords AS keywords FROM (( SELECT Comic.Id AS ComicId, Comic.Name AS ComicName, Cat, Artist.Name as ArtistName, Tag, Updated, Created, Finished, NumberOfPages, AVG(Vote) AS Snitt FROM Comic INNER JOIN Artist ON (Artist.Id = Comic.Artist) LEFT JOIN ComicVote ON (Comic.Id = ComicVote.ComicId) WHERE Artist.Id = ? GROUP BY Comic.Name, Comic.Id) AS T1 LEFT JOIN (SELECT ComicKeyword.ComicId AS ComicId, GROUP_CONCAT(Keyword SEPARATOR \',\') AS Keywords FROM ComicKeyword GROUP BY ComicKeyword.ComicId) AS T3 ON (T1.ComicId = T3.ComicId) LEFT JOIN (SELECT ComicId, Vote AS YourVote FROM ComicVote WHERE User = ?) AS T2 ON (T1.ComicId = T2.ComicId)) ORDER BY id'
      comicsQueryParams = [user.id]
    }
    else {
      comicsQuery = 'SELECT Comic.Id AS id, Comic.Name AS name, Comic.Cat AS cat, Comic.Tag AS tag, Artist.Name AS artist, Comic.Updated AS updated, Comic.Finished AS finished, Comic.Created AS created, Comic.NumberOfPages AS numberOfPages, AVG(ComicVote.Vote) AS userRating, 0 AS yourRating, T1.Keywords AS keywords FROM Comic INNER JOIN Artist ON (Artist.Id = Comic.Artist) WHERE Artist.Id=3 LEFT JOIN (SELECT ComicKeyword.ComicId AS ComicId, GROUP_CONCAT(Keyword SEPARATOR \',\') AS Keywords FROM ComicKeyword GROUP BY ComicKeyword.ComicId) AS T1 ON (T1.ComicId = Comic.Id) LEFT JOIN ComicVote ON (Comic.Id = ComicVote.ComicId) WHERE Artist.Id=? GROUP BY name, id ORDER BY id'
    }

    try {
      let artistId = await this.databaseFacade.execute(artistIdQuery, [artistName], 'Error getting artist id')
      artistId = artistId[0].Id
      comicsQueryParams.splice(0, 0, artistId)
      let links = await this.databaseFacade.execute(linksQuery, [artistId], 'Error getting artist links')
      let comics = await this.databaseFacade.execute(comicsQuery, comicsQueryParams, 'Error getting artist comics')
      for (var comic of comics) {
				if (!comic.keywords) { comic.keywords = [] }
				else { comic.keywords = comic.keywords.split(',') }
      }
      res.json({links: links, comics: comics})
    }
		catch (err) {
      return this.returnError(err.message, res, err.error)
		}
  }

  async addArtist (req, res) {
    let artistName = req.body.artistName
    let alreadyExistsQuery = 'SELECT * FROM Artist WHERE Name = ?'
    let query = 'INSERT INTO Artist (Name) VALUES (?)'
    try {
      let existingArtist = this.databaseFacade.execute(alreadyExistsQuery, [artistName])
      if (existingArtist.length > 0) { return this.returnError('Artist already exists', res) }
      let insertResult = await this.databaseFacade.execute(query, [artistName], 'Error adding artist')
      res.json(insertResult.insertId)
			this.addModLog(req, 'Artist', `Add ${artistName}`)
    }
		catch (err) {
      return this.returnError(err.message, res, err.error)
		}
  }

  async addArtistLinks (req, res) {
    let [artistId, links] = [req.body.artistId, req.body.links]
    if (!artistId || links.length==0) { return this.returnError('Missing field(s)', res) }
    let typedLinks = extractLinkTypesFromLinkUrls(links)

    let query = 'INSERT INTO ArtistLink (ArtistId, LinkURL, LinkType) VALUES '
    let queryParams = []

    for (var typedLink of typedLinks) {
      query += `(?, ?, ?), `
      queryParams.push(artistId, typedLink.linkUrl, typedLink.linkType)
    }
    query = query.substring(0, query.length-2)
    
    try {
      await this.databaseFacade.execute(query, queryParams, 'Error adding links')
      res.json({success: true})
      let artistName = (await this.databaseFacade.execute('SELECT Name FROM Artist WHERE Id=?', [artistId]))[0].Name
			this.addModLog(req, 'Artist', `Add ${typedLinks.length} links to ${artistName}`, links.join(', '))
    }
		catch (err) {
      return this.returnError(err.message, res, err.error)
		}
  }
}


function extractLinkTypesFromLinkUrls (linkList) {
  let typedLinkList = []
  for (var link of linkList) {
    if (link.indexOf('furaffinity') >= 0) { typedLinkList.push({linkUrl: link, linkType: 'furaffinity'}) }
    else if (link.indexOf('e621') >= 0) { typedLinkList.push({linkUrl: link, linkType: 'e621'}) }
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