import sharp from 'sharp'
sharp.cache(false)

export async function convertComicPage(filepath) {
  let buffer = await sharp(filepath)
    .jpeg({quality: 90})
    .toBuffer()

  return sharp(buffer).toFile(filepath)
}