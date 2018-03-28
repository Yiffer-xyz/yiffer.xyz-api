angular.module('StatsCtrl', []).controller('StatsController', ['$scope', '$http', function ($scope, $http) {

  var totalNumberOfDays = 0

  function onPageLoad () {
    getAllComicData()
    getTagCatData()
  }

  onPageLoad()

  // ALL COMIC DATA ////////////////////////////////////////////////////////////////////////////
  $scope.allComicData = []
  function getAllComicData () {
    $http.get('/api/allComicData')
      .success(function (res) {
        for (var x of res) {
          var newX = x
          newX['Created'] = new Date(x['Created'])
          $scope.allComicData.push(newX)
        }
      })
  }

  $scope.sortComicData = function (dataType) {
    $scope.allComicData.sort(function(a, b) {return b[dataType] - a[dataType]})
  }


  // TAG, CAT DATA ////////////////////////////////////////////////////////////////////////////
  $scope.tagStats = {
    Furry:    {AvgRating: 0, NumberOfComics: 0}, 
    MLP:      {AvgRating: 0, NumberOfComics: 0}, 
    Pokemon:  {AvgRating: 0, NumberOfComics: 0}, 
    Warcraft: {AvgRating: 0, NumberOfComics: 0}, 
    Other:    {AvgRating: 0, NumberOfComics: 0}
  }  
  $scope.catStats = {
    'M':   {AvgRating: 0, NumberOfComics: 0},
    'F':   {AvgRating: 0, NumberOfComics: 0},
    'MF':  {AvgRating: 0, NumberOfComics: 0},
    'FF':  {AvgRating: 0, NumberOfComics: 0},
    'MM':  {AvgRating: 0, NumberOfComics: 0},
    'MF+': {AvgRating: 0, NumberOfComics: 0},
    'I':   {AvgRating: 0, NumberOfComics: 0}
  }
  function getTagCatData () {
    $http.get('/api/catStats')
      .success(function (res) {
        console.log(res)
        for (var x of res) {
          console.log(x.Cat)
          $scope.catStats[x['Cat']]['NumberOfComics'] = x['NumberOfComics']
        }
      })
    $http.get('/api/catVotes')
      .success(function (res) {
        console.log(res)
        for (var x of res) {
          $scope.catStats[x['Cat']]['AvgRating'] = x['AvgRating']
        }
      })

    $http.get('/api/tagStats')
      .success(function (res) {
        for (var x of res) {
          $scope.tagStats[x['Tag']]['NumberOfComics'] = x['NumberOfComics']
        }
      })
    $http.get('/api/tagVotes')
      .success(function (res) {
        for (var x of res) {
          $scope.tagStats[x['Tag']]['AvgRating'] = x['AvgRating']
        }
      })
  }

  $scope.prettyDate = function (uglyDate) {
    return uglyDate.toISOString().substring(0,10)
  }

  function getDaysAgo (date) {
    return Math.floor(( Date.parse(new Date()) - Date.parse(date) ) / 86400000)
  }

  $scope.roundTwoDecimals = function (num) {
    return (Math.round(num*100))/100
  }
}])
