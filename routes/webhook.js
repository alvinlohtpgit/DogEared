var express = require('express');
var auth = require('../helpers/auth');
var security = require('../helpers/security');
var axios = require('axios');
var OAuth = require('oauth-1.0a');
var crypto = require('crypto');
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



// *** Service EndPoints

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

// Update the webhook based on env


module.exports = router;
