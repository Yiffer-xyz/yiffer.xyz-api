angular.module('ArtistCtrl', []).controller('ArtistController', ['$scope', '$routeParams', '$http', '$cookies', '$window', '$anchorScroll', function ($scope, $routeParams, $http, $cookies, $window, $anchorScroll) {

  $scope.f404 = false
  $scope.artistName = $routeParams.artistName

  $scope.showNoLinksMessage  = false
  $scope.showNoImagesMessage = false
  $scope.comicList = []
  $scope.linkList  = []

  $scope.modFavoriteImages = []

  $scope.brightColors = true

  $scope.thumbSizes = 'big'
  $scope.smallThumbs = true  
  $scope.comicThumbImgStyle = 'thumb-image-big'
  $scope.thumbContainerStyle = 'thumb-container-big'
  
  function onPageLoad() {
    $anchorScroll()
    initColors()
    initContent()
    refreshSessionAndSendLog()
  }


  function initContent () {  // todo add
    $http.get('/api/artists/' + $scope.artistName)
    .success((res) => {
      if (res.error && res.error == '404') {
        $scope.f404 = true
        return
      }

      $scope.comicList = res.comicList
      $scope.linkList = res.linkList
      if ($scope.linkList.length == 0) { $scope.showNoLinksMessage = true }
      $scope.modFavoriteImages = res.modFavoriteList
    })
  }


  function sendLog () {
    $http({
      url: '/api/addLog',
      method: 'POST',
      data: {
        path: '/artist/' + $scope.artistName,
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


  function refreshSessionAndSendLog () {
    $http.get('/userSession')
      .success (function (res) {
        $scope.username = res.username ? res.username : ''
        sendLog()
      })
  }


  $scope.openImage = function (imageMod) {
    $window.open('https://yiffer.xyz/mod-favorites/'+ imageMod +'/'+ $scope.artistName +'.jpg')
  }


  $scope.setBrightColors = function (isBrightColorScheme) {
    $scope.brightColors = isBrightColorScheme
    document.getElementById('theBody').classList.remove('bright-colors')
    document.getElementById('theBody').classList.remove('dark-colors')
    document.getElementById('theBody').classList.add(isBrightColorScheme ? 'bright-colors' : 'dark-colors')
    $cookies.put('colorTheme', JSON.stringify(isBrightColorScheme))
  }


  function initColors () {
    var col = $cookies.get('colorTheme')
    if (col && JSON.parse(col)) { $scope.setBrightColors(true) }
    else if (col && !JSON.parse(col)) { $scope.setBrightColors(false) }
    else { $scope.setBrightColors(true) }
  }


  onPageLoad() 

}])
