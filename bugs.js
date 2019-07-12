const fetch = require('node-fetch');
const fs = require('fs');
const readline = require('readline');
const retry = require('promise-fn-retry');
const Octokit = require('@octokit/rest')
    .plugin(require('@octokit/plugin-throttling'))
    .plugin(require('@octokit/plugin-retry'));
const util = require('util')
const helpers = require('./helpers');

// don't include results that:
// * contain a meta keyword
// * have a sci-exclude whiteboard tag
// * were reported by a @softvision email address
const searchConstraintQueryFragment = "&keywords_type=nowords&keywords=meta%2C%20&status_whiteboard_type=notregexp&status_whiteboard=sci%5C-exclude&emailreporter1=1&emailtype1=notsubstring&email1=%40softvision";

/**
 * Fetch bugs and webcompat.com reports.
 * @param {*} listFile
 * @param {*} keyFile
 * @returns a Map of String keys to arrays of Strings that represent spreadsheet
 *          column data
 */
const fetchBugs = async (listFile = 'data/list.csv', bugzillaKey, githubKey, minDate, maxDate) => {
    const currentLine = ((i = 0) => () => ++i)();
    const bugzilla = [];
    const bugzillaMobile = [];
    const webcompat = [];
    const webcompatMobile = [];
    const criticals = [];
    const criticalsMobile = [];
    const duplicates = [];
    const duplicatesMobile = [];
    const bugTable = new Map();

    bugTable.set("bugzilla", bugzilla);
    bugTable.set("webcompat", webcompat);
    bugTable.set("criticals", criticals);
    bugTable.set("bugzillaMobile", bugzillaMobile);
    bugTable.set("webcompatMobile", webcompatMobile);
    bugTable.set("criticalsMobile", criticalsMobile);
    bugTable.set("duplicates", duplicates);
    bugTable.set("duplicatesMobile", duplicatesMobile);

    // Load the website list.
    const fileStream = fs.createReadStream(listFile);
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity,
    });

    for await (const line of rl) {
        const website = line.split(',')[1];
        const {
            bugzillaResult,
            bugzillaMobileResult,
        } = await getBugzilla(website, bugzillaKey, minDate, maxDate);
        bugzilla.push(bugzillaResult);
        bugzillaMobile.push(bugzillaMobileResult);
        const {
            duplicatesResult,
            duplicatesMobileResult,
        } = await getDuplicates(website, bugzillaKey, githubKey, minDate, maxDate);
        duplicates.push(duplicatesResult);
        duplicatesMobile.push(duplicatesMobileResult);
        const {
            webcompatResult,
            criticalsResult,
            webcompatMobileResult,
            criticalsMobileResult,
        } = await getWebcompat(website, githubKey, minDate, maxDate);
        webcompat.push(webcompatResult);
        criticals.push(criticalsResult);
        webcompatMobile.push(webcompatMobileResult);
        criticalsMobile.push(criticalsMobileResult);
        console.log(`Fetched bug data for site #${currentLine()}: ${website}`);
    }
    return bugTable;
}

/**
 * Returns Bugzilla bugs created after minDate if specified, 2018-01-01 otherwise.
 * @param {String} website
 * @param {String} bugzillaKey
 * @param {Date} minDate
 * @param {Date} maxDate
 */
const getBugzilla = async (website, bugzillaKey, minDate, maxDate = new Date()) => {
    const minDateQuery = helpers.formatDateForAPIQueries(minDate);
    const maxDateQuery = helpers.formatDateForAPIQueries(maxDate);
    const openQuery = `https://bugzilla.mozilla.org/buglist.cgi?query_format=advanced&f1=OP${helpers.getBugzillaPriorities()}${helpers.getBugURL(website)}&o3=greaterthaneq&list_id=14636479&v3=${minDateQuery}&resolution=---&f3=creation_ts${helpers.getBugzillaStatuses()}${helpers.getBugzillaProducts()}${maxDateQueryFragment(4)}${searchConstraintQueryFragment}`;
    const openMobileQuery = `https://bugzilla.mozilla.org/buglist.cgi?query_format=advanced&f1=OP${helpers.getBugzillaPriorities()}${helpers.getBugURL(website)}&f2=creation_ts&o2=greaterthaneq&v2=${minDateQuery}&resolution=---${helpers.getBugzillaStatuses()}${maxDateQueryFragment(3)}${searchConstraintQueryFragment}&j4=OR&f4=OP&f5=product&o5=equals&v5=Core&f6=product&o6=equals&v6=Fenix&f7=product&o7=equals&v7=Firefox%20for%20Android&f8=product&o8=equals&v8=GeckoView&f9=OP&f10=product&o10=equals&v10=Web%20Compatibility&f11=component&o11=equals&v11=Mobile&f12=CP&f13=CP&f14=CP`;    const openDesktopQuery = `https://bugzilla.mozilla.org/buglist.cgi?query_format=advancedf1=OP${helpers.getBugzillaPriorities()}${helpers.getBugURL(website)}o3=greaterthaneq&list_id=14636479&v3=${minDateQuery}&resolution=---&f3=creation_ts${helpers.getBugzillaStatuses()}${maxDateQueryFragment()}${searchConstraintQueryFragment}&j_top=OR&o8=equals&f8=product&v8=Core&o1=equals&v1=Fenix&f1=product&f2=OP&o3=equals&v3=Web%20Compatibility&f3=product&o4=equals&v4=Mobile&f4=component&f5=CP&o7=equals&v7=GeckoView&f7=product&o6=equals&v6=Firefox%20for%20Android&f6=product`;
    const openApiQuery = `https://bugzilla.mozilla.org/rest/bug?include_fields=id,summary,status,priority,product,component,creator${helpers.getBugzillaPriorities()}${helpers.getBugURL(website)}${helpers.getBugzillaStatuses()}&f1=OP&f3=creation_ts&o3=greaterthaneq${helpers.getBugzillaProducts()}&resolution=---&v3=${minDateQuery}&api_key=${bugzillaKey}${maxDateQueryFragment(4)}${searchConstraintQueryFragment}`;
    const resolvedApiQuery = `https://bugzilla.mozilla.org/rest/bug?include_fields=id,summary,status,priority,product,component,creator${helpers.getBugzillaPriorities()}${helpers.getBugURL(website)}&chfield=bug_status&chfieldfrom=${maxDateQuery}&chfieldvalue=RESOLVED&f1=OP&f3=creation_ts&f4=creation_ts&o3=greaterthaneq&o4=lessthaneq${helpers.getBugzillaProducts()}&v3=${minDateQuery}&v4=${maxDateQuery}&api_key=${bugzillaKey}${searchConstraintQueryFragment}`;
    let openResults = await helpers.bugzillaRetry(openApiQuery);
    let resolvedResults = await helpers.bugzillaRetry(resolvedApiQuery);
    openResults = openResults.bugs.filter(helpers.isNotQA);
    resolvedResults = resolvedResults.bugs.filter(helpers.isNotQA);
    const openMobileResults = openResults.filter(helpers.isMobile);
    const resolvedMobileResults = resolvedResults.filter(helpers.isMobile);
    const openDesktopResults = openResults.filter(helpers.isDesktop);
    const resolvedDesktopResults = resolvedResults.filter(helpers.isDesktop);
    const results = openResults.concat(resolvedResults);
    const resultsMobile = openMobileResults.concat(resolvedMobileResults);
    return {
        bugzillaResult: `=HYPERLINK("${openQuery}"; ${results.length})`,
        bugzillaMobileResult: `=HYPERLINK("${openMobileQuery}"; ${resultsMobile.length})`,
    }
}

/**
 * Returns an instance of Octokit set up as we want it.
 * @param {*} githubKey
 * @returns an Octokit instance
 */
const getOctokitInstance = (function() {
    const singletons = new Map();
    return function getOctokitInstance(githubKey) {
        if (!singletons.has(githubKey)) {
            singletons.set(githubKey, new Octokit({
                auth: `token ${githubKey}`,
                userAgent: 'past/tsci',
                throttle: {
                    onRateLimit: (retryAfter, options) => {
                        console.warn(`Request quota exhausted for request to ${options.url}`)
                        console.warn(`Retry#${options.request.retryCount + 1} after ${retryAfter} seconds!`)
                        return true
                    },
                    onAbuseLimit: (retryAfter, options) => {
                        // Don't retry, only log an error.
                        console.error(`Abuse detected for request to ${options.url}!`)
                    },
                },
            }));
        }
        return singletons.get(githubKey);
    };
})();

/**
 * Dances the pagination dance for Octokit-based queries to GitHub.
 * @param {*} query
 * @param {*} params
 * @returns an array of results
 */
async function getAllGitHubResultsFor(query, params = {}) {
    let results = [];
    let expected;
    if (!("per_page" in params)) {
        params.per_page = 100;
    }
    params.page = 0; // Note: this parameter is 1-based, not 0-based
    while (expected === undefined || results.length < expected) {
        ++params.page;
        const response = await query.call(this, params);
        if (!response.data) {
            console.log(util.inspect(response, { showHidden: false, depth: null }))
            throw new Error("GitHub query failed!");
        }
        expected = response.data.total_count;
        results = results.concat(response.data.items);
    }
    return results;
}

/**
 * Returns open webcompat bugs that have the `engine-gecko` label and
 * severity-critical webcompat bugs.
 * That should be:
 *     browser - firefox, browser - firefox - mobile,
 *     browser - firefox - tablet, browser - fenix,
 *     browser - focus - geckoview, browser - firefox - reality
 * Only bugs in the needsdiagnosis, needscontact, contactready, & sitewait
 * milestones are collected.
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
        helpers.formatDateForAPIQueries(minDate),
        maxDate ? helpers.formatDateForAPIQueries(maxDate) : "*",
      ].join("..");
      if (maxDate) {
        state = "";
        date_range += `+-closed:<=${helpers.formatDateForAPIQueries(maxDate)}`;
      }
    }
    const webcompatQuery = `https://github.com/webcompat/web-bugs/issues?q=${spaced}${date_range}+in%3Atitle+${state}+label:engine-gecko+-milestone:needstriage`;
    const criticalsQuery = `https://github.com/webcompat/web-bugs/issues?q=${spaced}${date_range}+in%3Atitle+${state}+label%3Aseverity-critical+label:engine-gecko+-milestone:needstriage`;
    const octokit = getOctokitInstance(githubKey);
    const results = await getAllGitHubResultsFor(octokit.search.issuesAndPullRequests, {
        q: `${spaced}${date_range}+in:title+repo:webcompat/web-bugs${state}+label:engine-gecko+-milestone:needstriage`,
    });
    const criticals = await getAllGitHubResultsFor(await octokit.search.issuesAndPullRequests, {
        q: `${spaced}${date_range}+in:title+repo:webcompat/web-bugs${state}+label:engine-gecko+label:severity-critical+-milestone:needstriage`,
    });
    // milestones: needsdiagnosis (3), needscontact (4), contactready (5), sitewait (6)
    const filteredResults = results.filter(bug => [3, 4, 5, 6].includes(bug.milestone.number))
        // filter out any bugs with an sci-exclude label or filed by SoftVision
        .filter(bug => bug.labels.every(label => label.name !== "sci-exclude"))
        .filter(bug => helpers.isNotQA(bug));
    const filteredCriticals = criticals.filter(bug => [3, 4, 5, 6].includes(bug.milestone.number))
        // filter out any bugs with an sci-exclude label or filed by SoftVision
        .filter(bug => bug.labels.every(label => label.name !== "sci-exclude"))
        .filter(bug => helpers.isNotQA(bug));
    const filteredMobileResults = filteredResults.filter(helpers.isMobile);
    const filteredDesktopResults = filteredResults.filter(helpers.isDesktop);
    const filteredMobileCriticalResults = filteredCriticals.filter(helpers.isMobile);
    const filteredDesktopCriticalResults = filteredCriticals.filter(helpers.isDesktop);
    return {
        webcompatResult: `=HYPERLINK("${webcompatQuery}"; ${filteredResults.length})`,
        criticalsResult: `=HYPERLINK("${criticalsQuery}"; ${filteredCriticals.length})`,
        webcompatMobileResult: `=HYPERLINK("${webcompatQuery}"; ${filteredMobileResults.length})`,
        criticalsMobileResult: `=HYPERLINK("${criticalsQuery}"; ${filteredMobileCriticalResults.length})`,
    };
}

/**
 * Returns the list of see-also links for a given Bugzilla bug.
 *
 * @param {*} a Bugzilla bug's metadata including its creation_time,
 *            see_also, and history fields.
 * @returns a Map of the bug's see-also links mapped to the date they were added.
 */
function getSeeAlsoLinks(bug) {
    const seeAlsos = new Map();

    const date = new Date(bug.creation_time);
    for (const initial of bug.see_also) {
        for (const url of initial.split(",")) {
            seeAlsos.set(url.trim(), date);
        }
    }

    for (const {when, changes} of bug.history.sort((a, b) => b.when - a.when)) {
        const date = new Date(when);
        for (const {added, removed, field_name} of changes) {
            if (field_name === "see_also") {
                if (removed) {
                    for (const url of removed.split(",")) {
                        seeAlsos.delete(url.trim());
                    }
                }
                if (added) {
                    for (const url of added.split(",")) {
                        seeAlsos.set(url.trim(), date);
                    }
                }
            }
        }
    }

    return seeAlsos;
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
    const apiQuery = `https://bugzilla.mozilla.org/rest/bug?include_fields=id,creation_time,see_also,history,priority,product,component,creator${helpers.getBugzillaPriorities()}&f1=see_also&f2=bug_status&f3=bug_file_loc&o1=anywordssubstr&o2=anywordssubstr&o3=regexp&v1=webcompat.com%2Cgithub.com%2Fwebcompat&v2=UNCONFIRMED%2CNEW%2CASSIGNED%2CREOPENED&v3=${helpers.formatWebSiteForRegExp(website)}&limit=0&api_key=${bugzillaKey}${searchConstraintQueryFragment}`
    const promiseFn = () => fetch(apiQuery);
    const options = {
        times: 3,
        // 10 seconds should hopefully be enough for transient errors.
        initialDelay: 10000,
        onRetry: (error) => {
            console.warn(`Retrying buzgilla query ${apiQuery} due to ${error.message}!`)
        },
    };
    const results = await retry(promiseFn, options)
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
        const seeAlsos = getSeeAlsoLinks(bug);
        for (const [url, date] of seeAlsos.entries()) {
            if ((minDate && date < minDate) || (maxDate && date > maxDate)) {
                continue;
            }
            if (url.includes("webcompat.com") ||
                url.includes("github.com/webcompat")) {
                const matches = regex.exec(url);
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
        searchMapGhToBz.set(parseInt(githubId), bzId);
    }
    if (searchQuery !== baseSearchQuery) {
      searches.push([searchQuery, searchMapGhToBz]);
    }

    const dupedGhIds = new Set();
    const dupedMobileGhIds = new Set();
    const dupedBzIds = new Set();
    const dupedMobileBzIds = new Set();
    const octokit = getOctokitInstance(githubKey);
    for (const [ query, ghToBzMap ] of searches) {
        const milestoneSearch = `https://api.github.com/search/issues?q=${query}`;
        const results = await getAllGitHubResultsFor(octokit.request, {url: milestoneSearch});
        for (const item of results) {
            const bzId = ghToBzMap.get(item.number);
            if (bzId && item.milestone.title === "duplicate") {
                dupedBzIds.add(bzId);
                dupedGhIds.add(item.number);
                if (helpers.isMobile(item)) {
                    dupedMobileBzIds.add(bzId);
                    dupedMobileGhIds.add(item.number);
                }
            }
        }
    }

    let param = "";
    for (const id of dupedBzIds) {
        param += "%2C" + id;
    }
    const bzLink = `https://bugzilla.mozilla.org/buglist.cgi?o1=anyexact&v1=${param}&f1=bug_id`;
    let mobileParam = "";
    for (const id of dupedMobileBzIds) {
        mobileParam += "%2C" + id;
    }
    const bzMobileLink = `https://bugzilla.mozilla.org/buglist.cgi?o1=anyexact&v1=${mobileParam}&f1=bug_id`;
    return {
        duplicatesResult: dupedGhIds.size ? `=HYPERLINK("${bzLink}"; ${dupedGhIds.size})`: 0,
        duplicatesMobileResult: dupedMobileGhIds.size ? `=HYPERLINK("${bzMobileLink}"; ${dupedMobileGhIds.size})` : 0,
    };
}

module.exports = {
    fetchBugs,
}
