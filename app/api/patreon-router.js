import BaseRouter, { ApiError } from './baseRouter.js'
import url from 'url'
import { patreon as patreonAPI , oauth as patreonOAuth } from 'patreon'
import FileSystemFacade from '../fileSystemFacade.js'

import cron from 'cron'
import { convertPatreonProfilePic } from '../image-processing.js'
const CronJob = cron.CronJob

import multer from 'multer'
var storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads')
  },
  filename: function (req, file, cb) {
    cb(null, file.fieldname + '-' + Date.now())
  }
})
var upload = multer({ storage: storage })

export default class PatreonRouter extends BaseRouter {
  constructor (app, databaseFacade, config, authRouter) {
    super(app, databaseFacade, config)

    let patreonConfig = config.patreon
    this.patreonConfig = patreonConfig
    this.authRouter = authRouter
    this.patreonOAuthClient = patreonOAuth(patreonConfig.clientId, patreonConfig.clientSecret)

    let patreonPricesCents = patreonConfig.patreonTiers.map(tier => tier.amountCents)
    this.patreonPricesCents = patreonPricesCents
    this.tiersShownInList = patreonConfig.patreonTiers.filter(tier => tier.showInPatronList).map(tier => tier.dbTierNumber)
    this.VIPTiers = patreonConfig.patreonTiers.filter(tier => tier.isVIPPatron).map(tier => tier.dbTierNumber)

    this.setupRoutes()

    // Every night, 01:00
    let cronJob = new CronJob('0 1 * * *', this.syncAllPatreonTiers.bind(this), null, true, 'Europe/London')
		cronJob.start()
  }

  setupRoutes () {
    this.app.get('/api/patreon/callback', (req, res) => this.patreonCallback(req, res))
    this.app.get('/api/patreon/tiers', (req, res) => this.getTiers(req, res))
    this.app.post('/api/patreon/unlink', this.authorizeUser.bind(this), (req, res) => this.handleUnlinkPatreonAccount(req, res))
    this.app.post('/api/patreon/sync-account', this.authorizeUser.bind(this), (req, res) => this.handleSyncPatreonTier(req, res))

    this.app.post('/api/patreon/update-name', this.authorizeUser.bind(this), (req, res) => this.handleUpdatePatronDisplayName(req, res))
    this.app.post('/api/patreon/remove-name', this.authorizeUser.bind(this), (req, res) => this.handleRemovePatreonDisplayName(req, res))

    this.app.post('/api/patreon/update-link', this.authorizeUser.bind(this), (req, res) => this.handleUpdatePatronDisplayLink(req, res))
    this.app.post('/api/patreon/remove-link', this.authorizeUser.bind(this), (req, res) => this.handleRemovePatreonDisplayLink(req, res))
    this.app.post('/api/patreon/process-link', this.authorizeMod.bind(this), (req, res) => this.handleProcessPatronDisplayLink(req, res))

    this.app.post('/api/patreon/update-picture', this.authorizeUser.bind(this), upload.single('file'), (req, res) => this.handleUpdatePatronPicture(req, res))
    this.app.post('/api/patreon/remove-picture', this.authorizeUser.bind(this), (req, res) => this.handleRemovePatronPicture(req, res))
    
    this.app.post('/api/patreon/clear-patron-field', this.authorizeMod.bind(this), (req, res) => this.handleClearPatronField(req, res))
    
    this.app.get('/api/patreon/supporter-list', (req, res) => this.handleGetSupportersForList(req, res))
    this.app.get('/api/patreon/vip-supporter', (req, res) => this.getRandomVIPSupporter(req, res))
    this.app.get('/api/patreon/unprocessed-links', this.authorizeMod.bind(this), (req, res) => this.handleGetUnprocessedLinks(req, res))
  }
  
  async getTiers (req, res) {
    res.json(this.patreonConfig.patreonTiers)
  }

  async unlinkPatreonAccount (userId) {
    let query = `UPDATE user
      SET PatreonAccessToken = NULL, PatreonRefreshToken = NULL, PatreonTier = NULL, PatreonDisplayName = NULL, PatreonDisplayLink = NULL, HasPatreonPicture = 0
      WHERE Id = ?`

    await this.databaseFacade.execute(query, [userId], 'Error resetting patreon fields in database')
  }

  async handleUnlinkPatreonAccount (req, res) {
    try {
      await this.unlinkPatreonAccount(req.userData.id)
      await this.authRouter.refreshAuth(req, res)
    } 
		catch (err) {
			return this.returnApiError(res, err)
		}
  }

  async handleSyncPatreonTier (req, res) {
    try {
      let query = 'SELECT Id AS id, PatreonTier AS patreonTier, PatreonAccessToken AS patreonAccessToken, PatreonRefreshToken AS patreonRefreshToken FROM user WHERE Id = ?'

      let fullUserData = await this.databaseFacade.execute(query, [req.userData.id], 'Error fetching user data from database')
      fullUserData = fullUserData[0]

      await this.syncPatronTier(fullUserData)
      await this.authRouter.refreshAuth(req, res)
    } 
		catch (err) {
			return this.returnApiError(res, err)
		}
  }

  async patreonCallback (req, res) {
    let oauthGrantCode = url.parse(req.url, true).query.code
    let userId = req.query.state
    userId = Number(userId)

    try {
      let tokensResponse = await this.patreonOAuthClient.getTokens(oauthGrantCode, 'https://yiffer.xyz/api/patreon/callback')
      let accessToken = tokensResponse.access_token
      let refreshToken = tokensResponse.refresh_token

      await this.storeTokens(userId, accessToken, refreshToken)
      let relevantTier = await this.getPatronTier(accessToken)
      if (relevantTier) {
        await this.storePatronTier(userId, relevantTier.dbTierNumber)
        await this.updatePatronDisplayName(userId, null)
      }

      res.redirect('/account')
    }
    catch (err) {
      console.error('Patreon OAuth failed:', err)
      res.redirect('/account?error=1')
    }
  }

  async storeTokens (userId, accessToken, refreshToken) {
    let updateQuery = 'UPDATE user SET PatreonAccessToken = ?, PatreonRefreshToken = ? WHERE Id = ?'
    let updateQueryParams = [accessToken, refreshToken, userId]

    await this.databaseFacade.execute(updateQuery, updateQueryParams, 'Failed to store patreon tokens in database')
  }

  async storePatronTier (userId, tierNumber) {
    console.log(`New tier for user ${userId}: Tier number ${tierNumber}`)
    let setFieldsString = tierNumber === null
      ? 'PatreonTier = ?, PatreonAccessToken = NULL, PatreonRefreshToken = NULL'
      : 'PatreonTier = ?'
    let updateQuery = `UPDATE user SET ${setFieldsString} WHERE Id = ?`
    let updateQueryParams = [tierNumber, userId]

    await this.databaseFacade.execute(updateQuery, updateQueryParams, 'Failed to store patron tier in database')
  }

  async refreshToken (refreshToken) {
    let response = await this.patreonOAuthClient.refreshToken(refreshToken)
    return { newAccessToken: response.access_token, newRefreshToken: response.refresh_token }
  }

  async handleUpdatePatronDisplayName (req, res) {
    try {
      let newName = req.body.newName.trim()

      if (newName.length > 35) {
        return this.returnApiError(res, new ApiError('Name too long', 400))
      }
      if (newName.length < 1) {
        return this.returnApiError(res, new ApiError('Name too short', 400))
      }
      await this.updatePatronDisplayName(req.userData.id, newName)
      await this.authRouter.refreshAuth(req, res)
    } 
		catch (err) {
			return this.returnApiError(res, err)
		}
  }

  async handleRemovePatreonDisplayName (req, res) {
    try {
      await this.updatePatronDisplayName(req.userData.id, null, true)
      await this.authRouter.refreshAuth(req, res)
    } 
		catch (err) {
			return this.returnApiError(res, err)
		}
  }

  async handleUpdatePatronDisplayLink (req, res) {
    try {
      let newLink = req.body.newLink.trim()

      if (newLink.length > 100) {
        return this.returnApiError(res, new ApiError('Link too long, max 100 characters', 400))
      }
      if (newLink.length < 3) {
        return this.returnApiError(res, new ApiError('Link too short, at least 3 characters', 400))
      }
      if (!newLink.startsWith('https://') && !newLink.startsWith('http://')) {
        return this.returnApiError(res, new ApiError('Must start with https:// or http://', 400))
      }
  
      let updateQuery = 'UPDATE user SET PatreonDisplayLink = ?, IsPatreonLinkApproved = 0 WHERE Id = ?'
      let updateQueryParams = [newLink, req.userData.id]
  
      await this.databaseFacade.execute(updateQuery, updateQueryParams, 'Failed to store patron display link in database')

      await this.authRouter.refreshAuth(req, res)
    } 
		catch (err) {
			return this.returnApiError(res, err)
		}
  }

  async handleRemovePatreonDisplayLink (req, res) {
    try {
      await this.removePatreonDisplayLink(req.userData.id)
      await this.authRouter.refreshAuth(req, res)
    } 
		catch (err) {
			return this.returnApiError(res, err)
		}
  }

  async removePatreonDisplayLink (userId) {
    let updateQuery = 'UPDATE user SET PatreonDisplayLink = NULL, IsPatreonLinkApproved = 0 WHERE Id = ?'
    await this.databaseFacade.execute(updateQuery, [userId], 'Failed to store patron display link in database')
  }

  async handleProcessPatronDisplayLink (req, res) {
    try {
      let [userId, isApproved] = [req.body.userId, req.body.isApproved]
      let isApprovedNum = isApproved ? 1 : 0
      let updateQuery = `
        UPDATE user SET IsPatreonLinkApproved = ${isApprovedNum} 
        ${isApproved ? '' : ', PatreonDisplayLink = NULL '}
        WHERE Id = ?
      `

      await this.databaseFacade.execute(updateQuery, [userId], 'Failed to approve link in DB')

      let links = await this.getUnprocessedLinks()
      res.json(links)
      this.addModLog(req, 'Patreon', `${isApproved ? 'Approved' : 'Rejected'} link for userId ${userId}`)
    } 
		catch (err) {
			return this.returnApiError(res, err)
		}
  }

  async updatePatronDisplayName (userId, displayName, shouldDeleteName=false) {
    if (!displayName && !shouldDeleteName) {
      let user = await this.getUserById(userId)
      displayName = user.username
    }

    let updateQuery = 'UPDATE user SET PatreonDisplayName = ? WHERE Id = ?'
    let updateQueryParams = [displayName, userId]

    if (shouldDeleteName) {
      updateQuery = 'UPDATE user SET PatreonDisplayName = NULL WHERE Id = ?'
      updateQueryParams = [userId]
    }

    await this.databaseFacade.execute(updateQuery, updateQueryParams, 'Failed to store patron display name in database')
  }

  async syncAllPatreonTiers () {
    console.log('Syncing all patron tiers...')
    let allPatrons = await this.getAllPatrons()
    console.log(`Found ${allPatrons.length} patrons`)

    allPatrons.forEach(async patron => {
      try {
        await this.syncPatronTier(patron)
      }
      catch (err) {
        console.error(`Error syncing patron tier for user id ${patron.id}`, err)
      }
    })
  }

  async syncPatronTier (patron) {
    console.log(`Syncing patron userId ${patron.id}, tier ${patron.patreonTier}`)
    let relevantTier
    let relevantToken = patron.patreonAccessToken

    if (patron.patreonRefreshToken) {
      let { newAccessToken, newRefreshToken } = await this.refreshToken(patron.patreonRefreshToken)
      await this.storeTokens(patron.id, newAccessToken, newRefreshToken)
      relevantToken = newAccessToken;
    }

    if (relevantToken) {
      relevantTier = await this.getPatronTier(relevantToken)
    }

    if (relevantTier?.dbTierNumber !== patron.patreonTier || !relevantTier) {
      await this.storePatronTier(patron.id, relevantTier?.dbTierNumber || null)
    }
  }

  async getPatronTier (accessToken) {
    let patreonAPIClient = patreonAPI(accessToken)
    let result = await patreonAPIClient('/current_user')

    let store = result.store
    let rawJson = result.rawJson
    let theUser = store.find('user', rawJson.data.id)

    let campaign = store.find('campaign', this.patreonConfig.campaignId)
    if (!campaign) {
      return null
    }


    let userPledges = theUser.pledges
    if (!userPledges || userPledges.length === 0) {
      return null
    }

    let highestPledgePrice = -1
    for (let pledge of userPledges) {
      let amountCents = pledge.reward.amount_cents

      let isValidAndHighest = !pledge.declined_since 
        && this.patreonPricesCents.includes(amountCents)
        && amountCents > highestPledgePrice

      if (isValidAndHighest) {
        highestPledgePrice = amountCents
      }
    }
    if (highestPledgePrice <= 0) {
      return null
    }

    let relevantTier = this.patreonConfig.patreonTiers.find(tier => tier.amountCents === highestPledgePrice)
    return relevantTier
  }

  async getAllPatrons () {
    let query = 'SELECT Id AS id, PatreonTier AS patreonTier, PatreonAccessToken AS patreonAccessToken, PatreonRefreshToken AS patreonRefreshToken FROM user WHERE PatreonTier IS NOT NULL'

    let allPatrons = await this.databaseFacade.execute(query)
    return [...allPatrons]
  }

  async handleGetSupportersForList (req, res) {
    try {
      let supporters = await this.getSupportersForList()
      res.json(supporters)
    }
		catch (err) {
			return this.returnApiError(res, err)
		}
  }

  async getSupportersForList () {
    let query = `SELECT Username AS username, PatreonDisplayName AS patreonDisplayName, HasPatreonPicture AS hasPatreonPicture, PatreonTier AS patreonTier, PatreonDisplayLink AS patreonDisplayLink, IsPatreonLinkApproved AS isPatreonLinkApproved, Id AS userId
      FROM user
      WHERE PatreonTier IN (${this.tiersShownInList.join(', ')})`
    
    let supporters = await this.databaseFacade.execute(query, null, 'Failed getting patreon supporters')
    return supporters
  }

  async getRandomVIPSupporter (req, res) {
    try {
      let query = `SELECT PatreonDisplayName AS patreonDisplayName, HasPatreonPicture AS hasPatreonPicture, PatreonTier AS patreonTier 
        FROM user
        WHERE PatreonTier IN (${this.VIPTiers.join(', ')})
          AND PatreonDisplayName != 'Anonymous' AND PatreonDisplayName IS NOT NULL
        ORDER BY RAND()
        LIMIT 1`

      let supporters = await this.databaseFacade.execute(query, null, 'Failed getting VIP patreon supporters')
      if (supporters.length === 0) {
        res.json(null)
        return
      }

      res.json(supporters[0])
    }
		catch (err) {
			return this.returnApiError(res, err)
		}
  }

  async handleGetUnprocessedLinks (req, res) {
    try {
      let links = await this.getUnprocessedLinks()
      res.json(links)
    }
		catch (err) {
			return this.returnApiError(res, err)
		} 
  }

  async getUnprocessedLinks () {
    let query = `SELECT Id AS userId, Username AS username, PatreonDisplayLink AS patreonDisplayLink FROM user WHERE IsPatreonLinkApproved = 0 AND PatreonDisplayLink IS NOT NULL`

    let users = await this.databaseFacade.execute(query, null, 'Failed getting unprocessed links from DB')

    return users
  }

	async handleUpdatePatronPicture (req, res) {
    try {
      let [imageFile] = [req.file]

      if (!imageFile) {
        return this.returnApiError(res, new ApiError('No image file provided', 400))
      }

      if (!imageFile.mimetype.endsWith('jpeg') && !imageFile.mimetype.endsWith('png')) {
        await FileSystemFacade.deleteFile(imageFile.path, 'Error deleting temp file')
        return this.returnApiError(res, new ApiError('.jpg, .jpeg, or .png', 400))
      }

      await convertPatreonProfilePic(imageFile.path)

      await FileSystemFacade.writeGooglePatronImage(req.userData.id, imageFile.path)

      await this.databaseFacade.execute(
        'UPDATE user SET HasPatreonPicture=1 WHERE Id=?',
        [req.userData.id],
        'Database error updating user'
      )

      await this.authRouter.refreshAuth(req, res)
		}
		catch (err) {
			return this.returnApiError(res, err)
		}
	}

  async handleRemovePatronPicture (req, res) {
    try {
      await this.removePatronPicture(req.userData.id)
      await this.authRouter.refreshAuth(req, res)
    }
    catch (err) {
      return this.returnApiError(res, err)
    }
  }

  async handleClearPatronField (req, res) {
    try {
      let [fieldName, userId] = [req.body.fieldName, req.body.userId]

      if (fieldName === 'picture') {
        await this.removePatronPicture(userId)
      }
      else if (fieldName === 'display-name') {
        await this.updatePatronDisplayName(userId, null, true)
      }
      else if (fieldName === 'display-link') {
        await this.removePatreonDisplayLink(userId)
      }

      let newSupporters = await this.getSupportersForList()
      res.json(newSupporters)

      this.addModLog(req, 'Patreon', `Removed ${fieldName} from userId ${userId}`)
    }
    catch (err) {
      return this.returnApiError(res, err)
    }
  }

  async removePatronPicture (userId) {
    await FileSystemFacade.deleteGooglePatronImage(userId)
    await this.databaseFacade.execute('UPDATE user SET HasPatreonPicture=0 WHERE Id=?', [userId], 'Database error updating user')
  }
}