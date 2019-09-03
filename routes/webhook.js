var express = require('express');
var auth = require('../helpers/auth');
var path = require('path');
var security = require('../helpers/security');
var axios = require('axios');
var OAuth = require('oauth-1.0a');
var crypto = require('crypto');
var fs = require('fs');
const {prisma} = require('../generated/prisma-client');
var router = express.Router();

// Initialize oAuth
const oauth = OAuth({
    consumer:{
        key: auth.twitter_oauth.consumer_key,
        secret: auth.twitter_oauth.consumer_secret
    },
    signature_method: 'HMAC-SHA1',
    hash_function(base_string, key){
        return crypto
            .createHmac('sha1' , key)
            .update(base_string)
            .digest('base64')
    }
});

const token = {
    key: auth.twitter_oauth.token,
    secret: auth.twitter_oauth.token_secret
};

// Helper function to get the bearer token
const getBearerToken = async function(){
    let bearer_token = await  axios({
        method: 'post',
        //url: 'https://ptsv2.com/t/sj1fv-1567066554/post',
        url: 'https://api.twitter.com/oauth2/token',
        auth: {username: auth.twitter_oauth.consumer_key, password: auth.twitter_oauth.consumer_secret},
        headers: {'Content-Type': 'x-www-form-urlencoded'},
        params: {grant_type: 'client_credentials'}
    });

    return bearer_token.data;
};

// Helper function to get the active webhook
const getWebHook = async function(){
    let bearer_token_response = await getBearerToken();
    let bearer_token = bearer_token_response.access_token;

    let webhookinfo = await axios({
        method: 'get',
        url: 'https://api.twitter.com/1.1/account_activity/all/' + auth.twitter_webhook_environment + '/webhooks.json',
        headers: {'authorization': 'Bearer ' + bearer_token}
    })

    return webhookinfo.data;
};

// Helper function to delete the webhook
const deleteWebHook = async function(webhookid){
    const request_data = {
        url: 'https://api.twitter.com/1.1/account_activity/all/' + auth.twitter_webhook_environment + '/webhooks/' + webhookid + '.json',
        method:'delete'
    };

    let response = await axios({
        method: request_data.method,
        url: request_data.url,
        headers: oauth.toHeader(oauth.authorize(request_data , token))
    });

    return response.data;
};

// Helper function to set webhook to valid by triggering CRC
const triggerWebHookCRC = async function(webhookid){
    const request_data = {
        url: 'https://api.twitter.com/1.1/account_activity/all/' + auth.twitter_webhook_environment + '/webhooks/' + webhookid + '.json',
        method:'put'
    };

    let response = await axios({
        method: request_data.method,
        url: request_data.url,
        headers: oauth.toHeader(oauth.authorize(request_data,token))
    });

    return response.data;
};

// Helper function to register a webhook
const registerWebHook = async function(webhookurl){
    let encodedURL = encodeURIComponent(webhookurl);
    const request_data = {
        url: 'https://api.twitter.com/1.1/account_activity/all/' + auth.twitter_webhook_environment + '/webhooks.json?url=' + encodedURL,
        method:'post'
    };

    let response = await axios({
        method: request_data.method,
        url: request_data.url,
        headers: oauth.toHeader(oauth.authorize(request_data , token))
    });

    return response.data;
};

// Helper function to register a subscription
const registerSubscription = async function(){
    const request_data = {
        url: 'https://api.twitter.com/1.1/account_activity/all/' + auth.twitter_webhook_environment + '/subscriptions.json ',
        //url: 'https://ptsv2.com/t/sj1fv-1567066554/post',
        method:'post'
    };

    let response = await axios({
        method: request_data.method,
        url: request_data.url,
        headers: oauth.toHeader(oauth.authorize(request_data , token))
    });

    return response.data;
};

// Helper function to parse a tweet and insert into the database
const parseTweetToBookmark = async function(tweetmsg){
    let tweetobj = JSON.parse(tweetmsg);
    let tweet_type = '';

    // Check if it is a tweet_create_event which means it is a retweet or a DM
    let counter = 0;

    for (var i in tweetobj){
        if (counter === 1){
            tweet_type = i;
        }
        counter++;
    }

    if (tweet_type === 'tweet_create_events'){
        let createeventobj = tweetobj['tweet_create_events'][0];

        // Extract the tweet details that we need
        let tweet_user_id = createeventobj.user.id_str;
        let tweet_user_display_name = createeventobj.user.name;
        let tweet_user_screen_name = createeventobj.user.screen_name;
        let tweet_user_profile_image = createeventobj.user.profile_image_url_https;

        // Check if there is an extended key, if there is, the actual URL is inside there
        let quotedStatusNode =createeventobj.quoted_status;
        let hasExtendedTweetNode = false;

        for (i in quotedStatusNode){
            if (i === 'extended_tweet'){
                hasExtendedTweetNode = true;
            }
        }

        console.log('Detecting Extended Tweet - ' + hasExtendedTweetNode);

        let bookmark_fromsource = 'twitter';
        let bookmark_url = '';
        let bookmark_displayurl = '';
        let bookmark_tweet_source_text = '';
        let bookmark_tweet_source_userid = '';
        let bookmark_tweet_source_username = '';
        let bookmark_tweet_source_user_screenname = '';

        bookmark_tweet_source_userid = createeventobj.quoted_status.user.id_str
        bookmark_tweet_source_username = createeventobj.quoted_status.user.name;
        bookmark_tweet_source_user_screenname = createeventobj.quoted_status.user.screen_name;

        if (hasExtendedTweetNode === false) {
            bookmark_url = createeventobj.quoted_status.entities.urls[0].expanded_url;
            bookmark_displayurl = createeventobj.quoted_status.entities.urls[0].display_url;
            bookmark_tweet_source_text = createeventobj.quoted_status.text;
        }
        else{
            bookmark_url = createeventobj.quoted_status.extended_tweet.entities.urls[0].expanded_url;
            bookmark_displayurl = createeventobj.quoted_status.extended_tweet.entities.urls[0].display_url;
            bookmark_tweet_source_text = createeventobj.quoted_status.extended_tweet.full_text;
        }


        // Check to see if the user already exist in our database
        let userCount = await prisma.useraccountsConnection( {
            where:{
                registered_source: 'twitter',
                twitter_id: tweet_user_id
            }
        }).aggregate().count();

        // If user does not exist, create the user, else retrieve the user if exist
        let userRecord = '';
        if (userCount < 1){
            userRecord = await prisma.createUseraccount({
                registered_source: 'twitter',
                twitter_id:  tweet_user_id,
                twitter_display_name: tweet_user_display_name,
                twitter_screen_name: tweet_user_screen_name,
                twitter_profile_image: tweet_user_profile_image
            });
            console.log('Created User ID : ' + tweet_user_id);
        }
        else{
            // Retrieve the single user record
            userRecord = await prisma.useraccount({twitter_id: tweet_user_id});
            console.log('Retrieved User ID : ' + tweet_user_id);
        }

        // Populate the user record with the bookmark supplied
        let bookmarkRecord = await prisma.createBookmark({
            belongsTo: {
               connect: { twitter_id: tweet_user_id}
            },
            url: bookmark_url,
            displayurl: bookmark_displayurl,
            fromsource: bookmark_fromsource,
            tweetsourcetext: bookmark_tweet_source_text,
            tweetsourceuserid: bookmark_tweet_source_userid,
            tweetsourceusername: bookmark_tweet_source_username,
            tweetsourcescreenname: bookmark_tweet_source_user_screenname
        });

        console.log('Created bookmark ID ' + bookmarkRecord.id);


    }  // Close tweet_type === tweet_create_events

    return '12345';
};

// *** Service EndPoints

// Test Method to parse tweet
router.get('/testparse', function(req,res){
    let response = '';
    fs.readFile('/home/alvinloh/Documents/Projects/per/DogEared/dump/2019811134.txt' , 'utf8' ,  async function (err, data){
        response = await parseTweetToBookmark(data);
        res.send(response);
    });
});


// Get all registered webhooks
router.get('/list', async function (req, res) {
    let webhookinfo = await getWebHook();
    res.send(webhookinfo);
});

// Respond to periodic CRC checks from Twitter
router.get('/twitter', async function(req,res){
    let crc_token = req.query.crc_token;
    if (crc_token)   {
        let hash = security.get_challenge_response(crc_token, auth.twitter_oauth.consumer_secret);
        res.send( {response_token: 'sha256=' + hash} );
    }
    else{
        res.send('Error');
    }
});

// Register the webhook as specified in the env file
router.get('/registerwburl' , async function (req,res){
    // Register a new webhook
    let register_webhook_res = await registerWebHook(auth.twitter_webhook_url);
    console.log('Registered Webhook');

    // Validate the webhook
    // We get the webhook first
    webhooks_available = await getWebHook();
    console.log('New webhook ID : ' + webhooks_available[0]['id']);

    let validate_webhook_res = await triggerWebHookCRC(webhooks_available[0]['id']);
    console.log('Validated webhook');

    res.send('Webhook updated');
});

// Update the webhook based on env variables defined webhook url
router.get('/updatewburl', async function(req,res){
    // We need to get a list of the webhook url and grab its ID
    // Then we delete the URL
    // And then we register it again, with the new URL

    // Grab the list of web hooks and take the first one
    let webhooks_available = await getWebHook();
    console.log('Existing webhook ID : ' + webhooks_available[0]['id']);

    // Delete the webhook
    let delete_webhook_res = await deleteWebHook(webhooks_available[0]['id']);
    console.log('Deleted webhook');

    // Register a new webhook
    let register_webhook_res = await registerWebHook(auth.twitter_webhook_url);
    console.log('Registered Webhook');

    // Validate the webhook
    // We get the webhook first
    webhooks_available = await getWebHook();
    console.log('New webhook ID : ' + webhooks_available[0]['id']);

    let validate_webhook_res = await triggerWebHookCRC(webhooks_available[0]['id']);
    console.log('Validated webhook');

    res.send('Webhook updated');

});

router.get('/testdate', async function(req,res){
    let dateobj = new Date();
    let currentTime = dateobj.getFullYear().toString() + dateobj.getMonth().toString() + dateobj.getDay().toString() + dateobj.getHours().toString() + dateobj.getMinutes().toString() + '.txt';
    console.log('CurrentTime : ' + currentTime);

    res.send('OK');
});

// Capture the account activity from webhooks
router.post('/twitter', async function (req, res){

    let dateobj = new Date();
    let currentTime = dateobj.getFullYear().toString() + dateobj.getMonth().toString() + dateobj.getDay().toString() + dateobj.getHours().toString() + dateobj.getMinutes().toString() + '.txt';

    var fileName = path.join(auth.path_to_save , currentTime);
    // Just record down and dump it into files
    fs.writeFile(fileName, JSON.stringify(req.body), (err) => {
        if (err) console.log(err);
        console.log("Successfully Written to File.");
    });

    res.send('OK');
});

router.get('/registersub' , async function (req, res) {
    let subres = await registerSubscription();
    console.log('Subscription Add Sent');
    res.send(subres);
});
module.exports = router;
