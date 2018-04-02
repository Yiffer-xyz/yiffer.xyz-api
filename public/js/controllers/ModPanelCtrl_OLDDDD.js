angular.module('ModPanelCtrl', ['ngCookies', 'ngFileUpload']).controller('ModPanelController', ['$scope', '$http', '$cookies', 'Upload', function ($scope, $http, $cookies, Upload) {

  $scope.brightColors = true

  $scope.comicNames = []
  $scope.comicNamesNotInDatabase = []
  $scope.unfinishedComicList = []
  $scope.allArtists = []

  $scope.addedTags = []
  $scope.tagsToDelete = []
  $scope.allTags = []
  var tagDescriptions = {}

  $scope.favoriteImages = []
  $scope.username = ''

  $scope.uploadResponseMessage = ''

  $scope.tagSentMessage = 'Waiting...'
  $scope.showTagSentMessage = false
  $scope.tagSentMessageColor = '#bfbfbf'

  $scope.newTagSentMessage = 'Waiting...'
  $scope.showNewTagSentMessage = false
  $scope.newTagSentMessageColor = '#bfbfbf'

  $scope.approvalMessage = ''
  $scope.showApprovalMessage = false
  $scope.approvalMessageColor = '#bfbfbf'

  $scope.newComicData = {}
  $scope.newComicResponseMessage = ''

  $scope.showFavImages = false

  $scope.validComicTags = ['Furry', 'MLP', 'Pokemon', 'Warcraft', 'Other']

  $scope.favImageHighscores = []
  $scope.taggingHighScores = []

  $scope.removeTag = function (tagName) {
    if (tagName) {
      remove($scope.addedTags, tagName)
      $scope.allTags.push(tagName)
      sortAllTags()
    }
  }
  $scope.addTag = function (tagName) {
    if (tagName) {
      $scope.addedTags.push(tagName)
      remove($scope.allTags, tagName)
    }
  }

  $scope.toggleTagToTagsToDeleteList = function (tagName) {
    if ($scope.tagsToDelete.indexOf(tagName) >= 0)
      remove($scope.tagsToDelete, tagName)
    else
      $scope.tagsToDelete.push(tagName)
  }

  $scope.$watch('selectedComic', selectedComicChanged)

  function selectedComicChanged () {
    loadTagsAddedToComic()
  }

  function loadTagsAddedToComic () {
    $http.get('/api/comics/' + $scope.selectedComic)
    .success((res) => { $scope.selectedComicTags = res.keywords })
  }

  $scope.keyPressed = function (event) {
    if (event.key == 'Enter') {
      $scope.addTag($scope.selectedTag)
    }
  }

  $scope.sendTagsToDelete = function () {
    $http({
      url: '/api/keywords',
      method: 'DELETE',
      data: { comicName: $scope.selectedComic, tagsToDelete: $scope.tagsToDelete }
    })
    .success((res) => {
      if (res == 'ok') {
        $scope.tagSentMessage = 'Success!'
        $scope.tagSentMessageColor = '#7bfca0'
      } 
      else {
        $scope.tagSentMessage = 'Failed: ' + res
        $scope.tagSentMessageColor = '#ff638c'
      }

      resetTagsToDeleteList()
      refreshSelectedComic()

      setTimeout(function () {
        $scope.tagSentMessage = 'Waiting...'
        $scope.showTagSentMessage = false
        $scope.tagSentMessageColor = '#bfbfbf'
      }, 5*1000)
    })
  }

  $scope.sendTags = function () {
    $scope.showTagSentMessage = true

    $http({
      url: '/api/keywords/addToComic',
      method: 'POST',
      data: { comicId: $scope.selectedComic.id, tags: $scope.selectedTags }
    })
    .success (function (res) {
      if (res == 'ok') {
        $scope.tagSentMessage = 'Success!'
        $scope.tagSentMessageColor = '#7bfca0'
      } 
      else {
        $scope.tagSentMessage = 'Failed: ' + res
        $scope.tagSentMessageColor = '#ff638c'
      }

      refreshSelectedComic()

      setTimeout(function () {
        $scope.tagSentMessage = 'Waiting...'
        $scope.showTagSentMessage = false
        $scope.tagSentMessageColor = '#bfbfbf'
      }, 5*1000)
    })
  }

  $scope.sendNewTag = function () {
    $scope.showNewTagSentMessage = true
    $http({
      url: '/api/keywords',
      method: 'POST',
      data: { KeywordName: $scope.newTagName.toLowerCase(), keywordDescription: $scope.newTagDescription }
    })
    .success (function (res) {
      if (res == 'ok') {
        $scope.newTagSentMessage = 'Success! Reload window to use the new tag.'
        $scope.newTagSentMessageColor = '#7bfca0'
      } 
      else {
        $scope.newTagSentMessage = 'Failed: ' + res
        $scope.newTagSentMessageColor = '#ff638c'
      }

      refreshSelectedComic()

      setTimeout(function () {
        $scope.newTagSentMessage = 'Waiting...'
        $scope.showNewTagSentMessage = false
        $scope.newTagSentMessageColor = '#bfbfbf'
      }, 2*1000)
    })
  }

  $scope.getSelectedTagDescription = function () {
    if (tagDescriptions.hasOwnProperty($scope.selectedTag)) {
      return tagDescriptions[$scope.selectedTag]
    }
  }

  $scope.uploadImage = function () {
    if ($scope.uploadImageFile) {
      $scope.uploadResponseMessage = 'Waiting...'
      Upload.upload({
        url: '/api/uploadModImage',
        data: {file: $scope.uploadImageFile, artistName: $scope.selectedUploadArtist.name}, //todo make this
      }).success(function (res) {
        $scope.uploadImageFile = undefined
        $scope.uploadResponseMessage = 'Upload result: ' + res
        setTimeout(function(){$scope.uploadResponseMessage = ''}, 3000)
      })
    }
  }

  $scope.uploadAddImageToComic = function () {
    $scope.uploadComicImageResponseMessage = 'Waiting... '
    Upload.upload({
      url: `/api/comics/${$scope.selectedComicToAddImagesTo}`,
      data: {file: $scope.uploadComicImageFile, comicName: $scope.selectedComicToAddImagesTo, newImage: true}
    }).success(function (res) {
      $scope.uploadComicImageFile = undefined
      $scope.uploadComicImageResponseMessage = 'Upload result: ' + (res.status ? res.status : '') + (res.error ? res.error : '')
      setTimeout(function(){$scope.uploadComicImageResponseMessage = ''}, 3000)
    })
  }

  $scope.addComic = function () {
    $scope.newComicResponseMessage = 'Sending...'
    $http({
      url: '/api/comics',
      method: 'POST',
      data: {
        artistId: $scope.newComicArtist.id,
        cat: $scope.newComicCat,
        tag: $scope.newComicTag,
        comicName: $scope.newComicName,
        finished: $scope.newComicFinished
      }
    }).success(function (res) {
      console.log(res)
      $scope.newComicCat = undefined
      $scope.newComicTag = undefined
      $scope.newComicName = ''
      $scope.newComicArtist = undefined

      $scope.newComicResponseMessage = 'Result: ' + (res.status ? res.status : '') + (res.error ? res.error : '')
      setTimeout(function(){$scope.newComicResponseMessage = ''}, 3000)
    })
  }

  $scope.addArtist = function () {
    $scope.newComicResponseMessage = 'Adding..'
    $http({
      url: '/api/artists',
      method: 'POST',
      data: {artistName: $scope.newArtistName}
    })
    .success((res) => {
      $scope.newComicResponseMessage = res.message || res.error
      $scope.newArtistName = ''
      setTimeout(function(){$scope.newComicResponseMessage = ''}, 4000)
      getAllArtistNames()
    })
  }

  $scope.addArtistLinks = function () {
    let linkList = []
    for (var link of [$scope.link1, $scope.link2, $scope.link3, $scope.link4, $scope.link5, $scope.link6, $scope.link7]) {
      if (link && link.length > 2) { linkList.push(link) }
    }
    if (linkList.length > 0) {
      $http({
        url: '/api/artistLink',
        method: 'POST',
        data: {artistLinkList: linkList, artistId: $scope.linkArtist.id}
      })
      .success((res) => {
        $scope.newComicResponseMessage = res.message || res.error
        clearArtistLinks()
      })
    }
  }

  $scope.correctComic = function () {
    this needs some work
  }

  $scope.showUntaggedComics = function () {
    getUntaggedComics()
  }

  $scope.showAllComics = function () {
    getAllComicNames()
  }


  $scope.approveKeyword = function (suggestedKeyword, verdict) {
    $http({
      url: '/api/keywords/suggestions/responses',
      method: 'POST',
      data: {
        comicId: suggestedKeyword.comicId,
        keywordName: suggestedKeyword.keyword,
        extension: suggestedKeyword.extension,
        verdict: verdict
      }
    }).success(function (res) {
      if (!res.error) {
        $scope.approvalMessage = `(${suggestedKeyword.keyword}) ` + res.message
        $scope.showApprovalMessage = true
        $scope.approvalMessageColor = '#7bfca0'
        getKeywordSuggestions()
      }
      else {
        $scope.approvalMessage = `(${suggestedKeyword.keyword}) ` + res.error
        $scope.showApprovalMessage = true
        $scope.approvalMessageColor = '#ff638c'
      }
    })
  }

  function getKeywordSuggestions () {
    $http.get('/api/keywords/suggestions/pending').success((res) => {
      $scope.suggestedKeywords = res
    })
  }

  function getModHighScores () {
    getTaggingHighscores()
    getFavImageHighscores()
  }

  function getTaggingHighscores () {
    $http.get('/api/modPanel/modTaggingHighscores')
      .success(function (res) {
        $scope.taggingHighScores = res
      })
  }

  function getFavImageHighscores () {
    $http.get('/api/getModNames')
    this needs a fix
  }

  function getUntaggedComics () {
    $http.get('/api/modPanel/untaggedComics')
      .success(function (res) {
        $scope.comicNames = res
        sortComicNames()
      })
  }

  function extractLinkType (linkUrl) {
    if (linkUrl.indexOf('e621') >= 0) return 'e621'
    else if (linkUrl.indexOf('furaffinity') >= 0) return 'furaffinity'
    else if (linkUrl.indexOf('inkbunny') >= 0) return 'inkbunny'
    else if (linkUrl.indexOf('patreon') >= 0) return 'patreon'
    else if (linkUrl.indexOf('tumblr') >= 0) return 'tumblr'
    else if (linkUrl.indexOf('twitter') >= 0) return 'twitter'
    else if (linkUrl.indexOf('furrynetwork') >= 0) return 'furrynetwork'
    else if (linkUrl.indexOf('weasyl') >= 0) return 'weasyl'
    else if (linkUrl.indexOf('hentaifoundry') >= 0) return 'hentaifoundry'
    else if (linkUrl.indexOf('deviantart') >= 0) return 'deviantart'
    else if (linkUrl.indexOf('sofurry') >= 0) return 'sofurry'
    else if (linkUrl.indexOf('pixiv') >= 0) return 'pixiv'
    else return 'website'
  }

  function getArtistIdFromName (artistName) {
    for (var x of $scope.allArtists) {
      if (x.name === artistName) return x.id
    }
  }

  function clearArtistLinks () {
    $scope.link1 = ''
    $scope.link2 = ''
    $scope.link3 = ''
    $scope.link4 = ''
    $scope.link5 = ''
    $scope.link6 = ''
    $scope.link7 = ''
  }

  function resetTagLists () {
    var numberOfAddedTags = $scope.addedTags.length
    for (i = 0; i < numberOfAddedTags; i++) {
      $scope.removeTag($scope.addedTags[0])
    }
  }

  function resetTagsToDeleteList () {
    $scope.tagsToDelete = []
  }

  function refreshSelectedComic () {
    loadTagsAddedToComic()
    resetTagLists()  
  }


  function setComicsNotInDatabase () {
    $http.get('/api/modPanel/comicsReadyForAdding')
    .success((res) => {
      $scope.comicNamesNotInDatabase = res
    })
  }



  onPageLoad()
  function onPageLoad () {
    getTagsAsList()
    getTagsAsDictionary()
    setTimeout(initColorTheme, 200)
    getAllComicNames()
    getAllArtistNames()
    getFavoriteImages()
    getUsernameFromSession()
    getUnfinishedComics()
    setTimeout(setComicsNotInDatabase, 100)
    sortAllTags()
    getModHighScores()
    getKeywordSuggestions()
  }

  function getTagsAsList() {
    $http.get('/api/keywords')
    .success((res) => {
      this trenger aa behandle list med objects {keyword: <>, description: <>}
      $scope.allTags = res
      sortAllTags()
    })
  }

  function getTagsAsDictionary () {
    $http.get('/api/keywords')
    .success((res) => {
      tagDescriptions = res
    })
  }

  function getAllComicNames () {
    this maa behandle liste med objects, ikke bare liste med navn
    $http.get('/api/comics')
    .success((res) => {
       $scope.comicNames = res
       sortComicNames()
    })
  }

  function getAllArtistNames () {
    $http.get('/api/comics')
    .success((res) => {
       $scope.allArtists = res
    })
  }
  
  function getFavoriteImages () {
    $http({
      url: '/api/getFavoriteImages',
      method: 'GET'
    }).success(function (res) {
       $scope.favoriteImages = res
    })
  }

  function getUsernameFromSession () {
    $http.get('/userSession')
      .success(function (res) {
        $scope.username = res.username
      })
  }

  function getUnfinishedComics () {
    $http.get('/api/getUnfinishedComics')
      .success(function (res) {
        $scope.unfinishedComicList = res
        console.log('loADED! ;)')
      })
  }


  $scope.setBrightColors = function (bool) {
    document.getElementById('theBody').classList.remove('bright-colors')
    document.getElementById('theBody').classList.remove('dark-colors')
    document.getElementById('theBody').classList.add(bool ? 'bright-colors' : 'dark-colors')
    $cookies.put('colorTheme', JSON.stringify(bool))
    $scope.brightColors = bool
  }

  function sortAllTags () {
    $scope.allTags.sort()
  }

  function sortComicNames () {
    $scope.comicNames.sort()
  }

  function initColorTheme () {
    var colors = $cookies.get('colorTheme')
    if (colors && !JSON.parse(colors))
      $scope.setBrightColors(false)
    else 
      $scope.setBrightColors(true)
  }

  function remove(arr, what) {
    var found = arr.indexOf(what)

    while (found !== -1) {
      arr.splice(found, 1)
      found = arr.indexOf(what)
    }
  }
}])