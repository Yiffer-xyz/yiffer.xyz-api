import { ApiError } from './baseRouter.js'
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
		this.app.post('/api/blogs', this.authorizeAdmin.bind(this), (req, res) => this.addNewBlog(req, res))
  }
  
  async getCurrentBlog (req, res) {
    try {
      let newestBlogQuery = 'SELECT Title, Id, IsImportant, Displaydays, Timestamp FROM blog ORDER BY Timestamp DESC LIMIT 1'
      let returnedBlog = { shouldDisplay: false }

      let newestBlog = await this.databaseFacade.execute(newestBlogQuery, null, 'Error fetching newest blog from database')
      if (newestBlog.length === 1) {
        newestBlog = newestBlog[0]
        if (newestBlog.Displaydays) {
          let daysSinceBlog = differenceInDays(new Date(), new Date(newestBlog.Timestamp))
          if (daysSinceBlog <= newestBlog.Displaydays) {
            returnedBlog = { 
              shouldDisplay: true,
              title: newestBlog.Title,
              id: newestBlog.Id,
              isImportant: newestBlog.IsImportant
            }
          }
        }
      }

      res.json(returnedBlog)
    }
    catch (err) {
			return this.returnApiError(res, err)
    }
  }
  
  async getAllBlogs (req, res) {
    try {
      let query = 'SELECT blog.Id AS id, Title AS title, Username AS author, IsImportant AS isImportant, Content AS content, Timestamp AS timestamp FROM blog INNER JOIN user ON (blog.Author=user.Id) ORDER BY Timestamp DESC'
      let blogs = await this.databaseFacade.execute(query, null, 'Error retrieving blogs from database')
      res.json(blogs)
    }
    catch (err) {
			return this.returnApiError(res, err)
    }
  }
  
  async addNewBlog (req, res) {
    try {
      let [title, userId, isImportant, content, displayDays] = 
      [req.body.title, req.session.user.id, req.body.isImportant, req.body.content, req.body.displayDays]

      let query = 'INSERT INTO blog (Title, Author, IsImportant, Content, Displaydays) VALUES (?, ?, ?, ?, ?)'
      let queryParams = [title, userId, isImportant, content, displayDays]

      await this.databaseFacade.execute(query, queryParams, 'Error adding blog to database')
      res.json({success: true})
    }
    catch (err) {
			return this.returnApiError(res, err)
    }
  }
}