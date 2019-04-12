let ComicsRouter = require('../api/comics-router')

function createRouter () {
  let appMock = {
    get () {},
    post () {}
  }
  let databaseFacadeMock = new DatabaseFacadeMock()
  let router = new ComicsRouter(appMock, databaseFacadeMock)
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

test('getComicList returns correct format', async () => {
  let [router, res] = [createRouter(), new ResMock()]
  let req = {}
  router.databaseFacade.execute = () => [
    {"id":2,"name":"Breeder Season","cat":"MM","tag":"Furry","artist":"Tokifuji","updated":"2018-12-29T23:00:00.000Z","created":"2017-06-30T22:00:00.000Z","finished":1,"numberOfPages":10,"userRating":null,"yourRating":null,"keywords":null},
    {"id":3,"name":"Farm Boy","cat":"M","tag":"Furry","artist":"Fasttrack37d","updated":"2018-12-29T23:00:00.000Z","created":"2017-06-30T22:00:00.000Z","finished":1,"numberOfPages":13,"userRating":null,"yourRating":null,"keywords":"tag 1,tag2"}
  ]
  await router.getComicList(req, res)
  expect(res.sentResult.find(r => r.id==2).keywords).toEqual([])
  expect(res.sentResult.find(r => r.id==3).keywords).toEqual(expect.arrayContaining(['tag 1', 'tag2']))
})

test('getComicByName not found returns correctly', async () => {
  let [router, res] = [createRouter(), new ResMock()]
  let req = {params: 'some name'}
  router.databaseFacade.execute = () => []
  await router.getComicByName(req, res)
  expect(res.sentResult).toHaveProperty('error')
})

test('getComicByName returns correct format', async () => {
  let [router, res] = [createRouter(), new ResMock()]
  let req = {params: 'some name'}
  router.databaseFacade.execute = () => [
    {"id":3,"name":"Farm Boy","cat":"M","tag":"Furry","artist":"Fasttrack37d","updated":"2018-12-29T23:00:00.000Z","created":"2017-06-30T22:00:00.000Z","finished":1,"numberOfPages":13,"userRating":null,"yourRating":null,"keywords":"tag 1,tag2"}
  ]
  await router.getComicByName(req, res)
  expect(res.sentResult.keywords).toEqual(expect.arrayContaining(['tag 1', 'tag2']))
})
