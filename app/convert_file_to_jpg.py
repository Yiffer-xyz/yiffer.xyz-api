import sys, os
from PIL import Image

file_path = os.getcwd() + sys.argv[1]

new_file_path = file_path[:-4] + '.jpg'
Image.open(file_path).convert('RGB').save(new_file_path)

os.remove(file_path)