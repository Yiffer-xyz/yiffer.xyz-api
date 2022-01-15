import FileSystemFacade from "./fileSystemFacade.js"

const tempFolder = 'temp-files'

export async function storePartialUpload(filesForStorage, multipartKey, uploadNumber) {
  let dataValue = filesForStorage.map(ffs => JSON.stringify(ffs)).join('\n') + '\n'
  console.log(` Storing partial upload no. ${uploadNumber} for ${multipartKey} - ${filesForStorage.length} files`)
  await storeTempValue(multipartKey, dataValue)
}

export async function retrieveEarlierUploads(multipartKey) {
  let fileContents = await FileSystemFacade.readFile(`${tempFolder}/${multipartKey}.txt`)
  let lines = fileContents.split('\n')

  let uploadedFiles = {
    pageFiles: [],
    thumbnailFile: null,
  }

  for (let line of lines) {
    line = line.trim()
    if (!line.length) { continue }
    line = JSON.parse(line)

    if (line.type === 'pageFile') {
      uploadedFiles.pageFiles.push(line)
    }
    if (line.type === 'thumbnailFile') {
      uploadedFiles.thumbnailFile = line
    }
  }

  deleteTempFile(multipartKey)
  return uploadedFiles
}

async function deleteTempFile (dataKey) {
  FileSystemFacade.deleteFile(`${tempFolder}/${dataKey}.txt`)
}

async function storeTempValue (dataKey, dataValue) {
  await FileSystemFacade.appendFile(`${tempFolder}/${dataKey}.txt`, dataValue)
}
