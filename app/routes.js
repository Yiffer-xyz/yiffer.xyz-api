import ModLogger from './mod-logger.js'

import ComicsRouter from './api/comics-router.js'
import UserRouter from './api/user-router.js'
import ArtistRouter from './api/artist-router.js'
import MiscRouter from './api/misc-router.js'
import AuthRouter from './api/auth-router.js'
import KeywordsRouter from './api/keywords-router.js'
import BlogRouter from './api/blog-router.js'
import AdvertisingRouter from './api/advertising-router.js'
import PatreonRouter from './api/patreon-router.js'

import crypto from 'crypto'
import fs from 'fs'
import jwt from 'jsonwebtoken'

export default function (app, databaseFacade, config) {
  let rawPublicKey = fs.readFileSync(`${config.publicJwtKeyPath}`, 'utf-8')
  let publicKey = crypto.createPublicKey(rawPublicKey)
  let tokenPublicKey = publicKey

  app.use(async (req, res, next) => {
    let userData = await getCookieToken(req, tokenPublicKey, config.tokenConfig)
    req.userData = userData
    next()
  })

  const modLogger = new ModLogger(app, databaseFacade)
  new ComicsRouter(app, databaseFacade, config, modLogger)
  new MiscRouter(app, databaseFacade, config, modLogger)
  new KeywordsRouter(app, databaseFacade, config, modLogger)
  const authRouter = new AuthRouter(app, databaseFacade, config)
  new ArtistRouter(app, databaseFacade, config, modLogger)
  new UserRouter(app, databaseFacade, config, modLogger)
  new BlogRouter(app, databaseFacade)
  new AdvertisingRouter(app, databaseFacade, config)
  new PatreonRouter(app, databaseFacade, config, authRouter)
}

async function getCookieToken(req, publicKey, tokenConfig) {
  if (!req.cookies) {
    return null
  }

  let yifferCookie = req.cookies[tokenConfig.cookieName]
  if (!yifferCookie) {
    return null
  }

  try {
    let yifferToken = await verifyToken(yifferCookie, publicKey, tokenConfig)
    return yifferToken
  }
  catch (err) {
    return null
  }
}

async function verifyToken(token, publicKey, tokenConfig) {
  let tokenOptions = {
    algorithms: [tokenConfig.algorithm]
  }

  return new Promise((resolve) => {
    jwt.verify(token, publicKey, tokenOptions, (err, body) => {
      if (err) {
        console.log('Token verifying error: ', err)
        resolve(null)
      }
      resolve(body)
    })
  })
}