from PIL import Image
import sys, os

comic_folder_path = os.getcwd() + '/../client/public/comics/' + sys.argv[1]

amount_of_new_files = int(sys.argv[2])

images = [filename for filename in os.listdir(comic_folder_path) if filename != 's.jpg']
images.sort()
images = images[-amount_of_new_files : ]

for image in images:
	if image.endswith('.jpg'):
		continue
	else:
		image_path = comic_folder_path + '/' + image
		Image.open(image_path).convert('RGB').save(image_path[:-4] + '.jpg', quality=90)
		os.remove(image_path)
