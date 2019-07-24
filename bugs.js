const fs = require('fs');
const readline = require('readline');
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
    const bugzillaDesktop = [];
    const webcompat = [];
    const webcompatMobile = [];
    const webcompatDesktop = [];
    const criticals = [];
    const criticalsMobile = [];
    const criticalsDesktop = [];
    const duplicates = [];
    const duplicatesMobile = [];
    const duplicatesDesktop = [];
    const bugTable = new Map();

    bugTable.set("bugzilla", bugzilla);
    bugTable.set("webcompat", webcompat);
    bugTable.set("criticals", criticals);
    bugTable.set("duplicates", duplicates);
    bugTable.set("bugzillaDesktop", bugzillaDesktop);
    bugTable.set("webcompatDesktop", webcompatDesktop);
    bugTable.set("criticalsDesktop", criticalsDesktop);
    bugTable.set("duplicatesDesktop", duplicatesDesktop);
    bugTable.set("bugzillaMobile", bugzillaMobile);
    bugTable.set("webcompatMobile", webcompatMobile);
    bugTable.set("criticalsMobile", criticalsMobile);
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
            bugzillaDesktopResult,
        } = await getBugzilla(website, bugzillaKey, minDate, maxDate);
        bugzilla.push(bugzillaResult);
        bugzillaMobile.push(bugzillaMobileResult);
        bugzillaDesktop.push(bugzillaDesktopResult);
        const {
            duplicatesResult,
            duplicatesMobileResult,
            duplicatesDesktopResult,
        } = await getDuplicates(website, bugzillaKey, githubKey, minDate, maxDate);
        duplicates.push(duplicatesResult);
        duplicatesMobile.push(duplicatesMobileResult);
        duplicatesDesktop.push(duplicatesDesktopResult);
        const {
            webcompatResult,
            criticalsResult,
            webcompatMobileResult,
            criticalsMobileResult,
            webcompatDesktopResult,
            criticalsDesktopResult,
        } = await getWebcompat(website, githubKey, minDate, maxDate);
        webcompat.push(webcompatResult);
        criticals.push(criticalsResult);
        webcompatMobile.push(webcompatMobileResult);
        criticalsMobile.push(criticalsMobileResult);
        webcompatDesktop.push(webcompatDesktopResult);
        criticalsDesktop.push(criticalsDesktopResult);
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
    const maxDateQueryFragment = (num) => `&f${num}=creation_ts&o${num}=lessthaneq&v${num}=${helpers.formatDateForAPIQueries(maxDate)}`;
    const notSeeAlsoQueryFragment = (num) => `&f${num}=CP&f${num + 1}=see_also&o${num + 1}=notsubstring&v${num + 1}=webcompat.com&f${num + 2}=see_also&o${num + 2}=notsubstring&v${num + 2}=web-bugs`;
    const openQuery = `https://bugzilla.mozilla.org/buglist.cgi?query_format=advanced&f1=OP${helpers.getBugzillaPriorities()}${helpers.getBugURL(website)}&o2=greaterthaneq&list_id=14636479&v2=${minDateQuery}&resolution=---&f2=creation_ts${helpers.getBugzillaStatuses()}${helpers.getBugzillaProducts()}${maxDateQueryFragment(3)}${searchConstraintQueryFragment}${notSeeAlsoQueryFragment(4)}`;
    const openMobileQuery = `https://bugzilla.mozilla.org/buglist.cgi?query_format=advanced&f1=OP${helpers.getBugzillaPriorities()}${helpers.getBugURL(website)}&f2=creation_ts&o2=greaterthaneq&v2=${minDateQuery}&resolution=---${helpers.getBugzillaStatuses()}${maxDateQueryFragment(3)}${searchConstraintQueryFragment}&j4=OR&f4=OP&f5=product&o5=equals&v5=Core&f6=product&o6=equals&v6=Fenix&f7=product&o7=equals&v7=Firefox%20for%20Android&f8=product&o8=equals&v8=GeckoView&f9=OP&f10=product&o10=equals&v10=Web%20Compatibility&f11=component&o11=equals&v11=Mobile&f12=CP&op_sys=Unspecified&op_sys=All&op_sys=Android${notSeeAlsoQueryFragment(13)}`;
    const openDesktopQuery = `https://bugzilla.mozilla.org/buglist.cgi?query_format=advanced&f1=OP${helpers.getBugzillaPriorities()}${helpers.getBugURL(website)}&f2=creation_ts&o2=greaterthaneq&v2=${minDateQuery}&resolution=---${helpers.getBugzillaStatuses()}${maxDateQueryFragment(3)}${searchConstraintQueryFragment}&o5=equals&o9=equals&v5=Core&f12=CP&v9=Desktop&j4=OR&f10=CP&v6=Firefox&f8=product&o6=equals&f9=component&f4=OP&f5=product&v8=Web%20Compatibility&f6=product&f7=OP&o8=equals&op_sys=Unspecified&op_sys=All&op_sys=Windows&op_sys=Windows%207&op_sys=Windows%208&op_sys=Windows%208.1&op_sys=Windows%2010&op_sys=macOS&op_sys=Linux${notSeeAlsoQueryFragment(13)}`;
    const openApiQuery = `https://bugzilla.mozilla.org/rest/bug?include_fields=see_also,id,summary,status,priority,product,component,creator,op_sys${helpers.getBugzillaPriorities()}${helpers.getBugURL(website)}${helpers.getBugzillaStatuses()}&f1=OP&f3=creation_ts&o3=greaterthaneq${helpers.getBugzillaProducts()}&resolution=---&v3=${minDateQuery}&api_key=${bugzillaKey}${maxDateQueryFragment(4)}${searchConstraintQueryFragment}`;
    const resolvedApiQuery = `https://bugzilla.mozilla.org/rest/bug?include_fields=see_also,id,summary,status,priority,product,component,creator,op_sys${helpers.getBugzillaPriorities()}${helpers.getBugURL(website)}&chfield=bug_status&chfieldfrom=${maxDateQuery}&chfieldvalue=RESOLVED&f1=OP&f3=creation_ts&f4=creation_ts&o3=greaterthaneq&o4=lessthaneq${helpers.getBugzillaProducts()}&v3=${minDateQuery}&v4=${maxDateQuery}&api_key=${bugzillaKey}${searchConstraintQueryFragment}`;
    let openResults = await helpers.bugzillaRetry(openApiQuery);
    let resolvedResults = await helpers.bugzillaRetry(resolvedApiQuery);
    openResults = openResults.bugs.filter(helpers.isNotQA).filter(helpers.filterWebCompatSeeAlso);
    resolvedResults = resolvedResults.bugs.filter(helpers.isNotQA).filter(helpers.filterWebCompatSeeAlso);
    const openMobileResults = openResults.filter(helpers.isMobile);
    const resolvedMobileResults = resolvedResults.filter(helpers.isMobile);
    const openDesktopResults = openResults.filter(helpers.isDesktop);
    const resolvedDesktopResults = resolvedResults.filter(helpers.isDesktop);
    const results = openResults.concat(resolvedResults);
    const resultsMobile = openMobileResults.concat(resolvedMobileResults);
    const resultsDesktop = openDesktopResults.concat(resolvedDesktopResults);
    return {
        bugzillaResult: `=HYPERLINK("${openQuery}"; ${results.length})`,
        bugzillaMobileResult: `=HYPERLINK("${openMobileQuery}"; ${resultsMobile.length})`,
        bugzillaDesktopResult: `=HYPERLINK("${openDesktopQuery}"; ${resultsDesktop.length})`,
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
                userAgent: 'mozilla/tsci',
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
        webcompatDesktopResult: `=HYPERLINK("${webcompatQuery}"; ${filteredDesktopResults.length})`,
        criticalsDesktopResult: `=HYPERLINK("${criticalsQuery}"; ${filteredDesktopCriticalResults.length})`,
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
    const apiQuery = `https://bugzilla.mozilla.org/rest/bug?include_fields=id,creation_time,see_also,history,priority,product,component,creator,op_sys${helpers.getBugzillaPriorities()}&f1=see_also&f2=bug_status&f3=bug_file_loc&o1=anywordssubstr&o2=anywordssubstr&o3=regexp&v1=webcompat.com%2Cgithub.com%2Fwebcompat&v2=UNCONFIRMED%2CNEW%2CASSIGNED%2CREOPENED&v3=${helpers.formatWebSiteForRegExp(website)}&limit=0&api_key=${bugzillaKey}${searchConstraintQueryFragment}`
    const results = await helpers.bugzillaRetry(apiQuery);
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

    const dupedGhIds = new Set();
    const dupedMobileGhIds = new Set();
    const dupedDesktopGhIds = new Set();
    const dupedBzIds = new Set();
    const dupedMobileBzIds = new Set();
    const dupedDesktopBzIds = new Set();
    const octokit = getOctokitInstance(githubKey);
    for (const [ issue, bzId ] of githubCandidates) {
        const result = await octokit.issues.get(
           {owner: "webcompat", repo: "web-bugs", issue_number: issue}
        );
        if (result.data.milestone.title === "duplicate") {
            dupedBzIds.add(bzId);
            dupedGhIds.add(result.data.number);
            if (helpers.isMobile(result.data)) {
                dupedMobileBzIds.add(bzId);
                dupedMobileGhIds.add(result.data.number);
            }
            if (helpers.isDesktop(result.data)) {
                dupedDesktopBzIds.add(bzId);
                dupedDesktopGhIds.add(result.data.number);
            }
        }
    }
    return {
        duplicatesResult: dupedGhIds.size ? `=HYPERLINK("${helpers.getBzLink(dupedBzIds)}"; ${dupedGhIds.size})`: 0,
        duplicatesMobileResult: dupedMobileGhIds.size ? `=HYPERLINK("${helpers.getBzLink(dupedMobileBzIds)}"; ${dupedMobileGhIds.size})` : 0,
        duplicatesDesktopResult: dupedDesktopGhIds.size ? `=HYPERLINK("${helpers.getBzLink(dupedDesktopBzIds)}"; ${dupedDesktopGhIds.size})` : 0,
    };
}

module.exports = {
    fetchBugs,
}
