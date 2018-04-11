angular.module('ComicsDetailCtrl', ['ngCookies']).controller('ComicsDetailController', ['$scope', '$routeParams', '$http', '$cookies', '$anchorScroll', function ($scope, $routeParams, $http, $cookies, $anchorScroll) {

  $scope.loggedin = false
  $scope.yourRating = null
  $scope.comicName = $routeParams.comicName
  $scope.artist = ''
  $scope.f404 = false
  $scope.brightColors = true
  $scope.keywords = []

  $scope.prevComicName   = null
  $scope.nextComicName   = null
  $scope.showComicLink   = false
  $scope.donator         = false
  $scope.someFolderName  = ''

  $scope.showKeywordSuggestions = false
  $scope.showWaitingMessage = false
  $scope.suggestKeywordErrorMessage = ''
  $scope.suggestKeywordSuccessMessage = ''

  var hasLogged = false

  function initImages () {
    $http.get('/api/comics/' + $scope.comicName)
    .success(function (res) {
      if (res.error) {
        $scope.f404 = true
      }
      else {
        $scope.comicId = res.comicId
        $scope.artist  = res.artist
        $scope.yourRating = res.yourRating
        $scope.keywords = res.keywords
        $scope.prevComicName = res.previousComic
        $scope.nextComicName = res.nextComic
      }

      let temp = []
      for (var i = 1; i < res.numberOfPages+1; i++) {
        temp.push({src: '../comics/' + $scope.comicName + '/' + ((i < 10) ? '0' + (i) : '' + (i)) + '.jpg'})
      }
      $scope.images = temp    
    })
  }


  $scope.resizeImage = function ($event) {
    var imageClicked = $event.currentTarget

    if (imageClicked.className.indexOf('comic-image-fit-height') >= 0) {
      imageClicked.className = imageClicked.className.replace(/comic-image-fit-height/, 'comic-image-fit-width')
    } else if (imageClicked.className.indexOf('comic-image-fit-width') >= 0) {
      imageClicked.className = imageClicked.className.replace(/comic-image-fit-width/, 'comic-image-big')
    } else if (imageClicked.className.indexOf('comic-image-big') >= 0) {
      imageClicked.className = imageClicked.className.replace(/comic-image-big/, 'comic-image-thumb')
    } else if (imageClicked.className.indexOf('comic-image-thumb') >= 0) {
      imageClicked.className = imageClicked.className.replace(/comic-image-thumb/, 'comic-image-fit-height')
    }
  }

  $scope.resizeAllImages = function (requestedSize) {
    var images = document.getElementsByClassName('comic-detail-image')
    Array.prototype.forEach.call(images, function (im) {
      im.className = im.className.split('comic-image-thumb').join('').split('comic-image-big').join('').split('comic-image-fit-height').join('').split('comic-image-fit-width').join('')
      im.className += ' ' + requestedSize
    })
  }

  $scope.setBrightColors = function (bool) {
    document.getElementById('theBody').classList.remove('bright-colors')
    document.getElementById('theBody').classList.remove('dark-colors')
    document.getElementById('theBody').classList.add(bool ? 'bright-colors' : 'dark-colors')
    $cookies.put('colorTheme', JSON.stringify(bool))
    $scope.brightColors = bool
  }

  function getYourRating () {
    $http.get(`/api/comics/${$scope.comicName}/userRating`)
    .success((res) => {
      $scope.yourRating = res.rating 
      if (res.rating == 0) { $scope.yourRating = null }
    })
  }


  //  ///////////////////////// MODAL ///////////////////////////
  // login-modal
  $scope.modalLogin = true
  $scope.validInputs = {username: false, password: false}
  $scope.showModalErrorMessage = false
  $scope.modalErrorMessage = ''

  var closeModal = function () {
    let loginModal = document.getElementById('modal-1')
    let votingModal = document.getElementById('modal-2')
    let overlay = document.getElementById('modal-overlay')

    $scope.modalErrorMessage = ''
    $scope.showModalErrorMessage = false

    overlay.style.visibility = 'hidden'
    document.getElementById('modal-1').classList.remove('modal-show')
    document.getElementById('modal-2').classList.remove('modal-show')

    document.getElementById('usernameInputContainer').classList.remove('input--filled')
    document.getElementById('passwordInputContainer').classList.remove('input--filled')

    document.getElementById('inputUsername').value = ''
    document.getElementById('inputPassword').value = ''
  }

  $scope.openLoginModal = function () {
    // if user already logged in, log out
    if ($scope.loggedin) {
      $http.get('/logout')
      return setTimeout(function () { $scope.loggedin = false }, 10) // prevent multiple fires from 1 press
    }

    var modal =   document.getElementById('modal-1')
    var overlay = document.getElementById('modal-overlay')
    var close =   document.getElementById('closeLoginModalButton')

    overlay.style.visibility = 'visible'
    modal.classList.add('modal-show')

    overlay.addEventListener('click', closeModal)
    close.addEventListener('click', closeModal) // click, function (ev) {ev.stoppropagation too?
  }

  $scope.openVotingModal = function () {
    let modal = document.getElementById('modal-2')
    let overlay = document.getElementById('modal-overlay')

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
      username: document.querySelectorAll('.input-field')[0].value,
      password: document.querySelectorAll('.input-field')[1].value
    }

    $http.post(($scope.modalLogin ? '/login' : '/register'), data)
      .success(function (res) {
        // if user successfully logs in / registers
        if (res.success) {
          $scope.loggedin = true
          $scope.username = res.message
          $scope.modalUsername = ''
          $scope.modalPassword = ''
          closeModal()

          getYourRating()

          authorizeDonator()

        } else { // unsuccessful login / register
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


  $scope.initKeywordSuggestions = function () {
    $scope.showKeywordSuggestions = true
    $http({
      url: '/api/keywordsNotInComic',
      method: 'GET',
      params: {comicId: $scope.comicId}
    }).success((res) => {
      $scope.addKeywordList = res
    })
  }


  $scope.sendKeywordAddition = function (keywordName) {
    sendKeywordSuggestion(keywordName, true)
  }

  
  $scope.sendKeywordRemoval = function (keywordName) {
    sendKeywordSuggestion(keywordName, false)
  }


  function sendKeywordSuggestion (keywordName, addition) {
    $scope.showWaitingMessage = true
    $scope.suggestKeywordSuccessMessage = ''
    $scope.suggestKeywordErrorMessage = ''
    $http({
      url: '/api/keywords/suggestions',
      method: 'POST',
      data: {
        comicId: $scope.comicId,
        suggestedKeyword: keywordName,
        extension: addition
      }
    }).success((res) => {
      $scope.showWaitingMessage = false
      if (res.error) { $scope.suggestKeywordErrorMessage = `${res.error} (${keywordToAdd})` }
      else if (res.message) { $scope.suggestKeywordSuccessMessage = `${res.message} (${keywordToAdd})` }
    })
  }


  // Validation for login/register form
  // USERNAME
  var usernamePattern = /^[a-zA-Z][\w\d_-]{1,19}$/
  $scope.$watch('modalUsername', function () {
    if ($scope.modalUsername && usernamePattern.test($scope.modalUsername) && !$scope.validInputs.username) {
      document.getElementById('inputUsername').classList.add('input-field-valid')
      document.getElementById('inputLabelUsername').classList.add('input-field-valid')
      $scope.validInputs.username = true
    } else if ($scope.modalUsername && !usernamePattern.test($scope.modalUsername) && $scope.validInputs.username) {
      document.getElementById('inputUsername').classList.remove('input-field-valid')
      document.getElementById('inputLabelUsername').classList.remove('input-field-valid')
      $scope.validInputs.username = false
    }
  })
  // PASSWORD
  $scope.$watch('modalPassword', function () {
    if ($scope.modalPassword && $scope.modalPassword.length >= 6 && !$scope.validInputs.password) {
      document.getElementById('inputPassword').classList.add('input-field-valid')
      document.getElementById('inputLabelPassword').classList.add('input-field-valid')
      $scope.validInputs.password = true
    } else if ($scope.modalPassword && $scope.modalPassword.length < 6 && $scope.validInputs.password) {
      document.getElementById('inputPassword').classList.remove('input-field-valid')
      document.getElementById('inputLabelPassword').classList.remove('input-field-valid')
      $scope.validInputs.password = false
    }
  })

  $scope.comicVote = function () {
    $scope.openVotingModal()
    $scope.voteForComic = $scope.comicName
    $scope.colorVoteSquares = $scope.yourRating
    $scope.enterGlow = false

    var prevPress
    var prevKeyPressTime = 0

    // set up the listener for keypresses, destroy it when modal closes
    // var listenForKeys = function () {
    document.onkeypress = function (e) {
      // prevent multiple fires from one press
      if ((new Date()).getTime() - prevKeyPressTime < 30) return
      prevKeyPressTime = (new Date()).getTime()

      $scope.$apply(function () {
      //     0  1  2  3  4  5  6  7  8  9
        var ind = [48, 49, 50, 51, 52, 53, 54, 55, 56, 57].indexOf(e.keyCode)
        if (ind >= 0) {  // number was pressed
          $scope.enterGlow = true
          $scope.colorVoteSquares = ind
          if (ind === 0 && prevPress === 1) { // if 1 then 0 ( = 10 )
            $scope.colorVoteSquares = 10
          }
        } else if (e.keyCode === 13 && $scope.enterGlow) { // enter was pressed
          $scope.sendVote($scope.colorVoteSquares)
        } else {  // no number was pressed
          prevPress = 0
          $scope.colorVoteSquares = $scope.yourRating
          $scope.enterGlow = false
        }
        prevPress = ind
      })
    }

    $scope.voteModalMouseover = function (i) {
      $scope.colorVoteSquares = i
      $scope.enterGlow = false
      prevPress = 0
    }
    $scope.voteModalMouseout = function () {
      $scope.colorVoteSquares = $scope.voteForComic.yourRating
    }
  }


  $scope.sendVote = function (vote) {
    closeModal()
    var voteData = {vote: vote, comicId: $scope.comicId}
    $http.post('/api/addVote', voteData)
      .success(function (res) {
        $scope.yourRating = vote
      })
  }


  Date.prototype.toNiceString = function () {
    return this.toDateString().substr(4)
  }


  function initColorTheme () {
    var colors = $cookies.get('colorTheme')
    if (colors && !JSON.parse(colors))
      $scope.setBrightColors(false)
    else 
      $scope.setBrightColors(true)
  }


  function refreshSession () {
    $http.get('/userSession')
      .success (function (res) {
        $scope.loggedin = res.status
        $scope.username = res.username

        if (!hasLogged) sendLog()

        if (res.status) {
          authorizeDonator()
        }
      })
  }

  function authorizeDonator () {
    $http.get('/authorizeDonator')
      .success(function (res) {
        if (res.donator === true) {
          $scope.donator = true
          $scope.someFolderName = res.key
        }
      })
  }

  function sendLog () {
    hasLogged = true
    $http({
      url: '/api/log',
      method: 'POST',
      data: {
        path: '/' + $scope.comicName,
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


  function onPageLoad() {
    setTimeout(initInput, 200)  // wtf why i need do dis
    initColorTheme()
    refreshSession()
    $anchorScroll()
  }
  initImages()
  onPageLoad()

}])
