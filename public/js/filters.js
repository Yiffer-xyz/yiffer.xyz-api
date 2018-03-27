var app = angular.module('ComicsFilter', [])

app.filter('filterMultiple', function () {
  return function (input, userSearch) {
    if (typeof userSearch === 'undefined' || typeof input === 'undefined') {
      return input
    }
    var filteredList = input.filter(function (x) {
      if (userSearch.artist && (x.artist.toLowerCase().indexOf(userSearch.artist.toLowerCase()) < 0) && (x.name.toLowerCase().indexOf(userSearch.artist.toLowerCase()) < 0)) {
        return false
      }

      // if not matching finished
      if (userSearch.finished && x.others.indexOf('finished') < 0) {
        return false
      }
      else if (userSearch.finished && x.others.indexOf('unfinished') < 0){
      }
      else if (userSearch.finished) {
      }

      // if not matching search for tag
      if (!userSearch.tag.all && userSearch.tag.list.indexOf(x.tag) < 0) {
        return false
      }

      // if not matching search for cat
      if (!userSearch.cat.all && userSearch.cat.list.indexOf(x.cat) < 0) {
        return false
      }

      // if not matching search for artist
      if (userSearch.artist) {
        var tagSearch = userSearch.artist.split(', ')
        for (var s of tagSearch) {
          var ok = false
          // if not a comic name or artist name
          // console.log(x.artist.toLowerCase(), x.name.toLowerCase())

          if ((x.artist.toLowerCase().indexOf(s.toLowerCase()) >= 0) ||
          (x.name.toLowerCase().indexOf(s.toLowerCase()) >= 0)) {
            ok = true
          } else {
            // if not in "others" tags
            for (var o of x.others) {
              if ((o.toLowerCase()).indexOf(s) >= 0) {
                ok = true
                break
              }
            }
          }
          if (!ok) return false
        }
        return true
      }

      return true
    })

    // return filteredList.slice( userSearch.perPage * userSearch.page-1, userSearch.perPage * userSearch.page )
    return filteredList
  }
})
