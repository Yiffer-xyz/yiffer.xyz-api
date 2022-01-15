import fs from 'fs'
import googleStorage from '@google-cloud/storage'
const { Storage } = googleStorage

import fetch from 'node-fetch';

import yaml from 'js-yaml'
import { ApiError } from './api/baseRouter.js';
let fileContents = fs.readFileSync('./config/cfg.yml', 'utf8');
const config = yaml.load(fileContents)
const storage = new Storage({ credentials: config.googleServiceAccount })
const bucket = storage.bucket(config.storage.bucketName)

export default class FileSystemFacade {
	static async saveUrlToGoogleStorage(url, newFilePath) {
		return new Promise((resolve, reject) => {
			fetch(url).then(response => {
				if (!response.ok) {
					console.log('GCP error uploading file from url - error fetching url. Status code ', response.statusCode)
					throw new ApiError('Error uploading file to Google Storage', 500)
				}

				let readStream = response.body

				let writeStream = bucket.file(newFilePath).createWriteStream({
					metadata: {
						contentType: response.headers['content-type']
					}
				})

				readStream.on('error', err => {
					writeStream.end()
					console.log('GCP error uploading file from url, in read stream', err)
					reject(new ApiError('Error saving file in Google Storage', 500))
					return
				})
				writeStream.on('error', err => {
					writeStream.end()
					console.log('GCP error uploading file from url, in write stream', err)
					reject(new ApiError('Error saving file in Google Storage', 500))
					return
				})
				writeStream.on('finish', () => {
					resolve()
					return
				})

				readStream.pipe(writeStream)
			})
		})
	}

	static async writeGooglePaidImageFromUrl (cloudinaryId, adId, fileTypes) {
		let googleSavePromises = fileTypes.map(fileType => {
			let qualityString = `q_100/`
			if (fileType === 'webp') {
				qualityString = `q_96/`
			}
			if (fileType === 'mp4') {
				qualityString = ''
			}

			return this.saveUrlToGoogleStorage(
				`http://res.cloudinary.com/yiffer-xyz/image/upload/${qualityString}${cloudinaryId}.${fileType}`,
				`${config.storage.paidImagesBucketFolder}/${adId}.${fileType}`
			)
		})

		await Promise.all(googleSavePromises)
		return
	}

	static async renameGoogleComicFile(oldFilename, newFilename) {
		await storage.bucket(config.storage.bucketName)
			.file(`${config.storage.comicsBucketFolder}/${oldFilename}`)
			.move(`${config.storage.comicsBucketFolder}/${newFilename}`)
		return {error: false}
	}
	
	static async writeGoogleComicFile(localFilePath, comicName, filename) {
		let uploadOptions = {
			destination: `${config.storage.comicsBucketFolder}/${comicName}/${filename}`,
			gzip: true,
			metadata: {
				cacheControl: 'no-cache',
			},
		}
		return new Promise((resolve, reject) => {
			bucket.upload(localFilePath, uploadOptions, (err) => {
				if (err) {
					console.log('GOOGLE UPLOAD ERROR: ', err)
					reject(err)
				}
				else {
					resolve()
				}
			})
		})
	}

	static async deleteGoogleComicFile(filepath) {
		return storage.bucket(config.storage.bucketName)
			.file(`${config.storage.comicsBucketFolder}/${filepath}`)
			.delete()
	}

	static async downloadGoogleComicPage(comicName, filename) {
		await storage.bucket(config.storage.bucketName)
			.file(`${config.storage.comicsBucketFolder}/${comicName}/${filename}`)
			.download({destination: `uploads/${comicName}/${filename}`})
	}

	static async writeGooglePatronImage(userId, localFilePath) {
		let uploadOptions = {
			destination: `${config.storage.patronImagesBucketFolder}/${userId}.jpg`,
			gzip: true,
			metadata: {
				cacheControl: 'no-cache',
			},
		}
		return new Promise((resolve, reject) => {
			bucket.upload(localFilePath, uploadOptions, (err) => {
				if (err) {
					console.error('GOOGLE UPLOAD PATRON IMAGE ERROR: ', err)
					reject(err)
				}
				else {
					resolve()
				}
			})
		})
	}

	static async deleteGooglePatronImage(userId) {
		return storage.bucket(config.storage.bucketName)
			.file(`${config.storage.patronImagesBucketFolder}/${userId}.jpg`)
			.delete()
	}

	static async renameFile (oldFilename, newFilename, errorMessage='File system error: Error renaming') {
		return new Promise((resolve, reject) => {
			fs.rename(oldFilename, newFilename, err => {
				if (err) { reject({error: err, message: errorMessage}) }
				else { resolve({error: false}) }
			})
		})
	}

	static async listDir (pathToDirectory, errorMessage='File system error: Error listing content') {
		return new Promise((resolve, reject) => {
			fs.readdir(pathToDirectory, (err, files) => {
				if (err) { reject({error: err, message: errorMessage}) }
				else { resolve(files) }
			})
		})
	}

	static async createDirectory (pathToDirectory, errorMessage='File system error: Error creating directory') {
		return new Promise((resolve, reject) => {
			fs.mkdir(pathToDirectory, err => {
				if (err) { reject({error: err, message: errorMessage}) }
				else { resolve({error: false}) }
			})
		})
	}

	static async deleteDirectory (pathToDirectory) {
		return new Promise((resolve, reject) => {
			fs.rm(pathToDirectory, {recursive: true}, err => {
				if (err) { reject({error: err, message: 'Error deleting directory'}) }
				else { resolve({error: false}) }
			})
		})
	}

	static async readFile (filePath, errorMessage='File system error: Error reading file') {
		return new Promise((resolve, reject) => {
			fs.readFile(filePath, 'utf8', (err, fileContent) => {
				if (err) { reject({error: err, message: errorMessage}) }
				else { resolve(fileContent) }
			})
		})
	}

	static async appendFile (filePath, fileData, errorMessage='File system error: Error writing file') {
		return new Promise((resolve, reject) => {
			fs.appendFile(filePath, fileData, err => {
				if (err) { reject({error: err, message: errorMessage}) }
				else { resolve({error: false}) }
			})
		})
	}	
	
	static async deleteFile (filePath, errorMessage='File system error: Error deleting file') {
		return new Promise((resolve, reject) => {
			fs.unlink(filePath, err => {
				if (err) { reject({error: err, message: errorMessage}) }
				else { resolve({error: false}) }
			})
		})
	}
		
	static async deleteFiles (filePaths, errorMessage='File system error: Error deleting file') {
		return new Promise(async (resolve, reject) => {
			let promises = []
			for (let path of filePaths) {
				promises.push(
					fs.unlink(path, err => {
						if (err) { reject({error: err, message: errorMessage}) }
					})
				)
			}
			await Promise.all(promises)
			resolve({error: false})
		})
	}
}