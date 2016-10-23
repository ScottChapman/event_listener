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

var WEBHOOK_VERIFICATION_KEYS={"eventlog": "2i88ycvab6ra8h7s2c769r7kwwgtidlr"};
var WEBHOOK_VERIFICATION_TOKEN_HEADER="X-OUTBOUND-TOKEN".toLowerCase();
var WEBHOOK_ORDER_INDEX_HEADER="X-OUTBOUND-INDEX".toLowerCase();
var WEBHOOK_RETRY_COUNT_HEADER="X-OUTBOUND-RETRY-COUNT".toLowerCase();

// create a new express server
var app = express();

// serve the files out of ./public as our main files
app.use(express.static(__dirname + '/public'));

app.engine('html', require('ejs').renderFile);
app.set('view engine', 'html');


function rawBody(req, res, next) {
	var buffers = [];
	req.on('data', function(chunk) {
		buffers.push(chunk);
	});
	req.on('end', function(){
		req.rawBody = Buffer.concat(buffers);
		next();
	});
}

app.use(rawBody);
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

app.get("/:teamhook", function(req, res) {
	var endpoint = req.params.teamhook;

	if (endpoint.indexOf('teamhook') != 0) {
		res.status(400).end();
	} else {

		fs.readFile(__dirname + "/public/" + endpoint + "-event-log.html", 'utf-8', function(err, data) {
			if (err) {
				logger.info(err);
				res.writeHead(500);
				return res.end("Error loading " + endpoint + "-event-log.html");
			}
			res.writeHead(200);
			res.end(data);
		});
	}
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
		handleRequest(req, res, "eventlog", clienthost);
	});
});

// first demo webhook endpoint
app.post("/teamhooks/:teamhook", function(req, res) {
	var endpoint = req.params.teamhook;

	if (endpoint.indexOf('teamhook') != 0) {
		res.status(404).end();
	} else {
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
			handleRequest(req, res, endpoint, clienthost);
		});
	}
});

// create a websocket connection for both http+https to keep the content updated
io.sockets.on("connection", function(socket) {
  eventHandler.on("eventlog", function(data) {
      socket.volatile.emit("webhook-event", data);
  });
  eventHandler.on("teamhook1", function(data) {
      socket.volatile.emit("teamhook1-event", data);
  });
  eventHandler.on("teamhook2", function(data) {
      socket.volatile.emit("teamhook2-event", data);
  });
  eventHandler.on("teamhook3", function(data) {
      socket.volatile.emit("teamhook3-event", data);
  });
  eventHandler.on("teamhook4", function(data) {
      socket.volatile.emit("teamhook4-event", data);
  });
  eventHandler.on("teamhook5", function(data) {
      socket.volatile.emit("teamhook5-event", data);
  });
});

function getTime() {
	return df(new Date(), 'HH:MM:ss.l');
}

function handleRequest(request, response, endpoint, clienthost) {

	var urlpath="webhook";
	if (endpoint.indexOf('teamhook') == 0) {
		urlpath="teamhooks";
	}

    if ( ! verifySender(endpoint, request.headers, request.rawBody) ) {
		var log = '[' + getTime() + "]:[request comes from: " + clienthost + "]: /"+urlpath+"/" + endpoint + ": received request ignored - could not be verified that it comes from Toscana,<br>body=" + request.rawBody.toString() + ", response: status 200";
		eventHandler.emit(endpoint.toString(), log);
		response.status(200).end();
		return;
	} else {
		var body = JSON.parse(request.rawBody.toString());
		var stringJsonbody = JSON.stringify(body);
		var eventType = body.type;
		if (eventType == "verification")
			handleVerificationRequest(endpoint, response, body.challenge, urlpath, clienthost);
		else {
			var orderIndex = request.headers[WEBHOOK_ORDER_INDEX_HEADER];
			var retryCount = request.headers[WEBHOOK_RETRY_COUNT_HEADER];

			var log = '[' + getTime() + "]:[request comes from: " + clienthost + "]: /"+urlpath+"/" + endpoint + ": " + stringJsonbody +
				", X-OUTBOUND-ORDER-INDEX=" + orderIndex + ", X-OUTBOUND-RETRY-COUNT=" + retryCount + ", response: status 200";
			eventHandler.emit(endpoint.toString(), log);
			response.status(200).end();
		}
	}
}

function verifySender(endpoint, headers, rawbody)
{
	// console.log("verifySender");

    var headerToken = headers[WEBHOOK_VERIFICATION_TOKEN_HEADER];
	  var endpointSecret =  WEBHOOK_VERIFICATION_KEYS[endpoint];
    var expectedToken = crypto
		.createHmac('sha256', endpointSecret)
		.update(rawbody)
		.digest('hex');

		// console.log("expectedToken, headerToken" + expectedToken);
		// console.log("headerToken" + headerToken);

    if (expectedToken === headerToken) {
		   return Boolean(true);
    }
		else {
			return Boolean(false);
		}
}

function handleVerificationRequest(endpoint, response, challenge, urlpath, clienthost)
{
    var responseBodyObject = { "response" : challenge };
    var responseBodyString = JSON.stringify(responseBodyObject);
		var endpointSecret =  WEBHOOK_VERIFICATION_KEYS[endpoint];
    var responseToken = crypto
		.createHmac('sha256', endpointSecret)
        .update(responseBodyString)
        .digest('hex');

		// console.log("verification attempt!");
		// console.log("responseBodyObject: " + responseBodyObject);
		// console.log("responseBodyString: " + responseBodyString);
		// console.log("endpointSecret: " + endpointSecret);
		// console.log("responseToken: " + responseToken);

    response.writeHead(200,
                       {
                           "Content-Type" : "application/json; charset=utf-8",
                           "X-OUTBOUND-TOKEN" : responseToken
                       });
    response.write;
		var log = '[' + getTime() + "]:[request comes from: " + clienthost + "]: /" + urlpath + "/" + endpoint + ": " + "endpoint verification request, status ok, response: " + responseBodyString + ", X-OUTBOUND-TOKEN: " + responseToken;
		eventHandler.emit(endpoint.toString(), log);

    response.end(responseBodyString);
}
