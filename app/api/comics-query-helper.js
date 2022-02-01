import { ApiError } from './baseRouter.js'

export async function getComics(databaseFacade, userId, limit, offset, categories, tags, keywordIds, search, order, artistId) {
  let [
    filterQueryString,
    filterQueryParams,
    keywordCountString,
    innerJoinKeywordString
  ] = getFilterQuery(categories, tags, keywordIds, search, artistId)

  order = order || 'updated'
  if (!['updated', 'userRating', 'yourRating'].includes(order)) {
    throw new ApiError('Invalid order by', 400)
  }
  let orderQueryString = `ORDER BY ${order} DESC`

  let paginationQueryString = ''
  if (limit) {
    paginationQueryString += ' LIMIT ? '
  }
  if (offset) {
    paginationQueryString += ' OFFSET ? '
  }

  let comicVoteQuery = `
    LEFT JOIN (
      SELECT ComicId, Vote AS YourVote 
      FROM comicvote 
      WHERE UserId = ?
    ) AS VoteQuery ON (comic.Id = VoteQuery.ComicId) 
  `

  let innerComicQuery = `
    SELECT 
      comic.Id AS Id, comic.Name AS Name, comic.Cat AS Cat, comic.Tag AS Tag, artist.Name AS Artist, comic.Updated AS updated, comic.State AS State, comic.Created AS Created, comic.NumberOfPages AS NumberOfPages
      ${userId ? ', VoteQuery.YourVote AS yourRating' : ''}
    FROM comic 
    ${innerJoinKeywordString}
    INNER JOIN artist ON (artist.Id = comic.Artist) 
    ${userId ? comicVoteQuery : ''} 
    ${filterQueryString}
    GROUP BY comic.Name, comic.Id 
    ${keywordCountString} 
    ${order === 'userRating' ? '' : orderQueryString + paginationQueryString} 
  `

  let queryParams = []

  if (userId) { queryParams = [userId] }
  queryParams.push(...filterQueryParams)

  if (limit) {
    queryParams.push(limit)
  }
  if (offset) {
    queryParams.push(offset)
  }

  let query = `
    SELECT cc.Id AS id, cc.Name AS name, cc.Cat AS cat, cc.Tag AS tag, cc.Artist AS artist, 
    cc.updated AS updated, cc.State AS state, cc.Created AS created, cc.NumberOfPages AS numberOfPages, AVG(comicvote.Vote) AS userRating, 
    ${userId ? 'cc.yourRating AS yourRating' : '0 AS yourRating'}
    FROM (
      ${innerComicQuery}
    ) AS cc 
    LEFT JOIN comicvote ON (cc.Id = comicvote.ComicId) 
    GROUP BY name, id 
    ${order === 'userRating' ? orderQueryString + paginationQueryString : ''} 
  `

  return databaseFacade.execute(query, queryParams, 'Get comics (query helper)')
}

export function getFilterQuery(categories, tags, keywordIds, search, artistId) {
  let filterQueryString = ''
  let filterQueryParams = []
  let innerJoinKeywordString = ''
  let keywordCountString = ''

  if (categories || tags || search || keywordIds || artistId) {
    let queries = []

    if (keywordIds) {
      keywordCountString = `HAVING COUNT(*) >= ${keywordIds.length}`
      let keywordQueryStrings = []
      keywordIds.forEach(kwId => {
        filterQueryParams.push(kwId)
        keywordQueryStrings.push(' comickeyword.KeywordId=? ')
      })
      queries.push(`(${keywordQueryStrings.join('OR')})`)
      innerJoinKeywordString = 'INNER JOIN comickeyword ON (comic.Id = comickeyword.ComicId)'
    }

    if (categories) {
      let categoryStrings = []
      categories.forEach(category => {
        filterQueryParams.push(category)
        categoryStrings.push(' Cat = ? ')
      })
      queries.push(`(${categoryStrings.join('OR')})`)
    }

    if (tags) {
      let tagStrings = []
      tags.forEach(tag => {
        filterQueryParams.push(tag)
        tagStrings.push(' Tag = ? ')
      })
      queries.push(`(${tagStrings.join('OR')})`)
    }

    if (search) {
      queries.push('(comic.Name LIKE ? OR artist.Name LIKE ?)')
      filterQueryParams.push(`%${search}%`, `%${search}%`)
    }

    if (artistId) {
      queries.push('(comic.Artist = ?)')
      filterQueryParams.push(artistId)
    }

    filterQueryString = 'WHERE ' + queries.join(' AND ')
  }

  return [filterQueryString, filterQueryParams, keywordCountString, innerJoinKeywordString]
}