const fs = require('fs');
const readline = require('readline');
const fetch = require('node-fetch');

// Fetch bugs and webcompat.com reports.
const fetchBugs = async (listFile = 'data/list.csv', keyFile = 'api-key.ini') => {
    const bugzilla = [];
    const webcompat = [];
    const criticals = [];
    const duplicates = [];
    const bugTable = new Map();

    bugTable.set("bugzilla", bugzilla);
    bugTable.set("webcompat", webcompat);
    bugTable.set("criticals", criticals);
    bugTable.set("duplicates", duplicates);

    // Load service API keys.
    const apiKeys = await getKeys(keyFile);
    const bugzillaKey = apiKeys.get("bugzillaKey");
    const githubKey = apiKeys.get("githubKey");

    // Load the website list.
    const fileStream = fs.createReadStream(listFile);
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    for await (const line of rl) {
        const website = line.split(',')[1];
        bugzilla.push(await getBugzilla(website, bugzillaKey));
        duplicates.push(await getDuplicates(website));
        // Replace the period with a space, because GitHub search is weird.
        const spaced = website.replace(/\./g, " ")
        webcompat.push(await getWebcompat(spaced, githubKey));
        criticals.push(await getCriticals(spaced));
        console.log(`Fetched bug data for website ${website}`);
    }
    return bugTable;
}

// Load the service API keys from the provided file.
const getKeys = async (keyFile) => {
    const apiKeys = new Map();
    const fileStream = fs.createReadStream(keyFile);
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });
    for await (const line of rl) {
        const [service, key] = line.split('=');
        apiKeys.set(service, key);
        console.log(`Loaded key ${key} for service ${service}`);
    }
    return apiKeys;
}

const getBugzilla = async (website, bugzillaKey) => {
    const query = `https://bugzilla.mozilla.org/rest/bug?include_fields=id,summary,status&bug_file_loc=${website}&bug_file_loc_type=allwordssubstr&bug_status=UNCONFIRMED&bug_status=NEW&bug_status=ASSIGNED&bug_status=REOPENED&f1=OP&f3=creation_ts&keywords=meta%2C%20&keywords_type=nowords&o3=greaterthan&product=Core&product=Fenix&product=Firefox%20for%20Android&product=Firefox%20for%20Echo%20Show&product=Firefox%20for%20FireTV&product=Firefox%20for%20iOS&product=GeckoView&product=Web%20Compatibility&resolution=---&status_whiteboard=sci%5C-exclude&status_whiteboard_type=notregexp&v3=2018&api_key=${bugzillaKey}`;
    const results = await fetch(query)
        .then(res => {
            if (!res.ok ||
                res.headers.get('content-type') !== 'application/json; charset=UTF-8') {
                throw new Error("Bugzilla query failed!");
            }
            return res.json();
        });
    return results.bugs.length;
}

// TODO flesh out the implementation
const getWebcompat = async (website) => {
    return 0;
}

// TODO flesh out the implementation
const getCriticals = async (website) => {
    return 0;
}

// TODO flesh out the implementation
const getDuplicates = async (website) => {
    return 0;
}

module.exports = {
    fetchBugs
}
