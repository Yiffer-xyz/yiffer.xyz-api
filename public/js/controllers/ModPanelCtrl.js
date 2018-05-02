angular.module('ModPanelCtrl', ['ngCookies', 'ngFileUpload']).controller('ModPanelController', ['$scope', '$http', '$cookies', 'Upload', function ($scope, $http, $cookies, Upload) {

	$scope.brightColors = true

	$scope.newComicPage = {file: undefined, comic: undefined, uploadProgress: undefined}
	$scope.keywordAdding = {comic: {Name: undefined}, keywordsToAdd: [], existingKeywords: [], keywordsToDelete: []}
	$scope.correctComic = {comic: {tag: undefined, cat: undefined, finished: undefined, artistName: undefined}, tag: undefined, cat: undefined, finished: undefined, artistName: undefined}
	$scope.newComic = {name: undefined, artist: undefined, cat: undefined, tag: undefined, finished: undefined}
  $scope.newComicFiles = []
	$scope.newComicUploadProgress = undefined
  $scope.addArtistLinks = {artist: undefined, links: ['', '', '', '', '', '']}
  $scope.modFavImage = {artist: undefined, uploadProgress: undefined}
  $scope.pendingComics = []
  $scope.processedComics = []
  $scope.showWipComics = false

	$scope.suggestedKeywords = []
	$scope.allComicsList = []
	$scope.wipComicsList = []
	$scope.allKeywordsList = []
	$scope.allArtistsList = []

	$scope.modOrAdmin = undefined

	$scope.responseMessages = {
		kwSuggestions:  { visible: false, message: '', error: false },
		newComicPage:   { visible: false, message: '', error: false },
		addKeywords:    { visible: false, message: '', error: false },
		createKeyword:  { visible: false, message: '', error: false },
		correctComic:   { visible: false, message: '', error: false },
		tagSuggestions: { visible: false, message: '', error: false },
    addComic:       { visible: false, message: '', error: false },
    addArtist:      { visible: false, message: '', error: false },
    addArtistLinks: { visible: false, message: '', error: false },
    addModFavImage: { visible: false, message: '', error: false },
    approveComic:   { visible: false, message: '', error: false },
		reZipComic:     { visible: false, message: '', error: false }
	}

	$scope.respondToKeywordSuggestion = function (keyword, comicId, verdict, extension) {
		$http({
			url: '/api/keywords/suggestions/responses',
			method: 'POST',
			data: {
				keywordName: keyword,
				comicId: comicId,
				verdict: verdict,
				extension: (extension ? 1 : 0)
			}
		})
		.success((res) => {
      displayResponseMessage('kwSuggestions', res)
			getPendingKeywordSuggestions()
		})
	}


	$scope.uploadNewPage = function (comic, pageFile) {
		Upload.upload({
			url: '/api/comics/' + comic.name,
			data: {
				file: pageFile,
				comicName: comic.name,
				newImage: true
			}
		})
		.then(
			function (res) {
        displayResponseMessage('newComicPage', res.data)
				$scope.newComicPage.file = undefined
				$scope.newComicPage.uploadProgress = undefined
			},
			function (res) {},
			function (evt) { 
				$scope.newComicPage.uploadProgress = Math.min(100, parseInt(100.0 * evt.loaded / evt.total))
			}
		)
	}


	$scope.addSelectedKeyword = function (keyword) {
		if (keyword) {
			$scope.keywordAdding.keywordsToAdd.push(keyword)
			removeStringFromArray($scope.allKeywordsList, keyword)
		}
	}


	$scope.removeKeywordFromAddList = function (keyword) {
		removeStringFromArray($scope.keywordAdding.keywordsToAdd, keyword)
		$scope.allKeywordsList.push(keyword)
		$scope.allKeywordsList.sort()
	}


	$scope.sendAddedKeywords = function () {
		$http({
			url: '/api/keywords/addToComic',
			method: 'POST',
			data: {
				comicId: $scope.keywordAdding.comic.id,
				keywordAddList: $scope.keywordAdding.keywordsToAdd
			}
		})
		.success((res) => {
      displayResponseMessage('addKeywords', res)
      if (!res.error) {
				refreshKeywordsForComic($scope.keywordAdding.comic.name)
				$scope.keywordAdding.keywordsToDelete = []
				$scope.keywordAdding.keywordsToAdd = []
				getKeywordList()
      }
		})
	}


	$scope.sendDeleteKeywords = function () {
		$http({
			url: '/api/keywords',
			method: 'DELETE',
			params: {
				comicId: $scope.keywordAdding.comic.id,
				keywordsToDelete: $scope.keywordAdding.keywordsToDelete
			}
		})
		.success((res) => {
      displayResponseMessage('addKeywords', res)
			refreshKeywordsForComic($scope.keywordAdding.comic.name)
			$scope.keywordAdding.keywordsToDelete = []
			$scope.keywordAdding.keywordsToAdd = []
		})
	}


	$scope.keywordKeyPressed = function (event) {
		if (event.key == 'Enter') { $scope.addSelectedKeyword($scope.currentlySelectedKeyword) }
	}


	$scope.toggleKeywordDeletion = function (keyword) {
		if ($scope.keywordAdding.keywordsToDelete.indexOf(keyword) < 0) {
			$scope.keywordAdding.keywordsToDelete.push(keyword)
		}
		else {
			removeStringFromArray($scope.keywordAdding.keywordsToDelete, keyword)
		}
	}


	$scope.createKeyword = function (keywordName) {
		$http({
			url: '/api/keywords',
			method: 'POST',
			data: { keywordName: keywordName }
		})
		.success((res) => {
      displayResponseMessage('createKeyword', res)
			$scope.newKeywordName = undefined
			getKeywordList()
		})
	}


	$scope.sendCorrectComic = function () {
		$http({
			url: '/api/comics/' + $scope.correctComic.comic.name,
			method: 'PUT',
			data: {
				cat: $scope.correctComic.cat,
				tag: $scope.correctComic.tag,
				finished: $scope.correctComic.finished,
				artistName: $scope.correctComic.artist.Name
			}
		})
		.success((res) => {
      displayResponseMessage('correctComic', res)
			$scope.correctComic = {comic: {tag: undefined, cat: undefined, finished: undefined, artistName: undefined}, tag: undefined, cat: undefined, finished: undefined, artistName: undefined}
			getComicList()
		})
	}


  $scope.selectUploadFiles = function (files) {
    $scope.newComicFiles = files
  }


	$scope.uploadNewComicImages = function () {
		Upload.upload({
			url: '/api/comics',
			data: { 
				files: $scope.newComicFiles,
				comicDetails: {name: $scope.newComic.name, artist: $scope.newComic.artist.Name, cat: $scope.newComic.cat, tag: $scope.newComic.tag, finished: $scope.newComic.finished}
			}
		})
		.then(
			function (res) {
        displayResponseMessage('addComic', res.data)
				if (!res.data.error) {
					$scope.newComic = {name: undefined, artist: undefined, cat: undefined, tag: undefined, finished: undefined}
					$scope.newComicFiles = undefined
					getSuggestedComics()
				}
			},
			function (res) {},
			function (evt) { 
				$scope.newComicUploadProgress = Math.min(100, parseInt(100.0 * evt.loaded / evt.total))
			}
		)
	}


  $scope.sendAddArtist = function (artistName) {
    $http({
      url: '/api/artists',
      method: 'POST',
      data: { artistName: artistName }
    })
    .success((res) => {
      displayResponseMessage('addArtist', res)
      getArtistList()
      getComicList()
      $scope.newArtistName = ''
    })
  }


  $scope.sendAddArtistLinks = function () {
    let artistLinks = extractNonEmptyCellsFromArray($scope.addArtistLinks.links)
    $http({
      url: '/api/artistLinks',
      method: 'POST',
      data: { artistId: $scope.addArtistLinks.artist.Id, artistLinks: artistLinks }
    })
    .success((res) => {
      displayResponseMessage('addArtistLinks', res)
      $scope.addArtistLinks.links = ['', '', '', '', '', '']
    })
  }


  $scope.sendModFavImage = function () {
  	Upload.upload({
  		url: '/api/artistFavImage',
  		data: {
  			file: $scope.modFavImage.file,
  			artistName: $scope.modFavImage.artist.Name
  		}
  	})
		.then(
			function (res) {
		    displayResponseMessage('addModFavImage', res.data)
				$scope.modFavImage.uploadProgress = undefined
				$scope.modFavImage.file = undefined
			},
			function (res) {},
			function (evt) { 
				$scope.modFavImage.uploadProgress = Math.min(100, parseInt(100.0 * evt.loaded / evt.total))
			}
		)
  }


  $scope.approveComic = function (comic, verdict, comment) {
    $http({
      url: '/api/modPanel/suggestedComics',
      method: 'POST',
      data: {
        comic: comic,
        verdict: verdict,
        comment: comment
      }
    })
    .success((res) => {
      displayResponseMessage('approveComic', res)
      getSuggestedComics()
    })
  }


  $scope.sendReZipComic = function (comic) {
    $http.get('/api/modPanel/zip/' + comic.name)
    .success((res) => {
      displayResponseMessage('reZipComic', res)
    })
  }







	function getKeywordList () {
		$http.get('/api/keywords').success((res) => { 
			for (var keyword of res) {
				$scope.allKeywordsList.push(keyword.KeywordName)
			}
		})
	}


	function getArtistList () {
		$http.get('/api/artists').success((res) => { $scope.allArtistsList = res })
	}


	function getComicList () {
		$http.get('/api/comics')
		.success((res) => { 
			$scope.allComicsList = res 
			for (var comic of res) {
				if (!comic.finished) { $scope.wipComicsList.push(comic) }
			}
		})
	}


	function getPendingKeywordSuggestions () {
		$http.get('/api/keywords/suggestions/pending').success((res) => { $scope.suggestedKeywords = res })
	}

  function getSuggestedComics () {
    $http.get('/api/modPanel/suggestedComics').success((res) => {
      $scope.processedComics = []
      $scope.pendingComics = []
      for (var suggestedComic of res) {
        if (suggestedComic.Processed) { $scope.processedComics.push(suggestedComic) }
        else { $scope.pendingComics.push(suggestedComic) }
      }
    })
  }







	$scope.$watch('keywordAdding.comic', () => {
		refreshKeywordsForComic($scope.keywordAdding.comic.name)
	})


	function refreshKeywordsForComic (comicName) {
		$http.get('/api/comics/' + comicName)
		.success((res) => {
			$scope.keywordAdding.existingKeywords = res.keywords
		})
	}


  $scope.$watch('correctComic.comic', () => {
  	if ($scope.correctComic.comic) {
	  	$scope.correctComic.tag = $scope.correctComic.comic.tag
	  	$scope.correctComic.cat = $scope.correctComic.comic.cat
	  	$scope.correctComic.finished = $scope.correctComic.comic.finished
	  	$scope.correctComic.artist = findArtistObjectInArtistListByName($scope.correctComic.comic.artist)
  	}
	})


  function displayResponseMessage (responseMessageVariableName, res) {
    $scope.responseMessages[responseMessageVariableName] = {
      visible: true,
      message: (res.message || res.error),
      error: (res.error ? false : true)
    }
  }


	function removeStringFromArray (arr, string) {
		let indexOfString = arr.indexOf(string)		
		arr.splice(indexOfString, 1)
	}


  function extractNonEmptyCellsFromArray (array) {
    let returnArray = []
    for (var a of array) {
      if (a) { returnArray.push(a) }
    }
    return returnArray
  }


  function findArtistObjectInArtistListByName (artistName) {
  	for (var x of $scope.allArtistsList) {
  		if (x.Name == artistName) {
  			return x
  		}
  	}
  }


	function refreshSession () {
		$http.get('/userSession').success((res) => {
			if (res.mod) { $scope.modOrAdmin = 'mod' }
			if (res.admin) { $scope.modOrAdmin = 'admin' }
		})
	}


  function initColorTheme () {
    var colors = $cookies.get('colorTheme')
    if (colors && !JSON.parse(colors))
      $scope.setBrightColors(false)
    else 
      $scope.setBrightColors(true)
  }


  $scope.setBrightColors = function (bool) {
    document.getElementById('theBody').classList.remove('bright-colors')
    document.getElementById('theBody').classList.remove('dark-colors')
    document.getElementById('theBody').classList.add(bool ? 'bright-colors' : 'dark-colors')
    $cookies.put('colorTheme', JSON.stringify(bool))
    $scope.brightColors = bool
  }



	function init () {
		initColorTheme()
		refreshSession ()
		getKeywordList()
		getArtistList()
		getComicList()
		getPendingKeywordSuggestions()
		getSuggestedComics()
	}


	init()

}])
