from PIL import Image
import sys, os

comic_folder_path = os.getcwd() + '/public/comics/' + sys.argv[1]
file_in_question = 'x.' + sys.argv[2]
newPageNumber = sys.argv[3]

if newPageNumber < 10: 
    newPageNumber = '0' + str(newPageNumber)

Image.open(comic_folder_path + '/' + file_in_question).convert('RGB').save(comic_folder_path + '/' + str(newPageNumber) + '.jpg')

os.remove(comic_folder_path + '/' + file_in_question)