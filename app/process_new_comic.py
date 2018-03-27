from PIL import Image
import sys, os

comic_folder_path = os.getcwd() + '/public/comics/' + sys.argv[1]

images = os.listdir(comic_folder_path)
images.sort()
counter = 1

def rename_image(image_name, counter):
    os.rename(comic_folder_path + '/' + image_name, comic_folder_path + '/' + get_filename(counter))

def convert_and_rename_image(image_name, counter):
    Image.open(comic_folder_path + '/' + image_name).save(comic_folder_path + '/' + get_filename(counter))
    os.remove(comic_folder_path + '/' + image_name)

def get_filename(counter):
    return '0'+str(counter)+'.jpg' if counter<10 else str(counter)+'.jpg'

for image in images:
    if image == 's.jpg': 
        continue
    elif image.endswith('.jpg'):
        rename_image(image, counter)
    else:
        convert_and_rename_image(image, counter)
    counter += 1
