# tsci

[![Build Status](https://travis-ci.org/mozilla/tsci.svg?branch=master)](https://travis-ci.org/mozilla/tsci)

Calculate the Top Site Compatibility Index web compat metric.

## Usage
Requires [Node](https://nodejs.org/) 8+ and a [Google Cloud Platform](https://cloud.google.com/) service account.
You need to [create](https://cloud.google.com/docs/authentication/getting-started) a service account and download
the JSON file containing the authentication credentials. Put that file in the project workspace as `credentials.json`.

Copy `config.json.example` in the project workspace to a file named `config.json` and edit accordingly,
notably the API keys for [Bugzilla](https://bugzilla.mozilla.org/userprefs.cgi?tab=apikey) and
[GitHub](https://help.github.com/en/articles/creating-a-personal-access-token-for-the-command-line).
You can omit any keys where the defaults would suffice. Here is what a commented `config.json.example`
would look like:
```
{
  // The size of the Trexa list to download, up to ~150k sites.
  "listSize": 500,
  // The directory that will be used to store the downloaded list.
  "listDir": "data/",
  // The Bugzilla API authentication key.
  "bugzillaKey": "",
  // The GitHub API authentication key.
  "githubKey": "",
  // The path to save currentDoc.json (by default, CWD)
  "currentDocPath": ".",
  // A list of domains to ignore when fetching bug results.
  "ignoredDomains": [
    "github.com",
    "github.io",
    "t.co"
  ],
  // Whether we should ignore Fenix bugs (since it's pre-release)
  "ignoreFenix": true,
  // A list of GitHub accounts to ignore bugs from (QA)
  "ignoredGitHubAccounts": [
    "softvision-oana-arbuzov",
    "softvision-sergiulogigan",
    "cipriansv"
  ],
  // A QA email domain for ignoring Bugzilla bugs
  "ignoredQADomain": "@softvision.ro",
  // A cutoff date for calculating the TSCI (if not a Sunday, will be rounded to the next Sunday).
  // E.g. a value of "2019-03-01" would lead to using "2019-03-03" (March 1st was a Friday).
  "maxDate": null,
  // The earliest date to consider for when the bug or issue has to have been
  // filed. By default 2018-01-01 is used.
  "minDate": "2018",
  // The ID of a spreadsheet to work on. This only applies to the first weekly runs,
  // if more than one week is specified. Otherwise, a new spreadsheet will be created.
  "startingSpreadsheetId": null,
  // A list of Google accounts with whom the final spreadsheet should be shared.
  "writers": [
    "user@example.com"
  ]
}
```

Then run:
```
npm install
npm start
```

A single argument may also be provided to specify a cut-off date, providing a best-effort view of what the historical
results would have been, had the program been run at that date. Note that the end of the week for the given date is
what is actually used, regardless of the day-of-week specified. For instance, this will return issue-counts up to
and including Saturday May 25 2018:
```
npm start 2019-05-23
```

A `--resume` option also exists, to continue collecting weekly results until the present date, rather than just a single weekly result:

```
npm start 2019-05-23 -- --resume
```

A `--exact` option exists to allow testing of single dates that don't fall at the end of the week.

```
npm start 2020-05-28 -- --exact
```

Code of Conduct
===============

This project and repository is governed by Mozilla's code of conduct and
etiquette guidelines. For more details please see the [Code of Conduct](./CODE_OF_CONDUCT.md) file.
