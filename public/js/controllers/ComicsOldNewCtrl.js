angular.module('ComicsOldNewCtrl', []).controller('ComicsOldNewController', ['$scope', '$http', function ($scope, $http) {

$scope.editMode = false
$scope.pp = false
document.getElementById('theBody').classList.add('dark-colors')
$scope.imageList = []



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
  for (var x of data) {
    x.added = x.added.substring(0,10)
    $scope.imageList.push(x)
  }

  $scope.sortRating()
})

$scope.logClick = function (imageId) {
  console.log('logging ', imageId)
  $http({
    url: '/api/listRagLogClick',
    method: 'POST',
    data: { imageId: imageId }
  })
}

$scope.sortRating = function () {
  console.log('sorting rating')
  $scope.imageList.sort(function(a, b) {return b.rating - a.rating})
}

$scope.sortDate = function () {
  console.log('sorting date')
  $scope.imageList = $scope.imageList.sort(function(a, b) {
    console.log(a, b, a.added)
    let aDate = new Date(a.added)
    let bDate = new Date(b.added)
    if (bDate > aDate) { console.log(1);return 1 }
    else if (aDate > bDate) { console.log(-1);return -1 }
    else { console.log(0, 222);return 0 }
  })
}

$scope.togglePp = function () {
  $scope.pp = !$scope.pp
  console.log($scope.pp)
}
console.log('asd hei')

console.log('logging visit')
$http({
  url: '/api/listRagLogClick',
  method: 'POST',
  data: { imageId: 9999 }
})
}])
