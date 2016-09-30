/*eslint-env node*/

//------------------------------------------------------------------------------
// node.js starter application for Bluemix
//------------------------------------------------------------------------------

// This application uses express as its web server
// for more info, see: http://expressjs.com
var express = require('express');
var http = require("http");
var dns = require('dns');
var crypto = require('crypto');

// cfenv provides access to your Cloud Foundry environment
// for more info, see: https://www.npmjs.com/package/cfenv
var cfenv = require('cfenv');

var events = require("events");
var eventHandler = new events.EventEmitter();
var fs = require("fs");
var bodyParser = require('body-parser');
var df = require('dateformat');

var URL_VALIDATION_SECRET_HEADER="X-OUTBOUND-ONETIME-SECRET".toLowerCase();
var URL_VALIDATION_SECRET_BODY="OutboundWebhookOneTimeSecret";

var WEBHOOK_VERIFICATION_KEYS=["35fijs1ajc11j8ptzncgk12bcjb3vyf2", "95fijs1ajc11j9ptzncgk00bcjb3vyf2"];
var WEBHOOK_VERIFICATION_TOKEN_HEADER="X-IBM-OUTBOUND-TOKEN".toLowerCase();

// create a new express server
var app = express();

// serve the files out of ./public as our main files
app.use(express.static(__dirname + '/public'));

app.engine('html', require('ejs').renderFile);
app.set('view engine', 'html');

function rawBody(req, res, next) {
  req.setEncoding('utf8');
  req.rawBody = '';
  req.on('data', function(chunk) {
    req.rawBody += chunk;
  });
  req.on('end', function(){
    next();
  });
}

app.use(rawBody);
//app.use(bodyParser.text({defaultCharset: 'utf-8'}));
//app.use(bodyParser.json())
app.use(errorHandler);

// get the app environment from Cloud Foundry
var appEnv = cfenv.getAppEnv();


var httpServer = http.createServer(app).listen(appEnv.port, '0.0.0.0', function() {
  // print a message when the server starts listening
  console.log("server starting on " + appEnv.url);
});
var io = require("socket.io").listen(httpServer);

// start server on the specified port and binding host
//app.listen(appEnv.port, '0.0.0.0', function() {
  // print a message when the server starts listening
//  console.log("server starting on " + appEnv.url);
//});

function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }
  res.status(500);
  res.render('error', { error: err });
}

// demo page showing incoming and received webhook requests and events
app.get("/webhook", function(req, res) {
	fs.readFile(__dirname + "/public/webhook-event-log.html", 'utf-8', function(err, data) {
    if (err) {
      logger.info(err);
      res.writeHead(500);
      return res.end("Error loading webhook-event-log.html");
    }
    res.writeHead(200);
    res.end(data);
  });
});


app.get("/webhook/eventlog", function(req, res) {
	var clienthost = "";
	var ip = req.connection.remoteAddress;
	if (req.headers['x-forwarded-for'] !== undefined) {
		var value = req.headers['x-forwarded-for'];
		var ips = value.split(',');
		ip = ips[0];
	}

	dns.reverse(ip,  function(err, hostnames){
		if(err){
			clienthost="client ip=" + ip + " not resolvable";
		} else {
			if (hostnames.length >= 1) {
				clienthost=hostnames[0];
			} else {
				clienthost="client ip=" + ip + " not resolvable";
			}
		}
		valdiateUrlGetRequest(req, res, "eventlog", clienthost);
	});
});

// first demo webhook endpoint
app.post("/webhook/eventlog", function(req, res) {
	var clienthost = "";
	var ip = req.connection.remoteAddress;
	if (req.headers['x-forwarded-for'] !== undefined) {
		var value = req.headers['x-forwarded-for'];
		var ips = value.split(',');
		ip = ips[0];
	}
		
	dns.reverse(ip,  function(err, hostnames){
		if(err){
			clienthost="client ip=" + ip + " not resolvable";
		} else {
			if (hostnames.length >= 1) {
				clienthost=hostnames[0];
			} else {
				clienthost="client ip=" + ip + " not resolvable";
			}
		}
		logReceivedWebhook(req, res, "eventlog", clienthost);
	});
});


// create a websocket connection for both http+https to keep the content updated
io.sockets.on("connection", function(socket) {
  eventHandler.on("webhook-event", function(data) {
      socket.volatile.emit("notification", data);
  });
});

function getTime() {
	return df(new Date(), 'HH:MM:ss.l');
}

function logReceivedWebhook(req, res, endpoint, clienthost) {
	var rawbody = req.rawBody;
  	var jsonbody= JSON.parse(rawbody, 'utf8');
	var stringJsonbody = JSON.stringify(jsonbody);

	var verificationToken = req.headers[WEBHOOK_VERIFICATION_TOKEN_HEADER];

	if ( verificationToken !== undefined && verifyPayload(verificationToken, stringJsonbody) === true ) {
		var log = '[' + getTime() + "]:[request comes from: " + clienthost + "]: /webhook/" + endpoint + ": " + stringJsonbody + ", response: status 200";
		eventHandler.emit('webhook-event', log);
		res.status(200).end();
	} else {
		var log = '[' + getTime() + "]:[request comes from: " + clienthost + "]: /webhook/" + endpoint + ": received event ignored - could not be verified that it comes from Toscana, response: status 200";
		eventHandler.emit('webhook-event', log);
		res.status(200).end();
	}	
}

function valdiateUrlGetRequest(req, res, endpoint, clienthost) {
	if (req.headers[URL_VALIDATION_SECRET_HEADER] !== undefined) {
		var jsonresponse = '{"' + URL_VALIDATION_SECRET_BODY + '":"' + req.headers[URL_VALIDATION_SECRET_HEADER] + '"}';
		var log = '[' + getTime() + "]:[request comes from: " + clienthost + "]: /webhook/" + endpoint + ": " + ", status ok, response: " + jsonresponse;
		eventHandler.emit('webhook-event', log);
		res.writeHead(200, {"Content-Type": "application/json"});
		res.end(jsonresponse);
	} else {
		res.status(400).end();
	}
}

function verifyPayload(verificationToken, payload) {
	for (var index in WEBHOOK_VERIFICATION_KEYS) {
		var hash = crypto.createHmac('sha256', WEBHOOK_VERIFICATION_KEYS[index]).update(payload).digest('hex')

		if (hash == verificationToken) {
			return true;
		}
	}
	return false;
}
