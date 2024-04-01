import express from 'express'
import { fileURLToPath } from 'url';
import path from 'path';
import bodyParser from 'body-parser';

import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

const app = express();
const port = process.env.PORT || 8002;
var db;

const currentHost = "http://localhost:8002/";

// Open the sqlite db.
(async () => {
	db = await open({
		filename: "./db.db",
		driver: sqlite3.Database
	})
})()

// Express settings.
app.use(bodyParser.urlencoded({ extended: true }));
const __filename = fileURLToPath(
	import.meta.url); // Get the directory URL

app.set('view engine', 'ejs'); // Set webpages to run from EJS
app.use(express.static(path.dirname(__filename) + '/public')); // Set the public view folder to /public (to get images, css, etc.)

app.get('/', (req, res) => {
    checkOldURLs();
    res.render('home', {
    });
});

// Valid URL checker
// URLs do not require http:// or https:// in this case. They must contain text before and after the dot to be valid. They must not contain .. before the /
function isValidURL(url) {

    var withoutHttp = url.replace('http://', '').replace('https://', '');
    var beforeSlash = withoutHttp.split('/')[0];
    var splitDots = beforeSlash.split('.');

    var validURL = true;

    for(var i = 0; i < splitDots.length; i++) {
        if(splitDots[i] == "") validURL = false;
    }

    if(url.includes(' ') || beforeSlash.includes('..') || !beforeSlash.includes('.')) validURL = false;

    return validURL;

}

// Shorten URL post page, after entering a link
app.post('/shorten', async (req, res) => {

    const url = req.body.url;
    const validURL = isValidURL(url)

    // If URL does not pass validity function, show them invalid URL page
    if(!validURL) {

        res.render('invalid', {});
        return;

    }

    var result = await db.get(`SELECT * FROM urls WHERE url = ? OR url = ? OR url = ?`, [url, "http://" + url, "https://" + url])

	if(result != null) {

        res.render('success', {

            currentHost: currentHost,
            code: result.code,
            url: url
    
        })

        return;

	}

    // Random 7 length, alphanumeric string for the URL code.
    var randomCode = randomString(7);

    // Incase the code already exists, which is quite unlikely, or if it equals shorten, to stop problems arising.
    var result2 = await db.get(`SELECT * FROM urls WHERE code = ?`, [randomCode])

	while (result2 != null && randomCode.toLowerCase() != "shorten") {

        randomCode = randomString(7);
        result2 = await db.get(`SELECT * FROM urls WHERE code = ?`, [randomCode])

	}

    // Add http:// if there isn't already (or https://), to stop it redirecting to <shortnerURL>/<their url>
    var urlFixed = url;

    if(!(url.startsWith("http://")) && !(url.startsWith("https://"))) {

        urlFixed = "http://" + url;

    }

    // Add to the DB, with the last used so we can clear if not used within 30 days.
    db.run(`INSERT INTO urls (code, url, lastUsed) VALUES (?, ?, ?)`, [randomCode, urlFixed, Date.now()]);

    // Show them success page.
    res.render('success', {

        currentHost: currentHost,
        code: randomCode,
        url: url

    })

})

// Get any other paths than the ones already shown.
app.get('*', async (req, res) => {

    // Slice away the /
    var url = req.originalUrl.slice(1);
    var result = await db.get(`SELECT * FROM urls WHERE code = ?`, [url])

    // If no code is in the DB, render the unknown page
	if (result == null) {

        res.render('unknown', {});
		return;

	}

    // If found, update last used to stop url being deleted
    db.run(`UPDATE urls SET lastUsed = ? WHERE code = ?`, [Date.now(), url]);

    // Redirect to the shortened URL!
    res.redirect(result.url)

    checkOldURLs();
})

// Every 3 hours
async function checkOldURLs() {
    const date = new Date();
    date.setDate(date.getDate() - 30);
    const dateMs = date.getTime();
    db.run(`DELETE FROM urls WHERE lastUsed < ?`, [dateMs])
}

app.listen(port, () => {
    console.log(`Server started on port ${port}.`);
});

// Create a random string using alphanumeric characters
function randomString(length) {
    var chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    var result = '';
    for (var i = length; i > 0; --i) result += chars[Math.floor(Math.random() * chars.length)];
    return result;
}