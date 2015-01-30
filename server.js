var express = require('express');
var path = require("path");
var app = express();
var server = require('http').createServer(app);
require('peertc').listen(server);

var port = process.env.PORT || 2999;
server.listen(port);

app.use(express.static(path.join(__dirname, 'build')));

app.get('/', function(req, res) {
	res.sendFile(__dirname + '/demo/index.html');
});