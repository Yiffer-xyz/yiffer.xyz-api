
angular.module('ContactCtrl', ['ngCookies']).controller('ContactController', ['$scope', '$http', '$cookies', function ($scope, $http, $cookies) {

  $scope.loggedin = false
  $scope.hideThings = false

  $scope.submitFeedback = function () {
    $http({
      url: '/api/feedback',
      method: 'POST',
      data: { feedback: $scope.contactContent }
    })
    .success((res) => {
      if (res.message && res.message == 'success') { $scope.hideThings = true }
    })
  }


  function refreshSession () {
    $http.get('/userSession')
      .success (function (res) {
        $scope.loggedin = res.status
        sendLog()
      })
  }
  

  function onPageLoad() {
    refreshSession()
  }


  function sendLog () {
    $http({
      url: '/api/log',
      method: 'POST',
      data: {
        path: '/contact',
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


  onPageLoad()

}])
