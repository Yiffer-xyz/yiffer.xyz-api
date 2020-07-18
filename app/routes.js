import ModLogger from './mod-logger.js'

import ComicsRouter from './api/comics-router.js'
import UserRouter from './api/user-router.js'
import ArtistRouter from './api/artist-router.js'
import MiscRouter from './api/misc-router.js'
import AuthRouter from './api/auth-router.js'
import KeywordsRouter from './api/keywords-router.js'
import BlogRouter from './api/blog-router.js'

export default function (app, databaseFacade) {
  const modLogger = new ModLogger(app, databaseFacade)
  new ComicsRouter(app, databaseFacade, modLogger)
  new MiscRouter(app, databaseFacade, modLogger)
  new KeywordsRouter(app, databaseFacade, modLogger)
  new AuthRouter(app, databaseFacade)
  new ArtistRouter(app, databaseFacade, modLogger)
  new UserRouter(app, databaseFacade, modLogger)
  new BlogRouter(app, databaseFacade)
  // app.get('*', function (req, res) {
    //   res.sendFile('views/index.html', {root: './public'})
    // })
    
}