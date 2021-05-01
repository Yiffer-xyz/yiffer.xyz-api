import postmark from 'postmark'

import fs from 'fs'
import yaml from 'js-yaml'
let fileContents = fs.readFileSync('./config/cfg.yml', 'utf8');
const config = yaml.load(fileContents)

let client = new postmark.ServerClient(config.email.apiKey);

export async function sendEmail (sendername, receiver, subject, text) {
  try {
    await client.sendEmail({
      From: `${sendername}@yiffer.xyz`,
      To: 'contact@yiffer.xyz',
      Subject: subject,
      HtmlBody: text,
      MessageStream: 'outbound'
    });
  }
  catch (err) {
    throw {error: err, message: 'Error sending email'}
  }
}