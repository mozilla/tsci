const config = require("./config.json");
const escapeStringRegexp = require("escape-string-regexp");
const fs = require("fs");
const fetch = require("node-fetch");
const replace = require("replace-in-file");

let DOMAINS_REGEXP_CACHE = [];

/**
 * Clamp the CSV to config.listSize. We do this because we end up fetching
 * more than config.listSize by config.ignoredDomains.length. If all those
 * domains are removed, this will become a no-op.
 */
const clampListSize = (listFile, config) => {
  return new Promise(async (resolve, reject) => {
    const data = await fs.promises
      .readFile(listFile, "utf8")
      .catch(err => reject(err));
    const lines = data.split(/\r?\n/);
    const desiredLength = config.listSize;
    const currentLength = lines.length;
    // It's unclear why the list would be smaller, but if it is
    // just return it.
    if (currentLength <= desiredLength) {
      resolve(listFile);
    } else {
      lines.splice(desiredLength, currentLength - desiredLength);
      const clampedFile = lines.join("\r\n");
      await fs.promises
        .writeFile(listFile, clampedFile)
        .catch(err => reject(err));
      resolve(listFile);
    }
  });
};

/**
 * Return the list without the domains specific in config.ignoredDomains
 * @param {String} listFile
 * @returns a String path to the CSV file
 */
const removeIgnoredDomains = function(listFile, config) {
  const IGNORED_DOMAINS = config.ignoredDomains;

  return new Promise((resolve, reject) => {
    // Modify the website list, if we have any ignoredDomains.
    if (IGNORED_DOMAINS.length) {
      if (!DOMAINS_REGEXP_CACHE.length) {
        DOMAINS_REGEXP_CACHE = IGNORED_DOMAINS.map(value => {
          // create an escaped regexp out of each domain we want to ignore
          // the CSV format will look like one of the following (why tho):
          // 1,example.com\r\n
          // 1,example.com\n
          // 1,example.com
          return new RegExp(
            `^\\d{1,3},${escapeStringRegexp(value)}(\\r?\\n|$)`,
            "m"
          );
        });
      }
      console.log(`Skipping domains per config.ignoredDomains`);
      replace({
        countMatches: true,
        files: listFile,
        from: DOMAINS_REGEXP_CACHE,
        to: "",
      })
        .then(results => {
          if (!results[0].hasChanged) {
            console.warn(
              "Warning: config.ignoredDomains set, but the list was not modified."
            );
          }
          resolve(listFile, config);
        })
        .catch(error => reject(error));
    } else {
      resolve(listFile, config);
    }
  });
};

/**
 * Returns the list ID for the specified date or, if that cannot be found, the
 * most recent one available. If a date is not specified, returns the latest
 * available list.
 * @param {Date} date the date of the requested list ID
 * @returns the String of the list ID
 */
const fetchListID = async date => {
  const ID_URL = `https://tranco-list.eu/daily_list_id?date=${parseDate(date)}`;

  return fetch(ID_URL).then(async res => {
    if (
      res.ok &&
      res.headers.get("content-type") === "text/plain; charset=utf-8"
    ) {
      return { listID: await res.text(), listDate: date };
    } else if (res.status === 503) {
      const newDate = new Date(date);
      const now = new Date();
      // Future dates are unlikely to be available yet, but also ones
      // from long ago may have never been available. Try to converge
      // towards the present.
      if (date > now) {
        newDate.setDate(newDate.getDate() - 1);
        // If we end up at "today", we need to request the list from
        // the day before -- the daily list is actually a day old.
      } else if (parseDate(newDate) === parseDate(now)) {
        newDate.setDate(newDate.getDate() - 2);
      } else {
        newDate.setDate(newDate.getDate() + 1);
      }
      console.warn(`Retrying with date ${newDate}`);
      return fetchListID(newDate);
    }
    throw new Error(`Request for ${ID_URL} returned status ${res.status}!`);
  });
};

const fetchList = async (
  size = 500,
  directory = "data/",
  date,
  ignoredDomains = config.ignoredDomains
) => {
  const listSize = size + ignoredDomains.length;

  // Create the data directory.
  await new Promise((resolve, reject) => {
    fs.mkdir(directory, { recursive: true }, err => {
      if (err) reject(err);
      resolve();
    });
  });

  if (!date) {
    date = new Date();
  }

  // Fetch the list ID for the requested date.
  const { listID, listDate } = await fetchListID(date);
  const file = `${directory}list-${parseDate(listDate)}.csv`;

  // Check for an already downloaded list.
  const listIsCached = await fs.promises
    .access(file, fs.constants.R_OK | fs.constants.W_OK)
    .then(() => true)
    .catch(() => false);
  if (listIsCached) {
    console.log("Found cached Tranco list");
    return file;
  }

  // Fetch the list.
  const LIST_URL = `https://tranco-list.eu/download/${listID}/${listSize}`;
  return fetch(LIST_URL).then(res => {
    if (
      !res.ok ||
      res.headers.get("content-type") !== "text/csv; charset=utf-8"
    ) {
      throw new Error(`List ${listID} not found!`);
    }
    return new Promise((resolve, reject) => {
      const dest = fs.createWriteStream(file);
      res.body.pipe(dest);
      dest.on("finish", () => {
        console.log(
          `Downloaded Tranco list with ID ${listID} for date ${parseDate(
            listDate
          )}`
        );
        removeIgnoredDomains(file, config)
          .then(clampListSize)
          .then(
            newFile => resolve(newFile),
            error => reject(error)
          );
      });
    });
  });
};

/**
 * Return the specified date formatted as yyyy-mm-dd in UTC.
 * @param {Date} date
 * @returns a String representation of the date as yyyy-mm-dd
 */
function parseDate(date) {
  return date.toISOString().split("T")[0];
}

module.exports = {
  clampListSize,
  fetchList,
  removeIgnoredDomains,
};
