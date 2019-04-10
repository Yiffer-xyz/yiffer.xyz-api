const fs = require('fs')

module.exports = class FileSystemFacade {
	static async renameFile (oldFilename, newFilename, errorMessage) {
		return new Promise(async (resolve, reject) => {
			fs.rename(oldFilename, newFilename, err => {
				if (err) { reject({error: err, message: errorMessage}) }
				else { resolve({error: false}) }
			})
		})
	}

	static async listDir (pathToDirectory, errorMessage) {
		return new Promise(async (resolve, reject) => {
			fs.readdir(pathToDirectory, (err, files) => {
				if (err) { reject({error: err, message: errorMessage}) }
				else { resolve(files) }
			})
		})
	}

	static async createDirectory (pathToDirectory, errorMessage) {
		return new Promise(async (resolve, reject) => {
			fs.mkdir(pathToDirectory, err => {
				if (err) { reject({error: err, message: errorMessage}) }
				else { resolve({error: false}) }
			})
		})
	}

	static async readFile (filePath, errorMessage) {
		return new Promise(async (resolve, reject) => {
			fs.readFile(filePath, (fileContent, err) => {
				if (err) { reject({error: err, message: errorMessage}) }
				else { resolve(fileContent) }
			})
		})
	}

	static async writeFile (filePath, fileData, errorMessage) {
		return new Promise(async (resolve, reject) => {
			fs.writeFile(filePath, fileData, err => {
				if (err) { reject({error: err, message: errorMessage}) }
				else { resolve({error: false}) }
			})
		})
	}	
}