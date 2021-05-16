import fs from 'fs'
import googleStorage from '@google-cloud/storage'
const { Storage } = googleStorage

import yaml from 'js-yaml'
let fileContents = fs.readFileSync('./config/cfg.yml', 'utf8');
const config = yaml.load(fileContents)
const storage = new Storage({ credentials: config.googleServiceAccount })
const bucket = storage.bucket(config.storage.bucketName)

export default class FileSystemFacade {
	static async writeGooglePaidImageFile(localFilePath, newFilename) {
		let uploadOptions = {
			destination: `${config.storage.paidImagesBucketFolder}/${newFilename}`,
			gzip: true,
			metadata: {
				// Enable long-lived HTTP caching headers
				// Use only if the contents of the file will never change
				// (If the contents will change, use cacheControl: 'no-cache')
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

	static async renameFile (oldFilename, newFilename, errorMessage='File system error: Error renaming') {
		return new Promise(async (resolve, reject) => {
			fs.rename(oldFilename, newFilename, err => {
				if (err) { reject({error: err, message: errorMessage}) }
				else { resolve({error: false}) }
			})
		})
	}

	static async listDir (pathToDirectory, errorMessage='File system error: Error listing content') {
		return new Promise(async (resolve, reject) => {
			fs.readdir(pathToDirectory, (err, files) => {
				if (err) { reject({error: err, message: errorMessage}) }
				else { resolve(files) }
			})
		})
	}

	static async createDirectory (pathToDirectory, errorMessage='File system error: Error creating directory') {
		return new Promise(async (resolve, reject) => {
			fs.mkdir(pathToDirectory, err => {
				if (err) { reject({error: err, message: errorMessage}) }
				else { resolve({error: false}) }
			})
		})
	}

	static async deleteDirectory (pathToDirectory) {
		return new Promise(async (resolve, reject) => {
			fs.rmdir(pathToDirectory, err => {
				if (err) { reject({error: err, message: 'Error deleting directory'}) }
				else { resolve({error: false}) }
			})
		})
	}

	static async readFile (filePath, errorMessage='File system error: Error reading file') {
		return new Promise(async (resolve, reject) => {
			fs.readFile(filePath, (err, fileContent) => {
				if (err) { reject({error: err, message: errorMessage}) }
				else { resolve(fileContent) }
			})
		})
	}

	static async writeFile (filePath, fileData, errorMessage='File system error: Error writing file') {
		return new Promise(async (resolve, reject) => {
			fs.writeFile(filePath, fileData, err => {
				if (err) { reject({error: err, message: errorMessage}) }
				else { resolve({error: false}) }
			})
		})
	}	
	
	static async deleteFile (filePath, errorMessage='File system error: Error deleting file') {
		return new Promise(async (resolve, reject) => {
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