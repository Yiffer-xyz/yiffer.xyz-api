let KeywordsRouter = require('../api/keywords-router')
let DatabaseFacade = require('../databaseFacade')

function createRouter () {
  let appMock = {
    get () {},
    post () {}
  }
  let databaseFacadeMock = new DatabaseFacadeMock()
  let router = new KeywordsRouter(appMock, databaseFacadeMock)
  return router 
}

class ResMock {
  constructor () {
    this.sentResult = undefined
  }
  json (value) {
    this.sentResult = value
  }
}

class DatabaseFacadeMock {
  constructor () {
    this.queries = []
  }
  async execute (query, queryParams) {
    this.queries.push({query: query, params: queryParams})
  }
}

test('getAllKeywords returns correct value', async () => {
  let router = createRouter()
  let res = new ResMock()
  router.databaseFacade.execute = () => [
    {keyword: 'a', count: 3},
    {keyword: 'b', count: 4},
  ]
  await router.getAllKeywords(null, res)
  expect(res.sentResult).toBeDefined()
  expect(res.sentResult).toHaveLength(2)
  expect(res.sentResult[0]).toHaveProperty('keyword', 'a')
  expect(res.sentResult[0]).toHaveProperty('count', 3)
})

test('removeKeywordsFromComic query string correct', async () => {
  let router = createRouter()
  let res = new ResMock()
  let req = {body: {comicId: 1, keywords: ['a', 'b']}}
  let expectedQuery = 'DELETE FROM ComicKeyword WHERE (ComicId, Keyword) IN ((?, ?), (?, ?))'
  let expectedParams = [1, 'a', 1, 'b']
  await router.removeKeywordsFromComic(req, res)
  expect(res.sentResult).toHaveProperty('success', true)
  expect(router.databaseFacade.queries[0].query).toBe(expectedQuery)
  expect(router.databaseFacade.queries[0].params).toEqual(expect.arrayContaining(expectedParams))
})

test('addKeywordsToComic query string correct', async () => {
  let router = createRouter()
  let res = new ResMock()
  let req = {body: {comicId: 1, keywords: ['a', 'b']}}
  let expectedQuery = 'INSERT INTO ComicKeyword (ComicId, Keyword) VALUES (?, ?), (?, ?)'
  let expectedParams = [1, 'a', 1, 'b']
  await router.addKeywordsToComic(req, res)
  expect(res.sentResult).toHaveProperty('success', true)
  expect(router.databaseFacade.queries[0].query).toBe(expectedQuery)
  expect(router.databaseFacade.queries[0].params).toEqual(expect.arrayContaining(expectedParams))
})

