angular.module('AdminCtrl', []).controller('AdminController', ['$scope', '$http',
  function ($scope, $http) {


    $scope.logs = []
    $scope.approvals = []
    $scope.now = (new Date()).toTimeString().substring(0,5)

    $http.get('/api/tagLog')
      .success(function (res) {
        for (var x of res) {
          var newTs = (new Date(x.Timestamp)).toTimeString().substring(0,5)
          x.Timestamp = newTs
          $scope.logs.push(x)
        }
        $scope.logs = res
      })


    $http.get('/api/completedKeywordSuggestions')
      .success(function (res) {
        $scope.approvals = res
      })

  }
])
