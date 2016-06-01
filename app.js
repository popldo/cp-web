"use strict";
/* global process */
/* global __dirname */
/*******************************************************************************
 * Copyright (c) 2015 IBM Corp.
 *
 * All rights reserved.
 *
 * Contributors:
 *   David Huffman - Initial implementation
 *   Dale Avery
 *******************************************************************************/
/////////////////////////////////////////
///////////// Setup Node.js /////////////
/////////////////////////////////////////
var express = require('express');
var session = require('express-session');
var compression = require('compression');
var serve_static = require('serve-static');
var path = require('path');
var morgan = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var http = require('http');
var app = express();
var url = require('url');
var async = require('async');
var setup = require('./setup');
var cors = require("cors");
var fs = require("fs");
var util = require('util');

//// Set Server Parameters ////
var host = setup.SERVER.HOST;
var port = setup.SERVER.PORT;

// For logging
var TAG = "app.js:";

////////  Pathing and Module Setup  ////////
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');
app.engine('.html', require('jade').__express);
app.use(compression());
app.use(morgan('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded());
app.use(cookieParser());
app.use('/cc/summary', serve_static(path.join(__dirname, 'cc_summaries')));												//for chaincode investigator
app.use(serve_static(path.join(__dirname, 'public'), {maxAge: '1d', setHeaders: setCustomCC}));							//1 day cache
//app.use( serve_static(path.join(__dirname, 'public')) );
app.use(session({secret: 'Somethignsomething1234!test', resave: true, saveUninitialized: true}));
function setCustomCC(res, path) {
    if (serve_static.mime.lookup(path) === 'image/jpeg')  res.setHeader('Cache-Control', 'public, max-age=2592000');		//30 days cache
    else if (serve_static.mime.lookup(path) === 'image/png') res.setHeader('Cache-Control', 'public, max-age=2592000');
    else if (serve_static.mime.lookup(path) === 'image/x-icon') res.setHeader('Cache-Control', 'public, max-age=2592000');
}
// Enable CORS preflight across the board.
app.options('*', cors());
app.use(cors());

///////////  Configure Webserver  ///////////
app.use(function (req, res, next) {
    var keys;
    console.log('------------------------------------------ incoming request ------------------------------------------');
    console.log('New ' + req.method + ' request for', req.url);
    req.bag = {};											//create my object for my stuff
    req.session.count = eval(req.session.count) + 1;
    req.bag.session = req.session;

    var url_parts = url.parse(req.url, true);
    req.parameters = url_parts.query;
    keys = Object.keys(req.parameters);
    if (req.parameters && keys.length > 0) console.log({parameters: req.parameters});		//print request parameters
    keys = Object.keys(req.body);
    if (req.body && keys.length > 0) console.log({body: req.body});						//print request body
    next();
});

//// Router ////
var router = require('./routes/site_router');
app.use('/', router);

////////////////////////////////////////////
////////////// Error Handling //////////////
////////////////////////////////////////////
app.use(function (req, res, next) {
    var err = new Error('Not Found');
    err.status = 404;
    next(err);
});
app.use(function (err, req, res, next) {		// = development error handler, print stack trace
    console.log("Error Handeler -", req.url);
    var errorCode = err.status || 500;
    res.status(errorCode);
    req.bag.error = {msg: err.stack, status: errorCode};
    if (req.bag.error.status == 404) req.bag.error.msg = "Sorry, I cannot locate that file";
    res.render('template/error', {bag: req.bag});
});

// ============================================================================================================================
// 														Launch Webserver
// ============================================================================================================================
var server = http.createServer(app).listen(port, function () {
});
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
process.env.NODE_ENV = 'production';
server.timeout = 240000;																							// Ta-da.

console.log('------------------------------------------ Server Up - ' + host + ':' + port + ' ------------------------------------------');

if (process.env.PRODUCTION)
    console.log('Running using Production settings');
else
    console.log('Running using Developer settings');

// ============================================================================================================================
// ============================================================================================================================
// ============================================================================================================================
// ============================================================================================================================
// ============================================================================================================================
// ============================================================================================================================

// ============================================================================================================================
// 														Warning
// ============================================================================================================================

// ============================================================================================================================
// 														Entering
// ============================================================================================================================

// ============================================================================================================================
// 														Test Area
// ============================================================================================================================
var cpaper = require('./utils/cpaper');
var ws = require('ws');
var wss = {};
var Ibc1 = require('ibm-blockchain-js');
var ibc = new Ibc1();

// ==================================
// load peers manually or from VCAP, VCAP will overwrite hardcoded list!
// ==================================
var manual = JSON.parse(fs.readFileSync('mycreds.json', 'utf8'));

var peers, users, ca;

if (manual.credentials.peers) {
    console.log(TAG, 'loading', manual.credentials.peers.length, 'hardcoded peers');
    peers = manual.credentials.peers;
}

if (manual.credentials.users) {
    console.log(TAG, "loading", manual.credentials.users.length, "hardcoded users");
    users = manual.credentials.users;
}

if (manual.credentials.ca) {
    var ca_name = Object.keys(manual.credentials.ca)[0];
    console.log(TAG, "loading ca:", ca_name);
    ca = manual.credentials.ca[ca_name];
}

// Options for the blockchain network
var options = {};

// Merge the user list and the service credentials so that the list users work as aliases for the
// service users
var user_manager = require('./utils/users');  // Need to call setup() once sdk and chaincode are loaded

// Start up the network!!
configure_network();

// ==================================
// configure ibm-blockchain-js sdk
// ==================================
function configure_network() {
    console.log('configure_network Start');
    options = {
        network: {
            peers: peers,
            users: users,
            options: {quiet: true, tls:false, maxRetry: 1}
        },
        chaincode: {
            zip_url: 'https://github.com/IBM-Blockchain/cp-chaincode-v2/archive/master.zip',
            unzip_dir: 'cp-chaincode-v2-master/hyperledger',							    //subdirectroy name of chaincode after unzipped
            git_url: 'https://github.com/IBM-Blockchain/cp-chaincode-v2/hyperledger',		//GO get http url
            deployed_name: '2450c95bc77e124c766ff650c2f4642e5c0bc2d576ee67db130900750cddc5982e295f320fd5dff7aca2f61fa7cc673fcdcc8a7464f94c68eeccdb14b2384a75'
        }
    };

    ibc.load(options, cb_ready);
}

var chaincode = null;
function cb_ready(err, cc) {//response has chaincode functions
    console.log('cb_ready Start \n');
    if (err != null) {
        console.log('! looks like an error loading the chaincode, app will fail\n', err);
        if (!process.error) process.error = {type: 'load', msg: err.details};				//if it already exist, keep the last error
    }
    else {
        chaincode = cc;
        if (!cc.details.deployed_name || cc.details.deployed_name === "") {												//decide if i need to deploy
            cc.deploy('init', [], {save_path: './cc_summaries'}, finalSetup);
        }
        else {
            console.log('chaincode summary file indicates chaincode has been previously deployed');
            finalSetup();
        }
    }
}

/**
 * Configures other parts of the app that depend on the blockchain network being configured and running in
 * order to function.
 * @param err Will capture any errors from deploying the chaincode.
 */
function finalSetup(err, data) {
    console.log('finalSetup -- ');
    if (err != null) {
        //look at tutorial_part1.md in the trouble shooting section for help
        console.log('! looks like a deploy error, holding off on the starting the socket\n', err);
        if (!process.error) process.error = {type: 'deploy', msg: err.details};
    } else {
        cpaper.setup(ibc, chaincode, users);
        user_manager.setup(ibc, chaincode, ca, cb_deployed);
    }
}

// ============================================================================================================================
// 												WebSocket Communication Madness
// ============================================================================================================================
function cb_deployed(e, d) {
    if (e != null) {
        //look at tutorial_part1.md in the trouble shooting section for help
        console.log('! looks like the final configuration failed, holding off on the starting the socket\n', e);
        if (!process.error) process.error = {type: 'deploy', msg: e.details};
    }
    else {
        console.log('------------------------------------------ Websocket Up ------------------------------------------');
        ibc.save('./cc_summaries');															//save it here for chaincode investigator
        wss = new ws.Server({server: server});												//start the websocket now
        wss.on('connection', function connection(ws) {
            ws.on('message', function incoming(message) {
                console.log('received ws msg:', message);
                var data = JSON.parse(message);
                cpaper.process_msg(ws, data);
            });

            ws.on('close', function () {
            });
        });

        wss.broadcast = function broadcast(data) {											//send to all connections
            wss.clients.forEach(function each(client) {
                try {
                    data.v = '2';
                    client.send(JSON.stringify(data));
                }
                catch (e) {
                    console.log('error broadcast ws', e);
                }
            });
        };

        // ========================================================
        // Part 2 Code - Monitor the height of the blockchain
        // =======================================================
        ibc.monitor_blockheight(function (chain_stats) {										//there is a new block, lets refresh everything that has a state
            if (chain_stats && chain_stats.height) {
                console.log('hey new block, lets refresh and broadcast to all');
                ibc.block_stats(chain_stats.height - 1, cb_blockstats);
                wss.broadcast({msg: 'reset'});
                chaincode.query.query(['GetAllCPs'], cb_got_papers);
            }

            //got the block's stats, lets send the statistics
            function cb_blockstats(err, stats) {
                if (chain_stats.height) stats.height = chain_stats.height - 1;
                wss.broadcast({msg: 'chainstats', e: e, chainstats: chain_stats, blockstats: stats});
            }

            function cb_got_papers(e, papers) {
                if (e != null) {
                    console.log('papers error', e);
                }
                else {
                    //console.log('papers', papers);
                    wss.broadcast({msg: 'papers', papers: papers});
                }
            }

            //call back for getting open trades, lets send the trades
            function cb_got_trades(e, trades) {
                if (e != null) console.log('error:', e);
                else {
                    if (trades && trades.open_trades) {
                        wss.broadcast({msg: 'open_trades', open_trades: trades.open_trades});
                    }
                }
            }
        });
    }
}
