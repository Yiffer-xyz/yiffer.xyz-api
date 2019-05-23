angular.module('ComicsOldNewCtrl', []).controller('ComicsOldNewController', ['$scope', '$http', '$window', 'Upload', function ($scope, $http, $window, Upload) {

  $scope.editMode = false
  $scope.pp = false
  $scope.qq = false
  $scope.isAdmin = false 
  $scope.imageList = []
  $scope.recordingCome = false
  $scope.currentComeConfirmImage = undefined
  $scope.username = 'guest'
  
  $scope.newImage = undefined
  $scope.addImageMode = false

  $scope.newImage = undefined
  $scope.newImageRating = 0
  $scope.newImageAdded = new Date()
  $scope.newImagePpp = 0

  $scope.toggleAddImage = function () {
    $scope.addImageMode = true
  }
 
  $scope.toggleEditMode = function () {
    $scope.editMode = !$scope.editMode
  }

  $scope.uploadImage = function () {
    let uploadData = {
      file: $scope.newImage,
      artist: $scope.newImageArtist,
      added: $scope.newImageAdded,
      ppp: $scope.newImagePpp,
      rating: $scope.newImageRating
    }
    console.log(uploadData)
		Upload.upload({
			url: '/api/listRagAddImage',
			data: uploadData
		})
		.then(
			function (res) {
        init()
        clearNewImageFields()
			},
			function (res) {},
			function (evt) {}
		)
  }

  $scope.imageDeleteCount = {id: undefined, count: 0}
  $scope.deleteImage = function (image) {
    if (image.id == $scope.imageDeleteCount.id && $scope.imageDeleteCount.count == 1) {
      $http.post('/api/listRagDeleteImage', {id: image.id})
        .then(res => init())
      $scope.imageDeleteCount = {id: undefined, count: 0}
    }
    else {
      $scope.imageDeleteCount = {id: image.id, count: 1}
    }
  }

  function clearNewImageFields () {
    $scope.newImage = undefined
    $scope.newImageArtist = ''
    $scope.newImageRating = 0
    $scope.newImageAdded = new Date()
    $scope.newImagePpp = 0
  } 
  
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

  monthsToClass = function (m) {
    if (m==0) {
      return 'new-thumb'
    }
    else if (m<=5) {
      return 'medium-thumb'
    }
    else if (m==6) {
      return 'ending-thumb'
    }
    else {
      return 'old-thumb'
    }
  }

  prettyDate = inputDateString => (new Date(inputDateString)).toDateString().substring(4)

  function init () {
    $scope.imageList = []
    $http.get('/api/listRagGetImages').success((data) => {
      let today = new Date()
      for (var x of data) {
        x.added = prettyDate(x.added)
        x.addedDate = new Date(x.added)
        let months = monthDiff(x.addedDate, today)
        x.thumbClass = monthsToClass(months)
        $scope.imageList.push(x)
      }
    
      $scope.sortDate()
    })
  }

  init()

  $scope.comeImageClicked = function (image) {
    console.log('recordcick')
    if ($scope.recordingCome) {
      $scope.currentComeConfirmImage = image
    }
  }

  $scope.toggleRecordComeClick = function () {
    $scope.recordingCome = !$scope.recordingCome
  }

  $scope.confirmCome = function (image) {
    $http({
      url: '/api/listRagRecordCome',
      method: 'POST',
      data: { imageId: image.id }
    }).success((data) => {
      if (data.status) {
        $scope.recordingCome = false
        $scope.currentComeConfirmImage = undefined
        init()
        $scope.logClick(image.id, 'CUM')
      }
    })
  }

  $scope.rejectCome = function () {
    setTimeout(() => {
    $scope.currentComeConfirmImage = null
    }, 100)
  }

  $scope.logClick = function (imageId, description) {
    $http({
      url: '/api/listRagLogClick',
      method: 'POST',
      data: { imageId: imageId, description: description }
    })
  }
  
  $scope.sortRating = function () {
    $scope.imageList.sort(function(a, b) {return b.rating - a.rating})
  }

  $scope.sortComeCount = function () {
    $scope.imageList.sort(function(a, b) {return b.comeCount - a.comeCount})
  }
  
  $scope.sortDate = function () {
    $scope.logClick(undefined, 'Sort date')
    $scope.imageList = $scope.imageList.sort(function(a, b) {
      let aDate = new Date(a.added)
      let bDate = new Date(b.added)
      if (bDate > aDate) { return 1 }
      else if (aDate > bDate) { return -1 }
      else { return 0 }
    })
  }

  $scope.openImage = function (imageId) {
    $window.open('listRagImages/thumbs/' + imageId + '.jpg', '_blank')
    $scope.logClick(imageId)
  }
  
  $scope.togglePp = function () {
    $scope.pp = !$scope.pp
  }
  $scope.toggleQq = function () {
    $scope.qq = !$scope.qq
  }
  
  $http.get('/userSession')
    .success (function (res) {
      $scope.isAdmin = res.username == 'malann'
      $scope.username = res.username || 'guest'
  })

  $http({
    url: '/api/listRagLogClick',
    method: 'POST',
    data: { imageId: undefined, description: '/' }
  })

  function monthDiff(d1, d2) {
    var months;
    months = (d2.getFullYear() - d1.getFullYear()) * 12;
    months -= d1.getMonth();
    months += d2.getMonth();
    return months <= 0 ? 0 : months;
}
}])

