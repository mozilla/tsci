const fs = require('fs');
const fetch = require('node-fetch');

const fetchList = async (size = 500, directory = "data/", date) => {
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
    const LIST_URL = `https://tranco-list.eu/download/${LIST_ID}/${size}`;
    await fetch(LIST_URL)
        .then(res => {
            if (!res.ok ||
                res.headers.get('content-type') !== 'text/csv; charset=utf-8') {
                throw new Error(`List ${LIST_ID} not found!`);
            }
            return new Promise(resolve => {
                const dest = fs.createWriteStream(file);
                res.body.pipe(dest);
                dest.on('finish', () => {
                    console.log(`Downloaded Tranco list with ID ${LIST_ID} for date ${parseDate(date)}`);
                    resolve();
                });
            });
        });
    return file;
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
