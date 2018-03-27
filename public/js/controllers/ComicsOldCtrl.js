angular.module('ComicsOldCtrl', []).controller('ComicsOldController', ['$scope', '$http', function ($scope, $http) {

  $scope.sort = 'id'
  $scope.comicList = []
  $scope.brightColors = true

  $scope.setBrightColors = function (bool) {
    $scope.brightColors = bool
    document.getElementById('theBody').classList.remove('bright-colors')
    document.getElementById('theBody').classList.remove('dark-colors')
    document.getElementById('theBody').classList.add(bool ? 'bright-colors' : 'dark-colors')
  }

  $scope.setSort = function (sortName) {
    switch (sortName) {
      case 'date':
        $scope.sort = 'added'
        break
      case 'rating':
        $scope.sort = 'rating'
        $scope.log('/oldmNet/sortByRating')
        break
    }
  }

  $scope.etFilter = function (im) {
    return im['added'] ? true : false
  }

  $scope.sortComics = function (comic) {
    if ($scope.sort === 'rating')
      return 10 - comic[$scope.sort]
    else
      return comic[$scope.sort] ? 1607727600000 - (new Date(comic[$scope.sort])).getTime() : 315619200000
  }



  function initColors () {
    if (col && JSON.parse(col)) 
      $scope.setBrightColors(true)
    else if (col && !JSON.parse(col))
      $scope.setBrightColors(false)
    else 
      $scope.setBrightColors(true)
  }

  function initList() {
    badIds = []
    $http.get('list_of_images.json')
      .success(function (data) {
        $scope.comicList = data
        $scope.setSort('date')
      })
  }

  $scope.nicer = function (oneDate) {
    return oneDate ? ((new Date(oneDate)).toDateString()).substr(4) : ''
  }

  initList()

  $scope.log = function (path) {
    $http({
      url: '/api/addLog',
      method: 'POST',
      data: {
        path: path
      }
    })
  }

  $scope.log('/oldmNet')

}])
