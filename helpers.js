const config = require('./config.json');
const fetch = require('node-fetch');
const retry = require('promise-fn-retry');
const util = require('util');

/**
 * Retry a bugzilla query.
 * @param {String} query The specified bugzilla query
 * @returns a Promise of a JSON object with the query results
 */
const bugzillaRetry = async (query) => {
    const promiseFn = () => fetch(query);
    const options = {
        times: 3,
        // 10 seconds should hopefully be enough for transient errors.
        initialDelay: 10000,
        onRetry: (error) => {
            console.warn(`Retrying buzgilla query ${query} due to ${error.message}!`)
        },
    };
    return retry(promiseFn, options)
        .then(res => {
            if (!res.ok) {
                console.log(util.inspect(res, { showHidden: false, depth: null }))
                throw new Error("Bugzilla query failed!");
            }
            return res.json();
        });
}

/**
 * Returns a date formatted for API queries.
 * @param {Date} date the requested date
 * @returns the String with the formatted date
 */
function formatDateForAPIQueries(date) {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
}

/**
 * Returns a domain formatted for Bugzilla URL regexp strings.
 * @param {String} website
 */
function formatWebSiteForRegExp(website) {
    // We want https?://(.+\.)*example\.com(/.*)*$, in a suitable query string format
    return encodeURIComponent(`https?://(.+\\.)*${website.replace(/\./g, "\\.")}(/.*)*$`);
}

/**
 * Returns a URL encoded string containing the Buzilla products (as GET params)
 */
function getBugzillaProducts() {
    const products = [
        "Core",
        "Fenix",
        "Firefox",
        "Firefox for Android",
        "GeckoView",
        "Web Compatibility",
    ];
    return `&product=${products.map(i => encodeURIComponent(i)).join("&product=")}`;
}

/**
 * Returns a the relevant Bugzilla params for finding a bug by URL
 */
function getBugURL(url) {
    return `&bug_file_loc_type=regexp&bug_file_loc=${formatWebSiteForRegExp(url)}`;
}

/**
 * Returns a URL encoded string containing the Buzilla statuses (as GET params)
 */
function getBugzillaStatuses() {
    const statuses = [
        "UNCONFIRMED",
        "NEW",
        "ASSIGNED",
        "REOPENED",
    ];
    return `&bug_status=${statuses.map(i => encodeURIComponent(i)).join("&bug_status=")}`;
}

/**
 * Returns a URL encoded string containing the Buzilla priorities (as GET params)
 */
function getBugzillaPriorities() {
    const priorities = [
        "P1",
        "P2",
        "P3",
    ];
    return `&priority=${priorities.map(i => encodeURIComponent(i)).join("&priority=")}`;
}

/**
 * Returns true if the bug is considered to be Mobile (for Bugzilla or webcompat.com)
 */
function isMobile(bug) {
    const mobileProducts = ['Core', 'Firefox for Android', 'Fenix', 'GeckoView'];
    const mobileLabels = ['browser-fenix', 'browser-firefox-mobile', 'browser-focus-geckoview', 'browser-geckoview'];
    return bug.product ? (mobileProducts.includes(bug.product) || bug.product === "Web Compatibility" && bug.component === "Mobile") :
        bug.labels.some(label => mobileLabels.includes(label.name));
}

/**
 * Returns true if the bug is considered to be Desktop (for Bugzilla or webcompat.com)
 */
function isDesktop(bug) {
    const desktopProducts = ['Core', 'Firefox'];
    const desktopLabels = ['browser-firefox'];
    return bug.product ? (desktopProducts.includes(bug.product) || bug.product === "Web Compatibility" && bug.component === "Desktop") :
        bug.labels.some(label => desktopLabels.includes(label.name));
}

/**
* Returns true if the bug was not reported by QA
*/
function isNotQA(bug) {
    return !(bug.creator ? bug.creator.includes(config.ignoredQADomain) :
        config.ignoredGitHubAccounts.includes(bug.user.login));
}

module.exports = {
    bugzillaRetry,
    formatDateForAPIQueries,
    formatWebSiteForRegExp,
    getBugURL,
    getBugzillaPriorities,
    getBugzillaProducts,
    getBugzillaStatuses,
    isMobile,
    isDesktop,
    isNotQA,
}
