# tsci

Calculate the Top Site Compatibility Index web compat metric. 

## Usage
Requires [Node](https://nodejs.org/) 8+ and a [Google Cloud Platform](https://cloud.google.com/) service account. 
You need to [create](https://cloud.google.com/docs/authentication/getting-started) a service account and download
the JSON file containing the authentication credentials. Put that file in the project workspace as `credentials.json`.

Create another file in the project workspace named `config.json` containing configuration overrides for your needs,
like API keys for [Bugzilla](https://bugzilla.mozilla.org/userprefs.cgi?tab=apikey) and
[GitHub](https://help.github.com/en/articles/creating-a-personal-access-token-for-the-command-line).
Omit any keys where the defaults would suffice. Here is what the a `config.json` with the defaults would look like
(modulo the comments):
```
{
  // The size of the Tranco list to download, up to 1 million sites.
  "listSize": 500,
  // The directory that will be used to store the downloaded list.
  "listDir": "data/",
  // The Bugzilla API authentication key.
  "bugzillaKey": "",
  // The GitHub API authentication key.
  "githubKey": "",
  // A cutoff date for calculating the TSCI (if not a Sunday, will be rounded to the next Sunday).
  // E.g. a value of "2019-03-01" would lead to using "2019-03-03" (March 1st was a Friday).
  "maxDate": null,
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
