const config = require('./config.json');
const escapeStringRegexp = require('escape-string-regexp');
const fs = require('fs');
const fetch = require('node-fetch');
const replace = require('replace-in-file');

const IGNORED_DOMAINS = config.ignoredDomains || [];
let DOMAINS_REGEXP_CACHE = [];

/**
 * Return the list without the domains specific in config.ignoredDomains
 * @param {String} listFile
 * @returns a String path to the CSV file
 */
const removeIgnoredDomains = function (listFile) {
    return new Promise((resolve, reject) => {
        // Modify the website list, if we have any ignoredDomains.
        if (IGNORED_DOMAINS.length) {
            if (!DOMAINS_REGEXP_CACHE.length){
                DOMAINS_REGEXP_CACHE = IGNORED_DOMAINS.map((value, index) => {
                    // create an escaped regexp out of each domain we want to ignore
                    // the CSV format will look like one of the following (why tho):
                    // 1,example.com\r\n
                    // 1,example.com\n
                    return IGNORED_DOMAINS[index] = new RegExp(`\\d{1,3},${escapeStringRegexp(value)}\\r?\\n`);
                });
            }
            console.log(`Skipping domains per config.ignoredDomains`);
            replace({
                countMatches: true,
                files: listFile,
                from: DOMAINS_REGEXP_CACHE,
                to: ''
            }).then(results => {
                if (!results[0].hasChanged) {
                    console.warn('Warning: config.ignoredDomains set, but the list was not modified.');
                }
                resolve(listFile);
            }).catch(error => reject(error));
        } else {
            resolve(listFile);
        }
    });
};

const fetchList = async (size = 500, directory = "data/", date) => {
    const listSize = size + IGNORED_DOMAINS.length;
    const LATEST_LIST_URL = 'https://tranco-list.eu/top-1m-id';

    // Create the data directory.
    await new Promise((resolve, reject) => {
        fs.mkdir(directory, { recursive: true }, (err) => {
            if (err) reject(err);
            resolve();
        });
    });

    // Fetch the requested list ID.
    let ID_URL = LATEST_LIST_URL;
    if (date) {
        ID_URL = `https://tranco-list.eu/daily_list_id?date=${parseDate(date)}`;
    } else {
        date = new Date();
    }
    const LIST_ID = await fetch(ID_URL)
        .then(res => {
            if (!res.ok ||
                res.headers.get('content-type') !== 'text/plain; charset=utf-8') {
                throw new Error(`Request for ${ID_URL} returned status ${res.status}!`);
            }
            return res.text();
        });
    const file = `${directory}list-${parseDate(date)}.csv`;

    // Check for an already downloaded list.
    const listIsCached = await fs.promises.access(file, fs.constants.R_OK | fs.constants.W_OK)
        .then(() => true)
        .catch(() => false);
    if (listIsCached) {
        console.log("Found cached Tranco list");
        return file;
    }

    // Fetch the list.
    const LIST_URL = `https://tranco-list.eu/download/${LIST_ID}/${listSize}`;
    return fetch(LIST_URL).then(res => {
        if (!res.ok ||
            res.headers.get('content-type') !== 'text/csv; charset=utf-8') {
            throw new Error(`List ${LIST_ID} not found!`);
        }
        return new Promise((resolve, reject) => {
            const dest = fs.createWriteStream(file);
            res.body.pipe(dest);
            dest.on('finish', () => {
                console.log(`Downloaded Tranco list with ID ${LIST_ID} for date ${parseDate(date)}`);
                removeIgnoredDomains(file).then((newFile) => resolve(newFile), error => reject(error));
            });
        });
    });
}

/**
 * Return the specified date formatted as yyyy-mm-dd in UTC.
 * @param {Date} date
 * @returns a String representation of the date as yyyy-mm-dd
 */
function parseDate(date) {
    return date.toISOString().split("T")[0];
}

module.exports = {
    fetchList
}
