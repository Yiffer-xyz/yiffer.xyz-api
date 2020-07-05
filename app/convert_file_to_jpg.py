import sys, os
from PIL import Image

file_path = os.getcwd() + sys.argv[1]

new_file_path = file_path[:-4] + '.jpg'
Image.open(file_path).convert('RGB').save(new_file_path, quality=90)

os.remove(file_path)