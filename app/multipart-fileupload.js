export async function storePartialUpload(redisClient, filesWithKeys, multipartKey, uploadNumber) {
  let redisKey = `${multipartKey}-${uploadNumber}`
  let redisValue = JSON.stringify(filesWithKeys)

  console.log(` Storing partial upload ${redisKey} - ${filesWithKeys.length} files`)
  await storeRedisValue(redisClient, redisKey, redisValue)
}

export async function retrieveEarlierUploads(redisClient, multipartKey, numberToFetch) {
  let allUploads = []
  for (let i=1; i <= numberToFetch; i++) {
    let redisKey = `${multipartKey}-${i}`
    console.log(` Retrieving partial upload for  ${redisKey} - ${i}/${numberToFetch}`)
    
    let value = await getRedisValue(redisClient, redisKey)

    let valuesAsJson = JSON.parse(value)
    allUploads.push(...valuesAsJson)

    await deleteRedisValue(redisClient, redisKey)
  }

  let uploadedFiles = {}
  for (let [fileKey, fileData] of allUploads) {
    if (!(fileKey in uploadedFiles)) {
      uploadedFiles[fileKey] = []
    }

    uploadedFiles[fileKey].push(fileData)
  }

  return uploadedFiles
}

async function storeRedisValue(redisClient, redisKey, redisValue) {
  return new Promise((resolve, reject) => {
    redisClient.set(redisKey, redisValue, (err) => {
      if (err) {
        reject(err)
      }
      resolve()
    })
  })
}

async function getRedisValue(redisClient, redisKey) {
  return new Promise((resolve, reject) => {
    redisClient.get(redisKey, (err, result) => {
      if (err) {
        reject(err)
      }
      resolve(result)
    })
  })
}

async function deleteRedisValue(redisClient, redisKey) {
  return new Promise((resolve, reject) => {
    redisClient.del(redisKey, (err) => {
      if (err) {
        reject(err)
      }
      resolve()
    })
  })
}