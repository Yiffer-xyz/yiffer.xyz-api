import sharp from 'sharp'
sharp.cache(false)

import fs from 'fs'
import yaml from 'js-yaml'
let fileContents = fs.readFileSync('./config/cfg.yml', 'utf8');
const config = yaml.load(fileContents)
const pageConfig = config.dimensions.page

// TODO APIerror handling for all places calling this
export async function processComicPage(file) {
  let image = await sharp(file.path)
  let metadata = await image.metadata()

  if (!file.mimetype.endsWith('png') && !file.mimetype.endsWith('jpeg')) {
    throw new Error(`File format not supported (${file.originalname})`)
  }
  let needsTypeConvert = file.mimetype.endsWith('png')

  let needsResize = metadata.height > pageConfig.maxHeight
    && (metadata.height/metadata.width < pageConfig.excludeRatioAbove)

  if (needsResize) {
    image = await image.resize({
      fit: sharp.fit.contain,
      height: 1600,
    })
  }

  if (needsTypeConvert || needsResize) {
    let imageBuffer = await image.jpeg({
      quality: 100,
      progressive: true,
      chromaSubsampling: '4:4:4',
    }).toBuffer()

    return sharp(imageBuffer).toFile(file.path)
  }
}

export async function convertThumbnailFile(filepath) {
  await sharp(filepath)
    .resize(200)
    .webp({quality: 90})
    .toFile(filepath + '-thumb')

  await sharp(filepath)
    .resize(100)
    .webp({quality: 90})
    .toFile(filepath + '-thumbsmall')

  let jpgBuffer = await sharp(filepath)
    .resize(200)
    .jpeg({quality: 95})
    .toBuffer()

  return sharp(jpgBuffer).toFile(filepath)
}
