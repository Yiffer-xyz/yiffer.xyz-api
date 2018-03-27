from PIL import Image
import sys, os

comic_folder_path = os.getcwd() + '/public/comics/' + sys.argv[1]

all_files = os.listdir(comic_folder_path)
all_files2 = []
for f in all_files:
    if f.strip() != 's.jpg':
        all_files2.append(f.strip())

all_files3 = sorted(all_files2, key = lambda x: int(x[:x.index('.')]))
file_in_question = all_files3[-1]

page_number = file_in_question[:file_in_question.index('.')]

Image.open(comic_folder_path + '/' + file_in_question).save(comic_folder_path + '/' + str(page_number) + '.jpg')

os.remove(comic_folder_path + '/' + file_in_question)