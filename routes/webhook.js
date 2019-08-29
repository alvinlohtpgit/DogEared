var express = require('express');
var router = express.Router();



// List out the environment webhooks available
router.get('/', function(req, res, next) {
    res.send('inside webhook router');
});

module.exports = router;
