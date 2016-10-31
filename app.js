/*eslint-env node*/

//------------------------------------------------------------------------------
// node.js starter application for Bluemix
//------------------------------------------------------------------------------

// This application uses express as its web server
// for more info, see: http://expressjs.com
var express = require("express");
var http = require("http");
var crypto = require("crypto");

// cfenv provides access to your Cloud Foundry environment
// for more info, see: https://www.npmjs.com/package/cfenv
var cfenv = require("cfenv");

// Place here the webhook secret received during app registration
//const WEBHOOK_SECRET = "2i88ycvab6ra8h7s2c769r7kwwgtidlr";
const WEBHOOK_SECRET = "mwlpai9buwlt9mlbndsvlrhjemovntwh";

const WEBHOOK_CALLBACK = "/webhook/eventlog";




var WEBHOOK_VERIFICATION_TOKEN_HEADER="X-OUTBOUND-TOKEN".toLowerCase();
var WEBHOOK_ORDER_INDEX_HEADER="X-OUTBOUND-INDEX".toLowerCase();
var WEBHOOK_RETRY_COUNT_HEADER="X-OUTBOUND-RETRY-COUNT".toLowerCase();

// create a new express server
var app = express();

// serve the files out of ./public as our main files
app.use(express.static(__dirname + "/public"));


// app.engine('html', require('ejs').renderFile);
// app.set('view engine', 'html');

function rawBody(req, res, next) {
	var buffers = [];
	req.on("data", function(chunk) {
		buffers.push(chunk);
	});
	req.on("end", function(){
		req.rawBody = Buffer.concat(buffers);
		next();
	});
}

function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }
  res.status(500);
  res.render("error", { error: err });
}

app.use(rawBody);
app.use(errorHandler);

// get the app environment from Cloud Foundry
var appEnv = cfenv.getAppEnv();

var httpServer = http.createServer(app).listen(appEnv.port, "0.0.0.0", function() {
  console.log("wws-demo Server starting on " + appEnv.url);
});




// first demo webhook endpoint
app.post(WEBHOOK_CALLBACK, function(req, res) {

	if (!verifySender(req.headers, req.rawBody)) {
			console.log("Cannot verify caller ! -------------");
			console.log(req.rawBody.toString());
			res.status(200).end();
			return;
	} var body = JSON.parse(req.rawBody.toString());
			var stringJsonbody = JSON.stringify(body);
			var eventType = body.type;
			if (eventType === "verification")
					handleVerificationRequest(res, body.challenge);
			else {
					var orderIndex = req.headers[WEBHOOK_ORDER_INDEX_HEADER];
					var retryCount = req.headers[WEBHOOK_RETRY_COUNT_HEADER];

					console.log("X-OUTBOUND-ORDER-INDEX, OUTBOUND-RETRY-COUNT: " + orderIndex + ", " + retryCount);
					console.log(stringJsonbody);
					console.log("Event originated at " + Date (body.time));
 					console.log("Latency: " + (Date.now() - body.time) );

					res.status(200).end();
			}

});



function verifySender(headers, rawbody)
{
    var headerToken = headers[WEBHOOK_VERIFICATION_TOKEN_HEADER];
	  var endpointSecret =  WEBHOOK_SECRET;
    var expectedToken = crypto
		.createHmac("sha256", endpointSecret)
		.update(rawbody)
		.digest("hex");

    if (expectedToken === headerToken) {
		   return Boolean(true);
    }
	return Boolean(false);
}

function handleVerificationRequest(response, challenge)
{
    var responseBodyObject = { "response" : challenge };
    var responseBodyString = JSON.stringify(responseBodyObject);
    var endpointSecret =  WEBHOOK_SECRET;

    var responseToken = crypto
		.createHmac("sha256", endpointSecret)
        .update(responseBodyString)
        .digest("hex");

    response.writeHead(200,
                       {
                           "Content-Type" : "application/json; charset=utf-8",
                           "X-OUTBOUND-TOKEN" : responseToken
                       });
		response.end(responseBodyString);

		console.log ("Verification request processed");
//		console.log("VERIFICATION BODY: " + responseBodyString);
//		console.log("VERIFICATION X-OUTBOUND-TOKEN: " + responseToken);
}
