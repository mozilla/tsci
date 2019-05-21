const fs = require('fs');
const readline = require('readline');
const util = require('util')
const fetch = require('node-fetch');
const Octokit = require('@octokit/rest')
    .plugin(require('@octokit/plugin-throttling'))
    .plugin(require('@octokit/plugin-retry'));

/**
 * Fetch bugs and webcompat.com reports.
 * @param {*} listFile
 * @param {*} keyFile
 * @returns a Map of String keys to arrays of Strings that represent spreadsheet
 *          column data
 */
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
        duplicates.push(await getDuplicates(website, bugzillaKey, githubKey));
        webcompat.push(await getWebcompat(website, githubKey));
        criticals.push(await getCriticals(website, githubKey));
        console.log(`Fetched bug data for website ${website}`);
    }
    return bugTable;
}

/**
 * Load the service API keys from the provided file.
 * @param {*} keyFile
 */
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

/**
 * Returns Bugzilla bugs created after 2018-01-01.
 * @param {*} website
 * @param {*} bugzillaKey
 */
const getBugzilla = async (website, bugzillaKey) => {
    const query = `https://bugzilla.mozilla.org/buglist.cgi?f1=OP&bug_file_loc_type=allwordssubstr&o3=greaterthan&list_id=14636479&v3=2018&resolution=---&bug_file_loc=${website}&query_format=advanced&f3=creation_ts&bug_status=UNCONFIRMED&bug_status=NEW&bug_status=ASSIGNED&bug_status=REOPENED&product=Core&product=Fenix&product=Firefox%20for%20Android&product=Firefox%20for%20Echo%20Show&product=Firefox%20for%20FireTV&product=Firefox%20for%20iOS&product=GeckoView&product=Web%20Compatibility&keywords_type=nowords&keywords=meta%2C%20&status_whiteboard_type=notregexp&status_whiteboard=sci%5C-exclude&api_key=${bugzillaKey}`;
    const apiQuery = `https://bugzilla.mozilla.org/rest/bug?include_fields=id,summary,status&bug_file_loc=${website}&bug_file_loc_type=allwordssubstr&bug_status=UNCONFIRMED&bug_status=NEW&bug_status=ASSIGNED&bug_status=REOPENED&f1=OP&f3=creation_ts&keywords=meta%2C%20&keywords_type=nowords&o3=greaterthan&product=Core&product=Fenix&product=Firefox%20for%20Android&product=Firefox%20for%20Echo%20Show&product=Firefox%20for%20FireTV&product=Firefox%20for%20iOS&product=GeckoView&product=Web%20Compatibility&resolution=---&status_whiteboard=sci%5C-exclude&status_whiteboard_type=notregexp&v3=2018&api_key=${bugzillaKey}`;
    const results = await fetch(apiQuery)
        .then(res => {
            if (!res.ok) {
                console.log(util.inspect(res, { showHidden: false, depth: null }))
                throw new Error("Bugzilla query failed!");
            }
            return res.json();
        });
    return `=HYPERLINK("${query}"; ${results.bugs.length})`;
}

/**
 * Returns open webcompat bugs that have the `engine-gecko` label.
 * That should be:
 *     browser - firefox, browser - firefox - mobile,
 *     browser - firefox - tablet, browser - fenix,
 *     browser - focus - geckoview, browser - firefox - reality
 * @param {*} website
 * @param {*} githubKey
 */
const getWebcompat = async (website, githubKey) => {
    const query = `https://github.com/search?p=8&q=${website}+in%3Atitle+repo%3Awebcompat%2Fweb-bugs%2F+state%3Aopen+label:engine-gecko&type=Issues`;
    const octokit = new Octokit({
        auth: `token ${githubKey}`,
        userAgent: 'past/tsci',
        throttle: {
            onRateLimit: (retryAfter, options) => {
                octokit.log.warn(`Request quota exhausted for request to ${options.url}`)
                console.log(`retry count: ${options.request.retryCount}`);
                if (options.request.retryCount === 0) { // only retries once
                    console.log(`Retrying after ${retryAfter} seconds!`)
                    return true
                }
                return false;
            },
            onAbuseLimit: (retryAfter, options) => {
                // does not retry, only logs a warning
                octokit.log.warn(`Abuse detected for request to ${options.url}`)
            }
        }
    });
    const results = await octokit.issues.listForRepo({
        owner: "webcompat",
        repo: "web-bugs",
        state: "open",
        labels: "engine-gecko"
    });
    const count = results.data.filter(element => !element.pull_request)
        .filter(element => element.title.includes(website)).length;
    return `=HYPERLINK("${query}"; ${count})`;
}

/**
 * Return severity-critical webcompat bugs.
 * @param {*} website
 * @param {*} githubKey
 */
const getCriticals = async (website, githubKey) => {
    const query = `https://github.com/webcompat/web-bugs/issues?q=${website}+in%3Atitle+repo%3Awebcompat%2Fweb-bugs%2F+is%3Aopen+label%3Aseverity-critical+label:engine-gecko`;
    const octokit = new Octokit({
        auth: `token ${githubKey}`,
        userAgent: 'past/tsci',
        throttle: {
            onRateLimit: (retryAfter, options) => {
                octokit.log.warn(`Request quota exhausted for request to ${options.url}`)
                console.log(`retry count: ${options.request.retryCount}`);
                if (options.request.retryCount === 0) { // only retries once
                    console.log(`Retrying after ${retryAfter} seconds!`)
                    return true
                }
                return false;
            },
            onAbuseLimit: (retryAfter, options) => {
                // does not retry, only logs a warning
                octokit.log.warn(`Abuse detected for request to ${options.url}`)
            }
        }
    });
    const results = await octokit.issues.listForRepo({
        owner: "webcompat",
        repo: "web-bugs",
        state: "open",
        labels: "engine-gecko,severity-critical"
    });
    const count = results.data.filter(element => !element.pull_request)
        .filter(element => element.title.includes(website)).length;
    return `=HYPERLINK("${query}"; ${count})`;
}

/**
 * Returns duplicates (webcompat.com see-also links on Bugzilla,
 * which are also marked as duplicates on webcompat.com)
 *
 * To do so, an advanced Bugzilla search is first done to get all bugs for a
 * given site with any see-alsos on webcompat.com:
 * - See Also contains any of the strings: webcompat.com, github.com / webcompat
 * - Status contains any of the strings: UNCONFIRMED, NEW, ASSIGNED, REOPENED
 * - URL contains the string(exact case): (website)
 *
 * Then GitHub queries are run to confirm how many of the discovered issues
 * are in the duplicate milestone.
 * @param {*} website
 * @param {*} bugzillaKey
 * @param {*} githubKey
 */
const getDuplicates = async (website, bugzillaKey, githubKey) => {
    return 0;
}

module.exports = {
    fetchBugs
}
