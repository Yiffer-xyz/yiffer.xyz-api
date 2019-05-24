let pythonShell = require('python-shell')
const scriptPath = 'C:/scripts/Server/app/'

module.exports = class PythonShellFacade {
  static async run (scriptName, scriptArgs) {
    return new Promise (async (resolve, reject) => {
      pythonShell.PythonShell.run(scriptPath+scriptName, {mode: 'text', args: scriptArgs}, (err, output) => {
        if (err) {
          reject({error: err, message: 'Error running python script'})
        }
        else {
          resolve()
        }
      })
    })
  }
}