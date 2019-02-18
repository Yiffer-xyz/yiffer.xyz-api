from PIL import Image
import sys, os

comic_folder_path = os.getcwd() + '/../client/public/comics/' + sys.argv[1]

images = os.listdir(comic_folder_path)
images.sort()


for image in images:
	if image == 's.jpg': 
		continue
	elif image.endswith('.jpg'):
		continue
	else:
		image_path = comic_folder_path + '/' + image
		Image.open(image_path).convert('RGB').save(image_path[:-4] + '.jpg')
		os.remove(image_path)
