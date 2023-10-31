import cdny from "cloudinary";
import fs from "fs";
const cloudinary = cdny.v2;

import yaml from "js-yaml";
import { ApiError } from "./api/baseRouter.js";
let fileContents = fs.readFileSync("config/cfg.yml", "utf8");
const config = yaml.load(fileContents);

cloudinary.config(config.cloudinary);

export async function uploadCloudinaryMedia(filepath) {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload(filepath, (err, response) => {
      if (err) {
        console.log("ERROR uploading to cloudinary: ", err);
        reject(new ApiError("Error uploading file", 500));
        return;
      }

      resolve(response.public_id);
    });
  });
}

export async function deleteCloudinaryMedia(cloudinaryId) {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.destroy(cloudinaryId, (err) => {
      if (err) {
        console.log("ERROR deleting from cloudinary: ", err);
        reject(new ApiError("Error deleting file", 500));
        return;
      }

      resolve();
    });
  });
}
