angular.module('ModPanelCtrl', ['ngCookies', 'ngFileUpload']).controller('ModPanelController', ['$scope', '$http', '$cookies', 'Upload', function ($scope, $http, $cookies, Upload) {

	$scope.brightColors = true

	$scope.newComicPage = {file: undefined, comicName: undefined}
	$scope.keywordAdding = {comic: undefined, keywordsToAdd: [], existingKeywords: [], keywordsToDelete: []}
	$scope.correctComic = {comic: undefined, tag: undefined, cat: undefined, finished: undefined, artistName: undefined}
	$scope.newComic = {name: undefined, artist: undefined, cat: undefined, tag: undefined, finished: undefined}
	$scope.newComicUploadProgress = undefined

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
		addComic: 			{ visible: false, message: '', error: false },
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
		}).success((res) =>{
			$scope.newComicPage.file = undefined
			$scope.responseMessages.newComicPage = { 
				visible: true, 
				message: (res.message || res.error), 
				error: (res.error ? false : true)
			}
		})
	}


	$scope.addSelectedKeyword = function (keyword) {
		$scope.keywordAdding.keywordsToAdd.push(keyword)
		$scope.removeObjectFromArray($scope.allKeywordsList, keyword)
	}


	$scope.sendAddedKeywords = function () {
		$http({
			url: '/api/keywords/addToComic',
			method: 'POST',
			data: {
				comicId: $scope.keywordAdding.comic.id,
				keywordAddList: extractOneValueFromObjectListToList($scope.keywordAdding.keywordsToAdd, 'KeywordName')
			}
		})
		.success((res) => {
			$scope.responseMessages.addKeywords = { 
				visible: true, 
				message: (res.message || res.error), 
				error: (res.error ? false : true)
			}
			refreshKeywordsForComic(keywordAdding.comic.name)
			$scope.keywordAdding.keywordsToDelete = []
			$scope.keywordAdding.keywordsToAdd = []
		})
	}


	$scope.sendDeleteKeywords = function () {
		$http({
			url: '/api/keywords',
			method: 'DELETE',
			data: {
				comicId: $scope.keywordAdding.comic.id,
				keywordsToDelete: extractOneValueFromObjectListToList($scope.keywordAdding.keywordsToDelete, 'KeywordName')
			}
		})
		.success((res) => {
			$scope.responseMessages.addKeywords = { 
				visible: true, 
				message: (res.message || res.error),
				error: (res.error ? false : true)
			}
			refreshKeywordsForComic(keywordAdding.comic.name)
			$scope.keywordAdding.keywordsToDelete = []
			$scope.keywordAdding.keywordsToAdd = []
		})
	}


	$scope.keywordKeyPressed = function (event) {
		if (event.key == 'Enter') { $scope.addSelectedKeyword($scope.currentlySelectedKeyword) }
	}


	$scope.toggleKeywordDeletion = function (keyword) {
		if (objectArrayIndexOf($scope.keywordAdding.keywordsToDelete, keyword) == -1) {
			$scope.keywordAdding.keywordsToDelete.push(keyword)
		}
		else {
			$scope.removeObjectFromArray(keywordAdding.keywordsToDelete, keyword)
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
			url: '/api/comics/' + correctComic.comic.name,
			method: 'PUT',
			data: {
				cat: correctComic.cat,
				tag: correctComic.tag,
				finished: correctComic.finished,
				artistName: correctComic.artist.Name
			}
		})
		.success((res) => {
			$scope.responseMessages.correctComic = { 
				visible: true, 
				message: (res.message || res.error), 
				error: (res.error ? false : true)
			}
			$scope.correctComic = {comic: undefined, tag: undefined, cat: undefined, finished: undefined, artistName: undefined}
		})
	}


	$scope.uploadNewComicImages = function (files) {
		$scope.files = files
		Upload.upload({
			url: '/api/comics/new',
			data: { 
				files: files,
				comicDetails: {name: $scope.newComic.name, artist: $scope.newComic.artist.Name, cat: $scope.newComic.cat, tag: $scope.newComic.tag, finished: $scope.newComic.finished}
			}
		})
		.then(
			function (res) => {
				$timeout(function () {
					$scope.responseMessages.newComic = {
						visible: true,
						message: (res.message || res.error),
						error: (res.error ? false : true)
					}
					if (!res.error) {
						$scope.newComic = {name: undefined, artist: undefined, cat: undefined, tag: undefined, finished: undefined}
						$scope.files = undefined
					}
				})
			},
			function (res) {},
			function (evt) { 
				$scope.newComic.uploadProgress = Math.min(100, parseInt(100.0 * evt.loaded / evt.total))
			}
		)
	}




	function getKeywordList () {
		$http.get('/api/keywords').success((res) => { $scope.allKeywordsList = res })
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
  	correctComic.tag = correctComic.comic.tag
  	correctComic.cat = correctComic.comic.cat
  	correctComic.finished = correctComic.comic.finished
  	correctComic.artistName = {Name: correctComic.comic.artist}
  })


	$scope.removeObjectFromArray = function (arr, obj) {
		let foundIndex = undefined
		let keys = Object.keys(obj)
		let values = Object.values(obj)

		for (var i=0; i<arr.length; i++) {
			for (var j=0; j<keys.length; j++) {
				if (arr[i][keys[j]] != values[j]) {
					break
				}
				if (j == keys.length-1) {
					foundIndex = i
				}
			}
		}

		if (foundIndex) { arr.splice(foundIndex, 1) }
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


	function init () {
		refreshSession ()
	}


	function refreshSession () {
		todo this
	}

}])
