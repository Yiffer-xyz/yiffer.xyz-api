const fs = require('fs')

module.exports = class FileSystemFacade {
	static async renameFile (oldFilename, newFilename, errorMessage) {
		return new Promise(async (resolve, reject) => {
			fs.rename(oldFilename, newFilename, err => {
				if (err) { reject({error: err, message: errorMessage}) }
				else { resolve({error: err, message: errorMessage}) }
			})
		})
	}
}