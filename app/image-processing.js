import { ApiError } from './api/baseRouter.js';

import sharp from 'sharp'
sharp.cache(false)

import fs from 'fs'
import yaml from 'js-yaml'
let fileContents = fs.readFileSync('config/cfg.yml', 'utf8');
const config = yaml.load(fileContents)
const pageConfig = config.dimensions.page
const legalFileEndings = ['jpg', 'png']

export async function processComicPage(file) {
  if (!legalFileEndings.some(legalEnding => file.originalname.includes('.' + legalEnding))) {
    throw new ApiError(`File format not supported (${file.originalname})`, 400)
  }
  let needsTypeConvert = file.originalname.includes('.png')

  return await resizeComicPageIfNeeded(file.path, needsTypeConvert)
}

export async function resizeComicPageIfNeeded(filepath, forceConvert) {
  let image = await sharp(filepath)
  let metadata = await image.metadata()

  let needsResize = metadata.height > pageConfig.maxHeight
    && (metadata.height/metadata.width < pageConfig.excludeRatioAbove)

  if (needsResize) {
    image = await image.resize({
      fit: sharp.fit.contain,
      height: pageConfig.maxHeight,
    })
  }

  if (forceConvert || needsResize) {
    let imageBuffer = await image.jpeg({
      quality: 100,
      progressive: true,
      chromaSubsampling: '4:4:4',
    }).toBuffer()

    await sharp(imageBuffer).toFile(filepath)
    return true
  }

  return false
}

export async function convertThumbnailFile(filepath) {
  await sharp(filepath)
    .resize(200)
    .webp({quality: 95})
    .toFile(filepath + '-thumb')

  await sharp(filepath)
    .resize(100)
    .webp({quality: 95})
    .toFile(filepath + '-thumbsmall')

  let jpgBuffer = await sharp(filepath)
    .resize(200)
    .jpeg({quality: 95})
    .toBuffer()

  return sharp(jpgBuffer).toFile(filepath)
}

export async function convertPatreonProfilePic(filepath) {
  let jpgBuffer = await sharp(filepath)
    .resize(200)
    .jpeg({quality: 95})
    .toBuffer()

  return sharp(jpgBuffer).toFile(filepath)
}

