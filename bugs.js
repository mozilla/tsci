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
const fetchBugs = async (listFile = 'data/list.csv', keyFile = 'api-key.ini', minDate, maxDate) => {
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
        bugzilla.push(await getBugzilla(website, bugzillaKey, minDate, maxDate));
        duplicates.push(await getDuplicates(website, bugzillaKey, githubKey, minDate, maxDate));
        const { webcompatResult, criticalsResult } = await getWebcompat(website, githubKey, minDate, maxDate);
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

function formatDateForAPIQueries(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Returns Bugzilla bugs created after 2018-01-01.
 * @param {*} website
 * @param {*} bugzillaKey
 */
const getBugzilla = async (website, bugzillaKey, minDate, maxDate) => {
    const minDateQuery = minDate ? formatDateForAPIQueries(minDate) : "2018";
    const maxDateQueryFragment = maxDate ? `&f4=creation_ts&o4=lessthaneq&v4=${formatDateForAPIQueries(maxDate)}` : "";
    const query = `https://bugzilla.mozilla.org/buglist.cgi?f1=OP&bug_file_loc_type=allwordssubstr&o3=greaterthaneq&list_id=14636479&v3=${minDateQuery}&resolution=---&bug_file_loc=${website}&query_format=advanced&f3=creation_ts&bug_status=UNCONFIRMED&bug_status=NEW&bug_status=ASSIGNED&bug_status=REOPENED&product=Core&product=Fenix&product=Firefox%20for%20Android&product=Firefox%20for%20Echo%20Show&product=Firefox%20for%20FireTV&product=Firefox%20for%20iOS&product=GeckoView&product=Web%20Compatibility&keywords_type=nowords&keywords=meta%2C%20&status_whiteboard_type=notregexp&status_whiteboard=sci%5C-exclude${maxDateQueryFragment}`;
    const apiQuery = `https://bugzilla.mozilla.org/rest/bug?include_fields=id,summary,status&bug_file_loc=${website}&bug_file_loc_type=allwordssubstr&bug_status=UNCONFIRMED&bug_status=NEW&bug_status=ASSIGNED&bug_status=REOPENED&f1=OP&f3=creation_ts&keywords=meta%2C%20&keywords_type=nowords&o3=greaterthaneq&product=Core&product=Fenix&product=Firefox%20for%20Android&product=Firefox%20for%20Echo%20Show&product=Firefox%20for%20FireTV&product=Firefox%20for%20iOS&product=GeckoView&product=Web%20Compatibility&resolution=---&status_whiteboard=sci%5C-exclude&status_whiteboard_type=notregexp&v3=${minDateQuery}&api_key=${bugzillaKey}${maxDateQueryFragment}`;
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
const getWebcompat = async (website, githubKey, minDate, maxDate) => {
    const spaced = website.replace(/\./g, " ");
    let state = "+state:open"
    let date_range = "";
    if (minDate || maxDate) {
      date_range += "+created:" + [
        minDate ? formatDateForAPIQueries(minDate) : "*",
        maxDate ? formatDateForAPIQueries(maxDate) : "*",
      ].join("..");
      if (maxDate) {
        state = "";
        date_range += `+-closed:<=${formatDateForAPIQueries(maxDate)}`;
      }
    }
    const webcompatQuery = `https://github.com/webcompat/web-bugs/issues?q=${spaced}${date_range}+in%3Atitle+${state}+label:engine-gecko`;
    const criticalsQuery = `https://github.com/webcompat/web-bugs/issues?q=${spaced}${date_range}+in%3Atitle+${state}+label%3Aseverity-critical+label:engine-gecko`;
    const octokit = new Octokit({
        auth: `token ${githubKey}`,
        userAgent: 'past/tsci',
        throttle: {
            onRateLimit: (retryAfter, options) => {
                octokit.log.warn(`Request quota exhausted for request to ${options.url}`)
                octokit.log.warn(`Retry#${options.request.retryCount + 1} after ${retryAfter} seconds!`)
                return true
            },
            onAbuseLimit: (retryAfter, options) => {
                // Don't retry, only log an error.
                octokit.log.error(`Abuse detected for request to ${options.url}!`)
            }
        }
    });
    const results = await octokit.search.issuesAndPullRequests({
        q: `${spaced}${date_range}+in:title+repo:webcompat/web-bugs${state}+label:engine-gecko`,
        per_page: 100
    });
    const criticals = await octokit.search.issuesAndPullRequests({
        q: `${spaced}${date_range}+in:title+repo:webcompat/web-bugs${state}+label:engine-gecko+label:severity-critical`,
        per_page: 100
    });
    // TODO: handle pagination if the result is > 100
    const webcompatCount = results.data.total_count;
    const criticalsCount = criticals.data.total_count;
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
const getDuplicates = async (website, bugzillaKey, githubKey, minDate, maxDate) => {
    const apiQuery = `https://bugzilla.mozilla.org/rest/bug?include_fields=id,history&f1=see_also&f2=bug_status&f3=bug_file_loc&o1=anywordssubstr&o2=anywordssubstr&o3=casesubstring&v1=webcompat.com%2Cgithub.com%2Fwebcompat&v2=UNCONFIRMED%2CNEW%2CASSIGNED%2CREOPENED&v3=${website}&limit=0&api_key=${bugzillaKey}`
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
        for (const {when, changes} of bug.history) {
          const date = new Date(when);
          if ((minDate && date < minDate) || (maxDate && date > maxDate)) {
            continue;
          }
          for (const {added, field_name} of changes) {
            if (!added || field_name !== "see_also") {
                continue;
            }
            if (added.includes("webcompat.com") ||
                added.includes("github.com/webcompat")) {
                    const matches = regex.exec(added);
                    if (matches) {
                        const githubId = matches[matches.length - 1];
                        githubCandidates.push([githubId, bzId]);
                    }
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
        searchMapGhToBz.set(parseInt(githubId), bzId);
    }
    searches.push([searchQuery, searchMapGhToBz]);

    const dupedBzIds = new Set();
    const octokit = new Octokit({
        auth: `token ${githubKey}`,
        userAgent: 'past/tsci',
        throttle: {
            onRateLimit: (retryAfter, options) => {
                octokit.log.warn(`Request quota exhausted for request to ${options.url}`)
                octokit.log.warn(`Retry#${options.request.retryCount + 1} after ${retryAfter} seconds!`)
                return true
            },
            onAbuseLimit: (retryAfter, options) => {
                // Don't retry, only log an error.
                octokit.log.error(`Abuse detected for request to ${options.url}!`)
            }
        }
    });
    for (const [query, ghToBzMap] of searches) {
        const milestoneSearch = `https://api.github.com/search/issues?per_page=100&q=${query}`;
        const results = await octokit.request({url: milestoneSearch})
            .then(res => {
                if (!res.data) {
                    console.log(util.inspect(res, { showHidden: false, depth: null }))
                    throw new Error("GitHub query failed!");
                }
                return res.data;
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
