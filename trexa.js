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
const clampListSize = args => {
  return new Promise(async (resolve, reject) => {
    const data = await fs.promises
      .readFile(args.listFile, "utf8")
      .catch(err => reject(err));
    const lines = data.split(/\r?\n/);
    const desiredLength = args.config.listSize;
    const currentLength = lines.length;
    // It's unclear why the list would be smaller, but if it is
    // just return it.
    if (currentLength <= desiredLength) {
      resolve(args.listFile);
    } else {
      lines.splice(desiredLength, currentLength - desiredLength);
      const clampedFile = lines.join("\r\n");
      await fs.promises
        .writeFile(args.listFile, clampedFile)
        .catch(err => reject(err));
      resolve(args.listFile);
    }
  });
};

/**
 * Return the list without the domains specific in config.ignoredDomains
 * @param {Object} args ({listFile, config})
 * @returns args
 */
const removeIgnoredDomains = function(args) {
  const IGNORED_DOMAINS = args.config.ignoredDomains;

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
        files: args.listFile,
        from: DOMAINS_REGEXP_CACHE,
        to: "",
      })
        .then(results => {
          if (!results[0].hasChanged) {
            console.warn(
              "Warning: config.ignoredDomains set, but the list was not modified."
            );
          }
          resolve(args);
        })
        .catch(error => reject(error));
    } else {
      resolve(args);
    }
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

  const file = `${directory}list-${parseDate(date)}.csv`;

  // Check for an already downloaded list.
  const listIsCached = await fs.promises
    .access(file, fs.constants.R_OK | fs.constants.W_OK)
    .then(() => true)
    .catch(() => false);
  if (listIsCached) {
    console.log("Found cached Trexa list");
    return file;
  }

  // Fetch the list.
  const LIST_URL = `https://trexa.webcompat.com/api/lists/${parseDate(
    date
  )}?count=${listSize}`;
  return fetch(LIST_URL, {
    headers: { "User-Agent": "mozilla-tsci/1.0" },
  }).then(res => {
    if (!res.ok || !res.headers.get("content-type").includes("text/csv")) {
      throw new Error(`List trexa-${parseDate(date)}.csv not found!`);
    }
    return new Promise((resolve, reject) => {
      const dest = fs.createWriteStream(file);
      res.body.pipe(dest);
      dest.on("finish", () => {
        console.log(`Downloaded Trexa list for date ${parseDate(date)}`);
        removeIgnoredDomains({ listFile: file, config })
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
