import BaseRouter from './baseRouter.js'
import { getComics } from './comics-query-helper.js'

export default class ArtistRouter extends BaseRouter {
  constructor (app, databaseFacade, modLogger) {
		super(app, databaseFacade, modLogger)
		this.setupRoutes()
  }
  
  setupRoutes () {
    this.app.get ('/api/artists', (req, res) => this.getAllArtists(req, res))
    this.app.get ('/api/artists/:name', (req, res) => this.getArtistByName(req, res))
    this.app.post('/api/artists', this.authorizeMod.bind(this), (req, res) => this.addArtist(req, res))
    this.app.post('/api/artists/:id', this.authorizeMod.bind(this), (req, res) => this.updateArtist(req, res))
  }

  async getAllArtists (req, res) {
    try {
      let query = 'SELECT Id AS id, Name AS name, PatreonName AS patreonName, E621Name AS e621Name FROM artist'
      let results = await this.databaseFacade.execute(query)
      res.json(results)
    }
		catch (err) {
      return this.returnError(err.message, res, err.error)
		}
  }

  async getArtistByName (req, res) {
    let artistName = req.params.name
    let artistDataQuery = 'SELECT Id, E621Name, PatreonName from artist where Name = ?'
    let linksQuery = 'SELECT LinkType as linkType, LinkURL as linkUrl FROM artistlink WHERE ArtistId = ?'

    try {
      let user = this.getUser(req)
      let artistData = await this.databaseFacade.execute(artistDataQuery, [artistName], 'Error getting artist id')
      let artistId = artistData[0].Id
      let [artistE621Name, artistPatreonName] = [artistData[0].E621Name, artistData[0].PatreonName]

      let promises = [
        this.databaseFacade.execute(linksQuery, [artistId], 'Error getting artist links'),
        getComics(this.databaseFacade, user, 0, 0, null, null, null, null, null, artistId)
      ]
      let [links, comics] = await Promise.all(promises)

      let allArtistData = {
        'links': links,
        'e621Name': artistE621Name || null,
        'patreonName': artistPatreonName || null,
        'comics': comics
      }

      res.json(allArtistData)
    }
		catch (err) {
      return this.returnError(err.message, res, err.error)
		}
  }

  async addArtist (req, res) {
    let [artistName, e621Name, patreonName] = [req.body.artistName, req.body.e621Name, req.body.patreonName]
    let alreadyExistsQuery = 'SELECT * FROM artist WHERE Name = ?'
    let query = 'INSERT INTO artist (Name, E621Name, PatreonName) VALUES (?, ?, ?)'
    try {
      let existingArtist = this.databaseFacade.execute(alreadyExistsQuery, [artistName])
      if (existingArtist.length > 0) { return this.returnError('Artist already exists', res) }

      let insertResult = await this.databaseFacade.execute(query, [artistName, e621Name, patreonName], 'Error adding artist')
      res.json(insertResult.insertId)

			this.addModLog(req, 'Artist', `Add ${artistName}`)
    }
		catch (err) {
      return this.returnError(err.message, res, err.error)
		}
  }

  async updateArtist (req, res) {
    let artistId = req.params.id
    let [artistName, e621Name, patreonName, links] = [req.body.artistName, req.body.e621Name, req.body.patreonName, req.body.links]

    let typedLinks = extractLinkTypesFromLinkUrls(links)

    let updateQuery = 'UPDATE artist SET Name=?, E621Name=?, PatreonName=? WHERE Id=?'
    let deleteLinksQuery = 'DELETE FROM artistlink WHERE ArtistId=?'
    let insertLinksQuery = 'INSERT INTO artistlink (ArtistId, LinkURL, LinkType) VALUES '
    let insertLinksParams = []

    if (links.length > 0) {
      for (var typedLink of typedLinks) {
        insertLinksQuery += `(?, ?, ?), `
        insertLinksParams.push(artistId, typedLink.linkUrl, typedLink.linkType)
      }
      insertLinksQuery = insertLinksQuery.substring(0, insertLinksQuery.length-2)
    }

    try {
      await this.databaseFacade.execute(updateQuery, [artistName, e621Name, patreonName, artistId], 'Error updating artist')
      await this.databaseFacade.execute(deleteLinksQuery, [artistId], 'Error removing old links')
      if (links.length > 0) {
        await this.databaseFacade.execute(insertLinksQuery, insertLinksParams, 'Error adding links')
      }
      res.json({success: true})

			this.addModLog(req, 'Artist', `Update ${artistName} info`)
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
    else if (link.indexOf('inkbunny') >= 0) { typedLinkList.push({linkUrl: link, linkType: 'inkbunny'}) }
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