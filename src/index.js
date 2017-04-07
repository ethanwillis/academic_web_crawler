// Imports
var Crawler = require("simplecrawler");
var fs = require('fs');
var MongoClient = require('mongodb').MongoClient;
var timestamp = require('unix-timestamp');
timestamp.round = true;

// Define crawler settings
var settings = {
	crawler_settings: {
		max_depth: 1,
		mime_types: [(new RegExp("application/pdf")), (new RegExp('text/html'))],
		download_unsupported: false,
		max_concurrency: 100,
		crawler_timeout: 7000,
		parse_HTML_comments: false,
		parse_script_tags: false
	},
	application_settings: {
		return_mime_types: ["application/pdf"],
		download_folder: "./pdf_downloads",
		mongo_url: "mongodb://crawlerdb.fate:27017/crawlerdb"
	},
	urls: [
		"http://journals.plos.org/plosone/lockss-manifest",
		"http://www.ijbs.com/ms/archive",
		"https://peerj.com/archives/",
		"https://peerj.com/archives-preprints/"
	]
}



// Function for crawling a site.
var crawl_site = function(url, crawler_settings, app_settings, db_client, callback) {
	// Create crawler
	var crawler = Crawler(url);

	// Apply crawler settings.
	crawler.max_depth = crawler_settings.max_depth;
	crawler.supportedMimeTypes = crawler_settings.mime_types;
	crawler.downloadUnsupported = crawler_settings.download_unsupported;
	crawler.maxConcurrency = crawler_settings.max_concurrency;
	crawler.crawlerTimeout = crawler_settings.crawler_timeout;
	crawler.parseHTMLComments = crawler_settings.parse_HTML_comments;
	crawler.parseScriptTags = crawler_settings.parse_script_tags;

	crawler.addFetchCondition(function(queueItem, referrerQueueItem, callback) {
		// We only ever want to move one step away from example.com, so if
		// referrer queue item reports a different domain, don't proceed 
		callback(null, referrerQueueItem.host === crawler.host);
	});

	crawler.on("crawlstart", function() {
		console.log("Crawler started!");
	});

	crawler.on("fetchcomplete", function(queueItem, responseBuffer, response) {
		// Only log when we have grabbed a pdf.
		if( app_settings.return_mime_types.includes(response.headers['content-type']) ) {
			console.log("Found PDF!");
			callback(app_settings, responseBuffer, queueItem, db_client);
		} else {
			console.log("New link fetched: " + queueItem.url);
		}
	});

	crawler.start();
}

// Function for saving pdfs
var save_pdf = function(app_settings, responseBuffer, queueItem, callback) {
	var file_path = app_settings.download_folder + "/" + queueItem.id + ".pdf";
	fs.writeFile(file_path, responseBuffer, function(err) {
		if(err) {
			console.log("Error writing file: " + file_path);
			callback(null);
		} else {
			callback(file_path);
		}
	});

}

// Function for writing potential AUR to message queue.
var save_to_mq = function(app_settings, responseBuffer, queueItem, db_client) {
	var AUR = {
		retrieved_on: timestamp.now(),
		crawler: {
		},
		fs: {
		}
	}

	// Update AUR with information from crawler queueItem
	AUR.crawler.id = queueItem.id;
	AUR.crawler.url = queueItem.url;
	AUR.crawler.depth = queueItem.depth;
	AUR.crawler.status = queueItem.status;
	AUR.crawler.stateData = queueItem.stateData;

	// Save PDF to FS and update AUR message
	save_pdf(app_settings, responseBuffer, queueItem, function(file_path) {
		if(file_path) {
			AUR.fs.file_path = file_path;
			var AUR_message_queue = db_client.collection("AUR_message_queue");
			AUR_message_queue.insert(AUR, function(err, result) {
				if(err) {
					console.log("Error saving AUR in db: " + err);
				} else {
					console.log("Saved AUR in db: " + JSON.stringify(result));
				}
			});
		} else {
			console.log("Error saving pdf @ " + AUR.crawler.url);
		}
	});
};


// Script to start crawler.
MongoClient.connect(settings.application_settings.mongo_url, function(err, db_client) {
	if(err) {
		console.log("Error connecting to database: " + err);
	} else {
		settings.urls.map(function(url) {
			crawl_site(url, settings.crawler_settings, settings.application_settings, db_client, save_to_mq);
		});
	}
});
