import sharp from 'sharp'
sharp.cache(false)

export async function convertComicPage(filepath) {
  let buffer = await sharp(filepath)
    .jpeg({quality: 90})
    .toBuffer()

  return sharp(buffer).toFile(filepath)
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
