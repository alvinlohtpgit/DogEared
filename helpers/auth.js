require('dotenv').config();

// Create a new auth object
var auth = {};

// Populate our keys
auth.twitter_oauth = {
    consumer_key: process.env.TWITTER_CONSUMER_KEY,
    consumer_secret: process.env.TWITTER_CONSUMER_SECRET,
    token: process.env.TWITTER_ACCESS_TOKEN,
    token_secret: process.env.TWITTER_ACCESS_TOKEN_SECRET
}

auth.twitter_webhook_environment = process.env.TWITTER_WEBHOOK_ENV
auth.twitter_webhook_url = process.env.TWITTER_WEBHOOK_URL
auth.path_to_save = '/home/alvinloh/Documents/Projects/per/DogEared/dump'
module.exports = auth;
