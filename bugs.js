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
        const { webcompatResult, criticalsResult } = await getWebcompat(website, githubKey);
        webcompat.push(webcompatResult);
        criticals.push(criticalsResult);
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
    const query = `https://bugzilla.mozilla.org/buglist.cgi?f1=OP&bug_file_loc_type=allwordssubstr&o3=greaterthan&list_id=14636479&v3=2018&resolution=---&bug_file_loc=${website}&query_format=advanced&f3=creation_ts&bug_status=UNCONFIRMED&bug_status=NEW&bug_status=ASSIGNED&bug_status=REOPENED&product=Core&product=Fenix&product=Firefox%20for%20Android&product=Firefox%20for%20Echo%20Show&product=Firefox%20for%20FireTV&product=Firefox%20for%20iOS&product=GeckoView&product=Web%20Compatibility&keywords_type=nowords&keywords=meta%2C%20&status_whiteboard_type=notregexp&status_whiteboard=sci%5C-exclude`;
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
 * Returns open webcompat bugs that have the `engine-gecko` label and
 * severity-critical webcompat bugs.
 * That should be:
 *     browser - firefox, browser - firefox - mobile,
 *     browser - firefox - tablet, browser - fenix,
 *     browser - focus - geckoview, browser - firefox - reality
 * @param {*} website
 * @param {*} githubKey
 * @returns an Object with a webcompatResult and a criticalsResult properties
 *          that correspond to each query
 */
const getWebcompat = async (website, githubKey) => {
    const spaced = website.replace(/\./g, " ");
    const webcompatQuery = `https://github.com/search?q=${spaced}+in%3Atitle+repo%3Awebcompat%2Fweb-bugs%2F+state%3Aopen+label:engine-gecko&type=Issues`;
    const criticalsQuery = `https://github.com/webcompat/web-bugs/issues?q=${spaced}+in%3Atitle+repo%3Awebcompat%2Fweb-bugs%2F+is%3Aopen+label%3Aseverity-critical+label:engine-gecko`;
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
    const geckoResults = results.data.filter(element => !element.pull_request)
        .filter(element => element.title.includes(website));
    const webcompatCount = geckoResults.length;
    const criticals = geckoResults.filter(element => element.labels.includes("severity-critical"));
    const criticalsCount = criticals.length;
    return {
        webcompatResult: `=HYPERLINK("${webcompatQuery}"; ${webcompatCount})`,
        criticalsResult: `=HYPERLINK("${criticalsQuery}"; ${criticalsCount})`
    };
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
    const apiQuery = `https://bugzilla.mozilla.org/rest/bug?include_fields=id,see_also&f1=see_also&f2=bug_status&f3=bug_file_loc&o1=anywordssubstr&o2=anywordssubstr&o3=casesubstring&v1=webcompat.com%2Cgithub.com%2Fwebcompat&v2=UNCONFIRMED%2CNEW%2CASSIGNED%2CREOPENED&v3=${website}&limit=0&api_key=${bugzillaKey}`
    const results = await fetch(apiQuery)
        .then(res => {
            if (!res.ok) {
                console.log(util.inspect(res, { showHidden: false, depth: null }))
                throw new Error("Bugzilla query failed!");
            }
            return res.json();
        });

    const githubCandidates = [];
    const regex = /\/(\d+)$/;
    for (const bug of results.bugs) {
        const bzId = bug.id;
        for (const seeAlsoLink of bug.see_also) {
            if (seeAlsoLink.includes("webcompat.com") ||
                seeAlsoLink.includes("github.com/webcompat")) {
                    const matches = regex.exec(seeAlsoLink);
                    if (matches) {
                        const githubId = matches[matches.length - 1];
                        githubCandidates.push([githubId, bzId]);
                    }
                }
        }
    }
    // GitHub search queries (q parameter) cannot be too long, so do >1 requests.
    const searches = [];
    const baseSearchQuery = "is%3Aissue+milestone%3Aduplicate+repo%3Awebcompat%2Fweb-bugs%2F";
    let searchQuery = baseSearchQuery;
    let searchMapGhToBz = new Map();
    let i = 0;
    while (i < githubCandidates.length) {
        const [ githubId, bzId ] = githubCandidates[i];
        i++;
        if (searchQuery.length + 1 + githubId.length > 256) {
            searches.push([searchQuery, searchMapGhToBz]);
            searchQuery = baseSearchQuery;
            searchMapGhToBz = new Map();
        }
        searchQuery += "+" + githubId;
        searchMapGhToBz.set([parseInt(githubId)], bzId);
    }
    searches.push([searchQuery, searchMapGhToBz]);

    const dupedBzIds = new Set();
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
    for (const [query, ghToBzMap] of searches) {
        const milestoneSearch = `https://api.github.com/search/issues?per_page=100&q=${query}`;
        // TODO use Octokit
        // const results = await octokit.issues.listForRepo({
        //     owner: "webcompat",
        //     repo: "web-bugs",
        //     state: "open",
        //     labels: "engine-gecko"
        // });
        const results = await fetch(milestoneSearch)
            .then(res => {
                if (!res.ok) {
                    console.log(util.inspect(res, { showHidden: false, depth: null }))
                    throw new Error("Bugzilla query failed!");
                }
                return res.json();
            });
        if (results.incomplete_results) {
            throw new Error("Should not have over 100 results for just ${ids.length} search items"); // TODO figure out ${ids.length}
        }
        for (const item of results.items) {
            const bzId = ghToBzMap.get(item.number);
            if (bzId && item.milestone.title === "duplicate") {
                dupedBzIds.add(bzId);
            }
        }
    }

    if (dupedBzIds.size === 0) {
        return 0;
    }
    let param = "";
    for (const id of dupedBzIds) {
        param += "%2C" + id;
    }
    const bzLink = `https://bugzilla.mozilla.org/buglist.cgi?o1=anyexact&v1=${param}&f1=bug_id`;
    return `=HYPERLINK("${bzLink}"; ${dupedBzIds.size})`;
}

module.exports = {
    fetchBugs
}
