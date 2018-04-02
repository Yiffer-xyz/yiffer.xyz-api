import sys, os

file_path = os.cetcwd() + sys.argv[1]

if file_path[-4:] != '.jpg':
		from PIL import Image

		new_file_path = file_path[:-4] + '.jpg'
		Image.open(file_path).convert('RGB').save(new_file_path)

		os.remove(file_path)