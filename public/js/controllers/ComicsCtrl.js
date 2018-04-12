angular.module('ComicsCtrl', ['ngCookies']).controller('ComicsController', ['$scope', '$http', '$cookies', '$anchorScroll', function ($scope, $http, $cookies, $anchorScroll) {

  // general
  $scope.loggedin = false
  $scope.username = undefined
  $scope.comicsMode = true

  // for the list itself
  $scope.tag = {list: [], all: true}
  $scope.cat = {list: [], all: true}
  $scope.sort = 'id'

  // login-modal
  $scope.modalLogin = true
  $scope.validInputs = {username: false, password: false}
  $scope.showModalErrorMessage = false
  $scope.modalErrorMessage = ''

  // lists
  var comicList = []
  var allComicsList = []

  // pagination
  $scope.currentPage = 1
  var comicsPerPage = 100
  $scope.pageNumberArray = [1]  // for the 1, 2, 3, .. page navigation menu
  $scope.showComicsList = []

  // vote-modal
  $scope.enterGlow = false
  $scope.colorVoteSquares = 0
  var prevPress
  var prevKeyPressTime = 0

  $scope.brightColors = true

  $scope.thumbSizes = 'big'
  $scope.smallThumbs = false 
  $scope.comicThumbImgStyle = 'thumb-image-big'
  $scope.thumbContainerStyle = 'thumb-container-big'

  $scope.showKeywords = false

  $scope.finishedComicsOnly = false

  var hasLogged = false

  var keywordSearchList = []
  $scope.hasFocusedSearchBar = false

  $scope.setBrightColors = function (bool) {
    $scope.brightColors = bool
    document.getElementById('theBody').classList.remove('bright-colors')
    document.getElementById('theBody').classList.remove('dark-colors')
    document.getElementById('theBody').classList.add(bool ? 'bright-colors' : 'dark-colors')
    $cookies.put('colorTheme', JSON.stringify(bool))
  }

  $scope.nextPage = function (anchorScroll=false) {
    if ($scope.currentPage < $scope.pageNumberArray[$scope.pageNumberArray.length - 1]) {
      $scope.currentPage += 1
      updateShownComicsList()
      if (anchorScroll) { $anchorScroll() }
    }
  }
  $scope.prevPage = function (anchorScroll=false) {
    if ($scope.currentPage > 1) { 
      $scope.currentPage -= 1 
      updateShownComicsList()
      if (anchorScroll) { $anchorScroll() }
    }
  }
  $scope.setPage = function (pageNumber, anchorScroll=false) {
    $scope.currentPage = pageNumber
    updateShownComicsList()
    if (anchorScroll) { $anchorScroll() }
  }

  function setPageNumberOne () {
    $scope.currentPage = 1
  }

  function updateShownComicsList () {
    $scope.shownComicsList = comicList.slice( comicsPerPage*($scope.currentPage-1), comicsPerPage*($scope.currentPage) )
    $scope.$applyAsync()
  }
  function sortAndfilterComicListAndUpdateShownComicsList () {
    allComicsList.sort(sortComics)
    filterComicListAndUpdateShownComicsList()
  }
  function filterComicListAndUpdateShownComicsList () {
    setPageNumberOne()
    comicList = allComicsList.filter(filterComics)
    updateShownComicsList()
    updatePageNavigationList()
  }

  function updatePageNavigationList () {
    $scope.pageNumberArray = [1]
    for (var i = 1; i < Math.ceil(comicList.length / comicsPerPage); i++) {
      $scope.pageNumberArray.push(i+1)
    }
  }

  $scope.comicVote = function (comicObject) {
    // function is called with null as param if it's not meant to be used, so abort
    if (!comicObject) return
    if (!$scope.loggedin) return $scope.openLoginModal()

    $scope.openVotingModal()
    $scope.voteForComic = comicObject
    $scope.colorVoteSquares = comicObject.yourRating

    $scope.voteModalMouseover = function (i) {
      $scope.colorVoteSquares = i
      prevPress = 0
    }
    $scope.voteModalMouseout = function () {
      $scope.colorVoteSquares = $scope.voteForComic.yourRating
    }
  }

  $scope.setFilter = function (filterWhat, tagName) {
    var filterThing = (filterWhat === 'tag') ? $scope.tag : $scope.cat

    // if turning All ON
    if (tagName === 'All') {
      filterThing.all = true
      filterThing.list = []
    } 
    else {
      // if All is ON, and turning something else ON
      if (filterThing.all) {
        filterThing.all = false
      }

      // add tag to the list
      if (filterThing.list.indexOf(tagName) < 0) {
        filterThing.list.push(tagName)
      } 
      // remove tag from the list
      else {
        filterThing.list.splice(filterThing.list.indexOf(tagName), 1)
      }

      // if last tag was removed
      if (filterThing.list.length === 0) {
        filterThing.all = true
      }
    }
    setFilterOrSortCookie(filterWhat)
    filterComicListAndUpdateShownComicsList()
  }

  $scope.$watch('searchInput', function (newValue, oldValue) {
    updateKeywordSearchList()
    filterComicListAndUpdateShownComicsList()
    keywordSearch()
  })

  $scope.setSort = function (sortName) {
    switch (sortName) {
      case 'Recently added':
        $scope.sort = 'id'
        break
      case 'Your rating':
        $scope.sort = 'yourRating'
        break
      case 'User rating':
        $scope.sort = 'userRating'
        break
      case 'artist':
        $scope.sort = 'artist'
        break
    }
    setFilterOrSortCookie('sort')
    sortAndfilterComicListAndUpdateShownComicsList()
  }

  $scope.setThumbSizes = function (size) {
    $scope.thumbSizes = size
    $scope.comicThumbImgStyle = size === 'big' ? 'thumb-image-big' : 'thumb-image-small'
    $scope.thumbContainerStyle = size === 'big' ? 'thumb-container-big' : 'thumb-container-small'
    $scope.smallThumbs = size !== 'big'
  }

  function sortComics (c1, c2) {
    if ($scope.sort === 'id') {
      if (c1.updated === c2.updated) { return c2.id - c1.id }
      else { return (new Date(c2.updated)).getTime() - (new Date(c1.updated)).getTime() }
    }

    else {
      return c2[$scope.sort] - c1[$scope.sort]
    }
  }

  // function filterComics (c) {
  //   if (!$scope.tag.all && $scope.tag.list.indexOf(c.tag) < 0) { return false }
  //   if (!$scope.cat.all && $scope.cat.list.indexOf(c.cat) < 0) { return false }
  //   if ($scope.searchInput) {
  //     if (c.artist.toLowerCase().indexOf($scope.searchInput.toLowerCase())<0 && c.name.toLowerCase().indexOf($scope.searchInput.toLowerCase())<0) { return false }
  //   }

  //   return true
  // }

  $scope.sendVote = function (comic, number) {
    $http.post('/api/addVote', {vote: number, comicId: comic.id})
      .success(function (res) {
          refreshSession()
          assignRatingToComic(res, number, comic.id)
          closeModal()
      })
  }

  function assignRatingToComic(userRating, yourRating, comicId) {
    userRating = fixUserRating(userRating)
    for (var i=0; i<$scope.shownComicsList.length; i++) {
      if ($scope.shownComicsList[i].id == comicId) {
        $scope.shownComicsList[i].userRating = userRating
        $scope.shownComicsList[i].yourRating = yourRating
        break
      }
    }
    for (var i=0; i<allComicsList.length; i++) {
      if (allComicsList[i].id == comicId) {
        allComicsList[i].userRating = userRating
        allComicsList[i].yourRating = yourRating
        break
      }
    }
    for (var i=0; i<comicList.length; i++) {
      if (comicList[i].id == comicId) {
        comicList[i].userRating = userRating
        comicList[i].yourRating = yourRating
        break
      }
    }
    $scope.$applyAsync()
  }

  var closeModal = function () {
    var loginModal =  document.getElementById('modal-1')
    var votingModal = document.getElementById('modal-2')
    var overlay =     document.getElementById('modal-overlay')

    $scope.modalErrorMessage = ''
    $scope.showModalErrorMessage = false

    overlay.style.visibility = 'hidden'
    loginModal.classList.remove('modal-show')
    votingModal.classList.remove('modal-show')

    document.getElementById('usernameInputContainer').classList.remove('input--filled')
    document.getElementById('passwordInputContainer').classList.remove('input--filled')
    document.getElementById('inputUsername').value = ''
    document.getElementById('inputPassword').value = ''
  }

  $scope.openLoginModal = function () {
    // if user already logged in, log out
    if ($scope.loggedin) {
      $http.get('/logout')
      $scope.username = undefined
      $scope.loggedin = false
      return
    }

    var modal =   document.getElementById('modal-1')
    var overlay = document.getElementById('modal-overlay')
    var close =   document.getElementById('closeLoginModalButton')

    overlay.style.visibility = 'visible'
    modal.classList.add('modal-show')

    overlay.addEventListener('click', closeModal)
    close.addEventListener('click', closeModal)
  }

  $scope.openVotingModal = function () {
    var modal = document.getElementById('modal-2')
    var overlay = document.getElementById('modal-overlay')

    overlay.style.visibility = 'visible'
    modal.classList.add('modal-show')

    overlay.addEventListener('click', closeModal)
  }

  function initInput () { // TODO make this not shit
    Array.prototype.slice.call(document.querySelectorAll('input.input-field')).forEach(function (inputEl) {
      // in case the input is already filled..
      if (inputEl.value.trim() !== '') {
        inputEl.parentNode.classList.add('input--filled')
      }

      // events:
      inputEl.addEventListener('focus', onInputFocus)
      inputEl.addEventListener('blur', onInputBlur)
    })

    function onInputFocus (ev) {
      ev.target.parentNode.classList.add('input--filled')
    }

    function onInputBlur (ev) {
      if (ev.target.value.trim() === '') {
        ev.target.parentNode.classList.remove('input--filled')
      }
    }
  }

  $scope.fireLoginOrRegister = function () {
    var data = {
      username: $scope.modalUsername,
      password: $scope.modalPassword,
      email: $scope.modalEmail
    }

    $http.post(($scope.modalLogin ? '/login' : '/register'), data)
      .success(function (res) {
        if (res.success) {
          $scope.loggedin = true
          $scope.username = res.message
          $scope.modalUsername = ''
          $scope.modalPassword = ''
          closeModal()

          refreshSession()
          getComicList()
        } else { 
          $scope.modalErrorMessage = res.message
          $scope.showModalErrorMessage = true

          if (res.message === 'wrong password') {
            $scope.modalPassword = ''
          } else if (res.message === 'wrong username') {
            $scope.modalUsername = ''
            $scope.modalPassword = ''
          } else {
            $scope.modalUsername = ''
            $scope.modalPassword = ''
          }
        }
      })
  }

  // Validation for login/register form
  // USERNAME
  var usernamePattern = /^[a-zA-Z][\w\d_-]{1,19}$/
  $scope.$watch('modalUsername', function () {
    if ($scope.modalUsername && usernamePattern.test($scope.modalUsername) && !$scope.validInputs.username) {
      document.querySelector('#inputUsername').className += ' input-field-valid'
      document.querySelector('#inputLabelUsername').className += ' input-label-valid'
      $scope.validInputs.username = true
    } else if ($scope.modalUsername && !usernamePattern.test($scope.modalUsername) && $scope.validInputs.username) {
      document.querySelector('#inputUsername').className = document.querySelector('#inputUsername').className.replace(' input-field-valid', '')
      document.querySelector('#inputLabelUsername').className = document.querySelector('#inputLabelUsername').className.replace(' input-label-valid', '')
      $scope.validInputs.username = false
    }
  })
  // PASSWORD
  $scope.$watch('modalPassword', function () {
    if ($scope.modalPassword && $scope.modalPassword.length >= 6 && !$scope.validInputs.password) {
      document.querySelector('#inputPassword').className += ' input-field-valid'
      document.querySelector('#inputLabelPassword').className += ' input-label-valid'
      $scope.validInputs.password = true
    } else if ($scope.modalPassword && $scope.modalPassword.length < 6 && $scope.validInputs.password) {
      document.querySelector('#inputPassword').className = document.querySelector('#inputPassword').className.replace(' input-field-valid', '')
      document.querySelector('#inputLabelPassword').className = document.querySelector('#inputLabelPassword').className.replace(' input-label-valid', '')
      $scope.validInputs.password = false
    }
  })

  var oneWeekAgo = new Date( (new Date()).getTime() - 7*86400000 )
  $scope.isNewComic = function (co) { return new Date(co.created) > oneWeekAgo }

  function getComicList () {
    $http.get('/api/comics')
      .success((data) => {
        for (var d of data) {
          d.userRating = fixUserRating(d.userRating)
          d.keywords = []
        }
        allComicsList = data

        getKeywords()
      })
  }

  function getKeywords () {
    $http.get('/api/keywords/inIdOrder')
      .success((keywordsData) => {
        for (var i=0; i<keywordsData.length; i++) {
          allComicsList[i]['keywords'] = keywordsData[i]
        }
        sortAndfilterComicListAndUpdateShownComicsList()
      })
  }

  function refreshSession () {
    $http.get('/userSession')
      .success (function (res) {
        $scope.loggedin = res.status
        $scope.username = res.username
        if (!hasLogged) sendLog()
      })
  }

  function sendLog () {
    hasLogged = true
    $http({
      url: '/api/log',
      method: 'POST',
      data: {
        path: '/',
        username: $scope.username,
        dailyCookie: getDailyCookie(),
        monthlyCookie: getMonthlyCookie()
      }
    })
  }

  function getDailyCookie () {
    var currentDailyCookie = $cookies.get('userDailyCookie')
    return currentDailyCookie || setDailyCookie()
  }

  function getMonthlyCookie () {
    var currentMonthlyCookie = $cookies.get('userMonthlyCookie')
    return currentMonthlyCookie || setMonthlyCookie()
  }

  function setDailyCookie () {
      var today = new Date()
      var cookieExpiry = new Date(today.getYear(), today.getMonth(), today.getDate()+1)
      var newCookie = generateCookie()
      $cookies.put('userDailyCookie', newCookie, [{expires: cookieExpiry}])
      return newCookie
  }

  function setMonthlyCookie () {
      var today = new Date()
      var cookieExpiry = new Date(today.getYear(), today.getMonth()+1, today.getDate())
      var newCookie = generateCookie()
      $cookies.put('userMonthlyCookie', newCookie, [{expires: cookieExpiry}])
      return newCookie
  }

  function generateCookie () {
    function s4() {
      return Math.floor((1 + Math.random()) * 0x10000)
        .toString(16)
        .substring(1)
    }
    return s4() + s4() + '-' + s4() + '-' + s4() + '-' + s4() + '-' + s4() + s4() + s4()
  }


  function setFilterOrSortCookie (type) {
    if (type === 'cat') { $cookies.put('catFilter', JSON.stringify($scope.cat)) }
    else if (type === 'tag') { $cookies.put('tagFilter', JSON.stringify($scope.tag)) }
    else if (type === 'sort') { $cookies.put('sortOrder', $scope.sort) }
  }

  function initFilterAndSortByCookies () {
    var catFilter = $cookies.get('catFilter')
    if (catFilter) { $scope.cat = JSON.parse(catFilter) }
    var tagFilter = $cookies.get('tagFilter')
    if (tagFilter) { $scope.tag = JSON.parse(tagFilter) }
    var sortOrder = $cookies.get('sortOrder')
    if (sortOrder) { $scope.sort = sortOrder }
  }

  function initColors () {
    var col = $cookies.get('colorTheme')
    if (col && JSON.parse(col)) { $scope.setBrightColors(true) }
    else if (col && !JSON.parse(col)) { $scope.setBrightColors(false) }
    else { $scope.setBrightColors(true) }
  }

  function initShowKeywords () {
    var showKws = $cookies.get('showKeywords')
    if (showKws && JSON.parse(showKws)) { $scope.showKeywords = true }
    else if (showKws && !JSON.parse(showKws)) { $scope.showKeywords = false }
  }

  $scope.setShowKeywords = function (bool) {
    $scope.showKeywords = bool
    $cookies.put('showKeywords', bool)
  }

  function fixUserRating (userRating) {
    if (userRating >= 8.5) { return Math.round(100 * userRating) / 100 }
    else { return Math.round(10 * userRating) / 10 }
  }

  function onPageLoad() {
    getComicList()
    refreshSession()
    $anchorScroll()

    initFilterAndSortByCookies()
    initColors()
    initShowKeywords()
    initInput()
  }

  onPageLoad()

  function keywordSearch () {
    $http.get('/api/keywords/autocomplete/' + currentSearchTerm)
    .success((res) => { 
      $scope.suggestedTags = res.slice(0,50)
    })
  }


  function updateKeywordSearchList () {
    currentSearchTerm = findCurrentSearchTerm($scope.searchInput)
    keywordSearchList = []
    if ($scope.searchInput) {
      var splitList = $scope.searchInput.split(';')
      keywordSearchList = splitList.slice(0, splitList.length-1)
      for (var i=0; i<keywordSearchList.length; i++) {
        keywordSearchList[i] = keywordSearchList[i].trim().toLowerCase()
      }
    }
  }


  // change the filtercomics to be this!!!
  function filterComics (comicObject) {
    if (!$scope.tag.all && $scope.tag.list.indexOf(comicObject.tag) < 0) { return false }
    if (!$scope.cat.all && $scope.cat.list.indexOf(comicObject.cat) < 0) { return false }
    if (keywordSearchList.length>0 && !filterForSearchTags(comicObject)) { return false }
    return true
  }

  // is used by filterComics when the search input isnt empty!!
  function filterForSearchTags (comicObject) {
    for (var searchTerm of keywordSearchList) {
      if ((comicObject.keywords.indexOf(searchTerm) < 0) &&
          (comicObject.artist.toLowerCase() != searchTerm) &&
          (comicObject.name.toLowerCase() != searchTerm)) {
        return false
      }
    }
    return true
  }

  function findCurrentSearchTerm () {
    if ($scope.searchInput) { return $scope.searchInput.substring($scope.searchInput.lastIndexOf(';') + 1).trim().toLowerCase() }
    return ''
  }

  $scope.selectTag = function (tag) {
    $scope.hasFocusedSearchBar = true
    if ($scope.searchInput) {
      if (currentSearchTerm) {
        if (keywordSearchList.length) {
          $scope.searchInput = keywordSearchList.join('; ') + '; ' + tag.name + '; '
        }
        else{
          $scope.searchInput = tag.name + '; '          
        }
      }
      else {
        $scope.searchInput += tag.name + '; '
      }
    }
    else {
      $scope.searchInput = tag.name + '; '
    }
    logKeywordSearch(tag.name)
  }

  function logKeywordSearch (keywordName) {
    $http({
      url: '/api/keywords/log',
      method: 'POST',
      data: {keywordName: keywordName}
    })
  }

}])