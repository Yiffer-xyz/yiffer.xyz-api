import BaseRouter from './baseRouter.js'

import multer from 'multer'
import FileSystemFacade from '../fileSystemFacade.js'
var storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads')
  },
  filename: function (req, file, cb) {
    cb(null, file.fieldname + '-' + Date.now())
  }
})
var upload = multer({ storage: storage })

import { dirname } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));

export default class AdvertisingRouter extends BaseRouter {
  constructor (app, databaseFacade) {
		super(app, databaseFacade)
		this.setupRoutes()
  }
  
  setupRoutes () {
    this.app.get ('/api/advertisements', (req, res) => this.getAllAds(req, res))
    this.app.get ('/api/advertisements/pending', (req, res) => this.getPendingAds(req, res))
    this.app.get ('/api/advertisements/awaiting-payment', (req, res) => this.getAdsInNeedOfPayment(req, res))
    this.app.get ('/api/advertisements/active-soon', (req, res) => this.getActiveSoonAds(req, res))
    this.app.get ('/api/advertisements/active', (req, res) => this.getActiveAds(req, res))
    this.app.get ('/api/advertisements/user/:userid', (req, res) => this.getAdsByUserId(req, res))
    this.app.post('/api/advertisements', upload.single('file'), (req, res) => this.createApplication(req, res))
    this.app.post('/api/advertisements/:adId/toggle-renew', (req, res) => this.toggleAdRenewal(req, res))
  }

  async createApplication (req, res) {
    let [file, adType, adLink, adMainText, adSecondaryText, notes, user] = 
      [req.file, req.body.adType, req.body.adLink, req.body.adMainText, req.body.adSecondaryText, req.body.notes, this.getUser(req)]
    
    let {isValid, error} = this.checkApplicationValidity(file, adType, adLink, adMainText, adSecondaryText, notes)
    if (!isValid) { return res.json({error: error}) }

    let filetype = file.originalname.substring(file.originalname.length-3)

    try {
      let adId = await this.generateAdId()
      let price = getPrice(adType)
      let query = 'INSERT INTO advertisement (id, adtype, filetype, userid, price, advertisernotes) VALUES (?, ?, ?, ?, ?, ?)'
      let queryParams = [adId, adType, filetype, user.id, price, notes]

      await this.databaseFacade.execute(query, queryParams, 'Error adding application to database')

      let newFilePath = __dirname + `/../../../client/public/paid-images/${adId}.${filetype}`
			let fileData = await FileSystemFacade.readFile(file.path, 'Error parsing uploaded file')
      await FileSystemFacade.writeFile(newFilePath, fileData, 'Error writing file to disk')

      res.json({success: true})
    }
		catch (err) {
      return this.returnError(err.message, res, err.error, err)
    }
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

  checkApplicationValidity (file, adType, adLink, adMainText, adSecondaryText, notes) {
    if (!file) {
      return {isValid: false, error: 'file missing'}
    }
    if (!file.originalname.endsWith('jpg') && !file.originalname.endsWith('png') && !file.originalname.endsWith('gif')) {
      return {isValid: false, error: 'Invalid file format (must be jpg/png/gif)'}
    }
    if (!adTypes.includes(adType) || !adLink) {
      return {isValid: false, error: 'missing fields'}
    }
    if (notes && notes.length > 255) {
      return {isValid: false, error: 'notes too long (max 255)'}
    }
    if (adType.includes('card')) {
      if (!adMainText) {
        return {isValid: false, error: 'missing fields'}
      }
      if (adMainText.length > 25 || (adSecondaryText && adSecondaryText.length > 40)) {
        return {isValid: false, error: 'text too long'}
      }
    }

    return {isValid: true}
  }

  async getAdsBase (req, res, whereStatement, whereParams, isAdminRequest) {
    try {
      let query = `SELECT id, adtype AS adType, userid AS userId, isapproved AS isApproved, approveddate AS approvedDate, needscorrection AS needsCorrection, filetype, ispaid AS isPaid, price, isactive AS isActive, activationdate AS activationDate, deactivationdate AS deactivationDate, renew, applicationdate AS applicationDate, advertisernotes AS advertisreNotes, clicks ${isAdminRequest ? ', adminnotes AS adminNotes' : ''} FROM advertisement ${whereStatement} ORDER BY applicationdate DESC`
      let results = await this.databaseFacade.execute(query, whereParams, 'Error fetching ads')

      for (let result of results) {
        result.adTypeLong = getLongAdType(result.adType)
        result.status = getAdStatus(result)
      }

      return results
    }
		catch (err) {
      return this.returnError(err.message, res, err.error, err)
		}
  }

  async getAdsByUserId (req, res) {
    let results = await this.getAdsBase(req, res, 'WHERE userid=?', [req.params.userid], false)
    res.json(results)
  }

  async getAllAds (req, res) {
    let results = await this.getAdsBase(req, res, '', null, true)
    res.json(results)
  }

  async getPendingAds (req, res) {
    let results = await this.getAdsBase(req, res, 'WHERE isapproved=0', null, true)
    res.json(results)
  }

  async getAdsInNeedOfPayment (req, res) {
    let results = await this.getAdsBase(req, res, 'WHERE (isapproved=1 AND isactive=0 AND ispaid=0) OR (isactive=1 AND renew=1 AND paid=0)', null, true)
    res.json(results)
  }

  async getActiveSoonAds (req, res) {
    let results = await this.getAdsBase(req, res, 'WHERE (isapproved=1 AND isactive=0 AND ispaid=1) OR (isactive=1 AND renew=1 AND paid=1)', null, true)
    res.json(results)
  }

  async getActiveAds (req, res) {
    let results = await this.getAdsBase(req, res, 'WHERE isactive=1', null, false)
    res.json(results)
  }

  async getAdById (req, res, adId) {
    let ad = await this.getAdsBase(req, res, 'WHERE id=?', [adId], true)
    return ad[0]
  }

  async toggleAdRenewal (req, res) {
    let [adId, shouldRenew] = [req.params.adId, req.body.shouldRenew]

    try {
      let ad = await this.getAdById(adId)
      let query

      if (ad.status === 'ACTIVE' && shouldRenew) {
        query = 'UPDATE advertisement SET renew=1, ispaid=0 WHERE id=?'
      }
      else if (ad.status === 'ACTIVE, AWAITING RENEWAL PAYMENT' && !shouldRenew) {
        query = 'UPDATE advertisement SET renew=0, ispaid=1 WHERE id=?'
      }
      else {
			  return this.returnError('Illegal action', res, null, null)
      }

      await this.databaseFacade.execute(query, [adId], 'Error updating ad')

      ad = await this.getAdById(adId)

      res.json({success: true, ad: ad})
    }
		catch (err) {
      return this.returnError(err.message, res, err.error, err)
		}
  }
}

const adTypes = ['card2M', 'card4M', 'banner1M']

function makeId (length) {
  var result           = ''
  var characters       = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  var charactersLength = characters.length
  for (let i = 0; i < length; i++) {
     result += characters.charAt(Math.floor(Math.random() * charactersLength))
  }
  return result
}

function getPrice (adType) {
  if (adType === 'card2M') { return 20 }
  if (adType === 'card4M') { return 30 }
  if (adType === 'banner1M') { return 17}
}

function getLongAdType (adType) {
  if (adType === 'card2M') { return 'Card, 2 months' }
  if (adType === 'card4M') { return 'Card, 4 months' }
  if (adType === 'banner1M') { return 'Wide, 1 month' }
}

function getAdStatus (ad) {
  if (!ad.isApproved) {
    return 'PENDING'
  }
  if (ad.needsCorrection && ad.isApproved) {
    return 'NEEDS CORRECTION'
  }
  if (ad.isApproved && !ad.isActive && !ad.isPaid) {
    return 'AWAITING PAYMENT'
  }
  if (ad.isApproved && !ad.isActive && ad.isPaid) {
    return 'ACTIVE SOON'
  }
  if (ad.isActive && !ad.renew) {
    return 'ACTIVE'
  }
  if (ad.isActive && ad.renew && !ad.isPaid) {
    return 'ACTIVE, AWAITING RENEWAL PAYMENT'
  }
  if (ad.isActive && ad.renew && ad.isPaid) {
    return 'ACTIVE, RENEWAL PAID'
  }
  else {
    return `CAN'T RESOLVE, ERROR`
  }
}
