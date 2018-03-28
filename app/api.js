var express = require('express')
var app = express()
var fs = require('fs')
var multiparty = require('connect-multiparty')
var multipartyMiddelware = multiparty()
 
var mysql = require('mysql')
var mysqlSettings = require('../config/db-config.json')
var mysqlPool = mysql.createPool(mysqlSettings)

var authorizedUsers = require('../config/autorized-users.json')

var PythonShell = require('python-shell')

var archiver = require('archiver')

function authorizeAdmin (req) {
  if (!req.session || !req.session.user) { return false }
  if (authorizedUsers.admins.indexOf(req.session.user.username) === -1) { return false }
  return true
}
function authorizeMod (req) {
  if (!req.session || !req.session.user) { return false }
  if (authorizedUsers.mods.indexOf(req.session.user.username) === -1) { return false }
  return true
}


module.exports = app.get('/submitSurvey', function (req, res) {
  var sending = req.query
  console.log(req.query)
  if (!req.session || !req.session.user) return res.end('YOU MUST LOG IN!')

  sending['username'] = req.session.user.username
  fs.readFile(__dirname + '/../public/surveyData.json', function (err, data) {
    data = JSON.parse(data)
    data.push(sending)

    fs.writeFile(__dirname + '/../public/surveyData.json', JSON.stringify(data), function (err, data) {
      if (err) {
        console.log(err)
        throw err
      }
      res.end('THANK YOU!')
    })
  })
})

module.exports = app.post('/suggestComic', function (req, res) {
  var comicName = req.body.comicName
  var urll = req.body.urll
  var other = req.body.other

  if (!comicName || other.length > 400) {
    return res.end('NO')
  }
  fs.readFile('app/suggestions.json', function (err, data) {
    if (err) {
      console.log(err)
      res.end('Some error :(')
      throw err
    }
    var suggs = JSON.parse(data)
    suggs.push({
      comicName: comicName,
      urll: urll,
      other: other
    })
    fs.writeFile('app/suggestions.json', JSON.stringify(suggs), function (err) {
      if (err) {
        console.log(err)
        throw err
      }
      res.end('OK')
    })
  })
})


app.get('/getComicNumberOfImages', function (req, res) {
  fs.readdir(__dirname + '/../public/comics/' + req.query.comicName, function (err, files) {
    if (err) {
      return console.log(err)
    }
    res.json({numberOfImages: files.length - 1})
  })
})


app.get('/getOneComicTags', function (req, res) {
  var comicName = req.query.comicName

  var query = 'SELECT Keyword FROM ComicKeyword INNER JOIN Comic ON (Id = ComicId) WHERE Comic.Name = ?'

  mysqlPool.getConnection(function (err, connection) {
    connection.query(query, [comicName], function (err2, results, fields) {
      if (err2) {
        res.end('Some database error (F92), ask main mod')
        return connection.release()
      }
      var comicKeywordsAsList = []

      for (var keyword of results) {
        comicKeywordsAsList.push(keyword.Keyword)
      }

      res.json(comicKeywordsAsList)
      connection.release()
    })
  })
})


app.post('/addLog', function (req, res) {
  var urll = req.body.path
  var user = req.body.username
  var query
  var dailyCookie = req.body.dailyCookie
  var monthlyCookie = req.body.monthlyCookie

  if (user) {
    query = 'INSERT INTO Log (User, Url, DailyCookie, MonthlyCookie) VALUES (?, ?, ?, ?)'
    mysqlPool.getConnection(function (err, connection) {
      connection.query(query, [user, urll, dailyCookie, monthlyCookie], function (err, results, fields) {
        if (err) {return returnError(500, 'Database query error', res, connection, err)}
        connection.release()
        res.end('ok')
      })
    })
  }
  else {
    query = 'INSERT INTO Log (Url, DailyCookie, MonthlyCookie) VALUES (?, ?, ?)'
    mysqlPool.getConnection(function (err, connection) {
      connection.query(query, [urll, dailyCookie, monthlyCookie], function (err, results, fields) {
        if (err) {return returnError(500, 'Database query error', res, connection, err)}
        connection.release()
        res.end('ok')
      })
    })
  }

  logNode(req, urll)
})


app.get('/getModNames', function (req, res) {
  fs.readdir(__dirname + '/../public/mod-favorites', function (err, files) {
    res.json(files)
  })
})


app.get('/getModFavImageByArtistName', function (req, res) {
  var artistName = req.query.artistName
  var mod = req.query.mod

  fs.readdir(__dirname + '/../public/mod-favorites/' + mod, function (err, files) {
    if (files.indexOf(artistName + '.jpg') >= 0) {
      res.end(mod)
    }
    else {
      res.end("0")
    }
  })
})


app.get('/getFavoriteImages', function (req, res){
  if (!req.session || !req.session.user) {
    return res.json(['not logged in'])
  }

  fs.readdir(__dirname + '/../public/mod-favorites/' + req.session.user.username, function (err, files) {
    var returnList = []
    for (var f of files) {
      returnList.push(f.substr(0, f.indexOf('.jpg')))
    }
    res.json(returnList)
  })
})


module.exports = app.get('/addTagsToComic', function (req, res) {
  var comicName = req.query.comicName
  var newTags   = req.query.tags

  var idQuery = 'SELECT Id FROM Comic WHERE Name = ?'

  mysqlPool.getConnection(function (err, connection) {
    connection.query(idQuery, [comicName], function (err2, results, fields) {
      if (err2) {
        res.end('Some database error (C92), ask main mod')
        return connection.release()
      }
      if (results.length == 0) {
        res.end('No comics with that name')
        return connection.release()
      }
      var comicId = results[0].Id

      var insertQuery = 'INSERT INTO ComicKeyword (ComicId, Keyword) VALUES '
      var insertList = []
      for (var tag of newTags) {
        if (tag.toLowerCase().indexOf('drop ') >= 0) return connection.release()
        insertList.push('(' + comicId + ', \'' + tag + '\')')
      }
      insertQuery += insertList.join(',') 

      connection.query(insertQuery, function (err3, results3, fields3) {
        if (err3) {
          res.end('Some database error (C93), ask main mod')
        } else {
          res.end('ok')
        }
        connection.release()
      })
    })
  })
})


module.exports = app.post('/createTag', function (req, res) {
  var insertQuery = 'INSERT INTO Keyword (KeywordName, Description) VALUES (?, ?)'
  mysqlPool.getConnection(function (err, connection) {
    connection.query(insertQuery, [req.body.tagName, req.body.tagDescription], function (err2, results, fields) {
      if (err2) {
        res.end('Some database error (E12), ask main mod')
        return connection.release()
      }
      res.end('ok')
      connection.release()
    })
  })
})


module.exports = app.get('/comicTagsAsList', function (req, res) {
  var query = 'SELECT KeywordName FROM Keyword'
  mysqlPool.getConnection(function (err, connection) {
    connection.query(query, function (err2, results, fields) {
      if (err2) {
        res.end('Some database error (E44), ask main mod')
        return connection.release()
      }
      var keywordList = []
      for (var x of results) {
        keywordList.push(x.KeywordName)
      }
      res.json(keywordList)
      connection.release()
    })
  })
})


module.exports = app.get('/getComicRating', function (req, res) {
  var username = req.query.username
  var comicId  = req.query.comicId
  var query = 'SELECT Vote FROM ComicVote WHERE Username = ? AND ComicId = ?'

  mysqlPool.getConnection(function (err, connection) {
    connection.query(query, [username, comicId], function (err2, results, fields) {
      if (err2) return connection.release()
      if (results.length == 0)
        res.end('0')
      else
        res.end('' + results[0].Vote)
      connection.release()
    })
  })
})
 

module.exports = app.post('/addVote', function (req, res) {
  if (!req.session || !req.session.user) { return res.json({error: 'Not logged in'}) }
  var username = req.session.user.username
  var number   = parseInt(req.body.vote)
  var comicId  = req.body.comicId

  var removeQuery = 'DELETE FROM ComicVote WHERE Username = ? AND ComicId = ?'
  var insertQuery = 'INSERT INTO ComicVote (Username, ComicId, Vote) VALUES (?, ?, ?)'
  var newRatingQuery = 'SELECT AVG(Vote) AS avg FROM ComicVote WHERE ComicId = ?'

  mysqlPool.getConnection(function (err, connection) {
    connection.query(removeQuery, [username, comicId], function (err2, results, fields) {
      if (err2) {return connection.release()}

      if (number > 0) {
        connection.query(insertQuery, [username, comicId, number], function (err3, results2, fields2) {
          if (err3) {return connection.release()}

          connection.query(newRatingQuery, [comicId], function (err4, results3, fields3) {
            if (err4) {return connection.release()}
            res.json(results3[0]['avg'])
            connection.release()
          })
        })
      }
      else {
        connection.query(newRatingQuery, [comicId], function (err4, results3, fields3) {
          if (err4) {return connection.release()}
          res.json(results3[0]['avg'])
          connection.release()
        })
      }
    })
  })
})


module.exports = app.get('/addComment2', function (req, res) {
  if (!(req.session && req.session.user)) {
    return res.end('Must log in')
  }
  var text = req.query.textContent
  var comicId = parseInt(req.query.comicId)
  var username = req.session.user.username
  if (!text || text.length < 1) 
    return res.end('Text too short')

  var query = 'INSERT INTO ComicComment (ComicId, Username, CommentDate, Content) VALUES (?, ?, ?, ?)'
  var today = (new Date()).toISOString().substring(0,10)
  mysqlPool.getConnection(function (err, connection) {
    connection.query(query, [comicId, username, today, text], function (err2, results, fields) {
      if (err2) {res.json(err2.toString()); return connection.release()}
      res.json('ok')
      connection.release()
    })
  })
})


app.get('/comics', (req, res) => {
  if (req.session && req.session.user) { var query = 'SELECT T1.ComicId AS id, T1.ComicName AS name, T1.Cat AS cat, T1.Tag AS tag, T1.ArtistName AS artist, T1.Updated AS updated, T1.Created AS created, T1.Finished AS finished, T1.NumberOfPages AS numberOfPages, T1.Snitt AS userRating, T2.YourVote AS yourRating FROM ((SELECT Comic.Id AS ComicId, Comic.Name AS ComicName, Cat, Artist.Name as ArtistName, Tag, Updated, Created, Finished, NumberOfPages, AVG(Vote) AS Snitt FROM Comic INNER JOIN Artist ON (Artist.Id = Comic.Artist) LEFT JOIN ComicVote ON (Comic.Id = ComicVote.ComicId) GROUP BY Comic.Name, Comic.Id) AS T1 LEFT JOIN (SELECT ComicId, Vote AS YourVote FROM ComicVote WHERE Username = \''+req.session.user.username+'\') AS T2 ON (T1.ComicId = T2.ComicId)) ORDER BY id' }
  else { var query = 'SELECT Comic.Id AS id, Comic.Name AS name, Comic.Cat AS cat, Comic.Tag AS tag, Artist.Name AS artist, Comic.Updated AS updated, Comic.Finished AS finished, Comic.Created AS created, Comic.NumberOfPages AS numberOfPages, AVG(ComicVote.Vote) AS userRating, 0 AS yourRating FROM Comic INNER JOIN Artist ON (Artist.Id = Comic.Artist) LEFT JOIN ComicVote ON (Comic.Id = ComicVote.ComicId) GROUP BY name, id ORDER BY id' }
    
  mysqlPool.getConnection((err, connection) => {
    if (err) { return connection.release() }
    connection.query(query, (err2, results, fields) => {
      if (err2) { return connection.release() }
      res.json(results)
      connection.release()
    })
  })
})


module.exports = app.get('/getComicLinks', function (req, res) {
  var comicId = req.query.comicId
  var prevQuery = 'SELECT Name FROM ComicLink INNER JOIN Comic ON (Id = FirstComic) WHERE LastComic = ?'
  var nextQuery = 'SELECT Name FROM ComicLink INNER JOIN Comic ON (Id = LastComic) WHERE FirstComic = ?'
  var retur = {previousComic: null, nextComic: null}

  mysqlPool.getConnection(function (err, connection) {
    if (err) return connection.release()
    connection.query(prevQuery, [comicId], function (err2, results2, fields2) {
      if (err2) return connection.release()
      if (results2.length > 0) {
        retur.previousComic = results2[0].Name
      }

      connection.query(nextQuery, [comicId], function (err3, results3, fields3) {
        if (err3) return connection.release()
        if (results3.length > 0) {
          retur.nextComic = results3[0].Name
        }

        res.json(retur)
        connection.release()
      })
    })
  })
})


module.exports = app.get('/getBasicInfo2', function (req, res) {
  var comicName = req.query.comicName
  var retur = {}
  var getIdQuery = 'SELECT Id FROM Comic WHERE Name = ?'
  var comicMetadataQuery = ''
  var keywordsQuery = 'SELECT Keyword FROM ComicKeyword WHERE ComicId = ?'
  var queryParams = {}
  var commentsQuery = 'SELECT Username as author, Content as text, CommentDate as cDate FROM ComicComment WHERE ComicId = ?'

  mysqlPool.getConnection(function (err, connection) {
    if (err) return connection.release()
    // Get comic ID
    connection.query(getIdQuery, [comicName], function (err2, results, fields) {
      if (err2) {res.end('e25'); return connection.release()}
      if (results.length == 0) {  // If 404, invalid ID
        res.end('invalid name')
        return connection.release()
      }
      var comicId = results[0].Id
      if (req.session && req.session.user) {
        comicMetadataQuery = 'SELECT NumberOfPages as numberOfPages, Artist.Name as artist, Comic.Id as comicId, T1.Vote as yourRating FROM Comic LEFT JOIN (SELECT Vote, ComicId FROM ComicVote WHERE ComicId = ? AND Username = ?) AS T1 ON (Comic.Id = T1.ComicId) INNER JOIN Artist ON (Artist.Id = Comic.Artist) WHERE Comic.Id = ?'
        queryParams = [comicId, req.session.user.username, comicId]
      }
      else {
        comicMetadataQuery = 'SELECT NumberOfPages as numberOfPages, Artist.Name AS artist, Comic.Id AS comicId, NULL AS yourRating FROM Comic INNER JOIN Artist ON (Artist.Id = Comic.Artist) WHERE Comic.Id = ?'
        queryParams = [comicId]
      }

      connection.query(comicMetadataQuery, queryParams, function (err3, results2, fields2) {
        if (err3) {res.end(err3.toString()); return connection.release()}
        retur = results2[0]

        // Get comments
        connection.query(commentsQuery, [comicId], function (err4, results3, fields3) {
          if (err4) {return connection.release()}
          retur.comments = results3
          retur.comments.sort()

          connection.query(keywordsQuery, [comicId], function (err5, results4) {
            if (err5) {return connection.release()}
            retur.keywords = []
            for (var v of results4) {
              retur.keywords.push(v.Keyword)
            }

            res.json(retur)
            connection.release()
          })
        })
      })
    })
  })
})


module.exports = app.get('/comicTagsWithDescription', function (req, res) {
  var query = 'SELECT KeywordName, Description FROM Keyword'
  mysqlPool.getConnection(function (err, connection) {
    connection.query(query, function (err2, results, fields) {
      if (err2) {
        res.end('Some database error (E45), ask main mod')
        return connection.release()
      }
      var keywordDictionary = {}
      for (var x of results) {
        keywordDictionary[x.KeywordName] = x.Description
      }
      res.json(keywordDictionary)
      connection.release()
    })
  })
})


module.exports = app.get('/allComicNamesAsList', function (req, res) {
  var query = 'SELECT Name FROM Comic'
  mysqlPool.getConnection(function (err, connection) {
    connection.query(query, function (err2, results, fields) {
      if (err2) {
        res.end('Some database error (E10), ask main mod')
        return connection.release()
      }
      var comicNameList = []
      for (var x of results) {
        comicNameList.push(x.Name)
      }
      res.json(comicNameList)
      connection.release()
    })
  })
})


app.get('/getUntaggedComics', function (req, res) {
  var query = 'SELECT Name FROM Comic WHERE Name NOT IN (SELECT Name FROM Comic INNER JOIN ComicKeyword ON (ComicId=Id))'
  mysqlPool.getConnection(function (err, connection) {
    connection.query(query, function (err2, results, fields) {
      if (err2) {
        res.end('Some database error (E190), ask main mod')
        return connection.release()
      }
      var comicNameList = []
      for (var x of results) {
        comicNameList.push(x.Name)
      }
      res.json(comicNameList)
      connection.release()
    })
  })
})


app.get('/allComicNamesInFolder', function (req, res) {
  fs.readdir(__dirname + '/../public/comics', function (err, files) {
    if (err) { return res.json('error') }
    res.json(files)
  })
})


app.get('/artist', function (req, res) {
  var queryComic = 'SELECT Comic.Name FROM Comic INNER JOIN Artist ON (Artist.Id = Comic.Artist) WHERE Artist.Name = ? ORDER BY Comic.Name DESC'
  var queryLinks = 'SELECT LinkType as linkType, LinkURL as linkUrl FROM ArtistLink INNER JOIN Artist ON (Artist.Id = ArtistLink.ArtistId) WHERE Artist.Name = ?'
    
  mysqlPool.getConnection(function (err, connection) {
    if (err) {return connection.release()}
    connection.query(queryComic, [req.query.artist], function (err2, results2, fields2) {  // it's ok
      if (err2) {return connection.release()}
      if (results2.length === 0) {connection.release(); return res.end("404")}

      var retur = {comicList: [], linkList: []}
      for (var r in results2) 
        retur.comicList.push(results2[r].Name)

      retur.Additional = [results2, req.query.artist]

      connection.query(queryLinks, [req.query.artist], function (err3, results3, fields3) {  // it's ok
        if (err3) {return connection.release()}
        retur.linkList = results3
        res.json(retur)
        connection.release()
      })
    })
  })  
})


app.post('/uploadModImage', multipartyMiddelware, function (req, res) {
  if (!req.session || !req.session.user) {
    return res.end('Error (#08): You are not logged in!')
  }

  fs.readFile(req.files.file.path, function (err, data) {
    if (err) {return res.end('Error (#09): Something went wrong when accessing file. Ask main mod.')}

    var filePath = '/../public/mod-favorites/' + req.session.user.username + '/' + req.body.artistName + '.jpg'

    fs.writeFile(__dirname + filePath, data, function (err) {
      if (err) {return res.end('Error (#10): Something went wrong when trying to write the image to disc. Ask main mod.')}
      else res.end('Success!')

      var tagLogQuery = 'INSERT INTO TagLog (TagNames, ComicName, Username) VALUES (?, ?, ?)'
      mysqlPool.getConnection(function (err, connection) {
        connection.query(tagLogQuery, [req.body.artistName, '--FAVORITE IMAGE--', req.session.user.username], function (err, results) {
          if (err) { return returnError(500, 'Database query error: ' + err.toString(), res, connection, err) }
          connection.release()
        })
      })
    })
  })
})


function addImageToComic (req, res) {
  let newImageFile = req.files.file.path
  let comicName = req.body.comicName
  let query = 'UPDATE Comic SET NumberOfPages = ?, Updated = NOW() WHERE Name = ?'
  let newImageFileType = newImageFile.substring(newImageFile.length-3)
  fs.readFile(newImageFile, (err, fileData) => {
    if (err) { return returnError(500, 'Error reading the uploaded file', res, null) }
    fs.writeFile(__dirname + `/../public/comics/${comicName}/x.${newImageFileType}`, fileData, (err) => {
      if (err) { return returnError(500, 'Error rewriting the uploaded file', res, null) }

      fs.readdir(__dirname + `/../public/comics/${comicName}`, (err, files) => {
        if (err) { return returnError(500, 'Error reading comic directory', res, null) }
        let newNumberOfImages = files.length-1

        PythonShell.run('process_new_comic_page_new.py', {mode: 'text', args: [comicName, newImageFileType, newNumberOfImages], scriptPath: '/home/rag/mnet/app'}, (err, results) => {
          zipComic(comicName, false)
        })

        mysqlPool.getConnection((err, connection) => {
          connection.query(query, [newNumberOfImages, comicName], (err, rows) => {
            if (err) { return returnError(500, 'Error updating number of pages in database', res, connection, err) }
            res.status(200).json( {status: 'success'} )
            connection.release()
          })
        })
      })
    })
  })
}


function returnError (errorCode, errorMessage, res, mysqlConnection, err) {
  if (err) {console.log(err)}
  if (res) { res.json({ error: errorMessage }) }
  if (mysqlConnection) { mysqlConnection.release() }
}


app.post('/addImageToComic', multipartyMiddelware, addImageToComic)


function zipComic (comicName, isNewComic) {
  var zipFilePath = __dirname + '/../public/021njnwjfusjkfn89c23nfsnfkas/' + comicName + '.zip'
  if (!isNewComic) {
    console.log('Deleting file ' + zipFilePath)
    fs.unlinkSync(zipFilePath)
  }

  var outputStream = fs.createWriteStream(zipFilePath)
  var archive = archiver('zip', {zlib: {level: 9}})

  archive.pipe(outputStream)
  archive.directory(__dirname + '/../public/comics/'+ comicName +'/', false)
  archive.finalize()
  console.log('Zipping ' + comicName + '!')
}

////////////////////////////////////////////////////////////////
// FOR ADDING NEW COMICS
app.post('/addComic', function (req, res) {
  if (!req.session || !req.session.user) { return false }
  if (req.session.user.username != 'malann') { return res.end('I like your curiosity, but no.') }

  PythonShell.run('process_new_comic.py', {mode: 'text', args: [req.body.comicName], scriptPath: '/home/rag/mnet/app/'}, function (err, results) {
    if (err) {return res.end(err.toString())}
    var artistId    = req.body.artistId
    var comicName   = req.body.comicName
    var comicCat    = req.body.cat
    var comicTag    = req.body.tag
    var finished    = req.body.finished

    fs.readdir(__dirname + '/../public/comics/' + comicName, function (err, files) {
      if (err) {res.end('Error reading directory: ' + err.toString()); return}
      var numberOfPages = files.length - 1

      var query = 'INSERT INTO Comic (Name, Artist, Cat, Tag, NumberOfPages, Finished) VALUES (?, ?, ?, ?, ?, ?)'
      mysqlPool.getConnection(function (err, connection) {
        connection.query(query, [comicName, artistId, comicCat, comicTag, numberOfPages, finished], function (err, results, fields) {
          if (err) {res.end('Query failed: ' + err.toString()); return connection.release()}
          res.end("Success!")
          connection.release()

          zipComic(comicName, true)
        })
      })
    })
  })
})  

app.post('/addArtist', function (req, res) {
  if (!authorizeAdmin(req)) { return res.end('I like your curiosity, but no.') }

  var query = 'INSERT INTO Artist (Name) VALUES (?)'
  mysqlPool.getConnection(function (err, connection) {
    connection.query(query, [req.body.artistName], function (err, results, fields) {
      if (err) {res.end('Query failed '); return connection.release()}
      res.end(results)
      connection.release()
    })
  })
})


app.post('/addArtistLinks', function (req, res) {
  if (!authorizeAdmin(req)) { return res.end('I like your curiosity, but no.') }

  var query = 'INSERT INTO ArtistLink (LinkType, LinkURL, ArtistId) VALUES '
  for (var link of req.body.linkList) {
    query += '("' + link.linkType +'", "'+ link.linkUrl + '", ' + link.artistId + '), '
  }
  query = query.substr(0, query.length-2)

  mysqlPool.getConnection(function (err, connection) {
    connection.query(query, function (err, results, fields) {
      if (err) {res.end('Query failed'); return connection.release()}
      res.end("Success!")
      connection.release()
    })
  })
})


app.get('/getUnfinishedComics', function (req, res) {
  var query = 'SELECT Name FROM Comic WHERE Finished = 0'
  mysqlPool.getConnection(function (err, connection) {
    connection.query(query, function (err2, results, fields) {
      if (err2) {res.end('Error #L50'); return connection.release()}

      var unfinishedComics = []
      for (var x of results) {
        unfinishedComics.push(x.Name)
      }
      res.json(unfinishedComics)
      connection.release()
    })
  })
})


app.get('/allArtists', function (req, res) {
  var query = 'SELECT Name, Id FROM Artist'
  mysqlPool.getConnection(function (err, connection) {
    connection.query(query, function (err2, results, fields) {
      if (err2) {
        res.end('Error 56')
        return connection.release()
      }
      var artistList = []
      for (var x of results) {
        artistList.push({name: x.Name, id: x.Id})
      }
      res.json(artistList)
      connection.release()
    })
  })
})


app.get('/dailyStats', function (req, res) {
  // if (!authorizeAdmin(req)) { return res.json({}) }
  
  var query = 'SELECT DATE(Timestamp) AS date, COUNT(*) AS count FROM Log GROUP BY date ORDER BY date'
  mysqlPool.getConnection(function (err, connection) {
    connection.query(query, function (err2, results, fields) {
      if (err2) {return connection.release()}
      res.json(results)      
      connection.release()
    })
  })
})


app.get('/uniqueDailyStats', function (req, res) {
  // if (!authorizeAdmin(req)) { return res.json({}) }

  var query = 'SELECT Date(T1.dateTS) AS date, COUNT(*) AS count FROM (SELECT DailyCookie, Date(Timestamp) AS dateTS FROM Log WHERE Timestamp IS NOT NULL GROUP BY DailyCookie, dateTS) AS T1 GROUP BY Date(T1.dateTS) ORDER BY Date(T1.dateTS)'
  mysqlPool.getConnection(function (err, connection) {
    connection.query(query, function (err2, results, fields) {
      if (err2) {return connection.release()}
      res.json(results)      
      connection.release()
    })
  })
})


app.get('/hourStats', function (req, res) {
  if (!authorizeAdmin(req)) { return res.json({}) }

  var query = 'SELECT T1.hour AS hour, AVG(T1.count) AS count FROM (SELECT COUNT(*) AS count, HOUR(Timestamp) AS hour FROM Log GROUP BY DATE(Timestamp), hour) AS T1 GROUP BY hour'
  mysqlPool.getConnection(function (err, connection) {
    connection.query(query, function (err2, results, fields) {
      if (err2) {return connection.release()}
      res.json(results)      
      connection.release()
    })
  })
})


app.get('/weekdayStats', function (req, res) {
  if (!authorizeAdmin(req)) { return res.json({}) }

  var query = 'SELECT T1.weekday AS weekday, AVG(T1.count) AS count FROM (SELECT COUNT(*) AS count, DAYNAME(Timestamp) AS weekday FROM Log WHERE Timestamp<CURDATE() GROUP BY DAYOFYEAR(Timestamp), weekday) AS T1 GROUP BY weekday'
  mysqlPool.getConnection(function (err, connection) {
    connection.query(query, function (err2, results, fields) {
      if (err2) {return connection.release()}
      res.json(results)      
      connection.release()
    })
  })
})


app.post('/addFeedback', function (req, res) {
  if (!req.session || !req.session.user || req.body.feedback.length < 7) return res.end()

  var newContentForFile = '[[' + req.session.user.username + ']]  ' + req.body.feedback

  fs.readFile(__dirname + '/contact.txt', function (err, data) {
    var newData = data.toString() + '\n\n\n' + newContentForFile
    fs.writeFile(__dirname + '/contact.txt', newData, function (err) {
      res.end('Success!')
    })
  })
})


app.get('/getTaggingHighscores', function (req, res) {
  var query = "SELECT T1.Username AS username, count(*) AS count FROM (SELECT distinct Username, ComicName FROM TagLog WHERE ComicName NOT LIKE '%FAVORITE IMAGE%') AS T1 GROUP BY username ORDER BY count DESC"
  mysqlPool.getConnection(function (err, connection) {
    connection.query(query, function (err2, results, fields) {
      if (err2) {return connection.release()}
      res.json(results)
      connection.release()
    })
  })
})
app.get('/getModFavImageCount', function (req, res) {
  fs.readdir(__dirname + '/../public/mod-favorites/' + req.query.modName, function (err, files) {
    if (err) res.json({'modName': req.query.modName, 'count': 0})
    res.json({'modName': req.query.modName, 'count': files.length})
  })  
})


app.get('/getComicRatings', function (req, res) {
  var query = 'SELECT Name as name, Vote as rating FROM Comic INNER JOIN ComicVote ON (Id = ComicId) WHERE Username = ? ORDER BY rating DESC'
  mysqlPool.getConnection(function (err, connection) {
    connection.query(query, [req.query.modName], function (err2, results, fields) {
      if (err2) {return connection.release()}
      res.json({'modName': req.query.modName, 'data': results})
      connection.release()
    })
  })
})


app.get('/getModFavoriteImages', function (req, res) {
  fs.readdir(__dirname + '/../public/mod-favorites/' + req.query.modName, function (err, files) {
    if (err) res.end("oops")
    res.json({'modName': req.query.modName, 'data': files})
  })  
})


app.post('/correctComic', function (req, res) {
  var query = 'UPDATE Comic SET Tag = ?, Cat = ? WHERE Name = ?'
  mysqlPool.getConnection(function (err, connection) {
    connection.query(query, [req.body.tag, req.body.cat, req.body.comicName], function (err2, results, fields) {
      if (err2) {connection.release(); return res.end("Some database error (X44), ask admin")}
      res.end("Success!")
      connection.release()
    })
  })
})


app.get('/tagLog', function (req, res) {
  var query = 'SELECT Username, ComicName, Timestamp FROM TagLog WHERE Timestamp > NOW() - INTERVAL 1 DAY ORDER BY Timestamp DESC'
  mysqlPool.getConnection(function (err, connection) {
    connection.query(query, function (err2, results, fields) {
      if (err2) {connection.release(); return res.end("Some database error lolol")}
      res.json(results)
      connection.release()
    })
  })
})

app.get('/addTagLogModIndex', function (req, res) {
  if (req.session && req.session.user && req.session.user.username) {
    var query = 'INSERT INTO TagLog (TagNames, ComicName, username) VALUES (?, ?, ?)'
    mysqlPool.getConnection(function (err, connection) {
      connection.query(query, ['ModIndex', 'ModIndex', req.session.user.username], function (err2, results, fields) {
        connection.release()
      })
    })
  }
})

app.get('/allComicData', function (req, res) {
  var query = 'SELECT Name, Cat, Tag, Created, AVG(Vote) AS AvgRating, COUNT(*) AS NumberVotes FROM Comic INNER JOIN ComicVote ON (ComicId=Id) GROUP BY Name, Comic.Id ORDER BY Created DESC'
  mysqlPool.getConnection(function (err, connection) {
    connection.query(query, function (err2, results, fields) {
      if (err2) {res.end(); return connection.release()}
      res.json(results)
      connection.release()
    })
  })
})

app.get('/tagStats', function (req, res) {
  var query = 'SELECT Tag, COUNT(*) AS NumberOfComics FROM Comic GROUP BY Tag'
  mysqlPool.getConnection(function (err, connection) {
    connection.query(query, function (err2, results, fields) {
      if (err2) {res.end(); return connection.release()}
      res.json(results)
      connection.release()
    })
  })
})
app.get('/catStats', function (req, res) {
  var query = 'SELECT Cat, COUNT(*) AS NumberOfComics FROM Comic GROUP BY Cat'
  mysqlPool.getConnection(function (err, connection) {
    connection.query(query, function (err2, results, fields) {
      if (err2) {res.end(); return connection.release()}
      res.json(results)
      connection.release()
    })
  })
})

app.get('/tagVotes', function (req, res) {
  var query = 'SELECT Tag, AVG(Vote) AS AvgRating FROM Comic INNER JOIN ComicVote ON (Id=ComicId) GROUP BY Tag'
  mysqlPool.getConnection(function (err, connection) {
    connection.query(query, function (err2, results, fields) {
      if (err2) {res.end(); return connection.release()}
      res.json(results)
      connection.release()
    })
  })
})
app.get('/catVotes', function (req, res) {
  var query = 'SELECT Cat, AVG(Vote) AS AvgRating FROM Comic INNER JOIN ComicVote ON (Id=ComicId) GROUP BY Cat'
  mysqlPool.getConnection(function (err, connection) {
    connection.query(query, function (err2, results, fields) {
      if (err2) {res.end(); return connection.release()}
      res.json(results)
      connection.release()
    })
  })
})

app.post('/answerQuestionnaire', function (req, res) {
  var answer = req.body.questionnaireAnswer

  fs.readFile(__dirname + '/../public/surveyData2.json', function (err, data) {
    data = JSON.parse(data)
    data[answer] += 1

    fs.writeFile(__dirname + '/../public/surveyData2.json', JSON.stringify(data), function (err, data) {
      if (err) {
        console.log(err)
        throw err
      }
      res.end('THANK YOU!')
    })
  })
})


app.get('/getComicTags', function (req, res) {
  var query = 'SELECT Id AS id, GROUP_CONCAT(DISTINCT ComicKeyword.Keyword SEPARATOR \';\') AS keywords FROM Comic LEFT JOIN ComicKeyword ON (Comic.Id = ComicKeyword.ComicId) GROUP BY id ORDER BY id'

  mysqlPool.getConnection(function (err, connection) {
    connection.query(query, function (err2, results, fields) {
      if (err2) {res.end(); return connection.release()}

      var results2 = []
      for (var r of results) {
        if (r.keywords) { results2.push(r.keywords.split(';')) } 
        else { results2.push([]) }
      }

      res.json(results2)
      connection.release()
    })
  })

})

app.post('/kofiCallback', function (req, res) {
  console.log('Ko-Fi callback!')
  var kofiData = JSON.parse(req.body.data)
  var message = kofiData.message
  var amount  = Number(kofiData.amount)

  if (message.indexOf('yiffer-user=') >= 0 && amount >= 2) {
    var message2 = message.slice(message.indexOf('yiffer-user='))
    var spaceIndex = message2.indexOf(' ')
    if (spaceIndex == -1) {spaceIndex = message2.length}

    var yifferUser = message2.substring(12, spaceIndex)

    mysqlPool.getConnection(function (err, connection) {
      var query = 'INSERT INTO DonatorUser (Username) VALUES (?)'
      connection.query(query, [yifferUser], function (err3, results3, fields3) {
        if (err3) {
          console.log(err3.toString())
          connection.release()
        } 
        res.end('1')
        console.log('User has been added to donator table')
        connection.release()
      })
    })
  }
})

app.get('/keywordAutoComplete', function (req, res) {
  let escapedInput = mysql.escape(req.query.tagName)
  let input = escapedInput.substring(1, escapedInput.length-1)
  let query
  const artistQuery = 'SELECT Artist.Name AS name, COUNT(*) AS count FROM Artist INNER JOIN Comic ON (Artist=Artist.Id) WHERE Artist.name LIKE \'' + input + '%\' GROUP BY Artist.name'
  const comicNameQuery = 'SELECT Comic.Name AS name, 1 AS count FROM Comic WHERE Comic.Name LIKE \'' + input + '%\''
  if (input.length >= 1) {
    query = 'SELECT Keyword AS name, COUNT(*) AS count FROM ComicKeyword WHERE Keyword LIKE \'' + input + '%\' GROUP BY name ORDER BY count DESC'
  }
  else {
    query = 'SELECT Keyword AS name, COUNT(*) AS count FROM ComicKeyword GROUP BY name ORDER BY count DESC'
  }

  mysqlPool.getConnection((err, connection) => {
    connection.query(query, (err, results) => {
      if (err) {res.end(); return connection.release()}

      if (input.length >= 1) {
        connection.query(artistQuery, (err, results2) => {
          if (err) {console.log(err); res.end(); return connection.release()}
          var concatResults = results.concat(results2)

          connection.query(comicNameQuery, (err, results3) => {
            if (err) {console.log(err); res.end(); return connection.release()}
            var concatResults2 = results3.concat(concatResults)

            res.json(concatResults2.sort(function (a, b) {return b.count - a.count}))
            connection.release()
          })
        })
      }
      else {
        res.json(results)
        connection.release()
      }
    })
  })
})

app.post('/suggestKeyword', (req, res) => {
  let comicId = req.body.comicId
  let suggestedKeyword = req.body.suggestedKeyword
  let extension = req.body.extension ? 1 : 0
  let user
  if (req.session && req.session.user) { user = req.session.user.username }
  else { user = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.socket.remoteAddress || (req.connection.socket ? req.connection.socket.remoteAddress : null) }

  if (authorizeMod(req)) {
    let tagLogQuery = 'INSERT INTO TagLog (TagNames, ComicName, username) VALUES (?, ?, ?)'
    let kwQuery = extension ? 'INSERT INTO ComicKeyword (ComicId, Keyword) VALUES (?, ?)' : 'DELETE FROM ComicKeyword WHERE ComicId = ? AND Keyword = ?'
    mysqlPool.getConnection((err, connection) => {
      connection.query(tagLogQuery, [suggestedKeyword, ''+comicId, user], (err, rows) => {
        if (err) { return returnError(500, 'Database query error', res, connection, err) }
        connection.query(kwQuery, [comicId, suggestedKeyword], (err, rows) => {
          if (err) { return returnError(500, 'Database query error: ' + err.toString(), res, connection, err) }
          res.json({message: 'Keyword auto-approved, because you\'re a mod!'})
          connection.release()
        })
      })
    })
  }

  else {
    let tagAlreadyExistsQuery = 'SELECT Keyword FROM ComicKeyword WHERE ComicId = ? AND Keyword = ?'
    let alreadySuggestedQuery = 'SELECT * FROM KeywordSuggestion WHERE ComicId = ? AND Keyword = ?'
    let insertQuery = 'INSERT INTO KeywordSuggestion (ComicId, Keyword, Extension, User) VALUES (?, ?, ?, ?)'

    mysqlPool.getConnection((err, connection) => {
      connection.query(tagAlreadyExistsQuery, [comicId, suggestedKeyword], (err, rows) => {
        if (err) { return returnError(500, 'Database query error', res, connection, err) }
        if (rows.length > 0 && extension == 1) { return returnError(200, 'This comic already has this keyword!', res, connection, err) }

        connection.query(alreadySuggestedQuery, [comicId, suggestedKeyword], (err, rows) => {
          if (err) { return returnError(500, 'Database query error', res, connection, err) }
          if (rows.length > 0) {
            if (rows[0].Processed == 1 && rows[0].Approved == 0) { return returnError(200, 'This has already been suggested for this comic, and was not approved.', res, connection, err) }
            if (rows[0].Processed == 0) { return returnError(200, 'This has already been suggested for this comic, pending approval!', res, connection, err) }
          }

          connection.query(insertQuery, [comicId, suggestedKeyword, extension, user], (err, rows) => {
            if (err) { return returnError(500, 'Database query error', res, connection, err) }
            res.json({message: 'Suggestion added, now pending approval. Thank you!'})
            connection.release()
          })
        })
      })
    })
  }
})


app.get('/pendingKeywordSuggestions', (req, res) => {
  let query = 'SELECT ComicId AS comicId, Keyword AS keyword, Extension AS extension, Name AS comicName FROM KeywordSuggestion INNER JOIN Comic ON (Id=ComicId) WHERE Processed = 0'
  mysqlPool.getConnection((err, connection) => {
    connection.query(query, (err, rows) => {
      if (err) { return returnError(500, 'Database query error', res, connection, err) }
      res.json(rows)
    })
  })
})

app.get('/completedKeywordSuggestions', (req, res) => {
  let query = 'SELECT Keyword, User, Extension, Name, Moderator, Timestamp, Approved FROM KeywordSuggestion INNER JOIN Comic ON (Id=ComicId) WHERE Processed = 1 ORDER BY Timestamp DESC'
  mysqlPool.getConnection((err, connection) => {
    connection.query(query, (err, rows) => {
      if (err) { return returnError(500, 'Database query error', res, connection, err) }
      res.json(rows)
    })
  })
})

app.get('/keywordsNotInComic', (req, res) => {
  let comicId = req.query.comicId
  let query = 'SELECT KeywordName FROM Keyword WHERE KeywordName NOT IN (SELECT Keyword FROM ComicKeyword WHERE ComicId = ?)'

  mysqlPool.getConnection((err, connection) => {
    connection.query(query, [comicId], (err, rows) => {
      if (err) { return returnError(500, 'Database query error', res, connection, err) }
      let keywordList = []
      for (var x of rows) {
        keywordList.push(x.KeywordName)
      }
      res.json(keywordList)
      connection.release()
    })
  })
})


app.get('/logKeywordSearch', (req, res) => {
  let keyword = req.query.keywordName
  logNode(req, `KW: ${keyword}`)
  if (keyword) {
    let query = 'UPDATE KeywordSearches SET Count = Count + 1 WHERE Keyword = ?'
    mysqlPool.getConnection((err, connection) => {
      connection.query(query, [keyword], (err, results) => {
        if (err) { return returnError(500, 'MySql error: ' + err.toString(), res, connection, err) }
        res.json({status: 'success'})
        connection.release()
      })
    })
  }
})


app.get('/listRagGetImages', (req, res) => {
  let query = 'SELECT Id AS id, Artist AS artist, Rating AS rating, Added AS added FROM ListRagImage'
  mysqlPool.getConnection((err, connection) => {
    connection.query(query, (err, results) => {
      if (err) { return returnError(500, 'MySql error: ' + err.toString(), res, connection, err) }
      res.json(results)     
      connection.release()
    })
  })
})


app.post('/listRagAssignRating', (req, res) => {
  let imageId = req.body.id
  let newRating = req.body.newRating
  let query = 'UPDATE ListRagImage SET Rating = ? WHERE Id = ?'
  mysqlPool.getConnection((err, connection) => {
    connection.query(query, [newRating, imageId], (err, results) => {
      if (err) { return returnError(500, 'MySql error: ' + err.toString(), res, connection, err) }
      res.json({status: 'ok'})
      connection.release()
      archiveNewRating(imageId, newRating)
    })
  })
})

function archiveNewRating (imageId, newRating) {
  let query = 'INSERT INTO ListRagRatingArchive (Id, Rating, Timestamp) VALUES (?, ?, NOW())'
  mysqlPool.getConnection((err, connection) => {
    connection.query(query, [imageId, newRating], (err, results) => {
      if (err) { return returnError(500, 'MySql error: ' + err.toString(), null, connection, err) }
      connection.release()
    })
  })
}


function appendZeroFirstIfSingleNumber (number) {
  if (number < 10) {
    return '0' + number
  }
  else {
    return '' + number
  }
}


function logNode (req, message) {
  var time = (new Date()).toISOString()
  var user = false
  if (req.session && req.session.user) { user = req.session.user.username }
  var ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.socket.remoteAddress || (req.connection.socket ? req.connection.socket.remoteAddress : 'none')

  var lengthOfUser = 0
  var maxPathLength = 50
  var maxStringLength = 15
  if (user) {lengthOfUser = (String(user)).length}
  else if (ip) {lengthOfUser = (String(ip)).length}
    
  var firstSpaceCount = maxStringLength-lengthOfUser
  if (firstSpaceCount < 0) { firstSpaceCount = 0 }

  console.log(`[${user||ip}] ${' '.repeat(firstSpaceCount)}${message} ${' '.repeat(maxPathLength-message.length)}[${time}]`)
}


function getTodayDateIsoString () {
  return (new Date()).toISOString().substr(0,10)
}

function mysqlLikeEndEscape (inputString) {
  let escapedString = mysql.escape(inputString)
  return escapedString.substring()
}