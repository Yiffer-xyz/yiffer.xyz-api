angular.module('ModIndexCtrl', []).controller('ModIndexController', ['$scope', '$http', function ($scope, $http) {

  $scope.mods = []


  $http.get('/api/getModNames')
    .success(function (res) {
      $scope.mods.push({username: 'Nouwa', favImages: [], comicVotes: []})
      $scope.mods.push({username: 'simstart', favImages: [], comicVotes: []})
      $scope.mods.push({username: 'kyle', favImages: [], comicVotes: []})
      for (var r of res) {
        if (r != 'malann' && r != 'FakeUsername' && r != 'Can1s_Major' && r != 'Errorstrikes' && r != 'Nouwa' && r != 'simstart' && r != 'kyle') {
          $scope.mods.push({username: r, favImages: [], comicVotes: []})
        }
      }
      $scope.mods.push({username: 'Errorstrikes', favImages: [], comicVotes: []})
      $scope.mods.push({username: 'malann', favImages: [], comicVotes: []})
      $scope.mods.push({username: 'Can1s_Major', favImages: [], comicVotes: []})
      $scope.mods.push({username: 'FakeUsername', favImages: [], comicVotes: []})

      for (var mod of res) {
        getFavImages(mod)
        getComicRatings(mod)  
      }
    })

  function getFavImages(modName) {
    $http({
      url: '/api/getModFavoriteImages',
      method: 'GET',
      params: {modName: modName}
    }).success(function (res) {

        // ugly but who cares it's just for the mods
        for (var i=0; i < $scope.mods.length; i++) {
          if ($scope.mods[i].username === res.modName) {
            $scope.mods[i].favImages = res.data
          }
        }
      })
  }

  function getComicRatings(modName) {

    $http({
      url: '/api/getComicRatings',
      method: 'GET',
      params: {modName: modName}
    }).success(function (res) {

      // ugly but who cares it's just for the mods
      for (var i=0; i < $scope.mods.length; i++) {
        if ($scope.mods[i].username === res.modName) {
          $scope.mods[i].comicVotes = res.data
        }
      }
    })
  }

  $scope.hotfixUsername = function (name) {
    if (name === 'Can1s_Major') return 'Can1s_Major (ex-mod)'
    else if (name === 'FakeUsername') return 'FakeUsername (ex-mod)'
    else if (name === 'malann') return 'malann (admin)'
    else if (name === 'Nouwa') return 'Nouwa (aka Mute)'
    else if (name === 'Noobius_Maximus') return 'Noobius_Maximus (aka sleepy_gary)'
    else return name
  }

  $http({
    url: '/api/addTagLogModIndex',
    method: 'GET',
    params: {username: 'lol'}
  })
}])


