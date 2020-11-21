import emailSettings from '../config/email-config.js'
import postmark from 'postmark'

let client = new postmark.ServerClient(emailSettings.apiKey);

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