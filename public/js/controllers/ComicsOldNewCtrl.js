angular.module('ComicsOldNewCtrl', []).controller('ComicsOldNewController', ['$scope', '$http', function ($scope, $http) {

$scope.editMode = false
$scope.showIds = false
$scope.pp = false
document.getElementById('theBody').classList.add('dark-colors')
$scope.imageList = []
$scope.monthCounts = []


$scope.assignRating = function (image) {
  $http({
    url: '/api/listRagAssignRating',
    method: 'POST',
    data: { id: image.id, newRating: image.newRating }
  }).success((res) => {
    image.rating = image.newRating
    image.newRating = undefined
  })
}

$http.get('/api/listRagGetImages').success((data) => {
  calculateMonthCounts()

  for (var x of data) {
    x.added = x.added.substring(0,10)
    $scope.imageList.push(x)
  }

  $scope.sortRating()
})

function calculateMonthCounts () {
  for (var x of $scope.imageList) {
    console.log('caluclating')
    let imageDate = new Date(x.added)
    let imageYear = imageDate.getUTCFullYear()
    let imageMonth = imageDate.getMonth()

    let found = false
    for (var entry of $scope.monthCounts) {
      if (entry.year == imageYear && entry.month == imageMonth) {
        entry.count += 1
        found = true
      }
    }

    if (!found) {
      $scope.monthCounts.push({year: imageYear, month: imageMonth, count: 1})
    }
  }

  $scope.imageList.sort((i1, i2) => {
    if (i1.year > i2.year) { return -1 }
    else if (i1.year < i2.year) { return 1 }
    else {
      if (i1.month > i2.month) { return -1 }
      else if (i1.month < i2.month) { return 1 }
      else { return 0 }
    }
  })
}

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

$scope.monthNumberToString = function (monthNumber) {
  return months[monthNumber]
}

$scope.logClick = function (imageId) {
  $http({
    url: '/api/listRagLogClick',
    method: 'POST',
    data: { imageId: imageId }
  })
}

$scope.sortRating = function () {
  $scope.imageList.sort(function(a, b) {return b.rating - a.rating})
}

$scope.sortDate = function () {
  $scope.imageList = $scope.imageList.sort(function(a, b) {
    let aDate = new Date(a.added)
    let bDate = new Date(b.added)
    if (bDate > aDate) { return 1 }
    else if (aDate > bDate) { return -1 }
    else { return 0 }
  })
}

$scope.togglePp = function () {
  $scope.pp = !$scope.pp
}

$http({
  url: '/api/listRagLogClick',
  method: 'POST',
  data: { imageId: 9999 }
})
}])
