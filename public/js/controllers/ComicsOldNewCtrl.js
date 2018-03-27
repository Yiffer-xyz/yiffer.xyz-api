angular.module('ComicsOldNewCtrl', []).controller('ComicsOldNewController', ['$scope', '$http', function ($scope, $http) {

$scope.editMode = false
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

  sortRating()
})


function sortRating () {
  $scope.imageList.sort(function(a, b) {return b.rating - a.rating})
}


}])
