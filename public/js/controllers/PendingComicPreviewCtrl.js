angular.module('PendingComicPreviewCtrl', []).controller('PendingComicPreviewController', ['$scope', '$routeParams', '$http', function ($scope, $routeParams, $http) {

  $scope.comicName = $routeParams.comicName
  $scope.pageList = []

  $http.get(`/api/modPanel/suggestedComics/${$scope.comicName}/numberOfPages`)
  .success((res) => {
    let numberOfPages = res.numberOfPages
    for (var i=1; i<=numberOfPages; i++) {
      $scope.pageList.push( (i<10) ? ('0'+i+'.jpg') : (i+'.jpg') )
    }
  })

}])
