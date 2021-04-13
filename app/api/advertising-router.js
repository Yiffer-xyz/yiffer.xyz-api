import BaseRouter, { ApiError } from './baseRouter.js'
import multer from 'multer'
import FileSystemFacade from '../fileSystemFacade.js'
import { sendEmail } from '../emailFacade.js'
import adPrices from '../../config/ad-prices.js'
import dateFns from 'date-fns'
const { addMonths } = dateFns

var storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads')
  },
  filename: function (req, file, cb) {
    cb(null, file.fieldname + '-' + Date.now())
  }
})
var upload = multer({ storage: storage })
const adImageUploadFormat = upload.fields([{ name: 'file1', maxCount: 1 }, { name: 'file2', maxCount: 1 }])

export default class AdvertisingRouter extends BaseRouter {
  constructor (app, databaseFacade) {
		super(app, databaseFacade)
		this.setupRoutes()
  }
  
  setupRoutes () {
    this.app.get('/api/paid-images-prices', (req, res) => this.getAdPrices(req, res))
    this.app.get ('/api/paid-images', this.authorizeAdmin.bind(this), (req, res) => this.getAllAds(req, res))
    this.app.get ('/api/paid-images-basic', (req, res) => this.getAdsForFrontEnd(req, res))
    this.app.get ('/api/paid-images/me', this.authorizeUser.bind(this), (req, res) => this.getUserAds(req, res))
    this.app.get('/api/paid-images/:adId/click-stats', this.authorizeUser.bind(this), (req, res) => this.getAdClickStats(req, res))
    this.app.post('/api/paid-images', this.authorizeUser.bind(this), adImageUploadFormat, (req, res) => this.createApplication(req, res))
    this.app.post('/api/paid-images/:adId/update-admin', this.authorizeAdmin.bind(this), (req, res) => this.updateAdAdmin(req, res))
    this.app.delete('/api/paid-images/:adId', this.authorizeUser.bind(this), (req, res) => this.deleteOrDeactivateAd(req, res))
    this.app.post('/api/paid-images/:adId/update-user', this.authorizeUser.bind(this), adImageUploadFormat, (req, res) => this.updateAdUser(req, res))
    this.app.post('/api/paid-images-click', (req, res) => this.logAdClick(req, res))
  }

  async getAdPrices (req, res) {
    res.json(adPrices)
  }

  async createApplication (req, res) {
    try {
      let [file1, file2, adType, adName, adLink, adMainText, adSecondaryText, advertiserNotes, user] = 
        [req.file1, req.file2, req.body.adType, req.body.adName, req.body.adLink, req.body.adMainText, req.body.adSecondaryText, req.body.advertiserNotes, this.getUser(req)]
    
        if (!user) {
          return this.returnApiError(res, new ApiError('Not logged in', 401))
        }
        if (!user.email) {
          return this.returnApiError(res, new ApiError('You must add an email address to your account first', 403))
        }
        
        let {isValid, error} = this.checkApplicationValidity(file1, file2, adType, adName, adLink, adMainText, adSecondaryText, advertiserNotes)
        if (!isValid) {
          return this.returnApiError(res, new ApiError(error, 400))
        }

        let adId = await this.generateAdId()
        let query = 'INSERT INTO advertisement (Id, AdType, Link, MainText, SecondaryText, Filetype, UserId, AdvertiserNotes) VALUES (?, ?, ?, ?, ?, ?, ?)'
        let queryParams = [adId, adType, adLink, adMainText, adSecondaryText, filetype, user.id, advertiserNotes]

        await this.databaseFacade.execute(query, queryParams, 'Error adding application to database')

        let filetype = file1.originalname.substring(file1.originalname.length-3)

        if (adType === 'card') {
          let newFilenameBig = `${adId}-big.${filetype}`
          await FileSystemFacade.writeGooglePaidImageFile(file1.path, newFilenameBig)
          let newFilenameSmall = `${adId}-small.${filetype}`
          await FileSystemFacade.writeGooglePaidImageFile(file2.path, newFilenameSmall)
        }
        else {
          let newFilename = `${adId}.${filetype}`
          await FileSystemFacade.writeGooglePaidImageFile(file1.path, newFilename)
        }

        sendEmail(
          'advertising',
          user.email,
          'Ad submission confirmation - Yiffer.xyz!',
          `We have received your advertisement submission and will review it shortly. If the ad is accepted, you will receive another email stating this. Otherwise, you will receive an email detailing what needs to be fixed.
          <br/><br/>
          Regards,<br/>
          Yiffer.xyz`
        )      
        sendEmail(
          'advertising',
          'advertising@yiffer.xyz',
          'New ad - Yiffer.xyz',
          `An ad of type ${adType} with id ${adId} has been submitted by user ${user.username}.`
        )
  
        res.status(204).end()
    }
    catch (err) {
      return this.returnApiError(res, err)
    }
  }

  checkUpdateValidity (file1, file2, adType, adName, adLink, adMainText, adSecondaryText, existingFileType) {
    if (file1) {
      let filetype1 = file1.originalname.substring(file1.originalname.length-3).toLowerCase()
      if (filetype1 !== existingFileType) {
        return {isValid: false, error: `You cannot change the file format (must be ${existingFileType})`}
      }
    }

    if (file2) {
      let filetype2 = file2.originalname.substring(file2.originalname.length-3).toLowerCase()
      if (filetype2 !== existingFileType) {
        return {isValid: false, error: `You cannot change the file format (must be ${existingFileType})`}
      }
    }

    if (!adLink) {
      return {isValid: false, error: 'Missing link'}
    }

    if (adType === 'card') {
      if (!adMainText) {
        return {isValid: false, error: 'Missing main text'}
      }
      if (adMainText.length > 25 || (adSecondaryText && adSecondaryText.length > 60)) {
        return {isValid: false, error: 'One of the texts are too long (max 25 and 60 characters)'}
      }
    }

    if (!adName || adName.length === 0) {
      return {isValid: false, error: 'Ad name missing'}
    }
    if (adName.length > 64) {
      return {isValid: false, error: 'Ad name too long - max 64 characters'}
    }

    return {isValid: true}
  }

  checkApplicationValidity (file1, file2, adType, adName, adLink, adMainText, adSecondaryText, advertiserNotes) {
    let filetype1 = file1.originalname.substring(file1.originalname.length-3).toLowerCase()

    if (!file1) {
      return {isValid: false, error: 'File missing'}
    }
    if (file1 && !(['jpg', 'png', 'gif'].includes(filetype1))) {
      return {isValid: false, error: 'Invalid file format (must be jpg/png/gif)'}
    }

    if (adType === 'card') {
      if (!file2) {
        return {isValid: false, error: 'Second file missing'}
      }

      let filetype2 = file2.originalname.substring(file2.originalname.length-3).toLowerCase()

      if (file2 && !(['jpg', 'png', 'gif'].includes(filetype2))) {
        return {isValid: false, error: 'Invalid second file format (must be jpg/png/gif)'}
      }

      if (filetype1 !== filetype2) {
        return {isValid: false, error: 'The two files must be of the same type (jpg/png/gif)'}
      }
    }

    if (!adTypes.includes(adType)) {
      return {isValid: false, error: 'Invalid ad type'}
    }
    if (!adLink) {
      return {isValid: false, error: 'Missing link'}
    }

    if (adType === 'card') {
      if (!adMainText) {
        return {isValid: false, error: 'Missing main text'}
      }
      if (adMainText.length > 25 || (adSecondaryText && adSecondaryText.length > 60)) {
        return {isValid: false, error: 'One of the texts are too long'}
      }
    }

    if (advertiserNotes && advertiserNotes.length > 255) {
      return {isValid: false, error: 'Notes too long - max 255 characters'}
    }

    if (!adName || adName.length === 0) {
      return {isValid: false, error: 'Ad name missing'}
    }
    if (adName.length > 64) {
      return {isValid: false, error: 'Ad name too long - max 64 characters'}
    }

    return {isValid: true}
  }

  async getAdsBase (req, res, whereStatement, whereParams, isAdminRequest) {
    try {
      let query = `SELECT advertisement.Id AS id, AdType AS adType, AdName AS adName, Link AS link, MainText AS mainText, SecondaryText AS secondaryText, UserId AS userId, Username AS username, Status AS status, Filetype AS filetype, ExpiryDate AS expiryDate, CreatedDate AS createdDate, AdvertiserNotes AS advertisreNotes, Clicks AS clicks ${isAdminRequest ? ', AdminNotes AS adminNotes' : ''}, CorrectionNote AS correctionNote FROM advertisement INNER JOIN user ON (user.Id = advertisement.UserId) ${whereStatement} ORDER BY CreatedDate DESC`

      let results = await this.databaseFacade.execute(query, whereParams, 'Error fetching ads')

      return results
    }
    catch (err) {
      return this.returnApiError(res, err)
    }
  }

  async getUserAds (req, res) {
    try {
      let user = this.getUser(req)
      let results = await this.getAdsBase(req, res, 'WHERE UserId=?', [user.id], false)
      res.json(results)
    }
    catch (err) {
      return this.returnApiError(res, err)
    }
  }

  async getAllAds (req, res) {
    let whereQueryString = ''
    let whereQueryParams = null
    let statuses = req.query.statuses
    if ((typeof statuses) === 'string') {
      statuses = [statuses]
    }

    if (statuses && statuses.length > 0) {
      whereQueryParams = statuses
      whereQueryString = 'WHERE Status = ?'
      for (let i=0; i<statuses.length-1; i++) {
        whereQueryString += ' OR Status = ?'
      }
    }

    let results = await this.getAdsBase(req, res, whereQueryString, whereQueryParams, true)
    res.json(results)
  }

  async getAdsForFrontEnd (req, res) {
    try {
      let query = `SELECT advertisement.Id AS id, AdType AS adType, Link AS link, MainText AS mainText, SecondaryText AS secondaryText, Filetype AS filetype FROM advertisement WHERE Status=${adStatuses.active}`
      let results = await this.databaseFacade.execute(query, null, 'Error fetching ads')

      res.json(results)
    }
    catch (err) {
      return this.returnApiError(res, err)
    }
  }

  async getAdClickStats (req, res) {
    try {
      let adId = req.params.adId
      let user = this.getUser(req)

      let adDetails = await this.getAdById(req, res, adId)
      if (adDetails.userId !== user.id) {
        return this.returnApiError(res, new ApiError('You do not own this ad', 401))
      }

      let statsQuery = 'SELECT Date AS date, Clicks AS clicks FROM advertisementdayclick WHERE AdId = ? ORDER BY Date ASC'
      let statsResult = await this.databaseFacade.execute(statsQuery, [adId])
      
      // todo check if needed - could possibly just return statsResult as json?
      let stats = []
      for (let dayStat of statsResult) {
        stats.push({date: dayStat.date, clicks: dayStat.clicks})
      }

      res.json(stats)
    }
    catch (err) {
      return this.returnApiError(res, err)
    }
  }

  async updateAdAdmin (req, res) {
    try {
      let [adId, status, expiryDateExtendMonths, customExpiryDate, adminNotes, correctionNote] = 
        [req.params.adId, req.body.status, req.body.expiryDateExtendMonths, req.body.customExpiryDate, req.body.adminNotes, req.body.correctionNote]

      let existingAd = this.getAdById(req, res, adId)
      if (!existingAd) {
        return this.returnApiError(res, new ApiError('Ad with given id not found', 404))
      }

      let newExpiryDate
      if (expiryDateExtendMonths) {
        newExpiryDate = addMonths(new Date(existingAd.expiryDate), expiryDateExtendMonths)
      }
      else {
        newExpiryDate = customExpiryDate
      }

      let adType = existingAd.adType

      let query = 'UPDATE advertisement Status=?, ExpiryDate=?, AdminNotes=?, CorrectionNote=? WHERE Id=?'
      let queryParams = [status, newExpiryDate, adminNotes, correctionNote||null, adId]

      await this.databaseFacade.execute(query, queryParams, 'Error updating ad')
      let updatedAd = await this.getAdById(req, res, adId)
      
      if (status === adStatuses.awaitingPayment || status === adStatuses.needsCorrection) {
        let user = this.getUserAccount()
        
        if (status === adStatuses.awaitingPayment) {
          let adCosts = []
          for (let adPrice of adPrices[adType]) {
            if (adPrice.discountedPrice) {
              adCosts.push(`<b>${adPrice.discountedPrice} USD</b> for ${adPrice.durationMonths} months (limited discount)`)
            }
            else {
              adCosts.push(`<b>${adPrice.discountedPrice} USD</b> for ${adPrice.durationMonths} months`)
            }
          }

          let adCostsString = adCosts.join(', ')

          await sendEmail(
            'advertising',
            user.email,
            'Ad ready for payment - Yiffer.xyz',
            `Your advertisement with ID <b>${adId}</b> has been accepted. This means that you may now pay ad's cost (${adCostsString}) to <b>advertising@yiffer.xyz</b> on PayPal, or use the quick link at <a href="https://www.paypal.com/paypalme/yifferadvertising">paypal.me/yifferadvertising</a>. <b>Remember to include your ad's ID in the PayPal message field</b>. You can find detailed instructions at <a href="https://yiffer.xyz/ads-dashboard">https://yiffer.xyz/ads-dashboard</a>.
            <br/><br/>
            Regards,<br/>
            Yiffer.xyz`
          )
        }
        else if (status === adStatuses.needsCorrection) {
          await sendEmail(
            'advertising',
            user.email,
            'Ad needs correction - Yiffer.xyz',
            `Your advertisement with ID <b>${adId}</b> is not accepted in its submitted state. Here are the notes from an administrator to help you fix this:<br/><br/>
            <i>${correctionNote}</i>
            <br/><br/>
            You can make the required changes to your ad at <a href="https://yiffer.xyz/ads-dashboard">https://yiffer.xyz/ads-dashboard</a>.
            <br/><br/>
            Regards,<br/>
            Yiffer.xyz`
          )
        }
      }
      
      res.json({success: true, ad: updatedAd})
    }
    catch (err) {
      return this.returnApiError(res, err)
    }
  }

  async deleteOrDeactivateAd (req, res) {
    try {
      let adId = req.params.adId
      let user = await this.getUser(req)
      let ad = (await this.getAdsBase(req, res, 'WHERE advertisement.Id=?', [adId], true))[0]

      if (ad.userId !== user.id) {
        return this.returnApiError(res, new ApiError('You do not own this ad', 401))
      }

      let isDelete = [adStatuses.pending, adStatuses.needsCorrection, adStatuses.awaitingPayment].includes(ad.status)
      let canDeactivate = [adStatuses.active, adStatuses.activeButPending, adStatuses.activeNeedsCorrection].includes(ad.status)
      let query
      if (isDelete) {
        query = 'DELETE FROM advertisement WHERE advertisement.Id = ?'
      }
      else if (canDeactivate) {
        query = `UPDATE advertisement SET Status = 'ENDED' WHERE advertisement.Id = ?`
      }
      else {
        return this.returnApiError(res, new ApiError('You cannot deactivate nor delete this ad', 400))
      }

      await this.databaseFacade.execute(query, [adId], 'Error updating ad in database')
      res.status(204).end()
    }
    catch (err) {
      return this.returnApiError(res, err)
    }
  }

  async updateAdUser (req, res) {
    try {
      let [adId, file1, file2, adName, link, mainText, secondaryText] = 
        [req.params.adId, req.file1, req.file2, req.body.adName, req.body.link, req.body.mainText, req.body.secondaryText, req.file]

      let existingAd = await this.getAdById(req, res, adId)
      if (!existingAd) {
        return this.returnApiError(res, new ApiError('Ad id not found', 404))
      }

      let user = this.getUser(req)
      if (existingAd.userId !== user.id) {
        return this.returnApiError(res, new ApiError('You do not own this ad', 401))
      }

      let {isValid, error} = this.checkUpdateValidity(file1, file2, existingAd.adType, adName, link, mainText, secondaryText, existingAd.filetype)
      if (!isValid) { return res.json({error: error}) }
    
      if (existingAd.adType === 'card') {
        if (file1) {
          let newFilenameBig = `${adId}-big.${existingAd.filetype}`
          await FileSystemFacade.writeGooglePaidImageFile(file1.path, newFilenameBig)
        }
        if (file2) {
          let newFilenameSmall = `${adId}-small.${existingAd.filetype}`
          await FileSystemFacade.writeGooglePaidImageFile(file2.path, newFilenameSmall)
        }
      }
      else {
        if (file1) {
          let newFilename = `${adId}.${existingAd.filetype}`
          await FileSystemFacade.writeGooglePaidImageFile(file1.path, newFilename)
        }
      }
      
      let newStatus
      if ([adStatuses.needsCorrection, adStatuses.pending, adStatuses.ended, adStatuses.awaitingPayment].includes(existingAd.status)) {
        newStatus = adStatuses.pending
      }
      if ([adStatuses.active, adStatuses.activeButPending, adStatuses.activeNeedsCorrection].includes(existingAd)) {
        newStatus = adStatuses.activeButPending
      }
      
      let query, queryParams
      query = 'UPDATE advertisement SET Status=?, AdName=?, Link=?, MainText=?, SecondaryText=? WHERE Id=?'
      queryParams = [newStatus, adName, link, mainText, secondaryText, adId]

      await this.databaseFacade.execute(query, queryParams, 'Error updating ad')

      let updatedAd = await this.getAdById(req, res, adId)
      res.json({success: true, ad: updatedAd})
    }
    catch (err) {
      return this.returnApiError(res, err)
    }
  }

  async logAdClick (req, res) {
    res.status(204).end()

    let adId = req.body.adId
    try {
      let queryClicks = 'UPDATE advertisement SET Clicks = Clicks + 1 WHERE Id = ?'
      await this.databaseFacade.execute(queryClicks, [adId], 'Error logging ad click')

      const today = (new Date()).toISOString().substr(0, 10)
      let queryDayClicks = 'INSERT INTO advertisementdayclick (AdId, Date, Clicks) VALUES (?, ?, 1) ON DUPLICATE KEY UPDATE Clicks = Clicks + 1'
      let queryDayClicksParams = [adId, today]
      await this.databaseFacade.execute(queryDayClicks, queryDayClicksParams, 'Error logging ad click')
    }
		catch (err) {
      console.error('Error updating ad clicks: ', err)
		}
  }

  async getAdById (req, res, adId) {
    let ad = await this.getAdsBase(req, res, 'WHERE advertisement.Id=?', [adId], true)
    if (ad.length === 0) {
      return false
    }
    return ad[0]
  }

  async generateAdId () {
    let allIdsQuery = 'SELECT id FROM advertisement'
    let ids = await this.databaseFacade.execute(allIdsQuery, null, 'Error fetching ad IDs')

    let isIdNew = false
    let newId
    while (!isIdNew) {
      newId = makeId(6)
      let doesIdExist = [...ids].includes(newId)
      isIdNew = ids.length===0 || !doesIdExist
    }

    return newId
  }
}

const adTypes = ['card', 'banner']

const adStatuses = {
  pending: 'PENDING',
  needsCorrection: 'NEEDS CORRECTION',
  awaitingPayment: 'AWAITING PAYMENT',
  active: 'ACTIVE',
  activeButPending: 'ACTIVE BUT PENDING',
  activeNeedsCorrection: 'ACTIVE BUT NEEDS CORR.',
  ended: 'ENDED',
  cancelled: 'CANCELLED',
}

function makeId (length) {
  var result           = ''
  var characters       = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  var charactersLength = characters.length
  for (let i = 0; i < length; i++) {
     result += characters.charAt(Math.floor(Math.random() * charactersLength))
  }
  return result
}
