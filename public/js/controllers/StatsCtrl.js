angular.module('StatsCtrl', []).controller('StatsController', ['$scope', '$http', function ($scope, $http) {

  var totalNumberOfDays = 0

  function onPageLoad () {
    // setDailyData()
    // setHourData()
    // setWeekdayData()
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

  // // HOUR STATS //////////////////////////////////////////////////////////////////////////////
  // $scope.hourStats = {
  //   options: {
  //     chart: {
  //       type: 'discreteBarChart',
  //       height: 250,
  //       margin : {
  //           top: 20,
  //           right: 20,
  //           bottom: 40,
  //           left: 55
  //       },
  //       x: function(d){ return d.label },
  //       y: function(d){ return d.value; },
  //       // showValues: true,
  //       valueFormat: function (d) {
  //         return d3.format('.0f')(d)
  //       },
  //       xAxis: { 
  //         axisLabel: 'Hour of day'
  //       },
  //       yAxis: {
  //           axisLabel: '# of visits',
  //           axisLabelDistance: -10
  //       }
  //     }
  //   },

  //   data: []
  // }

  // function setHourData () {
  //   $http.get('/api/hourStats')
  //     .success(function (res) {
  //       $scope.hourStats.data.push(mysqlMinuteDataToNvd3Data(res))
  //     })
  // }

  // function mysqlMinuteDataToNvd3Data (mysqlData) {
  //   var returnValue = []
  //   for (var d of mysqlData) {
  //     returnValue.push({'label': d.hour, 'value': d.count})
  //   }
  //   return {values: returnValue}
  // }

  // // DAILY STATS //////////////////////////////////////////////////////////////////////////////
  // var dailyStatsMaxValue = 0

  // $scope.dailyStats = {
  //   options: {
  //     chart: {
  //       type: 'lineChart',
  //       height: 300,
  //       margin : {
  //           top: 20,
  //           right: 20,
  //           bottom: 40,
  //           left: 55
  //       },
  //       x: function(d){ return d.x },
  //       y: function(d){ return d.y; },
  //       useInteractiveGuideline: true,
  //       dispatch: {
  //           stateChange: function(e){ console.log("stateChange"); },
  //           changeState: function(e){ console.log("changeState"); },
  //           tooltipShow: function(e){ console.log("tooltipShow"); },
  //           tooltipHide: function(e){ console.log("tooltipHide"); }
  //       },
  //       xAxis: { 
  //         axisLabel: 'Date'
  //       },
  //       yAxis: {
  //           axisLabel: 'Visits',
  //           tickFormat: function(d) {
  //               // return d3.format('.02f')(d);
  //               return d
  //           },
  //           axisLabelDistance: -10
  //       }
  //     }
  //   },

  //   data: [],

  //   forcey: [0]
  // }

  // function setDailyData () {
  //   setDailyNonUniqueData()
  //   setDailyUniqueData()
  // }

  // function setDailyNonUniqueData () {
  //   $http.get('/api/dailyStats')
  //     .success(function (res) {
  //       totalNumberOfDays = res.length
  //       $scope.dailyStats.data.push(
  //         {
  //           values: mysqlDailyDataToNvd3Data(res),      
  //           key: 'Visits',
  //           color: '#57f',
  //           strokeWidth: 3
  //         }
  //       )
  //       $scope.dailyStats.options.chart['yDomain'] = [0, dailyStatsMaxValue]
  //     })
  // }

  // function setDailyUniqueData () {
  //   $http.get('/api/uniqueDailyStats')
  //     .success(function (res) {
  //       $scope.dailyStats.data.push(
  //         {
  //           values: mysqlDailyDataToNvd3Data(res, true),
  //           key: 'Unique visits',
  //           color: '#a16',
  //           strokeWidth: 3
  //         }
  //       )
  //     })
  // }

  // function mysqlDailyDataToNvd3Data (mysqlData, isUniqueData) {
  //   var returnData = []
  //   for (var d of mysqlData) {
  //     returnData.push({
  //       x: Number(getDaysAgo(d.date)), 
  //       y: Number(d.count)
  //     })

  //     if (d.count > dailyStatsMaxValue) dailyStatsMaxValue = Number(d.count)
  //   }
  //   return isUniqueData ? fixXAxisForUniqueData(returnData) : invertXAxis(returnData)
  // }


  // // WEEKDAY STATS //////////////////////////////////////////////////////////////////////////////
  // $scope.weekdayStats = {
  //   options: {
  //     chart: {
  //       type: 'discreteBarChart',
  //       height: 250,
  //       margin : {
  //           top: 20,
  //           right: 20,
  //           bottom: 40,
  //           left: 55
  //       },
  //       x: function(d){ return d.label },
  //       y: function(d){ return d.value; },
  //       // showValues: true,
  //       valueFormat: function (d) {
  //         return d3.format('.0f')(d)
  //       },
  //       xAxis: { 
  //         axisLabel: 'Weekday'
  //       },
  //       yAxis: {
  //           axisLabel: 'Avg # of visits',
  //           axisLabelDistance: -10
  //       }
  //     }
  //   },

  //   data: []
  // }

  // function setWeekdayData () {
  //   $http.get('/api/weekdayStats')
  //     .success(function (res) {
  //       $scope.weekdayStats.data.push(mysqlWeekdayDataToNvd3Data(res))
  //     })
  // }

  // function mysqlMinuteDataToNvd3Data (mysqlData) {
  //   var returnValue = []
  //   for (var d of mysqlData) {
  //     returnValue.push({'label': d.hour, 'value': d.count})
  //   }
  //   return {values: returnValue}
  // }

  // function mysqlWeekdayDataToNvd3Data (mysqlData) {
  //   var returnValue = []
  //   for (var d of mysqlData) {
  //     returnValue.push({'label': d.weekday, 'value': d.count})
  //   }
  //   return {values: returnValue}
  // }




  // function invertXAxis (data) {
  //   var newReturnData = []
  //   for (var i = 0; i < data.length; i++) {
  //     newReturnData.push({x: i, y: data[i].y})
  //   }
  //   return newReturnData
  // }

  // function fixXAxisForUniqueData (data) {
  //   var newReturnData = []
  //   // initialize array with zeros
  //   for (var i = 0; i < totalNumberOfDays-data.length; i++) {
  //     newReturnData.push({x: i, y: 0})
  //   }
  //   // start filling array at the end
  //   for (var i = 0; i < data.length; i++) {
  //     newReturnData.push({x: totalNumberOfDays-data.length+i, y: data[i].y})
  //   }
  //   return newReturnData
  // }

  $scope.prettyDate = function (uglyDate) {
    return uglyDate.toISOString().substring(0,10)
  }

  function getDaysAgo (date) {
    return Math.floor(( Date.parse(new Date()) - Date.parse(date) ) / 86400000)
  }

  $scope.roundTwoDecimals = function (num) {
    return (Math.round(num*100))/100
  }
  /////////////////////////////////////////////////////////////////////////////////////////////
}])
