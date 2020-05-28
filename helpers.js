const fetch = require("node-fetch");
const fs = require("fs");
const retry = require("promise-fn-retry");
const util = require("util");

const config = JSON.parse(fs.readFileSync("config.json", { encoding: "utf8" }));

/**
 * Retry a bugzilla query.
 * @param {String} query The specified bugzilla query
 * @returns a Promise of a JSON object with the query results
 */
const bugzillaRetry = async query => {
  const promiseFn = () => fetch(query);
  const options = {
    times: 3,
    // 10 seconds should hopefully be enough for transient errors.
    initialDelay: 10000,
    onRetry: error => {
      console.warn(`Retrying buzgilla query ${query} due to ${error.message}!`);
    },
    shouldRetry: error => {
      console.log(error);
      return true;
    },
  };
  return retry(promiseFn, options).then(res => {
    if (!res.ok) {
      console.log(util.inspect(res, { showHidden: false, depth: null }));
      throw new Error("Bugzilla query failed!");
    }
    return res.json();
  });
};

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
  return encodeURIComponent(
    `https?://(.+\\.)*${website.replace(/\./g, "\\.")}(/.*)*$`
  );
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
  return `&product=${products
    .map(i => encodeURIComponent(i))
    .join("&product=")}`;
}

/**
 * Returns a the relevant Bugzilla params for finding a bug by URL
 */
function getBugURL(url) {
  return `&bug_file_loc_type=regexp&bug_file_loc=${formatWebSiteForRegExp(
    url
  )}`;
}

/**
 * Returns a URL encoded string containing the Buzilla statuses (as GET params)
 */
function getBugzillaStatuses() {
  const statuses = ["UNCONFIRMED", "NEW", "ASSIGNED", "REOPENED"];
  return `&bug_status=${statuses
    .map(i => encodeURIComponent(i))
    .join("&bug_status=")}`;
}

/**
 * Returns a URL encoded string containing the Buzilla priorities (as GET params)
 */
function getBugzillaPriorities() {
  const priorities = ["P1", "P2", "P3"];
  return `&priority=${priorities
    .map(i => encodeURIComponent(i))
    .join("&priority=")}`;
}

/**
 * Returns a Bugzilla URL containing Bugs contained in the dupeSet
 * @param {Set} dupeSet
 */
function getBzLink(dupeSet) {
  const param = Array.from(dupeSet).join("%2C");
  return `https://bugzilla.mozilla.org/buglist.cgi?o1=anyexact&v1=${param}&f1=bug_id`;
}

/**
 * Returns true if the bug is considered to be Mobile (for Bugzilla or webcompat.com)
 */
function isMobile(bug) {
  const mobileProducts = ["Core", "Firefox for Android", "Fenix", "GeckoView"];
  const mobileLabels = [
    "browser-fenix",
    "browser-firefox-mobile",
    "browser-firefox-tablet",
    "browser-focus-geckoview",
    "browser-geckoview",
  ];
  const mobileOS = ["Android", "All", "Unspecified"];
  return bug.product
    ? (mobileProducts.includes(bug.product) && mobileOS.includes(bug.op_sys)) ||
        (bug.product === "Web Compatibility" && bug.component === "Mobile")
    : bug.labels.some(label => mobileLabels.includes(label.name));
}

/**
 * Returns true if the bug is considered to be Desktop (for Bugzilla or webcompat.com)
 */
function isDesktop(bug) {
  const desktopProducts = ["Core", "Firefox"];
  const desktopLabels = ["browser-firefox"];
  const desktopOS = [
    "Windows",
    "Windows 7",
    "Windows 8",
    "Windows 8.1",
    "Windows 10",
    "macOS",
    "Linux",
    "All",
    "Unspecified",
  ];
  return bug.product
    ? (desktopProducts.includes(bug.product) &&
        desktopOS.includes(bug.op_sys)) ||
        (bug.product === "Web Compatibility" && bug.component === "Desktop")
    : bug.labels.some(label => desktopLabels.includes(label.name));
}

/**
 * Returns true if the bug was not reported by QA
 */
function isNotQA(bug) {
  return !(bug.creator
    ? bug.creator.includes(config.ignoredQADomain)
    : config.ignoredGitHubAccounts.includes(bug.user.login));
}

/**
 * Returns true if the bug does not have a webcompat.com or web-bugs URL in the
 * see also field.
 */
function filterWebCompatSeeAlso(bug) {
  const seeAlsoArray = bug.see_also;
  const webCompatRegexp = /(webcompat\.com|web-bugs)/i;
  return !seeAlsoArray.some(url => webCompatRegexp.test(url));
}

/**
 * Return the End of the week the specified date belongs to.
 * @param {Date} date the date for which to
 * @returns the date of the end of the week
 */
function getEOW(date) {
  const param = new Date(date);
  param.setDate(param.getDate() - param.getDay() + 7);
  return new Date(param - 1);
}

/**
 * Return the list of query dates for a given inputDate
 * @param {Date} inputDate the date to start with.
 * @returns an Array with all dates to gather bugs for
 */
function getQueryDates(inputDate) {
  const queryDates = [];
  if (inputDate) {
    // We want to consider open bugs only until the end of the given week.
    const parsed = new Date(inputDate);
    const today = new Date();
    if (isNaN(parsed)) {
      throw new Error("Wrong maxDate format: use yyyy-mm-dd");
    }

    if (!inputDate.includes("-")) {
      // An entire year is specified.
      for (let i = 0; i < 52; i++) {
        queryDates.push(getEOW(parsed));
        parsed.setDate(parsed.getDate() + 7);
        if (getEOW(parsed) > today) {
          // Stop if we get into future dates (the Trexa list won't
          // have anything useful for us).
          break;
        }
      }
    } else if (inputDate.indexOf("-") === inputDate.lastIndexOf("-")) {
      // An entire month is specified.
      const month = getEOW(parsed).getMonth();
      for (let i = 0; i < 5; i++) {
        queryDates.push(getEOW(parsed));
        parsed.setDate(parsed.getDate() + 7);
        if (getEOW(parsed).getMonth() !== month || getEOW(parsed) > today) {
          // Stop if the fifth consecutive Sunday falls into the next
          // month, or we get into future dates.
          break;
        }
      }
    } else {
      // A single date is specified.
      queryDates.push(getEOW(parsed));
    }
  } else {
    queryDates.push(inputDate);
  }

  return queryDates;
}

/**
 * Write the passed in currentDocId to disk, so it can be read from other
 * consumers, and save it to the config.
 * @param {string} currentDocId
 */
async function recordCurrentDoc(currentDocId) {
  config.startingSpreadsheetId = currentDocId;

  Promise.all([
    fs.promises.writeFile(
      "config.json",
      JSON.stringify(config, null, 2),
      "utf8"
    ),
    fs.promises.writeFile(
      `${config.currentDocPath}/currentDoc.json`,
      JSON.stringify({ currentDoc: currentDocId }),
      "utf8"
    ),
  ]);
}

/**
 * Return the list of query dates until the present, starting
 * at the specified date.
 * @param {Date} inputDate the date to resume with
 * @returns an Array with all dates to gather bugs for
 */
function resumeQueryDates(inputDate) {
  const queryDates = [];
  const parsed = new Date(inputDate);
  const today = new Date();
  if (isNaN(parsed)) {
    throw new Error("Wrong maxDate format: use yyyy-mm-dd");
  }
  while (getEOW(parsed) < today) {
    queryDates.push(getEOW(parsed));
    parsed.setDate(parsed.getDate() + 7);
  }

  return queryDates;
}

module.exports = {
  bugzillaRetry,
  formatDateForAPIQueries,
  formatWebSiteForRegExp,
  getBugURL,
  getBugzillaPriorities,
  getBugzillaProducts,
  getBugzillaStatuses,
  getBzLink,
  getEOW,
  getQueryDates,
  filterWebCompatSeeAlso,
  isMobile,
  isDesktop,
  isNotQA,
  recordCurrentDoc,
  resumeQueryDates,
};
