var express = require('express');
var app = express();
var server = require('http').createServer(app);
require('./peertc.js').listen(server);
var path = require("path");

var port = process.env.PORT || 2999;
server.listen(port);

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', function(req, res) {
	res.sendfile(__dirname + '/index.html');
});