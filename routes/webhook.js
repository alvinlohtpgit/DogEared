var express = require('express');
var auth = require('../helpers/auth');
var axios = require('axios');
var router = express.Router();


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
    axios({
        method: 'delete',
        url: 'https://api.twitter.com/1.1/account_activity/all/' + auth.twitter_webhook_environment + '/webhooks/' + webhookid + '.json',
        headers{'authorization': 'OAuth' + }
    })
}

// Get all registered webhooks
router.get('/list', async function (req, res) {
    let webhookinfo = await getWebHook();
    res.send(webhookinfo);

});






module.exports = router;
