angular.module('ModPanelCtrl', ['ngCookies', 'ngFileUpload']).controller('ModPanelController', ['$scope', '$http', '$cookies', 'Upload', function ($scope, $http, $cookies, Upload) {

	$scope.brightColors = true
	$scope.userRole = 'mod'

	$scope.newComicPage = {file: undefined, comic: undefined, uploadProgress: undefined}
	$scope.keywordAdding = {comic: {Name: undefined}, keywordsToAdd: [], existingKeywords: [], keywordsToDelete: []}
	$scope.correctComic = {comic: {tag: undefined, cat: undefined, finished: undefined, artistName: undefined}, tag: undefined, cat: undefined, finished: undefined, artistName: undefined}
	$scope.newComic = {name: undefined, artist: undefined, cat: undefined, tag: undefined, finished: undefined}
	$scope.newComicUploadProgress = undefined
  $scope.addArtistLinks = {artist: undefined, links: ['', '', '', '', '', '']}
  $scope.modFavImage = {artist: undefined}
  $scope.pendingComics = []
  $scope.processedComics = []

	$scope.suggestedKeywords = []
	$scope.allComicsList = []
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
			$scope.responseMessages.kwSuggestions = { 
				visible: true, 
				message: (res.message || res.error), 
				error: (res.error ? false : true)
			}
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
				$scope.responseMessages.newComicPage = {
					visible: true,
					message: (res.data.message || res.data.error),
					error: (res.data.error ? false : true)
				}
				$scope.newComicPage.file = undefined
				$scope.newComicPage.uploadProgress = undefined
			},
			function (res) {
			},
			function (evt) { 
				$scope.newComicPage.uploadProgress = Math.min(100, parseInt(100.0 * evt.loaded / evt.total))
			}
		)
	}


	$scope.addSelectedKeyword = function (keyword) {
		$scope.keywordAdding.keywordsToAdd.push(keyword)
		removeStringFromArray($scope.allKeywordsList, keyword)
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
			$scope.responseMessages.addKeywords = { 
				visible: true, 
				message: (res.message || res.error), 
				error: (res.error ? false : true)
			}
			refreshKeywordsForComic($scope.keywordAdding.comic.name)
			$scope.keywordAdding.keywordsToDelete = []
			$scope.keywordAdding.keywordsToAdd = []
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
			$scope.responseMessages.addKeywords = { 
				visible: true, 
				message: (res.message || res.error),
				error: (res.error ? false : true)
			}
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
			$scope.responseMessages.createKeyword = { 
				visible: true, 
				message: (res.message || res.error), 
				error: (res.error ? false : true)
			}

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
			$scope.responseMessages.correctComic = { 
				visible: true, 
				message: (res.message || res.error), 
				error: (res.error ? false : true)
			}
			$scope.correctComic = {comic: {tag: undefined, cat: undefined, finished: undefined, artistName: undefined}, tag: undefined, cat: undefined, finished: undefined, artistName: undefined}
			getComicList()
		})
	}


	$scope.uploadNewComicImages = function (files) {
		$scope.files = files
		Upload.upload({
			url: '/api/comics',
			data: { 
				files: files,
				comicDetails: {name: $scope.newComic.name, artist: $scope.newComic.artist.Name, cat: $scope.newComic.cat, tag: $scope.newComic.tag, finished: $scope.newComic.finished}
			}
		})
		.then(
			function (res) {
				$scope.responseMessages.newComic = {
					visible: true,
					message: (res.data.message || res.data.error),
					error: (res.data.error ? false : true)
				}
				if (!res.data.error) {
					$scope.newComic = {name: undefined, artist: undefined, cat: undefined, tag: undefined, finished: undefined}
					$scope.files = undefined
				}
			},
			function (res) {},
			function (evt) { 
				$scope.newComic.uploadProgress = Math.min(100, parseInt(100.0 * evt.loaded / evt.total))
			}
		)
	}


  $scope.sendAddArtist = function (artistName) {
    $http({
      url: '/api/artists',
      method: 'POST',
      data: { artistName: newArtistName }
    })
    .success((res) => {
      $scope.responseMessages.addArtist = { 
        visible: true, 
        message: (res.message || res.error), 
        error: (res.error ? false : true)
      }

      $scope.getArtistList()
      $scope.newArtistName = ''
    })
  }


  $scope.sendAddArtistLinks = function () {
    let artistLinks = extractNonEmptyCellsFromArray($scope.addArtistLinks.links)
    $http({
      url: '/api/modPanel/artistLink',
      method: 'POST',
      data: { artistId: $scope.addArtistLinks.artist.id, artistLinks: newArtistLinks }
    })
    .success((res) => {
      $scope.responseMessages.addArtistLinks = { 
        visible: true, 
        message: (res.message || res.error), 
        error: (res.error ? false : true)
      }

      $scope.addArtistLinks.links = ['', '', '', '', '', '']
    })
  }


  $scope.sendModFavImage = function () {
  	Upload.upload({
  		url: '/api/artistFavImage',
  		data: {
  			file: modFavImage.file,
  			artistName: modFavImage.artist.Name
  		}
  	})
    .success((res) => {
      $scope.responseMessages.addModFavImage = { 
        visible: true, 
        message: (res.message || res.error), 
        error: (res.error ? false : true)
      }
  	})
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
      $scope.responseMessages.approveComic = { 
        visible: true, 
        message: (res.message || res.error), 
        error: (res.error ? false : true)
      }

      getSuggestedComics()
    })
  }


  $scope.sendReZipComic = function (comic) {
    $http.get('/api/modPanel/zip/' + comic.name)
    .success((res) => {
      $scope.responseMessages.reZipComic = { 
        visible: true, 
        message: (res.message || res.error), 
        error: (res.error ? false : true)
      } 
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
		$http.get('/api/comics').success((res) => { $scope.allComicsList = res })
	}


	function getPendingKeywordSuggestions () {
		$http.get('/api/keywords/suggestions/pending').success((res) => { $scope.suggestedKeywords = res })
	}

  function getSuggestedComics () {
    $http.get('/api/modPanel/suggestedComics').success((res) => {
	    	// todo uncomment, commented now because there will be no comics in res ??? maybe?? wtf
      // for (var suggestedComic of res) {
      //   if (suggestedComic.Processed) { $scope.processedComics.push(suggestedComic) }
      //   else { $scope.pendingComics.push(suggestedComic) }
      // }
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
  	$scope.correctComic.tag = $scope.correctComic.comic.tag
  	$scope.correctComic.cat = $scope.correctComic.comic.cat
  	$scope.correctComic.finished = $scope.correctComic.comic.finished
  	$scope.correctComic.artist = findArtistObjectInArtistListByName($scope.correctComic.comic.artist)
	})


	function removeStringFromArray (arr, string) {
		let indexOfString = arr.indexOf(string)		
		arr.splice(indexOfString, 1)
	}


	function objectArrayIndexOf (arr, obj) {
		let keys = Object.keys(obj)
		let values = Object.values(obj)

		for (var i=0; i<arr.length; i++) {
			for (var j=0; j<keys.length; j++) {
				if (arr[i][keys[j]] != values[j]) {
					break
				}
				if (j == keys.length-1) {
					return i
				}
			}
		}
		return -1
	}


	function extractOneValueFromObjectListToList (objList, key) {
		let valueList = []
		for (var obj of objList) {
			valueList.push(obj[key])
		}
		return valueList
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
			else if (res.admin) { $scope.modOrAdmin = 'admin' }
		})
	}


	function init () {
		refreshSession ()
		getKeywordList()
		getArtistList()
		getComicList()
		getPendingKeywordSuggestions()
		getSuggestedComics()
	}


	init()
}])
