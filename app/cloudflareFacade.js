import fs from 'fs'
import yaml from 'js-yaml'
let fileContents = fs.readFileSync('./config/cfg.yml', 'utf8');
const config = yaml.load(fileContents)

import fetch from 'cross-fetch'
import { ApiError } from './api/baseRouter.js';

const baseUrl = `https://api.cloudflare.com/client/v4/zones`

export async function purgePagesFromCache (comicName, pageNames) {
  comicName = comicName.split(' ').join('%20')

  try {
    let body = {
      files: pageNames.map(page => `${config.storage.staticStorageUrl}/${config.storage.comicsBucketFolder}/${comicName}/${page}`)
    }
    let headers = {
      'Authorization': `Bearer ${config.cloudflare.cachePurgeToken}`,
      'Content-Type': 'application/json',
    }

    console.log(`Purging Cloudflare cache, comic ${comicName}, urls ${body.files.join(', ')}`)

    await fetch(`${baseUrl}/${config.cloudflare.zoneId}/purge_cache`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    })
  }
  catch (err) {
    console.log(err)
    throw new ApiError('Error clearing Cloudflare cache')
  }
}