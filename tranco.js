const fs = require('fs');
const fetch = require('node-fetch');

const fetchList = async (size = 500, file = "data/list.csv") => {
    const LATEST_LIST_URL = 'https://tranco-list.eu/top-1m-id';

    // Check for an already downloaded list.
    const listIsCached = await fs.promises.access(file, fs.constants.R_OK | fs.constants.W_OK)
        .then(() => true)
        .catch(() => false);
    if (listIsCached) {
        console.log("Found cached Tranco list");
        return;
    }

    // Create the data directory.
    await new Promise((resolve, reject) => {
        fs.mkdir('data', { recursive: true }, (err) => {
            if (err) reject(err);
            resolve();
        });
    });

    // Fetch the latest list ID.
    const LIST_ID = await fetch(LATEST_LIST_URL)
        .then(res => {
            if (!res.ok ||
                res.headers.get('content-type') !== 'text/plain; charset=utf-8') {
                throw new Error("Latest list ID not found!");
            }
            return res.text();
        });

    // Fetch the latest list.
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
                    console.log(`Downloaded latest Tranco list, ID: ${LIST_ID}`);
                    resolve();
                });
            });
        });
}

module.exports = {
    fetchList
}
