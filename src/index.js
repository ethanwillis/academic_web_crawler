// Imports
var Crawler = require("simplecrawler");
var fs = require('fs');
var timestamp = require('unix-timestamp');
timestamp.round = true;

// Define crawler settings
var settings = {
	crawler_settings: {
		max_depth: 3,
		mime_types: [(new RegExp("application/pdf")), (new RegExp('text/html'))],
		download_unsupported: false
	},
	application_settings: {
		return_mime_types: ["application/pdf"],
		download_folder: "./pdf_downloads"
	},
	urls: [
		"http://journals.plos.org/plosone/lockss-manifest"
	]
}

// Function for crawling a site.
var crawl_site = function(url, crawler_settings, app_settings, callback) {
	// Create crawler
	var crawler = Crawler(url);

	// Apply crawler settings.
	crawler.max_depth = crawler_settings.max_depth;
	crawler.supportedMimeTypes = crawler_settings.mime_types;
	crawler.downloadUnsupported = crawler_settings.download_unsupported;

	crawler.addFetchCondition(function(queueItem, referrerQueueItem, callback) {
		// We only ever want to move one step away from example.com, so if
		// referrer queue item reports a different domain, don't proceed 
		callback(null, referrerQueueItem.host === crawler.host);
	});

	crawler.on("crawlstart", function() {
		//console.log("Crawler started!");
	});

	crawler.on("fetchcomplete", function(queueItem, responseBuffer, response) {
		// Only log when we have grabbed a pdf.
		if( app_settings.return_mime_types.includes(response.headers['content-type']) ) {
			callback(app_settings, responseBuffer, queueItem, function(result) {
				console.log(result);	
			});
		} else {
			console.log("not downloading " + response.headers['content-type']  + ": " + queueItem.url);
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
var save_to_mq = function(app_settings, responseBuffer, queueItem, callback) {
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
			callback(JSON.stringify(AUR, null, "\t"));
		}
	});
};


// Script to start crawler.
settings.urls.map(function(url) {
	crawl_site(url, settings.crawler_settings, settings.application_settings, save_to_mq);
});
