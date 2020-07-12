import BaseRouter from './baseRouter.js'

import dateFns from 'date-fns'
const { differenceInDays } = dateFns

export default class MiscRouter extends BaseRouter {
	constructor (app, databaseFacade) {
		super(app, databaseFacade)
		this.setupRoutes()
	}

	setupRoutes () {
		this.app.get('/api/blogs/current', (req, res) => this.getCurrentBlog(req, res))
		this.app.get('/api/blogs', (req, res) => this.getAllBlogs(req, res))
		this.app.post('/api/blogs', (req, res) => this.addNewBlog(req, res))
  }
  
  async getCurrentBlog (req, res) {
    let newestBlogQuery = 'SELECT Title, Importance, Displaydays, Timestamp FROM blog ORDER BY Timestamp DESC LIMIT 1'
    let returnedBlog = { shouldDisplay: false }

    try {
      let newestBlog = await this.databaseFacade.execute(newestBlogQuery, null, 'Error fetching newest blog')
      if (newestBlog.length === 1) {
        newestBlog = newestBlog[0]
        if (newestBlog.Displaydays) {
          let daysSinceBlog = differenceInDays(new Date(newestBlog.Timestamp))
          if (daysSinceBlog <= newestBlog.Displaydays) {
            returnedBlog = { 
              shouldDisplay: true,
              title: newestBlog.Title,
              importance: newestBlog.Importance
            }
          }
        }
      }
    }
    catch (err) {
			return this.returnError(err.message, res, err.error)
    }

    res.json(returnedBlog)
  }
  
  async getAllBlogs (req, res) {
    let query = 'SELECT Title AS title, Username AS author, Importance AS importance, Content AS content, Timestamp AS timestamp FROM blog INNER JOIN user ON (blog.Author=user.Id) ORDER BY Timestamp DESC'

    try {
      let blogs = await this.databaseFacade.query(query, null, 'Error retrieving blogs')
      res.json(blogs)
    }
    catch (err) {
			return this.returnError(err.message, res, err.error)
    }
  }
  
  async addNewBlog (req, res) {
    let [title, userId, importance, content, displayDays] = [req.body.title, req.session.user.id, req.body.importance, req.body.content, req.body.displayDays]

    let query = 'INSERT INTO blog (Title, Author, Importance, Content, Displaydays) VALUES (?, ?, ?, ?, ?)'
    let queryParams = [title, userId, importance, content, displayDays]

    try {
      await this.databaseFacade.execute(query, queryParams, 'Error adding blog to database')
      res.json({success: true})
    }
    catch (err) {
			return this.returnError(err.message, res, err.error, err)
    }
  }
}